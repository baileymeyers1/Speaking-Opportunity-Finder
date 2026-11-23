import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SpeakerProfileInput } from 'shared';
import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import { listedConditions } from '../services/opportunityQuery.js';
import { saveCall } from '../services/savedCalls.js';
import { createSpeaker } from '../services/speakerService.js';

/**
 * A demo visit is an account of its own: made when the visitor presses "Enter the demo", with a roster of
 * three fictional speakers and two saved calls, and deleted a few hours later. Nobody sees anyone else's
 * account, and there is no sign-up, password or email.
 */

export const DEMO_EMAIL_DOMAIN = 'demo.example.org';
/** How long a demo sign-in lasts; the account itself is removed an hour after that. */
export const DEMO_SESSION_MS = 2 * 60 * 60 * 1000;
const DEMO_ACCOUNT_KEEP_MS = DEMO_SESSION_MS + 60 * 60 * 1000;

/** The sample roster: three people an agency might place, spread over the busiest sectors of the list. */
export const DEMO_ROSTER: SpeakerProfileInput[] = [
  {
    name: 'Amara Okafor',
    title: 'Chief medical officer, Northwind Health',
    topics: ['digital health', 'patient safety', 'clinical ai', 'health equity'],
    bio: 'Physician executive who led a regional health system through its move to virtual care. Speaks on safe adoption of AI in clinical work.',
    seniority: 'keynote',
    homeCity: 'Chicago',
    homeCountry: 'United States',
    travelRadius: 'international',
    remotePreference: 'either',
    compensationRequirement: 'travel_covered',
    preferredFormats: ['conference', 'panel'],
  },
  {
    name: 'Daniel Reyes',
    title: 'Founder, Gridlight Storage',
    topics: ['grid storage', 'energy policy', 'climate finance', 'utilities'],
    bio: 'Started a battery storage company that works with rural co-ops. Talks about financing the grid build-out and what utilities get wrong about storage.',
    seniority: 'experienced',
    homeCity: 'Austin',
    homeCountry: 'United States',
    travelRadius: 'country',
    remotePreference: 'prefer_in_person',
    compensationRequirement: 'any',
    preferredFormats: ['conference', 'meetup', 'panel'],
  },
  {
    name: 'Lena Fischer',
    title: 'Staff engineer, Ledgerline',
    topics: ['payments infrastructure', 'developer experience', 'open source', 'platform engineering'],
    bio: 'Builds the payment rails behind a European fintech and maintains two open-source libraries. Gives practical talks on platform design.',
    seniority: 'experienced',
    homeCity: 'Berlin',
    homeCountry: 'Germany',
    travelRadius: 'international',
    remotePreference: 'either',
    compensationRequirement: 'any',
    preferredFormats: ['conference', 'meetup', 'podcast', 'webinar'],
  },
];

export interface DemoVisitor {
  user: { id: string; email: string; isAdmin: false };
  token: string;
}

/** Makes a visit's account, roster and two saved calls, and a sign-in token for it. */
export async function createDemoVisitor(now: Date = new Date()): Promise<DemoVisitor> {
  await pruneDemoVisitors(now);
  const email = `visitor-${randomBytes(6).toString('hex')}@${DEMO_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: { email, passwordHash: `!demo-${randomBytes(16).toString('hex')}`, isAdmin: false },
  });

  const speakers = [];
  for (const profile of DEMO_ROSTER) speakers.push(await createSpeaker(user.id, profile));

  // Two upcoming health calls saved for the first speaker, so Saved and "for whom" have something to show.
  const calls = await prisma.opportunity.findMany({
    where: { AND: [...listedConditions(now), { sectors: { has: 'healthcare' } }, { cfpDeadline: { gt: now } }] },
    orderBy: { cfpDeadline: 'asc' },
    select: { id: true },
    take: 2,
  });
  for (const [index, call] of calls.entries()) {
    await saveCall({
      userId: user.id,
      opportunityId: call.id,
      category: index === 0 ? 'interested' : 'applied',
      speakerId: speakers[0].id,
    });
  }

  const token = jwt.sign({ userId: user.id, email }, config.jwt.secret, { expiresIn: Math.floor(DEMO_SESSION_MS / 1000) });
  return { user: { id: user.id, email, isAdmin: false }, token };
}

/** Removes demo accounts older than a sign-in can last (rosters and saves go with them). */
export async function pruneDemoVisitors(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.user.deleteMany({
    where: {
      email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
      createdAt: { lt: new Date(now.getTime() - DEMO_ACCOUNT_KEEP_MS) },
    },
  });
  return count;
}
