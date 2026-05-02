/**
 * Markdown Parser
 * 
 * Parses markdown files to extract structure, code blocks, and symbol references
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export interface ParsedMarkdown {
  path: string;
  hash: string;
  sections: MarkdownSection[];
  codeBlocks: CodeBlock[];
  links: MarkdownLink[];
  frontmatter?: Record<string, any>;
}

export interface MarkdownSection {
  heading: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
  codeBlocks: CodeBlock[];
  symbolReferences: string[];
  id: string;  // Slug for linking
}

export interface CodeBlock {
  language: string;
  code: string;
  startLine: number;
  endLine: number;
  caption?: string;
  symbolReferences: string[];
}

export interface MarkdownLink {
  text: string;
  url: string;
  type: 'internal' | 'external' | 'symbol' | 'file';
  line: number;
}

export class MarkdownParser {
  /**
   * Parse a markdown file
   */
  static parseFile(filePath: string): ParsedMarkdown {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    // Extract frontmatter if present
    const { frontmatter, content: mainContent } = this.extractFrontmatter(content);

    // Parse sections
    const sections = this.extractSections(mainContent, filePath);

    // Extract all code blocks
    const codeBlocks = this.extractCodeBlocks(mainContent);

    // Extract all links
    const links = this.extractLinks(mainContent);

    return {
      path: filePath,
      hash,
      sections,
      codeBlocks,
      links,
      frontmatter,
    };
  }

  /**
   * Extract frontmatter (YAML between --- markers)
   */
  private static extractFrontmatter(content: string): {
    frontmatter?: Record<string, any>;
    content: string;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { content };
    }

    try {
      // Simple YAML parsing (key: value pairs)
      const frontmatterText = match[1];
      const frontmatter: Record<string, any> = {};

      frontmatterText.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          frontmatter[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes
        }
      });

      return {
        frontmatter,
        content: content.substring(match[0].length),
      };
    } catch (error) {
      logger.warn('Failed to parse frontmatter', error);
      return { content };
    }
  }

  /**
   * Extract sections based on headings
   */
  private static extractSections(content: string, filePath: string): MarkdownSection[] {
    // Normalize line endings to handle Windows (\r\n) and Unix (\n)
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedContent.split('\n');
    const sections: MarkdownSection[] = [];
    let currentSection: Partial<MarkdownSection> | null = null;
    let currentContent: string[] = [];
    let lineNumber = 1;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // Save previous section
        if (currentSection) {
          currentSection.content = currentContent.join('\n');
          currentSection.endLine = lineNumber - 1;
          currentSection.codeBlocks = this.extractCodeBlocksFromContent(
            currentSection.content,
            currentSection.startLine!
          );
          currentSection.symbolReferences = this.findSymbolReferences(currentSection.content);
          sections.push(currentSection as MarkdownSection);
        }

        // Start new section
        const level = headingMatch[1].length;
        const heading = headingMatch[2].trim();
        const id = this.createSlug(heading);

        currentSection = {
          heading,
          level,
          startLine: lineNumber,
          id,
        };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }

      lineNumber++;
    }

    // Save last section
    if (currentSection) {
      currentSection.content = currentContent.join('\n');
      currentSection.endLine = lineNumber - 1;
      currentSection.codeBlocks = this.extractCodeBlocksFromContent(
        currentSection.content,
        currentSection.startLine!
      );
      currentSection.symbolReferences = this.findSymbolReferences(currentSection.content);
      sections.push(currentSection as MarkdownSection);
    }

    return sections;
  }

  /**
   * Extract code blocks from content
   */
  private static extractCodeBlocks(content: string): CodeBlock[] {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const codeBlocks: CodeBlock[] = [];
    const lines = normalizedContent.split('\n');
    let inCodeBlock = false;
    let currentBlock: Partial<CodeBlock> | null = null;
    let blockLines: string[] = [];
    let lineNumber = 1;

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          // Start of code block
          const language = line.substring(3).trim() || 'text';
          currentBlock = {
            language,
            startLine: lineNumber,
          };
          blockLines = [];
          inCodeBlock = true;
        } else {
          // End of code block
          if (currentBlock) {
            currentBlock.code = blockLines.join('\n');
            currentBlock.endLine = lineNumber;
            currentBlock.symbolReferences = this.findSymbolReferences(currentBlock.code);
            codeBlocks.push(currentBlock as CodeBlock);
          }
          currentBlock = null;
          blockLines = [];
          inCodeBlock = false;
        }
      } else if (inCodeBlock) {
        blockLines.push(line);
      }

      lineNumber++;
    }

    return codeBlocks;
  }

  /**
   * Extract code blocks from a specific content section
   */
  private static extractCodeBlocksFromContent(
    content: string,
    startLineOffset: number
  ): CodeBlock[] {
    const blocks = this.extractCodeBlocks(content);
    // Adjust line numbers
    return blocks.map(block => ({
      ...block,
      startLine: block.startLine + startLineOffset,
      endLine: block.endLine + startLineOffset,
    }));
  }

  /**
   * Extract links from content
   */
  private static extractLinks(content: string): MarkdownLink[] {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const links: MarkdownLink[] = [];
    const lines = normalizedContent.split('\n');
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = linkRegex.exec(line)) !== null) {
        const text = match[1];
        const url = match[2];
        const type = this.classifyLink(url);

        links.push({
          text,
          url,
          type,
          line: index + 1,
        });
      }
    });

    return links;
  }

  /**
   * Classify a link as internal, external, symbol, or file
   */
  private static classifyLink(url: string): 'internal' | 'external' | 'symbol' | 'file' {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return 'external';
    }

    if (url.startsWith('#')) {
      return 'internal';
    }

    if (url.includes('#')) {
      // Could be file#symbol
      return 'symbol';
    }

    if (url.match(/\.(ts|js|tsx|jsx|py|java|go|rs|cs|cpp|c|h)$/)) {
      return 'file';
    }

    return 'internal';
  }

  /**
   * Find symbol references in content
   * 
   * Looks for:
   * - Inline code: `SymbolName`
   * - PascalCase words (likely class names)
   * - camelCase words followed by () (likely function calls)
   */
  static findSymbolReferences(content: string): string[] {
    const references = new Set<string>();

    // Inline code references
    const inlineCodeRegex = /`([A-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)`/g;
    let match;
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      references.add(match[1]);
    }

    // PascalCase words (classes, interfaces, types)
    const pascalCaseRegex = /\b([A-Z][a-zA-Z0-9]*)\b/g;
    while ((match = pascalCaseRegex.exec(content)) !== null) {
      const word = match[1];
      // Filter out common words
      if (word.length > 2 && !this.isCommonWord(word)) {
        references.add(word);
      }
    }

    // Function calls: camelCase()
    const functionCallRegex = /\b([a-z][a-zA-Z0-9]*)\s*\(/g;
    while ((match = functionCallRegex.exec(content)) !== null) {
      references.add(match[1]);
    }

    return Array.from(references);
  }

  /**
   * Check if a word is a common English word (not a symbol)
   */
  private static isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'The', 'This', 'That', 'These', 'Those',
      'For', 'With', 'From', 'Into', 'About',
      'When', 'Where', 'Which', 'While',
      'Example', 'Note', 'Warning', 'Important',
      'See', 'Also', 'More', 'Less',
    ]);
    return commonWords.has(word);
  }

  /**
   * Create a URL-safe slug from a heading
   */
  private static createSlug(heading: string): string {
    return heading
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Check if a file is a markdown file
   */
  static isMarkdownFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.markdown' || ext === '.mdx';
  }
}
