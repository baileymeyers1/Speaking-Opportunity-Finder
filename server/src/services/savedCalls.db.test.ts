import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { isSavedCategory, saveCall } from './savedCalls.js';

/**
 * Against the test Postgres database: a call is saved once per account and
 * speaker, whatever order or however close together the saves arrive. No
 * unique constraint backs this up any more, so the test is what does.
 */
const STAMP = Date.now();
const EMAIL = `saved-calls-${STAMP}@example.com`;
let userId = '';
let opportunityId = '';
let speakerId = '';

const rowsFor = (where: { speakerId?: string | null } = {}) =>
  prisma.savedOpportunity.findMany({ where: { userId, opportunityId, ...where } });

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'not-a-real-hash' } });
  userId = user.id;
  const call = await prisma.opportunity.create({
    data: {
      title: 'Saved calls test conference',
      organization: 'Saved Test Org',
      applyUrl: `https://saved-calls.example/${STAMP}`,
      format: 'conference',
      source: 'test-saved-calls',
      // Read already, so the enrichment-budget tests running alongside never claim it.
      enrichmentStatus: 'enriched',
    },
  });
  opportunityId = call.id;
  const speaker = await prisma.speakerProfile.create({ data: { userId, name: 'Dana Okafor' } });
  speakerId = speaker.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.opportunity.deleteMany({ where: { id: opportunityId } });
  await prisma.$disconnect();
});

describe('saving a call', () => {
  it('knows the four stages and nothing else', () => {
    expect(['interested', 'applied', 'accepted', 'rejected'].every(isSavedCategory)).toBe(true);
    expect(isSavedCategory('maybe')).toBe(false);
    expect(isSavedCategory(undefined)).toBe(false);
  });

  it('stores it once, with the call attached', async () => {
    const saved = await saveCall({ userId, opportunityId, category: 'interested' });

    expect(saved.category).toBe('interested');
    expect(saved.speakerId).toBeNull();
    expect(saved.opportunity.id).toBe(opportunityId);
    expect(await rowsFor()).toHaveLength(1);
  });

  it('moves the same row when the call is saved again', async () => {
    const [before] = await rowsFor();
    const saved = await saveCall({ userId, opportunityId, category: 'applied' });

    expect(saved.id).toBe(before.id);
    expect(saved.category).toBe('applied');
    expect(await rowsFor()).toHaveLength(1);
  });

  it('leaves one row when several saves arrive together', async () => {
    await prisma.savedOpportunity.deleteMany({ where: { userId } });
    await Promise.all(Array.from({ length: 6 }, () => saveCall({ userId, opportunityId, category: 'interested' })));

    expect(await rowsFor()).toHaveLength(1);
  });

  it('keeps a separate row for each speaker the call is saved for', async () => {
    await saveCall({ userId, opportunityId, category: 'accepted', speakerId });
    await saveCall({ userId, opportunityId, category: 'rejected', speakerId });

    expect((await rowsFor({ speakerId })).map((row) => row.category)).toEqual(['rejected']);
    expect((await rowsFor({ speakerId: null })).map((row) => row.category)).toEqual(['interested']);
  });

  it("goes when the speaker it was saved for is removed, and leaves the others", async () => {
    await prisma.speakerProfile.delete({ where: { id: speakerId } });

    expect(await rowsFor({ speakerId })).toHaveLength(0);
    expect(await rowsFor({ speakerId: null })).toHaveLength(1);
  });
});
