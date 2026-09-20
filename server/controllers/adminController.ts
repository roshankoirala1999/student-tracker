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

    const formatted = teachers.map((t) => {
      const expiryTime = t.expiresAt ? new Date(t.expiresAt).getTime() : Date.now() + 3 * 86400000;
      const isExpired = expiryTime < Date.now();
      const daysRemaining = Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24));

      return {
        id: t._id.toString(),
        username: t.username,
        fullName: t.fullName || '',
        phoneNumber: t.phoneNumber || '',
        college: t.college || '',
        dob: t.dob || '',
        customFields: t.customFields || {},
        plainPassword: t.plainPassword || '',
        role: t.role,
        status: t.status || 'active',
        isDeletionLocked: !!t.isDeletionLocked,
        mustChangePassword: !!t.mustChangePassword,
        expiresAt: t.expiresAt || new Date(expiryTime).toISOString(),
        isExpired,
        daysRemaining,
        createdAt: t.createdAt,
        classCount: classCountMap.get(t._id.toString()) || 0,
        studentCount: studentCountMap.get(t._id.toString()) || 0,
      };
    });

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
          plainPassword: passwordToHash,
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
        plainPassword: passwordToHash,
      });
    }

    return res.json({
      success: true,
      message: 'Teacher password updated successfully.',
      plainPassword: passwordToHash,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export const editTeacherPassword = resetTeacherPassword;

export async function updateTeacherProfileByAdmin(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { fullName, phoneNumber, username, college, dob, customFields } = req.body;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    const updateFields: any = {};
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim() === '') {
        return res.status(400).json({ success: false, message: 'Full Name cannot be empty.' });
      }
      updateFields.fullName = fullName.trim();
    }

    if (phoneNumber !== undefined) {
      if (typeof phoneNumber !== 'string' || phoneNumber.trim() === '') {
        return res.status(400).json({ success: false, message: 'Phone Number cannot be empty.' });
      }
      updateFields.phoneNumber = phoneNumber.trim();
    }

    if (username !== undefined) {
      const cleanU = username.trim().toLowerCase();
      if (cleanU.length < 3) {
        return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
      }
      if (cleanU.includes('admin')) {
        return res.status(400).json({ success: false, message: "Username cannot contain 'admin'." });
      }
      if (cleanU !== teacher.username) {
        const existing = await db.collection('users').findOne({ username: cleanU });
        if (existing) {
          return res.status(409).json({ success: false, message: 'Username is already in use.' });
        }
        updateFields.username = cleanU;
      }
    }

    if (college !== undefined) {
      updateFields.college = typeof college === 'string' ? college.trim() : '';
    }

    if (dob !== undefined) {
      const cleanDob = typeof dob === 'string' ? dob.trim() : '';
      if (cleanDob !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDob)) {
        return res.status(400).json({ success: false, message: 'Date of Birth must be in YYYY-MM-DD format.' });
      }
      updateFields.dob = cleanDob;
    }

    if (customFields !== undefined && typeof customFields === 'object' && customFields !== null) {
      updateFields.customFields = customFields;
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(teacherId) },
      { $set: updateFields }
    );

    return res.json({ success: true, message: 'Teacher profile updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function inspectTeacherData(req: Request, res: Response) {
  const { teacherId } = req.params;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne(
      { _id: new ObjectId(teacherId), role: 'teacher' }
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
          fullName: teacher.fullName || '',
          phoneNumber: teacher.phoneNumber || '',
          college: teacher.college || '',
          dob: teacher.dob || '',
          customFields: teacher.customFields || {},
          plainPassword: teacher.plainPassword || '',
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

export async function updateTeacherExpiry(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { daysToAdd, newExpiryDate } = req.body;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    let targetIsoDate: string;

    if (typeof newExpiryDate === 'string' && newExpiryDate.trim().length > 0) {
      const parsed = new Date(newExpiryDate);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format for expiry date.' });
      }
      targetIsoDate = parsed.toISOString();
    } else if (typeof daysToAdd === 'number' && !isNaN(daysToAdd)) {
      const now = Date.now();
      const currentExpiryTime = teacher.expiresAt ? new Date(teacher.expiresAt).getTime() : now;
      const baseTime = currentExpiryTime > now ? currentExpiryTime : now;
      const newTime = baseTime + daysToAdd * 24 * 60 * 60 * 1000;
      targetIsoDate = new Date(newTime).toISOString();
    } else {
      return res.status(400).json({ success: false, message: 'Please provide either daysToAdd or newExpiryDate.' });
    }

    await db.collection('users').updateOne(
      { _id: teacher._id },
      { $set: { expiresAt: targetIsoDate } }
    );

    const updatedExpiryTime = new Date(targetIsoDate).getTime();
    const isExpired = updatedExpiryTime < Date.now();
    const daysRemaining = Math.ceil((updatedExpiryTime - Date.now()) / (1000 * 60 * 60 * 24));

    return res.json({
      success: true,
      message: 'Teacher account expiry updated successfully.',
      data: {
        expiresAt: targetIsoDate,
        isExpired,
        daysRemaining,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}
