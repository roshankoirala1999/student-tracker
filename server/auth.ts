import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Response, Request, NextFunction } from 'express';
import { UserRole, UserStatus } from '../src/types/index.ts';

const JWT_SECRET = process.env.JWT_SECRET || '';

// If process.env.JWT_SECRET is missing or shorter than 32 characters, throw an error at startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  const startupError = new Error('CONFIG_ERROR: JWT_SECRET is missing or shorter than 32 characters.');
  try {
    throw startupError;
  } catch (err) {
    console.error('[Startup Config Error]:', err);
  }
}

export function validateJwtSecret(): void {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('CONFIG_ERROR: JWT_SECRET is missing or shorter than 32 characters.');
  }
}

// Middleware to ensure every API call returns HTTP 503 {error:'CONFIG_ERROR'} when JWT_SECRET is invalid
export function checkJwtConfig(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: 'CONFIG_ERROR', message: 'Server is not configured correctly. Contact the administrator.' });
  }
  next();
}

const TOKEN_COOKIE_NAME = 'auth_token';
const CSRF_COOKIE_NAME = 'csrf_token';

export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  tokenVersion?: number;
  expiresAt?: string;
  isExpired?: boolean;
  daysRemaining?: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('CONFIG_ERROR: JWT_SECRET is missing or shorter than 32 characters.');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setAuthCookies(res: Response, token: string, csrfToken: string) {
  const isSecure = Boolean(process.env.NETLIFY) || process.env.NODE_ENV === 'production';

  // Secure, httpOnly cookie for the authentication JWT
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });

  // Non-httpOnly cookie for CSRF token that client reads and sends via header on mutations
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  const isSecure = Boolean(process.env.NETLIFY) || process.env.NODE_ENV === 'production';

  res.clearCookie(TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
  });

  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
  });
}

export { TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME };
