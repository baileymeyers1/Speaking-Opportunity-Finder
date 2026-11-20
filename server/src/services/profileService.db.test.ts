import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { getProfile, speakerProfileInputSchema, upsertProfile } from './profileService.js';

/**
 * Against the test Postgres database: saving a profile creates it once and
 * changes that same row afterwards.
 *
 * What this cannot show is the reason the write is a read followed by a create
 * or an update: Prisma's `upsert` on `userId` becomes INSERT ... ON CONFLICT,
 * which Postgres rejects once no unique index covers the column, and the
 * roster's schema (several profiles per account) drops that index in the
 * production database as soon as its preview builds.
 */
const EMAIL = `profile-db-test-${Date.now()}@example.com`;
let userId = '';

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'not-a-real-hash' } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe('the speaker profile in the database', () => {
  it('is absent until it is saved', async () => {
    expect(await getProfile(userId)).toBeNull();
  });

  it('is created by the first save', async () => {
    const saved = await upsertProfile(userId, speakerProfileInputSchema.parse({ topics: ['Healthcare'], homeCity: 'Denver' }));

    expect(saved.userId).toBe(userId);
    expect(saved.topics).toEqual(['healthcare']);
    expect((await getProfile(userId))?.id).toBe(saved.id);
  });

  it('is changed in place by the next save, never duplicated', async () => {
    const before = await getProfile(userId);
    const saved = await upsertProfile(userId, speakerProfileInputSchema.parse({ topics: ['devops'], seniority: 'keynote' }));

    expect(saved.id).toBe(before?.id);
    expect(saved.topics).toEqual(['devops']);
    expect(saved.seniority).toBe('keynote');
    // A field left out of the body goes back to its default: the body is the whole profile.
    expect(saved.homeCity).toBeNull();
    expect(await prisma.speakerProfile.count({ where: { userId } })).toBe(1);
  });
});
