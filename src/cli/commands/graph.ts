import { logger } from '../../utils/index.js';

export async function graphCommand(projectRoot: string, port: number = 3000): Promise<void> {
  logger.info(`Starting graph visualization server on port ${port}`);
  logger.info(`Open browser to: http://localhost:${port}`);

  // Import server dynamically to avoid circular dependencies
  const { createGraphServer } = await import('../../server/index.js');

  try {
    const server = await createGraphServer(projectRoot, port);
    
    // Store broadcast function globally for watch command to use
    (global as any).__graphServerBroadcast = server.broadcast;
    
    // Handle graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down graph server...');
      server.wss.close();
      server.close();
      delete (global as any).__graphServerBroadcast;
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start graph server', error);
    throw error;
  }
}
