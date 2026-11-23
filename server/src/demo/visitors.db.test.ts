import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import { createDemoVisitor, DEMO_EMAIL_DOMAIN, DEMO_ROSTER, DEMO_SESSION_MS, pruneDemoVisitors } from './visitors.js';

/** Against the test Postgres: a demo visit's account, roster and saved calls. */
const STAMP = Date.now();
const NOW = new Date();
let callId = '';

beforeAll(async () => {
  const call = await prisma.opportunity.create({
    data: {
      title: `Demo visitor test health summit ${STAMP}`,
      organization: 'Visitor Test Org',
      format: 'conference',
      sectors: ['healthcare'],
      applyUrl: `https://visitor-test.example/${STAMP}`,
      source: 'sessionize.com',
      cfpDeadline: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
      eventDate: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
      qualityScore: 90,
      verifiedAt: NOW,
      hasOpenCall: true,
    },
  });
  callId = call.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
  await prisma.opportunity.deleteMany({ where: { id: callId } });
});

describe('createDemoVisitor', () => {
  it('makes a private account with the sample roster, saved calls and a short sign-in', async () => {
    const visit = await createDemoVisitor(NOW);
    expect(visit.user.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(visit.user.isAdmin).toBe(false);

    const speakers = await prisma.speakerProfile.findMany({ where: { userId: visit.user.id }, orderBy: { createdAt: 'asc' } });
    expect(speakers.map((speaker) => speaker.name)).toEqual(DEMO_ROSTER.map((profile) => profile.name));

    const saved = await prisma.savedOpportunity.findMany({ where: { userId: visit.user.id } });
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((row) => row.speakerId === speakers[0].id)).toBe(true);

    const payload = jwt.verify(visit.token, config.jwt.secret) as { userId: string; exp: number; iat: number };
    expect(payload.userId).toBe(visit.user.id);
    expect((payload.exp - payload.iat) * 1000).toBe(DEMO_SESSION_MS);
  });

  it('gives every visit its own account', async () => {
    const [first, second] = [await createDemoVisitor(NOW), await createDemoVisitor(NOW)];
    expect(first.user.id).not.toBe(second.user.id);
    expect(await prisma.speakerProfile.count({ where: { userId: first.user.id } })).toBe(DEMO_ROSTER.length);
  });
});

describe('pruneDemoVisitors', () => {
  it('removes visits older than a sign-in lasts, with their rosters and saves', async () => {
    const visit = await createDemoVisitor(NOW);
    const later = new Date(NOW.getTime() + DEMO_SESSION_MS + 2 * 60 * 60 * 1000);
    expect(await pruneDemoVisitors(later)).toBeGreaterThan(0);
    expect(await prisma.user.findUnique({ where: { id: visit.user.id } })).toBeNull();
    expect(await prisma.speakerProfile.count({ where: { userId: visit.user.id } })).toBe(0);
  });

  it('never touches a real account', async () => {
    const real = await prisma.user.create({ data: { email: `real-${STAMP}@example.com`, passwordHash: 'x' } });
    await pruneDemoVisitors(new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000));
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
    await prisma.user.delete({ where: { id: real.id } });
  });
});
