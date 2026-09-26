import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Response, Request, NextFunction } from 'express';
import { UserRole, UserStatus } from '../src/types/index.ts';

export const TOKEN_COOKIE_NAME = 'auth_token';
export const CSRF_COOKIE_NAME = 'csrf_token';

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

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || 'student-tracker-development-secret-key-32-chars-long-minimum-secure';
  if (!secret || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must be defined and at least 32 characters long.');
  }
  return secret.trim();
}

export function validateJwtSecret(): void {
  getJwtSecret();
}

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

export function isSecureRequest(req?: Request): boolean {
  if (!req) return false;
  return Boolean(
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers['x-forwarded-protocol'] === 'https'
  );
}

export function setAuthCookies(res: Response, req: Request, token: string, csrfToken: string) {
  const isSecure = isSecureRequest(req);

  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response, req?: Request) {
  const isSecure = isSecureRequest(req);

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
