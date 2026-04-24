import { logger } from '../../utils/index.js';

export async function graphCommand(projectRoot: string, port: number = 3000): Promise<void> {
  logger.info(`Starting graph visualization server on port ${port}`);
  logger.info(`Open browser to: http://localhost:${port}`);

  // Import server dynamically to avoid circular dependencies
  const { createGraphServer } = await import('../../server/index.js');

  try {
    await createGraphServer(projectRoot, port);
  } catch (error) {
    logger.error('Failed to start graph server', error);
    throw error;
  }
}
