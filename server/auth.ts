import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Response, Request, NextFunction } from 'express';
import { UserRole, UserStatus } from '../src/types/index.ts';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error('CONFIG_ERROR: JWT_SECRET is missing or shorter than 32 characters.');
  }
  return secret.trim();
}

// Initial startup validation check
export function validateJwtSecret(): void {
  getJwtSecret();
}

// Middleware to ensure every API call returns HTTP 503 {error:'CONFIG_ERROR'} when JWT_SECRET is invalid
export function checkJwtConfig(req: Request, res: Response, next: NextFunction) {
  try {
    getJwtSecret();
    next();
  } catch (err: any) {
    return res.status(503).json({
      error: 'CONFIG_ERROR',
      message: 'Server is not configured correctly. JWT_SECRET is missing or invalid.',
    });
  }
}

const TOKEN_COOKIE_NAME = 'auth_token';
const CSRF_COOKIE_NAME = 'csrf_token';

export interface JwtPayload {
  userId: string;
  username: string;
  fullName?: string;
  college?: string;
  role: UserRole;
  status: UserStatus;
  tokenVersion?: number;
  expiresAt?: string | null;
  isExpired?: boolean;
  daysRemaining?: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  if (!token) return null;
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setAuthCookies(res: Response, token: string, csrfToken: string) {
  const isSecure = process.env.NODE_ENV === 'production' || Boolean(process.env.NETLIFY);

  // Secure, httpOnly cookie for the authentication JWT
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });

  // Non-httpOnly cookie for CSRF token that client reads and sends via x-csrf-token header on mutations
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  const isSecure = process.env.NODE_ENV === 'production' || Boolean(process.env.NETLIFY);

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
