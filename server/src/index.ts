import app from './app.js';
import { config } from './config/index.js';
import { syncOpportunities } from './scrapers/index.js';

// Sync interval: 24 hours in milliseconds
const SYNC_INTERVAL = 24 * 60 * 60 * 1000;

let syncTimer: NodeJS.Timeout | null = null;

async function runSync() {
  try {
    await syncOpportunities();
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

function startAutoSync() {
  // Run initial sync after a short delay (let server start first)
  setTimeout(() => {
    runSync();
  }, 5000);

  // Schedule periodic sync
  syncTimer = setInterval(() => {
    console.log('Running scheduled sync...');
    runSync();
  }, SYNC_INTERVAL);

  console.log(`Auto-sync scheduled every 24 hours`);
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
  if (syncTimer) {
    clearInterval(syncTimer);
  }
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
