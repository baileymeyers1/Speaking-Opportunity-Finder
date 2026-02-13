import type { Opportunity } from '../types';

const LIVE_CACHE_KEY = 'liveResultsCache';

function loadAll(): Opportunity[] {
  try {
    const raw = localStorage.getItem(LIVE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Opportunity[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveAll(results: Opportunity[]) {
  try {
    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(results));
  } catch {
    // Ignore storage errors
  }
}

export function getLiveResultById(id: string): Opportunity | null {
  const all = loadAll();
  return all.find((r) => r.id === id) || null;
}

export function upsertLiveResults(results: Opportunity[]) {
  const all = loadAll();
  const byId = new Map(all.map((r) => [r.id, r]));
  for (const r of results) {
    byId.set(r.id, r);
  }
  saveAll(Array.from(byId.values()));
}

export function removeLiveResult(id: string) {
  const all = loadAll().filter((r) => r.id !== id);
  saveAll(all);
}

export function getAllLiveResults(): Opportunity[] {
  return loadAll();
}
