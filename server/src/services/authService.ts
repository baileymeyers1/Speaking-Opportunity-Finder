import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';
import type { JwtPayload } from '../middleware/auth.js';

const prisma = new PrismaClient();

export interface RegisterInput {
  email: string;
  password: string;
  preferredIndustries?: string[];
}

export interface LoginInput {
  email: string;
  password: string;
}

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function register(input: RegisterInput) {
  const { email, password, preferredIndustries = [] } = input;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(400, 'Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      preferredIndustries: JSON.stringify(preferredIndustries),
    },
    select: {
      id: true,
      email: true,
      preferredIndustries: true,
      createdAt: true,
    },
  });

  const token = generateToken({ userId: user.id, email: user.email });

  return {
    user: {
      ...user,
      preferredIndustries: parseJsonArray(user.preferredIndustries),
    },
    token,
  };
}

export async function login(input: LoginInput) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = generateToken({ userId: user.id, email: user.email });

  return {
    user: {
      id: user.id,
      email: user.email,
      preferredIndustries: parseJsonArray(user.preferredIndustries),
      createdAt: user.createdAt,
    },
    token,
  };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      preferredIndustries: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  return {
    ...user,
    preferredIndustries: parseJsonArray(user.preferredIndustries),
  };
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as string,
  } as jwt.SignOptions);
}
