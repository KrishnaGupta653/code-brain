/**
 * Environment Variable Loader
 * 
 * Loads environment variables from .env file and provides helpers
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

let envLoaded = false;

/**
 * SSRF Protection: Validate URL is not a private IP
 */
export function assertNotPrivateIP(url: string): void {
  try {
    const { hostname } = new URL(url);
    const privateRanges = [
      /^127\./,           // localhost
      /^10\./,            // 10.0.0.0/8
      /^192\.168\./,      // 192.168.0.0/16
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^169\.254\./,      // 169.254.0.0/16 (link-local)
      /^::1$/,            // IPv6 localhost
      /^fe80:/,           // IPv6 link-local
      /^fc00:/,           // IPv6 unique local
      /^fd00:/,           // IPv6 unique local
    ];
    
    if (privateRanges.some(r => r.test(hostname))) {
      throw new Error(`SSRF blocked: ${hostname} is a private IP or localhost`);
    }
    
    // Also block common internal hostnames
    const blockedHostnames = ['localhost', 'metadata.google.internal', '169.254.169.254'];
    if (blockedHostnames.includes(hostname.toLowerCase())) {
      throw new Error(`SSRF blocked: ${hostname} is a blocked hostname`);
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL: ${url}`);
    }
    throw error;
  }
}

/**
 * Load .env file from project root or user home
 */
export function loadEnv(projectRoot?: string): void {
  if (envLoaded) return;

  const locations = [
    // Project-specific .env
    projectRoot ? path.join(projectRoot, '.env') : null,
    // Current directory .env
    path.join(process.cwd(), '.env'),
    // User home .env
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.code-brain.env'),
  ].filter(Boolean) as string[];

  for (const envPath of locations) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        parseEnvFile(content);
        logger.debug(`Loaded environment from: ${envPath}`);
        envLoaded = true;
        return;
      } catch (error) {
        logger.debug(`Failed to load .env from ${envPath}:`, error);
      }
    }
  }

  logger.debug('No .env file found, using system environment variables');
  envLoaded = true;
}

/**
 * Parse .env file content and set environment variables
 */
function parseEnvFile(content: string): void {
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      const cleanValue = value.trim().replace(/^["']|["']$/g, '');
      
      // Only set if not already set (environment variables take precedence)
      if (!process.env[key]) {
        process.env[key] = cleanValue;
      }
    }
  }
}

/**
 * Get API key with fallback chain
 */
export function getApiKey(
  envVar: string,
  configValue?: string,
  defaultValue?: string
): string | undefined {
  // 1. Environment variable (highest priority)
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // 2. Config value (from .codebrainrc.json)
  if (configValue) {
    // Check if it's an environment variable reference
    const envMatch = configValue.match(/^\$\{(.+)\}$/);
    if (envMatch) {
      return process.env[envMatch[1]];
    }
    return configValue;
  }

  // 3. Default value
  return defaultValue;
}

/**
 * Get chat provider with fallback
 */
export function getChatProvider(): 'anthropic' | 'openai' | 'ollama' {
  const provider = process.env.CODE_BRAIN_CHAT_PROVIDER?.toLowerCase();
  
  if (provider === 'openai' || provider === 'ollama') {
    return provider;
  }
  
  return 'anthropic'; // default
}

/**
 * Get chat model with fallback
 */
export function getChatModel(provider: 'anthropic' | 'openai' | 'ollama'): string {
  // Provider-specific environment variable
  const envVar = `CODE_BRAIN_${provider.toUpperCase()}_MODEL`;
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // Default models
  const defaults = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4-turbo-preview',
    ollama: 'llama3',
  };

  return defaults[provider];
}

/**
 * Check if API key is available for a provider
 */
export function hasApiKey(provider: 'anthropic' | 'openai' | 'voyage'): boolean {
  const envVars = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    voyage: 'VOYAGE_API_KEY',
  };

  return Boolean(process.env[envVars[provider]]);
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): Array<'anthropic' | 'openai' | 'ollama'> {
  const providers: Array<'anthropic' | 'openai' | 'ollama'> = [];

  if (hasApiKey('anthropic')) {
    providers.push('anthropic');
  }

  if (hasApiKey('openai')) {
    providers.push('openai');
  }

  // Ollama is always available if running
  providers.push('ollama');

  return providers;
}
