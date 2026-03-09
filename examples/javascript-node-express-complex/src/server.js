/**
 * server.js
 * HTTP server entry point.
 * Starts the Express application and listens on the configured port.
 */
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`[logistics-api] Server listening on http://${HOST}:${PORT}`);
  console.log(`[logistics-api] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[logistics-api] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log('[logistics-api] HTTP server closed');
    process.exit(0);
  });
  // Force exit if graceful close takes too long
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = server; // exported for testing convenience
