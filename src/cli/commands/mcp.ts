import { CodeBrainMCPServer } from '../../mcp/server.js';
import { logger } from '../../utils/index.js';

export async function mcpCommand(): Promise<void> {
  logger.info('Starting Code-Brain MCP server...');
  const server = new CodeBrainMCPServer();
  await server.run();
}
