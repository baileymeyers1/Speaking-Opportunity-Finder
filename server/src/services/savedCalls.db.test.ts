import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { AlreadySavedError, UnknownSpeakerError, changeSavedCall, isSavedCategory, saveCall } from './savedCalls.js';

/**
 * Against the test Postgres database: a call is saved once per account and
 * speaker, whatever order or however close together the saves arrive. No
 * unique constraint backs this up any more, so the test is what does.
 */
const STAMP = Date.now();
const EMAIL = `saved-calls-${STAMP}@example.com`;
const STRANGER_EMAIL = `saved-calls-stranger-${STAMP}@example.com`;
let userId = '';
let opportunityId = '';
let speakerId = '';
let secondSpeakerId = '';
let strangerId = '';
let strangerSpeakerId = '';

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
  secondSpeakerId = (await prisma.speakerProfile.create({ data: { userId, name: 'Marcus Lee' } })).id;
  const stranger = await prisma.user.create({ data: { email: STRANGER_EMAIL, passwordHash: 'not-a-real-hash' } });
  strangerId = stranger.id;
  strangerSpeakerId = (await prisma.speakerProfile.create({ data: { userId: strangerId, name: 'Someone Else' } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, STRANGER_EMAIL] } } });
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

  it("refuses a speaker who is not on the account's roster", async () => {
    await expect(saveCall({ userId, opportunityId, category: 'interested', speakerId: strangerSpeakerId })).rejects.toBeInstanceOf(
      UnknownSpeakerError
    );
    expect(await rowsFor({ speakerId: strangerSpeakerId })).toHaveLength(0);
  });

  it('moves a saved call to another stage, another speaker, or both', async () => {
    const [unassigned] = await rowsFor({ speakerId: null });

    const applied = await changeSavedCall(userId, unassigned.id, { category: 'applied' });
    expect(applied?.category).toBe('applied');
    expect(applied?.speakerId).toBeNull();

    const given = await changeSavedCall(userId, unassigned.id, { speakerId: secondSpeakerId, category: 'accepted' });
    expect(given?.id).toBe(unassigned.id);
    expect(given?.speakerId).toBe(secondSpeakerId);
    expect(given?.category).toBe('accepted');
    expect(given?.opportunity.id).toBe(opportunityId);
    expect(await rowsFor({ speakerId: null })).toHaveLength(0);
  });

  it('will not give a call to a speaker who already has it saved', async () => {
    const [marcus] = await rowsFor({ speakerId: secondSpeakerId });

    await expect(changeSavedCall(userId, marcus.id, { speakerId })).rejects.toBeInstanceOf(AlreadySavedError);
    expect((await rowsFor({ speakerId })).map((row) => row.category)).toEqual(['rejected']);
    expect((await rowsFor({ speakerId: secondSpeakerId })).map((row) => row.category)).toEqual(['accepted']);
  });

  it("does not move another account's saved call, or move a call to their speaker", async () => {
    const [marcus] = await rowsFor({ speakerId: secondSpeakerId });

    expect(await changeSavedCall(strangerId, marcus.id, { category: 'rejected' })).toBeNull();
    await expect(changeSavedCall(userId, marcus.id, { speakerId: strangerSpeakerId })).rejects.toBeInstanceOf(UnknownSpeakerError);
    expect((await rowsFor({ speakerId: secondSpeakerId })).map((row) => row.category)).toEqual(['accepted']);
  });

  it('takes a call back from a speaker, to nobody', async () => {
    const [marcus] = await rowsFor({ speakerId: secondSpeakerId });
    const back = await changeSavedCall(userId, marcus.id, { speakerId: null });

    expect(back?.speakerId).toBeNull();
    expect(back?.category).toBe('accepted');
  });

  it("goes when the speaker it was saved for is removed, and leaves the others", async () => {
    await prisma.speakerProfile.delete({ where: { id: speakerId } });

    expect(await rowsFor({ speakerId })).toHaveLength(0);
    expect(await rowsFor({ speakerId: null })).toHaveLength(1);
  });
});
