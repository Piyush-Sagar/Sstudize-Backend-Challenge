import { config } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { app } from './app';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  try {
    await disconnectDatabase();
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
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
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`📝 Environment: ${config.NODE_ENV}`);
      console.log(`🔗 Health: http://localhost:${config.PORT}/health`);
      console.log(`📚 API: http://localhost:${config.PORT}${config.API_PREFIX}`);
      console.log('='.repeat(50) + '\n');
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();