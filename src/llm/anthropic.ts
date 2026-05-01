/**
 * Anthropic API integration for LLM-generated summaries.
 * Generates persistent module summaries for better AI context.
 */

import { logger } from '../utils/index.js';

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface SummaryRequest {
  moduleName: string;
  moduleType: 'file' | 'directory' | 'class' | 'function';
  code?: string;
  symbols?: Array<{
    name: string;
    type: string;
    signature?: string;
  }>;
  dependencies?: string[];
  exports?: string[];
}

export interface SummaryResponse {
  summary: string;
  keyPoints: string[];
  purpose: string;
  usage?: string;
  tokens: number;
}

export class AnthropicClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private baseUrl: string = 'https://api.anthropic.com/v1';

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 500;
    this.temperature = config.temperature || 0.3;
  }

  /**
   * Generate a summary for a module.
   */
  async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const prompt = this.buildPrompt(request);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      return this.parseSummaryResponse(data, request);
    } catch (error) {
      logger.error('Failed to generate summary:', error);
      throw error;
    }
  }

  /**
   * Build prompt for summary generation.
   */
  private buildPrompt(request: SummaryRequest): string {
    const parts: string[] = [];

    parts.push(`Generate a concise summary for the following ${request.moduleType}:`);
    parts.push(`\nName: ${request.moduleName}`);

    if (request.code) {
      parts.push(`\nCode:\n\`\`\`\n${request.code.substring(0, 2000)}\n\`\`\``);
    }

    if (request.symbols && request.symbols.length > 0) {
      parts.push(`\nSymbols:`);
      for (const symbol of request.symbols.slice(0, 20)) {
        const sig = symbol.signature ? `: ${symbol.signature}` : '';
        parts.push(`- ${symbol.type} ${symbol.name}${sig}`);
      }
    }

    if (request.dependencies && request.dependencies.length > 0) {
      parts.push(`\nDependencies: ${request.dependencies.slice(0, 10).join(', ')}`);
    }

    if (request.exports && request.exports.length > 0) {
      parts.push(`\nExports: ${request.exports.slice(0, 10).join(', ')}`);
    }

    parts.push(`\nProvide a JSON response with:`);
    parts.push(`{`);
    parts.push(`  "summary": "One sentence overview (max 100 words)",`);
    parts.push(`  "purpose": "What this module does (max 50 words)",`);
    parts.push(`  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],`);
    parts.push(`  "usage": "How to use this module (optional, max 50 words)"`);
    parts.push(`}`);

    return parts.join('\n');
  }

  /**
   * Parse summary response from Anthropic.
   */
  private parseSummaryResponse(data: any, request: SummaryRequest): SummaryResponse {
    const content = data.content?.[0]?.text || '';
    const tokens = data.usage?.output_tokens || 0;

    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || `Module: ${request.moduleName}`,
          keyPoints: parsed.keyPoints || [],
          purpose: parsed.purpose || 'Unknown purpose',
          usage: parsed.usage,
          tokens,
        };
      }
    } catch (error) {
      logger.debug('Failed to parse JSON from summary response');
    }

    // Fallback: use raw content
    return {
      summary: content.substring(0, 200),
      keyPoints: [],
      purpose: content.substring(0, 100),
      tokens,
    };
  }

  /**
   * Generate summaries for multiple modules in batch.
   */
  async generateBatchSummaries(
    requests: SummaryRequest[],
    concurrency: number = 3
  ): Promise<Map<string, SummaryResponse>> {
    const results = new Map<string, SummaryResponse>();
    const queue = [...requests];

    const processBatch = async () => {
      while (queue.length > 0) {
        const request = queue.shift();
        if (!request) break;

        try {
          const summary = await this.generateSummary(request);
          results.set(request.moduleName, summary);
          logger.debug(`Generated summary for ${request.moduleName}`);
        } catch (error) {
          logger.error(`Failed to generate summary for ${request.moduleName}:`, error);
        }

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    // Process in parallel with concurrency limit
    const workers = Array.from({ length: concurrency }, () => processBatch());
    await Promise.all(workers);

    return results;
  }
}

/**
 * Check if Anthropic API key is configured.
 */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Get Anthropic client if configured.
 */
export function getAnthropicClient(): AnthropicClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new AnthropicClient({ apiKey });
}
