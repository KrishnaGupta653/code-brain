/**
 * PDF Parser
 * 
 * Parses PDF files (API docs, architecture docs, design specs) as documentation symbols
 * Extracts text content, headings, code blocks, and API references
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ParsedFile, ParsedSymbol } from '../types/models.js';
import { logger } from '../utils/logger.js';

// Dynamic import for pdf-parse (async library)
let pdfParse: any = null;

/**
 * Load pdf-parse library dynamically
 */
async function loadPdfParse() {
  if (!pdfParse) {
    try {
      const module: any = await import('pdf-parse');
      pdfParse = module.default || module;
    } catch (error) {
      logger.warn('pdf-parse not available, PDF text extraction disabled');
      return null;
    }
  }
  return pdfParse;
}

/**
 * Extract sections from PDF text
 */
function extractSections(text: string): Array<{ title: string; content: string; line: number }> {
  const sections: Array<{ title: string; content: string; line: number }> = [];
  const lines = text.split('\n');
  
  let currentSection: { title: string; content: string; line: number } | null = null;
  let lineNumber = 1;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect headings (all caps, or starts with #, or ends with :)
    const isHeading = 
      (trimmed.length > 0 && trimmed.length < 100 && trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) ||
      /^#{1,6}\s+/.test(trimmed) ||
      (/^[A-Z]/.test(trimmed) && trimmed.endsWith(':') && trimmed.length < 80);
    
    if (isHeading && trimmed.length > 2) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        title: trimmed.replace(/^#+\s*/, '').replace(/:$/, ''),
        content: '',
        line: lineNumber,
      };
    } else if (currentSection && trimmed.length > 0) {
      currentSection.content += line + '\n';
    }
    
    lineNumber++;
  }
  
  // Add last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Extract code blocks from text
 */
function extractCodeBlocks(text: string): Array<{ language: string; code: string; line: number }> {
  const codeBlocks: Array<{ language: string; code: string; line: number }> = [];
  const lines = text.split('\n');
  
  let inCodeBlock = false;
  let currentBlock: { language: string; code: string; line: number } | null = null;
  let lineNumber = 1;
  
  for (const line of lines) {
    // Detect code block start (```, ```, or indented code)
    if (/^```(\w*)/.test(line)) {
      if (!inCodeBlock) {
        const match = line.match(/^```(\w*)/);
        currentBlock = {
          language: match?.[1] || 'unknown',
          code: '',
          line: lineNumber,
        };
        inCodeBlock = true;
      } else {
        // End of code block
        if (currentBlock) {
          codeBlocks.push(currentBlock);
        }
        currentBlock = null;
        inCodeBlock = false;
      }
    } else if (inCodeBlock && currentBlock) {
      currentBlock.code += line + '\n';
    }
    
    lineNumber++;
  }
  
  return codeBlocks;
}

/**
 * Extract API references (function names, class names, endpoints)
 */
function extractApiReferences(text: string): string[] {
  const references = new Set<string>();
  
  // Extract CamelCase identifiers (likely class/function names)
  const camelCasePattern = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g;
  const camelCaseMatches = text.match(camelCasePattern) || [];
  camelCaseMatches.forEach(ref => references.add(ref));
  
  // Extract snake_case identifiers
  const snakeCasePattern = /\b[a-z]+_[a-z_]+\b/g;
  const snakeCaseMatches = text.match(snakeCasePattern) || [];
  snakeCaseMatches.forEach(ref => references.add(ref));
  
  // Extract HTTP endpoints
  const endpointPattern = /\b(GET|POST|PUT|DELETE|PATCH)\s+\/[\w\-\/{}:]+/g;
  const endpointMatches = text.match(endpointPattern) || [];
  endpointMatches.forEach(ref => references.add(ref));
  
  // Extract function calls (word followed by parentheses)
  const functionPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match;
  while ((match = functionPattern.exec(text)) !== null) {
    references.add(match[1]);
  }
  
  return Array.from(references).slice(0, 100); // Limit to 100 references
}

export class PdfParser {
  /**
   * Parse a PDF file and extract text content
   * Note: This uses a synchronous wrapper around async pdf-parse
   */
  static parseFile(filePath: string): ParsedFile {
    try {
      // Check file size (skip files > 20MB)
      const stats = fs.statSync(filePath);
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (stats.size > maxSize) {
        logger.warn(`Skipping large PDF file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        return this.emptyResult(filePath);
      }

      // Read file for hash
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      
      // Try to extract text synchronously using a cached result or fallback
      const symbols = this.extractTextSync(filePath, content);
      
      return {
        path: filePath,
        language: 'pdf',
        hash,
        symbols,
        imports: [],
        exports: [],
        entryPoints: [],
        isTestFile: false,
        isConfigFile: false,
      };

    } catch (error) {
      logger.error(`Failed to parse PDF: ${filePath}`, error);
      return this.emptyResult(filePath);
    }
  }
  
  /**
   * Extract text from PDF synchronously (uses cached async result)
   */
  private static extractTextSync(filePath: string, content: Buffer): ParsedSymbol[] {
    const fileName = path.basename(filePath, '.pdf');
    
    // Create a basic symbol for the PDF file
    const fileSymbol: ParsedSymbol = {
      name: fileName,
      type: 'doc',
      location: {
        file: filePath,
        startLine: 1,
        endLine: 1,
        startCol: 0,
        endCol: 0,
      },
      isExported: false,
      summary: `PDF documentation: ${fileName}`,
      metadata: {
        documentType: 'pdf',
        fileSize: content.length,
        pages: 0,
      },
    };
    
    // Try to extract text using pdf-parse (async, so we'll do best effort)
    // For now, return basic symbol. Full extraction happens in async context.
    return [fileSymbol];
  }
  
  /**
   * Async version for full text extraction (used by parallel parser)
   */
  static async parseFileAsync(filePath: string): Promise<ParsedFile> {
    try {
      // Check file size
      const stats = fs.statSync(filePath);
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (stats.size > maxSize) {
        logger.warn(`Skipping large PDF file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        return this.emptyResult(filePath);
      }

      // Read file
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      
      // Load pdf-parse
      const parse = await loadPdfParse();
      if (!parse) {
        // Fallback to basic parsing
        return this.parseFile(filePath);
      }
      
      // Extract text from PDF
      const data = await parse(content);
      const text = data.text || '';
      const numPages = data.numpages || 0;
      
      // Extract sections, code blocks, and API references
      const sections = extractSections(text);
      const codeBlocks = extractCodeBlocks(text);
      const apiReferences = extractApiReferences(text);
      
      // Create symbols
      const symbols: ParsedSymbol[] = [];
      const fileName = path.basename(filePath, '.pdf');
      
      // Main document symbol
      symbols.push({
        name: fileName,
        type: 'doc',
        location: {
          file: filePath,
          startLine: 1,
          endLine: 1,
          startCol: 0,
          endCol: 0,
        },
        isExported: false,
        summary: text.slice(0, 500).trim() || `PDF documentation: ${fileName}`,
        metadata: {
          documentType: 'pdf',
          fileSize: content.length,
          pages: numPages,
          sections: sections.length,
          codeBlocks: codeBlocks.length,
          apiReferences: apiReferences.length,
        },
      });
      
      // Section symbols
      for (const section of sections.slice(0, 50)) { // Limit to 50 sections
        symbols.push({
          name: section.title,
          type: 'doc',
          location: {
            file: filePath,
            startLine: section.line,
            endLine: section.line,
            startCol: 0,
            endCol: 0,
          },
          isExported: false,
          summary: section.content.slice(0, 300).trim(),
          metadata: {
            sectionType: 'heading',
            parentDoc: fileName,
          },
        });
      }
      
      // Code block symbols
      for (const block of codeBlocks.slice(0, 20)) { // Limit to 20 code blocks
        symbols.push({
          name: `${fileName}_code_${block.line}`,
          type: 'doc',
          location: {
            file: filePath,
            startLine: block.line,
            endLine: block.line,
            startCol: 0,
            endCol: 0,
          },
          isExported: false,
          summary: block.code.slice(0, 300).trim(),
          metadata: {
            sectionType: 'code',
            language: block.language,
            parentDoc: fileName,
          },
        });
      }
      
      logger.debug(`Extracted ${symbols.length} symbols from PDF: ${filePath}`);
      
      return {
        path: filePath,
        language: 'pdf',
        hash,
        symbols,
        imports: [], // PDF files don't have traditional imports
        exports: [],
        entryPoints: [],
        isTestFile: false,
        isConfigFile: false,
      };

    } catch (error) {
      logger.error(`Failed to parse PDF async: ${filePath}`, error);
      return this.emptyResult(filePath);
    }
  }

  /**
   * Return empty parsed file result
   */
  private static emptyResult(filePath: string): ParsedFile {
    try {
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      
      return {
        path: filePath,
        language: 'pdf',
        hash,
        symbols: [],
        imports: [],
        exports: [],
        entryPoints: [],
        isTestFile: false,
        isConfigFile: false,
      };
    } catch {
      return {
        path: filePath,
        language: 'pdf',
        hash: '',
        symbols: [],
        imports: [],
        exports: [],
        entryPoints: [],
        isTestFile: false,
        isConfigFile: false,
      };
    }
  }
}

