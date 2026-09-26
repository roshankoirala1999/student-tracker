import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { formatCell } from '../utils/csv.ts';

export async function getAttendanceMetaAndHistory(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(section.classId) });
    if (!classDoc || !classDoc.attendanceEnabled) {
      return res.status(400).json({
        success: false,
        error: 'ATTENDANCE_DISABLED',
        message: 'Attendance is currently turned OFF for this class.',
      });
    }

    // Find highest dayNumber recorded so far
    const lastAttendance = await db.collection('attendance')
      .find({ sectionId })
      .sort({ dayNumber: -1 })
      .limit(1)
      .toArray();

    const nextDayNumber = lastAttendance.length > 0 ? lastAttendance[0].dayNumber + 1 : 1;

    // Get historical days (dayNumber, submissionDate, presentCount, absentCount)
    const history = await db.collection('attendance')
      .find({ sectionId })
      .sort({ dayNumber: -1 })
      .toArray();

    const formattedHistory = history.map((h) => {
      const records = h.records || [];
      const presentCount = records.filter((r: any) => r.status === 'present').length;
      const absentCount = records.filter((r: any) => r.status === 'absent').length;

      return {
        id: h._id.toString(),
        dayNumber: h.dayNumber,
        submissionDate: h.submissionDate,
        comment: h.comment || '',
        presentCount,
        absentCount,
        totalStudents: records.length,
        lastModifiedAt: h.lastModifiedAt,
        createdAt: h.createdAt,
      };
    });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

    return res.json({
      success: true,
      data: {
        today,
        nextDayNumber,
        history: formattedHistory,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function submitDailyAttendance(req: Request, res: Response) {
  const { sectionId } = req.params;
  const { records, targetDayNumber, comment } = req.body;

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'Attendance records are required.' });
  }

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(section.classId) });
    if (!classDoc || !classDoc.attendanceEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Attendance is currently turned OFF for this class.',
      });
    }

    // Load section's current students
    const currentStudents = await db.collection('students').find({ sectionId }).toArray();
    const currentStudentIdSet = new Set(currentStudents.map((s) => s._id.toString()));

    if (records.length !== currentStudents.length) {
      return res.status(400).json({ success: false, message: 'Roster changed. Please close and reopen attendance.' });
    }

    const seenStudentIds = new Set<string>();
    for (const r of records) {
      const sid = typeof r.studentId === 'string' ? r.studentId : r.studentId?.toString();
      if (!sid || !currentStudentIdSet.has(sid) || seenStudentIds.has(sid)) {
        return res.status(400).json({ success: false, message: 'Roster changed. Please close and reopen attendance.' });
      }
      seenStudentIds.add(sid);
    }

    if (seenStudentIds.size !== currentStudentIdSet.size) {
      return res.status(400).json({ success: false, message: 'Roster changed. Please close and reopen attendance.' });
    }

    // Determine target day: user custom dayNumber or auto-sequential next day
    let dayNumber: number;
    const parsedTarget = Number(targetDayNumber);
    if (!isNaN(parsedTarget) && parsedTarget >= 1) {
      dayNumber = Math.floor(parsedTarget);
    } else {
      const lastAttendance = await db.collection('attendance')
        .find({ sectionId })
        .sort({ dayNumber: -1 })
        .limit(1)
        .toArray();
      dayNumber = lastAttendance.length > 0 ? lastAttendance[0].dayNumber + 1 : 1;
    }

    // Stamp calendar date YYYY-MM-DD in Asia/Kathmandu
    const submissionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
    const now = new Date().toISOString();
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

    const validRecords = records.map((r: any) => ({
      studentId: r.studentId,
      status: r.status === 'absent' ? 'absent' : 'present',
    }));

    // Atomic upsert for this day record
    const filter = { sectionId, dayNumber };
    const updateDoc: any = {
      $set: {
        teacherId: section.teacherId,
        classId: section.classId,
        sectionId,
        dayNumber,
        submissionDate,
        records: validRecords,
        lastModifiedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    };
    if (trimmedComment) {
      updateDoc.$set.comment = trimmedComment;
    }

    const result = await db.collection('attendance').findOneAndUpdate(
      filter,
      updateDoc,
      { upsert: true, returnDocument: 'after' }
    );

    const doc = result;
    const isUpdated = Boolean(doc?.lastModifiedAt && doc?.createdAt && doc.lastModifiedAt !== doc.createdAt);

    return res.status(isUpdated ? 200 : 201).json({
      success: true,
      data: {
        id: doc?._id?.toString() || '',
        dayNumber,
        submissionDate,
        comment: doc?.comment || trimmedComment,
        recordsCount: validRecords.length,
        updated: isUpdated,
      },
      message: `Attendance for Day ${dayNumber} ${isUpdated ? 'updated' : 'saved'} successfully.`,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Day already recorded from another device. Reload and try again.' });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function getHistoricalDay(req: Request, res: Response) {
  const { attendanceId } = req.params;

  if (!attendanceId || !ObjectId.isValid(attendanceId)) {
    return res.status(400).json({ success: false, message: 'Invalid Attendance ID.' });
  }

  try {
    const db = getDatabase();
    const attendance = await db.collection('attendance').findOne({ _id: new ObjectId(attendanceId) });
    if (!attendance) return res.status(404).json({ success: false, message: 'Attendance record not found.' });

    // Verify ownership
    if (attendance.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'You do not have permission to view this attendance.' });
    }

    return res.json({
      success: true,
      data: {
        id: attendance._id.toString(),
        teacherId: attendance.teacherId,
        classId: attendance.classId,
        sectionId: attendance.sectionId,
        dayNumber: attendance.dayNumber,
        submissionDate: attendance.submissionDate,
        comment: attendance.comment || '',
        records: attendance.records,
        lastModifiedAt: attendance.lastModifiedAt,
        createdAt: attendance.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateHistoricalAttendance(req: Request, res: Response) {
  const { attendanceId } = req.params;
  const { records, comment } = req.body;

  if (!attendanceId || !ObjectId.isValid(attendanceId)) {
    return res.status(400).json({ success: false, message: 'Invalid Attendance ID.' });
  }

  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ success: false, message: 'Attendance records are required.' });
  }

  try {
    const db = getDatabase();
    const attendance = await db.collection('attendance').findOne({ _id: new ObjectId(attendanceId) });
    if (!attendance) return res.status(404).json({ success: false, message: 'Attendance record not found.' });

    // Verify ownership
    if (attendance.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this attendance.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(attendance.classId) });
    if (!classDoc || !classDoc.attendanceEnabled) {
      return res.status(400).json({
        success: false,
        error: 'ATTENDANCE_DISABLED',
        message: 'Attendance is currently turned OFF for this class.',
      });
    }

    const now = new Date().toISOString();
    const existingRecords = attendance.records || [];
    const existingStudentIds = new Set(existingRecords.map((r: any) => r.studentId));

    // Fetch current students in section to merge or allow currently enrolled students as well
    const currentStudents = await db.collection('students').find({ sectionId: attendance.sectionId }).toArray();
    const allowedStudentIds = new Set([
      ...existingStudentIds,
      ...currentStudents.map((s) => s._id.toString()),
    ]);

    const seenStudentIds = new Set<string>();
    const validRecords: Array<{ studentId: string; status: 'present' | 'absent' }> = [];

    for (const r of records) {
      const sid = typeof r.studentId === 'string' ? r.studentId : r.studentId?.toString();
      if (sid && allowedStudentIds.has(sid) && !seenStudentIds.has(sid)) {
        seenStudentIds.add(sid);
        validRecords.push({
          studentId: sid,
          status: r.status === 'absent' ? 'absent' : 'present',
        });
      }
    }

    const updateDoc: Record<string, any> = {
      records: validRecords,
      lastModifiedAt: now,
    };
    if (typeof comment === 'string') {
      updateDoc.comment = comment.trim();
    }

    // Update records, comment, and lastModifiedAt, while PRESERVING dayNumber and original submissionDate
    await db.collection('attendance').updateOne(
      { _id: new ObjectId(attendanceId) },
      { $set: updateDoc }
    );

    return res.json({
      success: true,
      message: `Attendance for Day ${attendance.dayNumber} updated successfully.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function downloadAttendanceCsv(req: Request, res: Response) {
  const { classId } = req.params;
  const sectionIdQuery = req.query.sectionId as string | undefined;

  try {
    const db = getDatabase();
    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(classId) });
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found.' });

    if (classDoc.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this class.' });
    }

    // Find sections
    const sections = await db.collection('sections')
      .find({ classId })
      .sort({ order: 1, name: 1 })
      .toArray();

    const sectionMap = new Map<string, string>();
    const sectionOrderMap = new Map<string, number>();
    sections.forEach((s, idx) => {
      sectionMap.set(s._id.toString(), s.name);
      sectionOrderMap.set(s._id.toString(), s.order !== undefined ? s.order : idx);
    });

    const isSpecificSection = !!(sectionIdQuery && sectionIdQuery !== 'combined' && ObjectId.isValid(sectionIdQuery));
    const studentQuery: any = { classId };
    if (isSpecificSection) {
      studentQuery.sectionId = sectionIdQuery;
    }

    const students = await db.collection('students').find(studentQuery).toArray();

    // Sort according to section, then by rollNumber
    students.sort((a, b) => {
      const orderA = sectionOrderMap.get(a.sectionId) ?? 999;
      const orderB = sectionOrderMap.get(b.sectionId) ?? 999;
      if (orderA !== orderB) return orderA - orderB;

      const nameA = sectionMap.get(a.sectionId) || '';
      const nameB = sectionMap.get(b.sectionId) || '';
      const nameComp = nameA.localeCompare(nameB);
      if (nameComp !== 0) return nameComp;

      return (a.rollNumber || 0) - (b.rollNumber || 0);
    });

    // Find attendance records
    const sectionIds = sections.map((s) => s._id.toString());
    const attendanceQuery: any = {
      $or: [{ classId }, { sectionId: { $in: sectionIds } }],
    };
    if (isSpecificSection) {
      attendanceQuery.$or = [{ sectionId: sectionIdQuery }];
    }

    const attendanceDocs = await db.collection('attendance').find(attendanceQuery).toArray();

    // Find highest day number recorded
    let maxRecordedDay = 0;
    const statusMap = new Map<string, string>(); // `${studentId}_${dayNumber}` -> status

    attendanceDocs.forEach((doc) => {
      const dNum = doc.dayNumber || 0;
      if (dNum > maxRecordedDay) maxRecordedDay = dNum;
      if (Array.isArray(doc.records)) {
        doc.records.forEach((r: any) => {
          if (r.studentId) {
            statusMap.set(`${r.studentId}_${dNum}`, r.status);
          }
        });
      }
    });

    // Dynamically size columns based strictly on recorded days
    const totalDays = maxRecordedDay;

    // Build CSV strictly following required format with anti-formula injection
    const rows: string[] = [];
    // Row 1: Class Name = <ClassName>
    rows.push(formatCell(`Class Name = ${classDoc.name || ''}`));

    // Row 2: Headers
    const headers = ['Roll no', 'Symbol No', 'NAME', 'Section'];
    for (let i = 1; i <= totalDays; i++) {
      headers.push(String(i));
    }
    headers.push('Total');
    rows.push(headers.map(formatCell).join(','));

    // Rows 3+: Students
    students.forEach((s) => {
      const sId = s._id.toString();
      const secName = sectionMap.get(s.sectionId) || '';
      let totalPresent = 0;
      const dayValues: number[] = [];

      for (let d = 1; d <= totalDays; d++) {
        const status = statusMap.get(`${sId}_${d}`);
        if (status === 'present') {
          dayValues.push(1);
          totalPresent++;
        } else {
          dayValues.push(0);
        }
      }

      const row = [
        formatCell(s.rollNumber),
        formatCell(s.symbolNumber || ''),
        formatCell(s.studentName || ''),
        formatCell(secName),
        ...dayValues.map(formatCell),
        formatCell(totalPresent),
      ];
      rows.push(row.join(','));
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const safeName = (classDoc.name || 'Class').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const secSuffix = isSpecificSection ? `_${(sectionMap.get(sectionIdQuery!) || 'Section').replace(/[^a-zA-Z0-9_\-]/g, '_')}` : '_Combined';
    const filename = `${safeName}${secSuffix}_Attendance.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to download attendance CSV.' });
  }
}

export async function downloadSectionAttendanceCsv(req: Request, res: Response) {
  const { sectionId } = req.params;
  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    req.params.classId = section.classId;
    req.query.sectionId = sectionId;
    return downloadAttendanceCsv(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to download attendance CSV.' });
  }
}

export async function getByClassDate(req: Request, res: Response) {
  const { classId, date } = req.query;
  try {
    const db = getDatabase();
    const query: any = {};
    if (classId) query.classId = classId;
    if (date) query.submissionDate = { $regex: new RegExp(`^${date}`) };
    const records = await db.collection('attendance').find(query).toArray();
    return res.json({
      success: true,
      data: records.map((r) => ({
        id: r._id.toString(),
        classId: r.classId,
        sectionId: r.sectionId,
        dayNumber: r.dayNumber,
        submissionDate: r.submissionDate,
        records: r.records,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance.' });
  }
}

export async function saveAttendanceDirect(req: Request, res: Response) {
  const { sectionId, dayNumber, date, records } = req.body;
  if (!sectionId || !records) {
    return res.status(400).json({ success: false, message: 'sectionId and records are required.' });
  }
  try {
    const db = getDatabase();
    if (!ObjectId.isValid(sectionId)) {
      return res.status(400).json({ success: false, message: 'Invalid section ID.' });
    }
    const sec = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!sec) return res.status(404).json({ success: false, message: 'Section not found.' });
    const now = date || new Date().toISOString();
    const result = await db.collection('attendance').insertOne({
      teacherId: req.user!.userId,
      classId: sec.classId,
      sectionId,
      dayNumber: Number(dayNumber) || 1,
      submissionDate: now,
      records,
      createdAt: new Date().toISOString(),
    });
    return res.json({ success: true, message: 'Attendance saved.', id: result.insertedId.toString() });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to save attendance.' });
  }
}

export async function getStudentSummary(req: Request, res: Response) {
  const { studentId } = req.params;
  try {
    const db = getDatabase();
    const attendance = await db.collection('attendance').find({ 'records.studentId': studentId }).toArray();
    let present = 0;
    let absent = 0;
    attendance.forEach((att) => {
      const rec = (att.records || []).find((r: any) => String(r.studentId) === String(studentId));
      if (rec?.status === 'present') present++;
      if (rec?.status === 'absent') absent++;
    });
    return res.json({
      success: true,
      data: {
        studentId,
        total: present + absent,
        present,
        absent,
        percentage: present + absent > 0 ? Math.round((present / (present + absent)) * 100) : 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance summary.' });
  }
}

