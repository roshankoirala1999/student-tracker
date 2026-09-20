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

    const seenStudentIds = new Set<string>();
    const validRecords: Array<{ studentId: string; status: 'present' | 'absent' }> = [];

    for (const r of records) {
      const sid = typeof r.studentId === 'string' ? r.studentId : r.studentId?.toString();
      if (sid && existingStudentIds.has(sid) && !seenStudentIds.has(sid)) {
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
