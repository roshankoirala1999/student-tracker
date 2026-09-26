import crypto from 'crypto';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { hashPassword, comparePassword } from '../auth.ts';
import { formatCell } from '../utils/csv.ts';

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
      const hasExpiry = t.expiryMode !== false;
      const expiryTime = (hasExpiry && t.expiresAt) ? new Date(t.expiresAt).getTime() : 0;
      const isExpired = hasExpiry ? (expiryTime < Date.now()) : false;
      const daysRemaining = hasExpiry ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) : undefined;

      return {
        id: t._id.toString(),
        username: t.username,
        fullName: t.fullName || '',
        phoneNumber: t.phoneNumber || '',
        college: t.college || '',
        dob: t.dob || '',
        customFields: t.customFields || {},
        role: t.role,
        status: t.status || 'active',
        isReadOnly: !!t.isReadOnly,
        isDeletionLocked: !!t.isDeletionLocked,
        mustChangePassword: !!t.mustChangePassword,
        fullNameLocked: !!t.fullNameLocked,
        expiryMode: hasExpiry,
        expiresAt: hasExpiry ? (t.expiresAt || new Date(expiryTime).toISOString()) : null,
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

    const teacherName = teacher.fullName || teacher.username || 'Teacher';
    const username = teacher.username || 'teacher';
    const cleanName = teacherName.includes('(deleted)') ? teacherName : `${teacherName} (deleted)`;
    const cleanUsername = username.includes('(deleted)') ? username : `${username} (deleted)`;

    // Cascade delete academic data, but preserve messages and mark teacher as (deleted)
    await Promise.all([
      db.collection('classes').deleteMany({ teacherId }),
      db.collection('sections').deleteMany({ teacherId }),
      db.collection('students').deleteMany({ teacherId }),
      db.collection('marks').deleteMany({ teacherId }),
      db.collection('attendance').deleteMany({ teacherId }),
      db.collection('examinations').deleteMany({ teacherId }),
      db.collection('assignments').deleteMany({ teacherId }),
      db.collection('users').deleteOne({ _id: new ObjectId(teacherId) }),
      db.collection('messages').updateMany(
        { senderId: teacherId },
        {
          $set: {
            senderFullName: cleanName,
            senderUsername: cleanUsername,
            senderIsDeleted: true,
          },
        }
      ),
      db.collection('messages').updateMany(
        { recipientId: teacherId },
        {
          $set: {
            recipientFullName: cleanName,
            recipientUsername: cleanUsername,
            recipientIsDeleted: true,
          },
        }
      ),
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

export async function updateTeacherReadOnly(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { isReadOnly } = req.body;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(teacherId), role: 'teacher' },
      { $set: { isReadOnly: !!isReadOnly } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    return res.json({
      success: true,
      message: `Teacher account is now ${isReadOnly ? 'in Read-Only Mode' : 'in Full Access Mode'}.`,
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
          mustChangePassword: isAutoGenerated,
          tokenVersion: nextTokenVersion,
        },
        $unset: { plainPassword: "", adminPasswordRecord: "" },
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
      message: 'Teacher password updated successfully.',
      temporaryPassword: passwordToHash,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export const editTeacherPassword = resetTeacherPassword;

export async function updateTeacherProfileByAdmin(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { fullName, phoneNumber, username, college, dob, customFields, newPassword, isReadOnly } = req.body;

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

    if (newPassword !== undefined && typeof newPassword === 'string' && newPassword.trim() !== '') {
      const cleanPass = newPassword.trim();
      if (cleanPass.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
      }
      const lower = cleanPass.toLowerCase();
      if (lower.includes('password') || lower.includes('admin')) {
        return res.status(400).json({
          success: false,
          message: "Password cannot contain reserved words such as 'password' or 'admin'.",
        });
      }
      updateFields.passwordHash = await hashPassword(cleanPass);
      updateFields.mustChangePassword = false;
      updateFields.tokenVersion = (teacher.tokenVersion || 0) + 1;
    }

    if (isReadOnly !== undefined) {
      updateFields.isReadOnly = !!isReadOnly;
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(teacherId) },
      { 
        $set: updateFields,
        $unset: { plainPassword: "", adminPasswordRecord: "" }
      }
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
  const { expiryMode, daysToAdd, daysDelta, newExpiryDate, expiresAt } = req.body;

  if (!teacherId || !ObjectId.isValid(teacherId)) {
    return res.status(400).json({ success: false, message: 'Invalid Teacher ID.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    // 1. If explicitly disabling expiryMode:
    if (expiryMode === false) {
      await db.collection('users').updateOne(
        { _id: teacher._id },
        { $set: { expiryMode: false }, $unset: { expiresAt: "" } }
      );

      return res.json({
        success: true,
        message: 'Account expiry mode turned OFF (Lifetime access).',
        data: {
          expiryMode: false,
          expiresAt: null,
          isExpired: false,
          daysRemaining: undefined,
        },
      });
    }

    // 2. Enabling or adjusting expiry
    let targetIsoDate: string | null = null;
    const rawDate = newExpiryDate || expiresAt;
    const rawDays = daysToAdd !== undefined ? daysToAdd : daysDelta;

    if (rawDate && typeof rawDate === 'string' && rawDate.trim().length > 0) {
      const cleanDate = rawDate.trim();
      const parsed = new Date(cleanDate.includes('T') ? cleanDate : `${cleanDate}T23:59:59.999Z`);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format for expiry date.' });
      }
      targetIsoDate = parsed.toISOString();
    } else if (rawDays !== undefined && !isNaN(Number(rawDays))) {
      const numDays = Number(rawDays);
      const now = Date.now();
      const currentExpiryTime = teacher.expiresAt ? new Date(teacher.expiresAt).getTime() : now;
      const baseTime = currentExpiryTime > now ? currentExpiryTime : now;
      const newTime = baseTime + numDays * 24 * 60 * 60 * 1000;
      targetIsoDate = new Date(newTime).toISOString();
    } else if (expiryMode === true) {
      // Re-enabling expiry mode without explicit date/days: default to 7 days from now or keep existing
      if (teacher.expiresAt && new Date(teacher.expiresAt).getTime() > Date.now()) {
        targetIsoDate = teacher.expiresAt;
      } else {
        targetIsoDate = new Date(Date.now() + 7 * 86400000).toISOString();
      }
    } else {
      return res.status(400).json({ success: false, message: 'Please provide either daysToAdd or newExpiryDate.' });
    }

    await db.collection('users').updateOne(
      { _id: teacher._id },
      { $set: { expiresAt: targetIsoDate, expiryMode: true } }
    );

    const updatedExpiryTime = new Date(targetIsoDate!).getTime();
    const isExpired = updatedExpiryTime < Date.now();
    const daysRemaining = Math.ceil((updatedExpiryTime - Date.now()) / (1000 * 60 * 60 * 24));

    return res.json({
      success: true,
      message: 'Teacher account expiry updated successfully.',
      data: {
        expiryMode: true,
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

// 10. New User Default Settings
export async function getNewUserDefaults(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const settings = await db.collection('system_settings').findOne({ _id: 'new_user_defaults' as any });
    const expiryMode = settings ? settings.expiryMode !== false : true;
    const canDelete = settings ? (settings.canDeleteAccount === true || settings.allowAccountDeletion === true) : true;
    return res.json({
      success: true,
      data: {
        expiryMode,
        canDeleteAccount: canDelete,
        allowAccountDeletion: canDelete,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to fetch default settings.' });
  }
}

export async function updateNewUserDefaults(req: Request, res: Response) {
  try {
    const { expiryMode, canDeleteAccount, allowAccountDeletion } = req.body;
    const db = getDatabase();
    const cleanExpiryMode = expiryMode !== false;
    const cleanCanDelete = canDeleteAccount !== undefined
      ? canDeleteAccount === true
      : allowAccountDeletion === true;

    await db.collection('system_settings').updateOne(
      { _id: 'new_user_defaults' as any },
      {
        $set: {
          expiryMode: cleanExpiryMode,
          canDeleteAccount: cleanCanDelete,
          allowAccountDeletion: cleanCanDelete,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: 'New user default settings updated successfully.',
      data: {
        expiryMode: cleanExpiryMode,
        canDeleteAccount: cleanCanDelete,
        allowAccountDeletion: cleanCanDelete,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to update default settings.' });
  }
}

// 11. Developer Contact Info
export async function getDeveloperContact(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const contact = await db.collection('system_settings').findOne({ _id: 'developer_contact' as any });
    return res.json({
      success: true,
      data: {
        name: contact?.name || '',
        phone: contact?.phone || '',
        address: contact?.address || '',
        email: contact?.email || '',
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to fetch developer contact info.' });
  }
}

export async function updateDeveloperContact(req: Request, res: Response) {
  try {
    const { name, phone, address, email } = req.body;
    const db = getDatabase();
    const data = {
      name: typeof name === 'string' ? name.trim() : '',
      phone: typeof phone === 'string' ? phone.trim() : '',
      address: typeof address === 'string' ? address.trim() : '',
      email: typeof email === 'string' ? email.trim() : '',
      updatedAt: new Date().toISOString(),
    };

    await db.collection('system_settings').updateOne(
      { _id: 'developer_contact' as any },
      { $set: data },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: 'Developer contact info saved successfully.',
      data,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to update developer contact info.' });
  }
}

// 12. Notifications (Admin -> Teacher)
export async function getTeacherNotifications(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const teacherId = req.user?.userId;
    if (!teacherId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const orClauses: any[] = [{ teacherId }, { teacherId: teacherId.toString() }];
    if (ObjectId.isValid(teacherId)) {
      orClauses.push({ teacherId: new ObjectId(teacherId) });
    }

    const notifications = await db.collection('notifications')
      .find({ $or: orClauses })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = notifications.map(n => ({
      id: n._id.toString(),
      message: n.message,
      read: !!(n.read || n.isRead),
      isRead: !!(n.read || n.isRead),
      createdAt: n.createdAt,
      adminUsername: n.adminUsername || 'Administrator',
    }));

    const unreadCount = formatted.filter(n => !n.read).length;

    return res.json({
      success: true,
      data: formatted,
      unreadCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
}

export async function markNotificationsRead(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const teacherId = req.user?.userId;
    if (!teacherId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const orClauses: any[] = [{ teacherId }, { teacherId: teacherId.toString() }];
    if (ObjectId.isValid(teacherId)) {
      orClauses.push({ teacherId: new ObjectId(teacherId) });
    }

    await db.collection('notifications').updateMany(
      { $or: orClauses },
      { $set: { read: true, isRead: true } }
    );

    return res.json({ success: true, message: 'Notifications marked as read.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to mark notifications as read.' });
  }
}

export async function getAdminTeacherNotifications(req: Request, res: Response) {
  const { teacherId } = req.params;
  try {
    const db = getDatabase();
    const notifications = await db.collection('notifications')
      .find({ teacherId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      success: true,
      data: notifications.map(n => ({
        id: n._id.toString(),
        message: n.message,
        read: !!n.read,
        createdAt: n.createdAt,
        adminUsername: n.adminUsername || 'Administrator',
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load teacher notifications.' });
  }
}

export async function sendTeacherNotification(req: Request, res: Response) {
  const { teacherId } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message text is required.' });
  }

  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    const newNotification = {
      teacherId,
      adminId: req.user?.userId || '',
      adminUsername: req.user?.username || 'Administrator',
      message: message.trim(),
      read: false,
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection('notifications').insertOne(newNotification);

    // Also write into messages collection for seamless 2-way conversation thread
    await db.collection('messages').insertOne({
      conversationId: `admin:${teacherId}`,
      senderId: 'admin',
      senderUsername: req.user?.username || 'admin',
      senderFullName: 'Admin',
      senderRole: req.user?.role || 'master_admin',
      recipientId: teacherId,
      recipientUsername: teacher.username,
      recipientFullName: teacher.fullName || '',
      recipientRole: 'teacher',
      message: message.trim(),
      read: false,
      createdAt: newNotification.createdAt,
    });

    return res.json({
      success: true,
      message: 'Notification sent successfully.',
      data: {
        id: result.insertedId.toString(),
        ...newNotification,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to send notification.' });
  }
}

export async function deleteAdminNotification(req: Request, res: Response) {
  const { notificationId } = req.params;
  try {
    const db = getDatabase();
    const result = await db.collection('notifications').deleteOne({ _id: new ObjectId(notificationId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    return res.json({ success: true, message: 'Notification deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
}

// 13. Comprehensive Teacher Info CSV Export
export async function exportTeacherData(req: Request, res: Response) {
  const { teacherId } = req.params;
  try {
    const db = getDatabase();
    const teacher = await db.collection('users').findOne({ _id: new ObjectId(teacherId), role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    // 1. Classes & Sections
    const classes = await db.collection('classes').find({ teacherId }).sort({ order: 1, createdAt: 1 }).toArray();
    const classIds = classes.map(c => c._id.toString());
    const sections = await db.collection('sections').find({ classId: { $in: classIds } }).sort({ order: 1, createdAt: 1 }).toArray();
    const sectionIds = sections.map(s => s._id.toString());

    // 2. Students
    const students = await db.collection('students').find({ sectionId: { $in: sectionIds } }).sort({ rollNumber: 1 }).toArray();

    // 3. Assessments
    const exams = await db.collection('examinations').find({ classId: { $in: classIds } }).toArray();
    const assignments = await db.collection('assignments').find({ classId: { $in: classIds } }).toArray();

    // 4. Marks
    const marks = await db.collection('marks').find({ sectionId: { $in: sectionIds } }).toArray();

    // 5. Attendance
    const attendanceRecords = await db.collection('attendance').find({ sectionId: { $in: sectionIds } }).toArray();

    // Maps
    const classMap = new Map(classes.map(c => [c._id.toString(), c]));
    const sectionMap = new Map(sections.map(s => [s._id.toString(), s]));

    // Map student attendance
    // attendance item has records: [{ studentId, status: 'present' | 'absent' }]
    const studentAttendanceMap = new Map<string, { total: number; present: number; absent: number }>();
    attendanceRecords.forEach(att => {
      if (Array.isArray(att.records)) {
        att.records.forEach((r: any) => {
          const sId = r.studentId?.toString();
          if (!sId) return;
          const curr = studentAttendanceMap.get(sId) || { total: 0, present: 0, absent: 0 };
          curr.total += 1;
          if (r.status === 'present') curr.present += 1;
          else if (r.status === 'absent') curr.absent += 1;
          studentAttendanceMap.set(sId, curr);
        });
      }
    });

    // Map student marks
    // marks schema: { studentId, itemId, itemType: 'assignment' | 'examination', marksObtained, updatedAt }
    const examMap = new Map(exams.map(e => [e._id.toString(), e]));
    const assignmentMap = new Map(assignments.map(a => [a._id.toString(), a]));
    const studentMarksMap = new Map<string, string[]>();

    marks.forEach(m => {
      const sId = m.studentId?.toString();
      if (!sId) return;
      const itemIdStr = (m.itemId || m.assessmentId)?.toString();
      let assessTitle = 'Assessment';
      let maxMarksVal: number | string = 'N/A';

      if (m.itemType === 'examination' || m.assessmentType === 'exam') {
        const e = examMap.get(itemIdStr);
        assessTitle = e ? `Exam: ${e.name}` : 'Exam';
        maxMarksVal = e?.maxMarks ?? m.maxScore ?? 'N/A';
      } else {
        const a = assignmentMap.get(itemIdStr);
        assessTitle = a ? `Assignment: ${a.name || a.title}` : 'Assignment';
        maxMarksVal = a?.maxMarks ?? m.maxScore ?? 'N/A';
      }

      const scoreVal = m.marksObtained !== undefined ? m.marksObtained : m.score;
      const scoreDisplay = (scoreVal !== null && scoreVal !== undefined) ? scoreVal : 'Absent/Pending';
      const scoreStr = `${assessTitle} (${scoreDisplay}/${maxMarksVal})`;
      const list = studentMarksMap.get(sId) || [];
      list.push(scoreStr);
      studentMarksMap.set(sId, list);
    });

    // Generate CSV
    const rows: string[] = [];

    // SECTION 1: TEACHER PROFILE
    rows.push(formatCell('--- TEACHER PROFILE ---'));
    rows.push(['Field', 'Value'].map(formatCell).join(','));
    rows.push(['Username', teacher.username].map(formatCell).join(','));
    rows.push(['Full Name', teacher.fullName || 'N/A'].map(formatCell).join(','));
    rows.push(['Phone Number', teacher.phoneNumber || 'N/A'].map(formatCell).join(','));
    rows.push(['Institution / College', teacher.college || 'N/A'].map(formatCell).join(','));
    rows.push(['Date of Birth', teacher.dob || 'N/A'].map(formatCell).join(','));
    rows.push(['Account Status', (teacher.status || 'active').toUpperCase()].map(formatCell).join(','));
    rows.push(['Expiry Mode', teacher.expiryMode !== false ? 'ON' : 'OFF (Lifetime Access)'].map(formatCell).join(','));
    rows.push(['Expiry Date', teacher.expiryMode !== false && teacher.expiresAt ? new Date(teacher.expiresAt).toLocaleDateString() : 'No Expiry'].map(formatCell).join(','));
    rows.push(['Account Deletion Lock', teacher.isDeletionLocked ? 'Locked' : 'Unlocked'].map(formatCell).join(','));
    rows.push(['Created Date', teacher.createdAt ? new Date(teacher.createdAt).toLocaleDateString() : 'N/A'].map(formatCell).join(','));
    rows.push('');

    // SECTION 2: CLASSES & SECTIONS SUMMARY
    rows.push(formatCell('--- CLASSES & SECTIONS SUMMARY ---'));
    rows.push(['Class Name', 'Section Name', 'Academic Year', 'Attendance Feature', 'Created Date'].map(formatCell).join(','));
    if (sections.length === 0) {
      rows.push(['No sections created yet', '', '', '', ''].map(formatCell).join(','));
    } else {
      sections.forEach(sec => {
        const cls = classMap.get(sec.classId);
        rows.push([
          cls ? cls.name : 'Unknown Class',
          sec.name,
          sec.academicYear || 'N/A',
          cls?.attendanceEnabled ? 'Enabled' : 'Disabled',
          sec.createdAt ? new Date(sec.createdAt).toLocaleDateString() : 'N/A',
        ].map(formatCell).join(','));
      });
    }
    rows.push('');

    // SECTION 3: STUDENTS ROSTER & ACADEMIC PERFORMANCE
    rows.push(formatCell('--- STUDENTS ROSTER & ACADEMIC PERFORMANCE ---'));
    rows.push([
      'Class',
      'Section',
      'Roll No',
      'Symbol No',
      'Student Name',
      'Student Contact',
      'Parent Contact',
      'Attendance (Present/Total)',
      'Attendance %',
      'Assessments & Marks Breakdown',
    ].map(formatCell).join(','));

    if (students.length === 0) {
      rows.push(['No students registered yet', '', '', '', '', '', '', '', '', ''].map(formatCell).join(','));
    } else {
      students.forEach(st => {
        const sec = sectionMap.get(st.sectionId);
        const cls = sec ? classMap.get(sec.classId) : null;
        const sId = st._id.toString();
        const att = studentAttendanceMap.get(sId);
        const attText = att ? `${att.present}/${att.total}` : '0/0';
        const attPct = att && att.total > 0 ? `${Math.round((att.present / att.total) * 100)}%` : 'N/A';
        const marksList = studentMarksMap.get(sId) || [];
        const marksStr = marksList.length > 0 ? marksList.join('; ') : 'No marks recorded';

        const displayName = st.studentName || st.name || 'Unknown Student';
        const contact = st.contactNumber || st.parentContact || 'N/A';
        const parentContact = st.parentContact || st.contactNumber || 'N/A';

        rows.push([
          cls ? cls.name : 'Unknown',
          sec ? sec.name : 'Unknown',
          st.rollNumber,
          st.symbolNumber || 'N/A',
          displayName,
          contact,
          parentContact,
          attText,
          attPct,
          marksStr,
        ].map(formatCell).join(','));
      });
    }

    const csvContent = rows.join('\r\n');
    const safeUsername = teacher.username.replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="teacher_${safeUsername}_complete_data.csv"`);
    return res.send('\uFEFF' + csvContent);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to export teacher data.' });
  }
}

export async function getAdminStats(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const teachersCount = await db.collection('users').countDocuments({ role: 'teacher' });
    const classesCount = await db.collection('classes').countDocuments();
    const studentsCount = await db.collection('students').countDocuments();
    const attendanceRecordsCount = await db.collection('attendance').countDocuments();
    return res.json({
      success: true,
      data: {
        teachersCount,
        classesCount,
        studentsCount,
        attendanceRecordsCount,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve admin stats.' });
  }
}

export async function createTeacherByAdmin(req: Request, res: Response) {
  const { fullName, phoneNumber, username, password, college, dob } = req.body;
  if (!fullName || !username || !password) {
    return res.status(400).json({ success: false, message: 'Full name, username, and password are required.' });
  }
  try {
    const db = getDatabase();
    const cleanUsername = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username is already taken.' });
    }
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const result = await db.collection('users').insertOne({
      username: cleanUsername,
      fullName: String(fullName).trim(),
      phoneNumber: String(phoneNumber || '').trim(),
      college: String(college || '').trim(),
      dob: String(dob || '').trim(),
      customFields: {},
      passwordHash,
      role: 'teacher',
      status: 'active',
      isDeletionLocked: false,
      mustChangePassword: true,
      tokenVersion: 0,
      expiryMode: false,
      createdAt: now,
    });
    return res.status(201).json({
      success: true,
      message: 'Teacher account created successfully.',
      data: {
        id: result.insertedId.toString(),
        username: cleanUsername,
        fullName,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to create teacher account.' });
  }
}

