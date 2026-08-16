import { config } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { app } from './app';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER] Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[SERVER] Received ${signal}. Starting graceful shutdown...`);

  try {
    await disconnectDatabase();
    console.log('[SERVER] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[SERVER] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start(): Promise<void> {
  try {
    // Load and validate environment
    config;

    // Connect to database
    await connectDatabase();

    // Start HTTP server
    const server = app.listen(config.PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('[SERVER] Server running on port ' + config.PORT);
      console.log('[SERVER] Environment: ' + config.NODE_ENV);
      console.log('[SERVER] Health: http://localhost:' + config.PORT + '/health');
      console.log('[SERVER] API: http://localhost:' + config.PORT + config.API_PREFIX);
      console.log('='.repeat(50) + '\n');
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error('[SERVER] Port ' + config.PORT + ' is already in use');
      } else {
        console.error('[SERVER] Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('[SERVER] Failed to start server:', error);
    process.exit(1);
  }
}

start();