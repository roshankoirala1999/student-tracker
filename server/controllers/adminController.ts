import crypto from 'crypto';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { hashPassword, comparePassword } from '../auth.ts';

export async function listAllTeachers(req: Request, res: Response) {
  try {
    const db = getDatabase();

    // Find all teachers
    const teachers = await db.collection('users')
      .find({ role: 'teacher' })
      .sort({ createdAt: -1 })
      .toArray();

    const teacherIds = teachers.map((t) => t._id.toString());

    // Aggregate class counts and student counts per teacher
    const classCounts = await db.collection('classes').aggregate([
      { $match: { teacherId: { $in: teacherIds } } },
      { $group: { _id: '$teacherId', count: { $sum: 1 } } },
    ]).toArray();

    const studentCounts = await db.collection('students').aggregate([
      { $match: { teacherId: { $in: teacherIds } } },
      { $group: { _id: '$teacherId', count: { $sum: 1 } } },
    ]).toArray();

    const classCountMap = new Map<string, number>();
    classCounts.forEach((c) => classCountMap.set(c._id, c.count));

    const studentCountMap = new Map<string, number>();
    studentCounts.forEach((s) => studentCountMap.set(s._id, s.count));

    const formatted = teachers.map((t) => ({
      id: t._id.toString(),
      username: t.username,
      role: t.role,
      status: t.status || 'active',
      isDeletionLocked: !!t.isDeletionLocked,
      mustChangePassword: !!t.mustChangePassword,
      createdAt: t.createdAt,
      classCount: classCountMap.get(t._id.toString()) || 0,
      studentCount: studentCountMap.get(t._id.toString()) || 0,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateTeacherDeletionLock(req: Request, res: Response) {
  const { teacherId } = req.params;
  const lockedVal = typeof req.body.isLocked === 'boolean'
    ? req.body.isLocked
    : (typeof req.body.isDeletionLocked === 'boolean' ? req.body.isDeletionLocked : undefined);

  if (typeof lockedVal !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isDeletionLocked boolean parameter is required.' });
  }

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(teacherId), role: 'teacher' },
      { $set: { isDeletionLocked: lockedVal } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    return res.json({
      success: true,
      message: `Teacher deletion lock set to ${lockedVal ? 'LOCKED' : 'UNLOCKED'}.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function deleteTeacher(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Administrator password is required to delete a teacher account.' });
  }

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();

    // Verify admin's own password
    const adminUser = await db.collection('users').findOne({ _id: new ObjectId(req.user!.userId) });
    if (!adminUser) {
      return res.status(401).json({ success: false, message: 'Administrator account not found.' });
    }

    const isPasswordValid = await comparePassword(password, adminUser.passwordHash);
    if (!isPasswordValid) {
      return res.status(403).json({ success: false, message: 'Incorrect administrator password.' });
    }

    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    if (teacher.isDeletionLocked === true) {
      return res.status(403).json({ success: false, message: 'Unlock this account first.' });
    }

    // Cascade delete all data
    await Promise.all([
      db.collection('classes').deleteMany({ teacherId }),
      db.collection('sections').deleteMany({ teacherId }),
      db.collection('students').deleteMany({ teacherId }),
      db.collection('marks').deleteMany({ teacherId }),
      db.collection('attendance').deleteMany({ teacherId }),
      db.collection('examinations').deleteMany({ teacherId }),
      db.collection('assignments').deleteMany({ teacherId }),
      db.collection('users').deleteOne({ _id: new ObjectId(teacherId) }),
    ]);

    return res.json({
      success: true,
      message: `Teacher account "${teacher.username}" and all associated data permanently deleted.`,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateTeacherStatus(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { status } = req.body;

  if (!status || !['active', 'suspended'].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be either 'active' or 'suspended'." });
  }

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(teacherId), role: 'teacher' },
      { $set: { status } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    return res.json({
      success: true,
      message: `Teacher account status updated to ${status}.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function resetTeacherPassword(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { newPassword } = req.body;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    let passwordToHash: string;
    let isAutoGenerated = false;

    if (newPassword && typeof newPassword === 'string' && newPassword.trim() !== '') {
      const cleanPass = newPassword.trim();
      if (cleanPass.length < 8) {
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
      }
      const lower = cleanPass.toLowerCase();
      if (lower.includes('password') || lower.includes('admin')) {
        return res.status(400).json({
          success: false,
          message: "Password cannot contain reserved words such as 'password' or 'admin'.",
        });
      }
      passwordToHash = cleanPass;
    } else {
      passwordToHash = crypto.randomBytes(9).toString('base64url').slice(0, 12);
      isAutoGenerated = true;
    }

    const passwordHash = await hashPassword(passwordToHash);
    const nextTokenVersion = (teacher.tokenVersion || 0) + 1;

    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(teacherId), role: 'teacher' },
      {
        $set: {
          passwordHash,
          mustChangePassword: true,
          tokenVersion: nextTokenVersion,
        },
        $unset: { adminPasswordRecord: "" },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    if (isAutoGenerated) {
      return res.json({
        success: true,
        message: 'Teacher password reset successfully.',
        temporaryPassword: passwordToHash,
      });
    }

    return res.json({
      success: true,
      message: 'Teacher password reset successfully.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export const editTeacherPassword = resetTeacherPassword;

export async function inspectTeacherData(req: Request, res: Response) {
  const { teacherId } = req.params;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne(
      { _id: new ObjectId(teacherId), role: 'teacher' },
      { projection: { passwordHash: 0, adminPasswordRecord: 0 } }
    );

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    // Retrieve teacher's classes
    const classes = await db.collection('classes')
      .find({ teacherId })
      .sort({ createdAt: 1 })
      .toArray();

    const classIds = classes.map((c) => c._id.toString());

    // Retrieve sections
    const sections = await db.collection('sections')
      .find({ teacherId })
      .sort({ classId: 1, order: 1 })
      .toArray();

    // Retrieve students count and students roster
    const students = await db.collection('students')
      .find({ teacherId })
      .sort({ rollNumber: 1 })
      .toArray();

    // Retrieve examinations and assignments
    const examinations = await db.collection('examinations')
      .find({ classId: { $in: classIds } })
      .toArray();

    const assignments = await db.collection('assignments')
      .find({ classId: { $in: classIds } })
      .toArray();

    const formattedClasses = classes.map((c) => {
      const cId = c._id.toString();
      const cSections = sections.filter((s) => s.classId === cId).map((s) => {
        const sId = s._id.toString();
        const sStudents = students.filter((stu) => stu.sectionId === sId);
        return {
          id: sId,
          name: s.name,
          order: s.order,
          studentCount: sStudents.length,
          students: sStudents.map((st) => ({
            id: st._id.toString(),
            rollNumber: st.rollNumber,
            studentName: st.studentName,
            symbolNumber: st.symbolNumber,
            contactNumber: st.contactNumber || st.parentContact || '',
            parentContact: st.contactNumber || st.parentContact || '',
          })),
        };
      });

      return {
        id: cId,
        name: c.name,
        attendanceEnabled: !!c.attendanceEnabled,
        sections: cSections,
        examinations: examinations.filter((e) => e.classId === cId).map((e) => ({
          id: e._id.toString(),
          name: e.name,
          maxMarks: e.maxMarks,
        })),
        assignments: assignments.filter((a) => a.classId === cId).map((a) => ({
          id: a._id.toString(),
          name: a.name,
          maxMarks: a.maxMarks,
        })),
      };
    });

    return res.json({
      success: true,
      data: {
        teacher: {
          id: teacher._id.toString(),
          username: teacher.username,
          status: teacher.status || 'active',
          isDeletionLocked: !!teacher.isDeletionLocked,
          createdAt: teacher.createdAt,
        },
        classes: formattedClasses,
        totalStudents: students.length,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}
