import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService.js';
import { AppError } from '../middleware/errorHandler.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, preferredIndustries } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const { token, user } = await authService.register({
      email,
      password,
      preferredIndustries,
    });

    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const { token, user } = await authService.login({ email, password });

    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.clearCookie('token', { path: '/' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const user = await authService.getCurrentUser(req.user.userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
