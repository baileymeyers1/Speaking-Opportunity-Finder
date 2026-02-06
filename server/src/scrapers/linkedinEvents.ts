import type { ScraperResult } from './index.js';
import { config } from '../config/index.js';

export async function scrapeLinkedInEvents(): Promise<ScraperResult[]> {
  const token = config.scrapers?.linkedinToken;
  if (!token) {
    return [];
  }

  // LinkedIn Events API access requires partner approval and specific permissions.
  // We keep this stub to enable future integration once credentials are available.
  return [];
}
