import app from './app.js';
import { config, validateConfig } from './config/index.js';

// Fail fast if required environment variables are missing
validateConfig();

// On Vercel the app is imported as a serverless function (api/index.ts) and
// never listens. Anywhere else this process only serves HTTP: syncs and
// enrichment are scheduled by Vercel Cron alone (vercel.json), so a second
// host pointed at the same database can never run them a second time. Locally,
// run a sync from the admin dashboard or `POST /api/sync`.
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  });

  function shutdown(signal: string) {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
