import { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase, isDatabaseConnected, getDbConnectionError } from './db.ts';
import { verifyToken, TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME, JwtPayload } from './auth.ts';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// 1. Require Database Connection
export function requireDb(req: Request, res: Response, next: NextFunction) {
  if (!isDatabaseConnected()) {
    const errorMsg = getDbConnectionError() || 'Database is not connected. Please check MONGODB_URI configuration.';
    return res.status(503).json({
      success: false,
      error: 'DATABASE_NOT_CONFIGURED',
      message: errorMsg,
    });
  }
  next();
}

// 2. CSRF Protection Middleware
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Exempt public auth endpoints from CSRF check (login/register establish the session)
  const exemptPaths = ['/auth/login', '/auth/register', '/auth/register-admin', '/auth/csrf'];
  if (exemptPaths.some(p => req.path === p)) {
    return next();
  }

  const clientCsrfToken = req.headers['x-csrf-token'] as string;
  const cookieCsrfToken = req.cookies[CSRF_COOKIE_NAME];

  if (!clientCsrfToken || !cookieCsrfToken || clientCsrfToken !== cookieCsrfToken) {
    return res.status(403).json({
      success: false,
      error: 'INVALID_CSRF_TOKEN',
      message: 'Invalid or missing CSRF token. Please refresh the page.',
    });
  }

  next();
}

// 3. Require Authenticated User
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies[TOKEN_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in.',
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Session expired or invalid. Please log in again.',
    });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.userId) });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Account not found.',
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended by the administrator.',
      });
    }

    // Token version check (forced logout / password reset invalidation)
    const dbTokenVersion = user.tokenVersion ?? 0;
    const payloadTokenVersion = payload.tokenVersion ?? 0;
    if (payloadTokenVersion !== dbTokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'SESSION_REVOKED',
        message: 'Your session has been invalidated. Please log in again.',
      });
    }

    // Check mandatory password change flow
    if (user.mustChangePassword) {
      const allowedPaths = ['/auth/change-password', '/auth/logout', '/auth/me', '/auth/csrf'];
      const isAllowed = allowedPaths.some(p => req.path.endsWith(p));
      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          error: 'MUST_CHANGE_PASSWORD',
          message: 'You must change your temporary password before accessing other features.',
        });
      }
    }

    const expiryTime = user.expiresAt ? new Date(user.expiresAt).getTime() : Date.now() + 3 * 86400000;
    const isExpired = user.role === 'teacher' && expiryTime < Date.now();
    const daysRemaining = user.role === 'teacher' ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) : undefined;

    req.user = {
      userId: user._id.toString(),
      username: user.username,
      fullName: user.fullName || '',
      college: user.college || '',
      role: user.role,
      status: user.status || 'active',
      tokenVersion: dbTokenVersion,
      isExpired,
      expiresAt: user.expiresAt,
      daysRemaining,
    };

    next();
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Failed to verify user session.',
    });
  }
}

// 4. Require Teacher Role
export async function requireTeacher(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Access restricted to teachers.',
    });
  }

  // If teacher is in read-only mode, allow GET (read-only) and profile editing, but block other mutating operations
  if (req.method !== 'GET') {
    const isSafePath = req.path.includes('/auth/logout') || req.path.includes('/auth/change-password') || req.path.includes('/auth/profile');
    if (!isSafePath) {
      if (req.user.isExpired) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_EXPIRED',
          message: 'Your teacher account has expired. You are currently in Read-Only Mode. Please contact the administrator to renew access.',
        });
      }

      // Check if admin turned on read-only mode for this teacher
      try {
        const db = getDatabase();
        const userDoc = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });
        if (userDoc?.isReadOnly) {
          return res.status(403).json({
            success: false,
            error: 'READ_ONLY_MODE',
            message: 'Your account is in Read-Only Mode set by the Administrator. Please contact the administrator to enable editing.',
          });
        }
      } catch (err) {
        console.error('Error checking read-only mode in requireTeacher:', err);
      }
    }
  }

  next();
}

// 5. Require Administrator Role
export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'master_admin' && req.user.role !== 'administrator')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Access restricted to Administrators.',
    });
  }
  next();
}

// 6. Server-Side Ownership Checks
export async function verifyClassOwnership(req: Request, res: Response, next: NextFunction) {
  const classId = req.params.classId;
  if (!classId || !ObjectId.isValid(classId)) {
    return res.status(400).json({ success: false, message: 'Invalid Class ID.' });
  }

  try {
    const db = getDatabase();
    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(classId) });

    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    // Teachers can only access their own
    if (classDoc.teacherId.toString() !== req.user?.userId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to access this class.' });
    }

    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Ownership verification failed.' });
  }
}

export async function verifySectionOwnership(req: Request, res: Response, next: NextFunction) {
  const sectionId = req.params.sectionId;
  if (!sectionId || !ObjectId.isValid(sectionId)) {
    return res.status(400).json({ success: false, message: 'Invalid Section ID.' });
  }

  try {
    const db = getDatabase();
    const sectionDoc = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });

    if (!sectionDoc) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (sectionDoc.teacherId.toString() !== req.user?.userId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to access this section.' });
    }

    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Ownership verification failed.' });
  }
}
