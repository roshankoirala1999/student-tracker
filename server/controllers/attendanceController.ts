import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';

export async function getAttendanceMetaAndHistory(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

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

    // Check if attendance for this day already exists (overwrite scenario)
    const existingDay = await db.collection('attendance').findOne({ sectionId, dayNumber });
    if (existingDay) {
      await db.collection('attendance').updateOne(
        { _id: existingDay._id },
        {
          $set: {
            records: validRecords,
            comment: trimmedComment || (existingDay.comment || ''),
            lastModifiedAt: now,
          },
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          id: existingDay._id.toString(),
          dayNumber,
          submissionDate: existingDay.submissionDate,
          comment: trimmedComment || (existingDay.comment || ''),
          recordsCount: validRecords.length,
          updated: true,
        },
        message: `Attendance for Day ${dayNumber} updated successfully.`,
      });
    }

    const result = await db.collection('attendance').insertOne({
      teacherId: section.teacherId,
      classId: section.classId,
      sectionId,
      dayNumber,
      submissionDate,
      comment: trimmedComment,
      records: validRecords,
      createdAt: now,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        dayNumber,
        submissionDate,
        comment: trimmedComment,
        recordsCount: validRecords.length,
      },
      message: `Attendance for Day ${dayNumber} saved successfully.`,
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
    if (attendance.teacherId !== req.user!.userId) {
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
    if (attendance.teacherId !== req.user!.userId) {
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

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function downloadAttendanceCsv(req: Request, res: Response) {
  const { classId } = req.params;
  const sectionIdQuery = req.query.sectionId as string | undefined;

  try {
    const db = getDatabase();
    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(classId) });
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found.' });

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

    // Find highest day number recorded (default at least 30 as shown in Image 2)
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

    const totalDays = Math.max(30, maxRecordedDay);

    // Build CSV strictly following Image 2 format
    const rows: string[] = [];
    // Row 1: Class Name = <ClassName>
    rows.push(`Class Name = ${classDoc.name}`);

    // Row 2: Headers
    const dayHeaders = Array.from({ length: totalDays }, (_, i) => i + 1);
    rows.push(['Roll no', 'Symbol No', 'NAME', 'Section', ...dayHeaders, 'Total'].join(','));

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
        s.rollNumber,
        escapeCsv(s.symbolNumber || ''),
        escapeCsv(s.studentName || ''),
        escapeCsv(secName),
        ...dayValues,
        totalPresent,
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

    req.params.classId = section.classId;
    req.query.sectionId = sectionId;
    return downloadAttendanceCsv(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to download attendance CSV.' });
  }
}
