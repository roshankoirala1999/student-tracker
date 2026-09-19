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
  const { username, password } = req.body;

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

    const insertResult = await db.collection('users').insertOne({
      username: cleanUsername,
      passwordHash,
      role: 'teacher' as UserRole,
      status: 'active' as UserStatus,
      isDeletionLocked: false,
      mustChangePassword: false,
      tokenVersion: 0,
      createdAt: now,
    });

    const userId = insertResult.insertedId.toString();

    const token = signToken({
      userId,
      username: cleanUsername,
      role: 'teacher',
      status: 'active',
      tokenVersion: 0,
    });

    const csrfToken = generateCsrfToken();
    setAuthCookies(res, token, csrfToken);

    return res.status(201).json({
      success: true,
      data: {
        id: userId,
        username: cleanUsername,
        role: 'teacher',
        status: 'active',
        isDeletionLocked: false,
        mustChangePassword: false,
        tokenVersion: 0,
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

    const userId = user._id.toString();
    const tokenVersion = user.tokenVersion ?? 0;
    const token = signToken({
      userId,
      username: user.username,
      role: user.role,
      status: user.status || 'active',
      tokenVersion,
    });

    const csrfToken = generateCsrfToken();
    setAuthCookies(res, token, csrfToken);

    return res.status(200).json({
      success: true,
      data: {
        id: userId,
        username: user.username,
        role: user.role,
        status: user.status || 'active',
        isDeletionLocked: !!user.isDeletionLocked,
        mustChangePassword: !!user.mustChangePassword,
        tokenVersion,
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

    return res.status(200).json({
      success: true,
      data: {
        id: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        status: user ? user.status || 'active' : req.user.status,
        isDeletionLocked: user ? !!user.isDeletionLocked : false,
        mustChangePassword: user ? !!user.mustChangePassword : false,
        tokenVersion: user ? user.tokenVersion ?? 0 : 0,
        createdAt: user ? user.createdAt : undefined,
      },
      csrfToken,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
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
