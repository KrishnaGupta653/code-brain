import { logger } from '../../utils/index.js';

export async function graphCommand(projectRoot: string, port: number = 3000): Promise<void> {
  logger.info(`Starting graph visualization server on port ${port}`);
  logger.info(`Open browser to: http://localhost:${port}`);

  // Import server dynamically to avoid circular dependencies
  const { createGraphServer } = await import('../../server/index.js');

  try {
    const { server, wss, broadcast } = await createGraphServer(projectRoot, port);
    
    // Store broadcast function globally for watch command to use
    (global as any).__graphServerBroadcast = broadcast;
    
    // Handle graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down graph server...');
      wss.close();
      server.close();
      delete (global as any).__graphServerBroadcast;
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error: any) {
    // Provide helpful error message for port already in use
    if (error?.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use`);
      logger.info(`\nTo fix this, you can:`);
      logger.info(`  1. Try a different port: --port ${port + 1}`);
      logger.info(`  2. Find and stop the process using port ${port}:`);
      logger.info(`     lsof -ti:${port} | xargs kill -9`);
      logger.info(`  3. Or use a random available port: --port 0`);
      process.exit(1);
    }
    
    logger.error('Failed to start graph server', error);
    throw error;
  }
}
