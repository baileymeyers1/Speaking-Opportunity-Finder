import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Only load .env file in development (production uses environment variables directly)
if (process.env.NODE_ENV !== 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  dotenvConfig({ path: resolve(__dirname, '../../../.env') });
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  jwt: {
    secret: process.env.JWT_SECRET || 'development-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  scrapers: {
    webSearch: process.env.WEB_SEARCH_API_KEY,
    eventbriteToken: process.env.EVENTBRITE_TOKEN,
    linkedinToken: process.env.LINKEDIN_TOKEN,
    airtableApiKey: process.env.AIRTABLE_API_KEY,
    airtableBaseId: process.env.AIRTABLE_BASE_ID,
    airtableTableId: process.env.AIRTABLE_TABLE_ID,
    airtableViewId: process.env.AIRTABLE_VIEW_ID,
  },

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '256', 10),
  },
};

const REQUIRED_VARS: Array<{ key: string; value: unknown; prodOnly?: boolean }> = [
  { key: 'DATABASE_URL', value: config.database.url },
  { key: 'JWT_SECRET', value: process.env.JWT_SECRET, prodOnly: true },
];

export function validateConfig(): void {
  const missing = REQUIRED_VARS
    .filter(v => !v.value && (!v.prodOnly || config.nodeEnv === 'production'))
    .map(v => v.key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
