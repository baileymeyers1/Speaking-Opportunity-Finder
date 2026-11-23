import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));
const { blockDisabledInDemo } = await import('./routes.js');

function run(path: string) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const next = vi.fn();
  blockDisabledInDemo({ path } as Request, res as unknown as Response, next as NextFunction);
  return { blocked: res.status.mock.calls[0]?.[0] === 404, passed: next.mock.calls.length === 1 };
}

describe('blockDisabledInDemo', () => {
  it('switches off passwords, sign-up, resets, scrapers and admin', () => {
    for (const path of ['/auth/register', '/auth/login', '/auth/forgot-password', '/auth/reset-password', '/sync', '/sync/status', '/admin/analytics/sources', '/cron/daily-sync', '/cron/enrichment']) {
      expect(run(path), path).toEqual({ blocked: true, passed: false });
    }
  });

  it('leaves the rest of the app alone', () => {
    for (const path of ['/auth/demo', '/auth/me', '/auth/logout', '/opportunities', '/saved', '/speakers', '/cron/demo-listings', '/administrators']) {
      expect(run(path), path).toEqual({ blocked: false, passed: true });
    }
  });
});
