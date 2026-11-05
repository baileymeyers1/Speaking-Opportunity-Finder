import { describe, it, expect } from 'vitest';
import { callSignal, looksLikeArticle } from './liveHitTriage.js';

const hit = (title: string, description = '', applyUrl = 'https://example.org/page') => ({ title, description, applyUrl });

describe('looksLikeArticle', () => {
  it.each([
    'How to Use AI in Public Relations: Tools, Prompts, and Best Practices',
    'PR and AI: 21 ways artificial intelligence is changing the PR game',
    'AI in PR: What you need to know | Muck Rack',
    'Best AI Tools for PR Agencies (2026): What Actually Works',
    '12 Bingeworthy PR Podcasts to Follow in 2026 | Cision',
    'Top 10 AI Conferences to Attend in 2027',
    'TrizCom PR Blog: Insights and Trends in Public Relations',
    'AI in Public Relations: Definition, Benefits & Examples',
  ])('drops "%s"', (title) => {
    expect(looksLikeArticle(hit(title))).toBe(true);
  });

  it('drops Reddit threads', () => {
    expect(looksLikeArticle(hit('AI in PR', '', 'https://www.reddit.com/r/PublicRelations/comments/x'))).toBe(true);
  });

  it.each([
    '4th Annual AI Implementation for Communications Conference | Mar 23–25, 2027, New York City',
    'Practical AI for Communications Virtual Conference | Jan 20–21, 2027',
    'TU Dublin Announces Call for Papers for the Fourth Annual SymPRandA Symposium',
    'PR & COMMS 2026 – The Future of AI-Powered PR & Communications Summit',
    'Swaay.Health LIVE 2027',
    'The Future of PR: Gaining an AI Edge',
  ])('keeps "%s"', (title) => {
    expect(looksLikeArticle(hit(title))).toBe(false);
  });
});

describe('callSignal', () => {
  it('ranks an explicit call above an event page above an article-ish page', () => {
    const call = callSignal(hit('SymPRandA Symposium', 'Call for papers: submit your abstract by 15 January 2027.'));
    const event = callSignal(hit('Practical AI for Communications Virtual Conference | Jan 20–21, 2027'));
    const other = callSignal(hit('The State of AI in PR 2026 | Muck Rack'));
    expect(call).toBeGreaterThan(event);
    expect(event).toBeGreaterThan(other);
  });

  it('counts speaker-call wording in the title or the snippet', () => {
    expect(callSignal(hit('Speakers wanted: AI in Comms webinar series'))).toBeGreaterThan(0);
    expect(callSignal(hit('Comms Summit', 'Apply to speak at our 2027 summit'))).toBeGreaterThan(0);
  });
});
