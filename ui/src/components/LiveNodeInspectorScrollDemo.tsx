import React, { useState } from 'react';
import LiveNodeInspector from './LiveNodeInspector';

/**
 * Demo component showing the scrolling capabilities of LiveNodeInspector
 * Tests with many relationships and long source code
 */
export const LiveNodeInspectorScrollDemo: React.FC = () => {
    const [isOpen, setIsOpen] = useState(true);

    // Generate many relationships to test scrolling
    const manyRelationships = [
        // Calls
        ...Array.from({ length: 15 }, (_, i) => ({
            direction: 'calls' as const,
            target: `helperFunction${i + 1}`,
            type: 'function' as const,
        })),
        // Called by
        ...Array.from({ length: 10 }, (_, i) => ({
            direction: 'calledBy' as const,
            target: `ServiceClass${i + 1}.method`,
            type: 'method' as const,
        })),
        // Imports
        ...Array.from({ length: 8 }, (_, i) => ({
            direction: 'imports' as const,
            target: `module${i + 1}`,
            type: 'module' as const,
        })),
        // Imported by
        ...Array.from({ length: 7 }, (_, i) => ({
            direction: 'importedBy' as const,
            target: `Component${i + 1}`,
            type: 'class' as const,
        })),
    ];

    // Generate long source code to test scrolling
    const longSourceCode = `import { EventEmitter } from 'events';
import { validateInput, sanitizeData } from './validators';
import { Logger } from './logger';
import { Cache } from './cache';

/**
 * RateLimiter class for managing API rate limits
 * Implements token bucket algorithm with Redis backing
 */
export class RateLimiter extends EventEmitter {
  private cache: Cache;
  private logger: Logger;
  private maxTokens: number;
  private refillRate: number;
  private tokens: Map<string, number>;
  private lastRefill: Map<string, number>;

  constructor(maxTokens: number = 100, refillRate: number = 10) {
    super();
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = new Map();
    this.lastRefill = new Map();
    this.cache = new Cache();
    this.logger = new Logger('RateLimiter');
  }

  /**
   * Check if a request is allowed for the given key
   */
  async isAllowed(key: string): Promise<boolean> {
    await this.refillTokens(key);
    
    const currentTokens = this.tokens.get(key) || this.maxTokens;
    
    if (currentTokens > 0) {
      this.tokens.set(key, currentTokens - 1);
      this.emit('request-allowed', { key, remainingTokens: currentTokens - 1 });
      return true;
    }
    
    this.emit('request-denied', { key });
    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private async refillTokens(key: string): Promise<void> {
    const now = Date.now();
    const lastRefill = this.lastRefill.get(key) || now;
    const elapsed = now - lastRefill;
    
    const tokensToAdd = Math.floor(elapsed / 1000) * this.refillRate;
    
    if (tokensToAdd > 0) {
      const currentTokens = this.tokens.get(key) || this.maxTokens;
      const newTokens = Math.min(currentTokens + tokensToAdd, this.maxTokens);
      
      this.tokens.set(key, newTokens);
      this.lastRefill.set(key, now);
      
      this.logger.debug(\`Refilled \${tokensToAdd} tokens for key: \${key}\`);
    }
  }

  /**
   * Get remaining tokens for a key
   */
  getRemainingTokens(key: string): number {
    return this.tokens.get(key) || this.maxTokens;
  }

  /**
   * Get time until next token refill
   */
  getTimeUntilRefill(key: string): number {
    const lastRefill = this.lastRefill.get(key) || Date.now();
    const elapsed = Date.now() - lastRefill;
    const timeUntilNext = 1000 - (elapsed % 1000);
    return timeUntilNext;
  }

  /**
   * Reset tokens for a key
   */
  reset(key: string): void {
    this.tokens.delete(key);
    this.lastRefill.delete(key);
    this.emit('reset', { key });
  }

  /**
   * Clear all tokens
   */
  clearAll(): void {
    this.tokens.clear();
    this.lastRefill.clear();
    this.emit('clear-all');
  }

  /**
   * Get statistics for all keys
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [key, tokens] of this.tokens.entries()) {
      stats[key] = {
        tokens,
        lastRefill: this.lastRefill.get(key),
        timeUntilRefill: this.getTimeUntilRefill(key),
      };
    }
    
    return stats;
  }
}`;

    const nodeData = {
        name: 'RateLimiter',
        type: 'class',
        module: 'server/src/websocket/rate-limiter.js',
        status: 'resolved' as const,
        filePath: 'packages/server/src/websocket/rate-limiter.js',
        lineStart: 53,
        lineEnd: 287,
        totalLines: 257,
    };

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-100 mb-4">
                    Live Node Inspector - Scrolling Demo
                </h1>
                <p className="text-gray-400 mb-4">
                    This demo shows the scrolling capabilities with:
                </p>
                <ul className="text-gray-400 mb-8 space-y-2">
                    <li>• <strong>40 relationships</strong> (tests independent scrolling in relationships list)</li>
                    <li>• <strong>100+ lines of code</strong> (tests independent scrolling in code preview)</li>
                    <li>• <strong>Custom scrollbars</strong> (styled for dark theme)</li>
                    <li>• <strong>Smooth scrolling</strong> (60fps performance)</li>
                </ul>

                <button
                    onClick={() => setIsOpen(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                    Open Inspector (Scroll Demo)
                </button>

                <div className="mt-8 p-4 bg-gray-900 border border-gray-800 rounded-md">
                    <h2 className="text-lg font-semibold text-gray-200 mb-2">Try These:</h2>
                    <ul className="text-sm text-gray-400 space-y-1">
                        <li>1. Expand "Relationships" section - scroll through 40 items</li>
                        <li>2. Use the search to filter relationships</li>
                        <li>3. Expand "Source Code" section - scroll through 100+ lines</li>
                        <li>4. Notice the custom scrollbars (hover over them)</li>
                        <li>5. Try scrolling the main content area</li>
                        <li>6. Notice smooth scrolling behavior</li>
                    </ul>
                </div>

                {isOpen && (
                    <LiveNodeInspector
                        node={nodeData}
                        relationships={manyRelationships}
                        sourceCode={longSourceCode}
                        onClose={() => setIsOpen(false)}
                        onNavigate={(target) => {
                            console.log('Navigate to:', target);
                            alert(`Would navigate to: ${target}`);
                        }}
                        onOpenFile={(path) => {
                            console.log('Open file:', path);
                            alert(`Would open file: ${path}`);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default LiveNodeInspectorScrollDemo;
