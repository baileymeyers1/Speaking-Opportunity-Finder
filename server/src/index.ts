import app from './app.js';
import { config } from './config/index.js';
import { syncOpportunities } from './scrapers/index.js';

// Sync intervals
const DAILY_SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const WEEKLY_SYNC_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

let dailySyncTimer: NodeJS.Timeout | null = null;
let weeklySyncTimer: NodeJS.Timeout | null = null;

async function runDailySync() {
  try {
    console.log('Running scheduled daily sync...');
    await syncOpportunities('daily');
  } catch (error) {
    console.error('Daily sync failed:', error);
  }
}

async function runWeeklySync() {
  try {
    console.log('Running scheduled weekly deep sync...');
    await syncOpportunities('weekly');
  } catch (error) {
    console.error('Weekly sync failed:', error);
  }
}

function startAutoSync() {
  // Run a full sync on startup (after a short delay to let server start)
  setTimeout(async () => {
    try {
      console.log('Running initial full sync...');
      await syncOpportunities('full');
    } catch (error) {
      console.error('Initial sync failed:', error);
    }
  }, 5000);

  // Schedule daily sync (fast scrapers)
  dailySyncTimer = setInterval(() => {
    runDailySync();
  }, DAILY_SYNC_INTERVAL);

  // Schedule weekly sync (deep scrapers)
  // Offset by 1 hour from daily to avoid overlap
  setTimeout(() => {
    runWeeklySync();
    weeklySyncTimer = setInterval(() => {
      runWeeklySync();
    }, WEEKLY_SYNC_INTERVAL);
  }, 60 * 60 * 1000);

  console.log('Auto-sync scheduled: daily (fast scrapers) + weekly (deep scrapers)');
}

const server = app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);

  // Start auto-sync in production, or if explicitly enabled
  if (config.nodeEnv === 'production' || process.env.ENABLE_AUTO_SYNC === 'true') {
    startAutoSync();
  }
});

// Graceful shutdown
function shutdown() {
  if (dailySyncTimer) clearInterval(dailySyncTimer);
  if (weeklySyncTimer) clearInterval(weeklySyncTimer);
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  shutdown();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  shutdown();
});
