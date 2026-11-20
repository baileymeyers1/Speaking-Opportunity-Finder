import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  MAX_SPEAKERS,
  SpeakerLimitError,
  createSpeaker,
  deleteSpeaker,
  getMatchProfile,
  getSpeaker,
  listSpeakers,
  speakerProfileInputSchema,
  updateSpeaker,
} from './speakerService.js';

/**
 * Against the test Postgres database: an account keeps several speakers, and
 * one account never reads, changes or removes another's.
 */
const STAMP = Date.now();
const OWNER_EMAIL = `speakers-owner-${STAMP}@example.com`;
const OTHER_EMAIL = `speakers-other-${STAMP}@example.com`;
let ownerId = '';
let otherId = '';

const speaker = (fields: Record<string, unknown>) => speakerProfileInputSchema.parse(fields);

beforeAll(async () => {
  const [owner, other] = await Promise.all(
    [OWNER_EMAIL, OTHER_EMAIL].map((email) => prisma.user.create({ data: { email, passwordHash: 'not-a-real-hash' } }))
  );
  ownerId = owner.id;
  otherId = other.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
  await prisma.$disconnect();
});

describe('a roster of speakers in the database', () => {
  it('starts empty, with nobody to score fit for', async () => {
    expect(await listSpeakers(ownerId)).toEqual([]);
    expect(await getMatchProfile(ownerId)).toBeNull();
  });

  it('keeps several speakers for one account, oldest first', async () => {
    const dana = await createSpeaker(ownerId, speaker({ name: 'Dana Okafor', title: 'Chief medical officer', topics: ['Digital health'] }));
    const marcus = await createSpeaker(ownerId, speaker({ name: 'Marcus Lee', remotePreference: 'remote_only' }));

    expect(dana.name).toBe('Dana Okafor');
    expect(dana.title).toBe('Chief medical officer');
    expect(dana.topics).toEqual(['digital health']);
    expect((await listSpeakers(ownerId)).map((row) => row.id)).toEqual([dana.id, marcus.id]);
  });

  it('scores fit for the first speaker until someone else is chosen', async () => {
    const [first] = await listSpeakers(ownerId);
    expect((await getMatchProfile(ownerId))?.topics).toEqual(first.topics);
  });

  it('changes one speaker in place', async () => {
    const [dana, marcus] = await listSpeakers(ownerId);
    const changed = await updateSpeaker(ownerId, dana.id, speaker({ name: 'Dana Okafor', title: 'CMO, Northwind Health', topics: ['health equity'] }));

    expect(changed?.id).toBe(dana.id);
    expect(changed?.title).toBe('CMO, Northwind Health');
    expect(changed?.topics).toEqual(['health equity']);
    expect((await getSpeaker(ownerId, marcus.id))?.name).toBe('Marcus Lee');
    expect(await listSpeakers(ownerId)).toHaveLength(2);
  });

  it("does not read, change or remove another account's speaker", async () => {
    const [dana] = await listSpeakers(ownerId);

    expect(await listSpeakers(otherId)).toEqual([]);
    expect(await getSpeaker(otherId, dana.id)).toBeNull();
    expect(await updateSpeaker(otherId, dana.id, speaker({ name: 'Taken over' }))).toBeNull();
    expect(await deleteSpeaker(otherId, dana.id)).toBe(false);
    expect((await getSpeaker(ownerId, dana.id))?.name).toBe('Dana Okafor');
  });

  it('removes a speaker and leaves the others', async () => {
    const [dana, marcus] = await listSpeakers(ownerId);

    expect(await deleteSpeaker(ownerId, dana.id)).toBe(true);
    expect(await deleteSpeaker(ownerId, dana.id)).toBe(false);
    expect((await listSpeakers(ownerId)).map((row) => row.id)).toEqual([marcus.id]);
  });

  it('stops at the roster limit', async () => {
    const have = (await listSpeakers(otherId)).length;
    await prisma.speakerProfile.createMany({
      data: Array.from({ length: MAX_SPEAKERS - have }, (_, index) => ({ userId: otherId, name: `Speaker ${index}` })),
    });

    await expect(createSpeaker(otherId, speaker({ name: 'One too many' }))).rejects.toBeInstanceOf(SpeakerLimitError);
    expect(await listSpeakers(otherId)).toHaveLength(MAX_SPEAKERS);
  });
});
