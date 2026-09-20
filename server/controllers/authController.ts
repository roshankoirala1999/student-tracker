import crypto from 'crypto';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { hashPassword, comparePassword, signToken, generateCsrfToken, setAuthCookies, clearAuthCookies } from '../auth.ts';
import { UserRole, UserStatus } from '../../src/types/index.ts';

export async function cascadeDeleteTeacherData(db: any, teacherId: string) {
  const teacherObjId = ObjectId.isValid(teacherId) ? new ObjectId(teacherId) : teacherId;
  await Promise.all([
    db.collection('classes').deleteMany({ teacherId }),
    db.collection('sections').deleteMany({ teacherId }),
    db.collection('students').deleteMany({ teacherId }),
    db.collection('marks').deleteMany({ teacherId }),
    db.collection('attendance').deleteMany({ teacherId }),
    db.collection('examinations').deleteMany({ teacherId }),
    db.collection('assignments').deleteMany({ teacherId }),
    db.collection('users').deleteOne({ _id: teacherObjId }),
  ]);
}

export async function registerTeacher(req: Request, res: Response) {
  const { fullName, phoneNumber, username, password } = req.body;

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Full Name is required.' });
  }

  if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Phone Number is required.' });
  }

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long.' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
  }

  const cleanUsername = username.trim().toLowerCase();

  // 1. Username Constraint: Disallow any username containing 'admin' (case-insensitive)
  if (cleanUsername.includes('admin')) {
    return res.status(400).json({
      success: false,
      message: "Username cannot contain the reserved term 'admin'.",
    });
  }

  // 2. Password Constraint: Disallow passwords containing 'password' or 'admin' (case-insensitive)
  const lowerPassword = password.toLowerCase();
  if (lowerPassword.includes('password') || lowerPassword.includes('admin')) {
    return res.status(400).json({
      success: false,
      message: "Password cannot contain reserved words such as 'password' or 'admin'.",
    });
  }

  try {
    const db = getDatabase();
    const existing = await db.collection('users').findOne({ username: cleanUsername });

    if (existing) {
      return res.status(409).json({ success: false, message: 'Username is already taken. Please choose another.' });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    // 3-day trial period on initial creation
    const trialExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const insertResult = await db.collection('users').insertOne({
      username: cleanUsername,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      college: '',
      dob: '',
      customFields: {},
      plainPassword: password,
      passwordHash,
      role: 'teacher' as UserRole,
      status: 'active' as UserStatus,
      isDeletionLocked: false,
      mustChangePassword: false,
      tokenVersion: 0,
      expiresAt: trialExpiresAt,
      createdAt: now,
    });

    const userId = insertResult.insertedId.toString();

    const token = signToken({
      userId,
      username: cleanUsername,
      role: 'teacher',
      status: 'active',
      tokenVersion: 0,
      expiresAt: trialExpiresAt,
      isExpired: false,
      daysRemaining: 3,
    });

    const csrfToken = generateCsrfToken();
    setAuthCookies(res, token, csrfToken);

    return res.status(201).json({
      success: true,
      data: {
        id: userId,
        username: cleanUsername,
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        college: '',
        dob: '',
        customFields: {},
        plainPassword: password,
        role: 'teacher',
        status: 'active',
        isDeletionLocked: false,
        mustChangePassword: false,
        tokenVersion: 0,
        expiresAt: trialExpiresAt,
        isExpired: false,
        daysRemaining: 3,
        createdAt: now,
      },
      csrfToken,
      message: 'Teacher account created successfully.',
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function login(req: Request, res: Response) {
  const { username, password, portal } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Please provide both username and password.' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ username: cleanUsername });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    const passwordValid = await comparePassword(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    // Portal Segregation
    if (portal === 'administrator' && user.role === 'teacher') {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }
    if (portal === 'teacher' && (user.role === 'administrator' || user.role === 'master_admin')) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended by the administrator.' });
    }

    // Sync plainPassword and ensure 3-day trial expiry exists for teachers
    const updateOps: any = {};
    if (!user.plainPassword && password) {
      updateOps.plainPassword = password;
      user.plainPassword = password;
    }
    if (user.role === 'teacher' && !user.expiresAt) {
      const defaultTrial = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      updateOps.expiresAt = defaultTrial;
      user.expiresAt = defaultTrial;
    }
    if (Object.keys(updateOps).length > 0) {
      await db.collection('users').updateOne({ _id: user._id }, { $set: updateOps });
    }

    const expiryTime = user.expiresAt ? new Date(user.expiresAt).getTime() : Date.now() + 3 * 86400000;
    const isExpired = user.role === 'teacher' && expiryTime < Date.now();
    const daysRemaining = user.role === 'teacher' ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) : undefined;

    const userId = user._id.toString();
    const tokenVersion = user.tokenVersion ?? 0;
    const token = signToken({
      userId,
      username: user.username,
      role: user.role,
      status: user.status || 'active',
      tokenVersion,
      expiresAt: user.expiresAt,
      isExpired,
      daysRemaining,
    });

    const csrfToken = generateCsrfToken();
    setAuthCookies(res, token, csrfToken);

    return res.status(200).json({
      success: true,
      data: {
        id: userId,
        username: user.username,
        fullName: user.fullName || '',
        phoneNumber: user.phoneNumber || '',
        college: user.college || '',
        dob: user.dob || '',
        customFields: user.customFields || {},
        plainPassword: user.plainPassword || password,
        role: user.role,
        status: user.status || 'active',
        isDeletionLocked: !!user.isDeletionLocked,
        mustChangePassword: !!user.mustChangePassword,
        tokenVersion,
        expiresAt: user.expiresAt,
        isExpired,
        daysRemaining,
        createdAt: user.createdAt,
      },
      csrfToken,
      message: 'Logged in successfully.',
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function changePassword(req: Request, res: Response) {
  const { oldPassword, newPassword } = req.body;

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
  }

  const lowerNew = newPassword.toLowerCase();
  if (lowerNew.includes('password') || lowerNew.includes('admin')) {
    return res.status(400).json({
      success: false,
      message: "New password cannot contain reserved words such as 'password' or 'admin'.",
    });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // If the user is NOT flagged for forced password change, require verification of the old password
    if (!user.mustChangePassword) {
      if (!oldPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required.' });
      }
      const valid = await comparePassword(oldPassword, user.passwordHash);
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
    }

    const newHash = await hashPassword(newPassword);
    const newTokenVersion = (user.tokenVersion || 0) + 1;

    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: newHash,
          plainPassword: newPassword,
          mustChangePassword: false,
          tokenVersion: newTokenVersion,
        },
        $unset: { adminPasswordRecord: "" },
      }
    );

    const newToken = signToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      status: user.status || 'active',
      tokenVersion: newTokenVersion,
    });

    const csrfToken = generateCsrfToken();
    setAuthCookies(res, newToken, csrfToken);

    return res.json({
      success: true,
      message: 'Password updated successfully.',
      data: {
        id: user._id.toString(),
        username: user.username,
        fullName: user.fullName || '',
        phoneNumber: user.phoneNumber || '',
        college: user.college || '',
        dob: user.dob || '',
        customFields: user.customFields || {},
        plainPassword: newPassword,
        role: user.role,
        status: user.status || 'active',
        isDeletionLocked: !!user.isDeletionLocked,
        mustChangePassword: false,
        tokenVersion: newTokenVersion,
        createdAt: user.createdAt,
      },
      csrfToken,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function logout(req: Request, res: Response) {
  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

    // Ensure fresh CSRF cookie exists
    let csrfToken = req.cookies['csrf_token'];
    if (!csrfToken) {
      csrfToken = generateCsrfToken();
      res.cookie('csrf_token', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    const isTeacher = req.user.role === 'teacher';
    let userExpiresAt = user?.expiresAt;
    if (isTeacher && !userExpiresAt && user) {
      userExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await db.collection('users').updateOne({ _id: user._id }, { $set: { expiresAt: userExpiresAt } });
    }

    const expiryTime = userExpiresAt ? new Date(userExpiresAt).getTime() : Date.now() + 3 * 86400000;
    const isExpired = isTeacher && expiryTime < Date.now();
    const daysRemaining = isTeacher ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) : undefined;

    return res.status(200).json({
      success: true,
      data: {
        id: req.user.userId,
        username: req.user.username,
        fullName: user?.fullName || '',
        phoneNumber: user?.phoneNumber || '',
        college: user?.college || '',
        dob: user?.dob || '',
        customFields: user?.customFields || {},
        plainPassword: user?.plainPassword || '',
        role: req.user.role,
        status: user ? user.status || 'active' : req.user.status,
        isDeletionLocked: user ? !!user.isDeletionLocked : false,
        mustChangePassword: user ? !!user.mustChangePassword : false,
        tokenVersion: user ? user.tokenVersion ?? 0 : 0,
        expiresAt: userExpiresAt,
        isExpired,
        daysRemaining,
        createdAt: user ? user.createdAt : undefined,
      },
      csrfToken,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateTeacherProfile(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  const { fullName, phoneNumber, username, college, dob, password } = req.body;

  // Strict boundary: Rejects any teacher attempt to mutate fullName, phoneNumber, or username
  if (fullName !== undefined || phoneNumber !== undefined || username !== undefined) {
    return res.status(403).json({
      success: false,
      message: 'Name, Phone Number, and Username are editable by Admin only.',
    });
  }

  const updateFields: any = {};

  if (college !== undefined) {
    updateFields.college = typeof college === 'string' ? college.trim() : '';
  }

  if (dob !== undefined) {
    const cleanDob = typeof dob === 'string' ? dob.trim() : '';
    if (cleanDob !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDob)) {
        return res.status(400).json({
          success: false,
          message: 'Date of Birth must be in YYYY-MM-DD format (e.g., 2056-01-01).',
        });
      }
    }
    updateFields.dob = cleanDob;
  }

  let newPassHash: string | undefined;
  let cleanNewPass: string | undefined;

  if (password && typeof password === 'string' && password.trim() !== '') {
    cleanNewPass = password.trim();
    if (cleanNewPass.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }
    const lower = cleanNewPass.toLowerCase();
    if (lower.includes('password') || lower.includes('admin')) {
      return res.status(400).json({
        success: false,
        message: "Password cannot contain reserved words such as 'password' or 'admin'.",
      });
    }
    newPassHash = await hashPassword(cleanNewPass);
    updateFields.passwordHash = newPassHash;
    updateFields.plainPassword = cleanNewPass;
    updateFields.mustChangePassword = false;
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (newPassHash) {
      const nextTokenVer = (user.tokenVersion || 0) + 1;
      updateFields.tokenVersion = nextTokenVer;
    }

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: updateFields }
    );

    const updatedUser = await db.collection('users').findOne({ _id: user._id });

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        id: updatedUser!._id.toString(),
        username: updatedUser!.username,
        fullName: updatedUser!.fullName || '',
        phoneNumber: updatedUser!.phoneNumber || '',
        college: updatedUser!.college || '',
        dob: updatedUser!.dob || '',
        customFields: updatedUser!.customFields || {},
        plainPassword: updatedUser!.plainPassword || '',
        role: updatedUser!.role,
        status: updatedUser!.status || 'active',
        isDeletionLocked: !!updatedUser!.isDeletionLocked,
        mustChangePassword: !!updatedUser!.mustChangePassword,
        tokenVersion: updatedUser!.tokenVersion ?? 0,
        createdAt: updatedUser!.createdAt,
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function listProfileQuestions(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const questions = await db.collection('profile_questions')
      .find({})
      .sort({ createdAt: 1 })
      .toArray();

    const formatted = questions.map((q) => ({
      id: q._id.toString(),
      questionLabel: q.questionLabel || q.questionText || '',
      questionText: q.questionText || q.questionLabel || '',
      required: Boolean(q.required),
      createdAt: q.createdAt,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load profile questions.' });
  }
}

export async function createProfileQuestion(req: Request, res: Response) {
  const rawLabel = req.body.questionLabel || req.body.questionText;
  const isRequired = Boolean(req.body.required);

  if (!rawLabel || typeof rawLabel !== 'string' || rawLabel.trim() === '') {
    return res.status(400).json({ success: false, message: 'Question label is required.' });
  }

  try {
    const db = getDatabase();
    const cleanLabel = rawLabel.trim();
    const now = new Date().toISOString();

    const result = await db.collection('profile_questions').insertOne({
      questionLabel: cleanLabel,
      questionText: cleanLabel,
      required: isRequired,
      createdAt: now,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        questionLabel: cleanLabel,
        questionText: cleanLabel,
        required: isRequired,
        createdAt: now,
      },
      message: 'Profile question created successfully.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to create profile question.' });
  }
}

export async function deleteProfileQuestion(req: Request, res: Response) {
  const { id } = req.params;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Question ID.' });
  }

  try {
    const db = getDatabase();
    await db.collection('profile_questions').deleteOne({ _id: new ObjectId(id) });
    return res.json({ success: true, message: 'Profile question deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to delete profile question.' });
  }
}

export async function deleteAccount(req: Request, res: Response) {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password confirmation is required to delete your account.' });
  }

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    if (user.isDeletionLocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been locked from deletion by the Administrator.',
      });
    }

    const passwordValid = await comparePassword(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(403).json({ success: false, message: 'Incorrect password. Account deletion aborted.' });
    }

    const teacherId = req.user.userId;
    await cascadeDeleteTeacherData(db, teacherId);
    clearAuthCookies(res);

    return res.json({
      success: true,
      message: 'Your account and all associated academic records have been permanently deleted.',
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function getCsrfToken(req: Request, res: Response) {
  let csrfToken = req.cookies['csrf_token'];
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  return res.json({ success: true, csrfToken });
}

export async function getAdminSetupStatus(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const count = await db.collection('users').countDocuments({
      role: { $in: ['administrator', 'master_admin'] },
    });
    return res.json({ success: true, needsSetup: count === 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function registerMasterAdmin(req: Request, res: Response) {
  const { username, password, bootstrapKey } = req.body;

  try {
    const db = getDatabase();

    // Check if any user with administrator or master_admin role already exists
    const count = await db.collection('users').countDocuments({
      role: { $in: ['administrator', 'master_admin'] },
    });
    if (count > 0) {
      return res.status(403).json({ success: false, message: 'Administrator account already exists.' });
    }

    // Validate ADMIN_BOOTSTRAP_KEY using crypto.timingSafeEqual
    const expectedKey = process.env.ADMIN_BOOTSTRAP_KEY || '';
    const bufProvided = Buffer.from(String(bootstrapKey || ''));
    const bufExpected = Buffer.from(expectedKey);
    if (bufProvided.length !== bufExpected.length || !crypto.timingSafeEqual(bufProvided, bufExpected)) {
      return res.status(403).json({ success: false, message: 'Invalid administrative bootstrap key.' });
    }

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    }

    if (!password || password.length < 10) {
      return res.status(400).json({ success: false, message: 'Admin password must be at least 10 characters.' });
    }

    const cleanUsername = username.trim().toLowerCase();

    const existing = await db.collection('users').findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    await db.collection('users').insertOne({
      username: cleanUsername,
      passwordHash,
      role: 'master_admin' as UserRole,
      status: 'active' as UserStatus,
      mustChangePassword: false,
      tokenVersion: 0,
      createdAt: now,
    });

    return res.status(201).json({
      success: true,
      message: 'Administrator account initialized successfully. You may now log in.',
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}
