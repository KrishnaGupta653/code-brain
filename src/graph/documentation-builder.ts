/**
 * Documentation Builder
 * 
 * Adds documentation nodes to the knowledge graph and links them to code symbols
 */

import { GraphModel, createGraphNode, createGraphEdge } from './model.js';
import { MarkdownParser, ParsedMarkdown, MarkdownSection, CodeBlock } from '../parser/markdown.js';
import { GraphNode } from '../types/models.js';
import { logger, stableId } from '../utils/index.js';
import path from 'path';

export interface DocumentationStats {
  totalDocs: number;
  totalSections: number;
  totalExamples: number;
  linkedSymbols: number;
  coverage: number; // Percentage of symbols with documentation
}

export class DocumentationBuilder {
  private graph: GraphModel;
  private projectRoot: string;
  private symbolIndex: Map<string, string>; // symbol name -> node id

  constructor(graph: GraphModel, projectRoot: string) {
    this.graph = graph;
    this.projectRoot = projectRoot;
    this.symbolIndex = new Map();
    this.buildSymbolIndex();
  }

  /**
   * Build an index of all symbols for fast lookup
   */
  private buildSymbolIndex(): void {
    const nodes = this.graph.getNodes();
    
    for (const node of nodes) {
      // Index by simple name
      this.symbolIndex.set(node.name, node.id);
      
      // Index by full name
      if (node.fullName) {
        this.symbolIndex.set(node.fullName, node.id);
      }
      
      // Index by qualified name (Class.method)
      if (node.metadata?.owner && node.name) {
        const qualifiedName = `${node.metadata.owner}.${node.name}`;
        this.symbolIndex.set(qualifiedName, node.id);
      }
    }
    
    logger.debug(`Built symbol index with ${this.symbolIndex.size} entries`);
  }

  /**
   * Add documentation files to the graph
   */
  addDocumentation(
    docFiles: string[],
    onProgress?: (current: number, total: number) => void
  ): void {
    logger.info(`Processing ${docFiles.length} documentation files...`);
    
    let processed = 0;
    
    for (const docFile of docFiles) {
      try {
        this.addDocumentationFile(docFile);
        processed++;
        
        if (onProgress) {
          onProgress(processed, docFiles.length);
        }
      } catch (error) {
        logger.warn(`Failed to process documentation file: ${docFile}`, error);
      }
    }
    
    logger.success(`Processed ${processed} documentation files`);
  }

  /**
   * Add a single documentation file to the graph
   */
  private addDocumentationFile(filePath: string): void {
    // Parse markdown
    const parsed = MarkdownParser.parseFile(filePath);
    
    // Create file node
    const fileId = this.createDocumentationFileNode(parsed);
    
    // Create section nodes
    for (const section of parsed.sections) {
      const sectionId = this.createSectionNode(section, parsed.path, fileId);
      
      // Create example nodes for code blocks
      for (const codeBlock of section.codeBlocks) {
        this.createExampleNode(codeBlock, section, parsed.path, sectionId);
      }
    }
  }

  /**
   * Create a documentation file node
   */
  private createDocumentationFileNode(parsed: ParsedMarkdown): string {
    const relativePath = path.relative(this.projectRoot, parsed.path);
    const fileId = stableId('doc-file', parsed.path);
    
    // Get title from first heading or filename
    const title = parsed.sections.length > 0 && parsed.sections[0].level === 1
      ? parsed.sections[0].heading
      : path.basename(parsed.path, path.extname(parsed.path));
    
    const node = createGraphNode(
      fileId,
      'doc',
      title,
      {
        file: parsed.path,
        startLine: 1,
        endLine: parsed.sections[parsed.sections.length - 1]?.endLine || 1,
        startCol: 1,
        endCol: 1,
      },
      relativePath,
      `Documentation file: ${title}`,
      {
        filePath: parsed.path,
        relativePath,
        hash: parsed.hash,
        sectionCount: parsed.sections.length,
        codeBlockCount: parsed.codeBlocks.length,
        linkCount: parsed.links.length,
        frontmatter: parsed.frontmatter,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to project
    const projectNodes = this.graph.getNodes().filter(n => n.type === 'project');
    if (projectNodes.length > 0) {
      const projectId = projectNodes[0].id;
      this.graph.addEdge(
        createGraphEdge(
          stableId('edge', 'OWNS', projectId, fileId),
          'OWNS',
          projectId,
          fileId,
          true,
          [node.location!]
        )
      );
    }
    
    return fileId;
  }

  /**
   * Create a documentation section node
   */
  private createSectionNode(
    section: MarkdownSection,
    filePath: string,
    fileId: string
  ): string {
    const sectionId = stableId('doc-section', filePath, section.id, section.startLine);
    
    const node = createGraphNode(
      sectionId,
      'doc',
      section.heading,
      {
        file: filePath,
        startLine: section.startLine,
        endLine: section.endLine,
        startCol: 1,
        endCol: 1,
      },
      `${path.relative(this.projectRoot, filePath)}#${section.id}`,
      section.content.substring(0, 200), // First 200 chars as summary
      {
        heading: section.heading,
        level: section.level,
        content: section.content,
        sectionId: section.id,
        codeBlockCount: section.codeBlocks.length,
        symbolReferences: section.symbolReferences,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to file
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'OWNS', fileId, sectionId),
        'OWNS',
        fileId,
        sectionId,
        true,
        [node.location!]
      )
    );
    
    // Link to referenced symbols
    this.linkToSymbols(sectionId, section.symbolReferences, node.location!);
    
    return sectionId;
  }

  /**
   * Create an example node for a code block
   */
  private createExampleNode(
    codeBlock: CodeBlock,
    section: MarkdownSection,
    filePath: string,
    sectionId: string
  ): string {
    const exampleId = stableId('example', filePath, section.id, codeBlock.startLine);
    
    const name = codeBlock.caption || `${section.heading} Example`;
    
    const node = createGraphNode(
      exampleId,
      'example',
      name,
      {
        file: filePath,
        startLine: codeBlock.startLine,
        endLine: codeBlock.endLine,
        startCol: 1,
        endCol: 1,
      },
      `${path.relative(this.projectRoot, filePath)}#${section.id}-example`,
      `Code example in ${codeBlock.language}`,
      {
        language: codeBlock.language,
        code: codeBlock.code,
        caption: codeBlock.caption,
        symbolReferences: codeBlock.symbolReferences,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to section
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'OWNS', sectionId, exampleId),
        'OWNS',
        sectionId,
        exampleId,
        true,
        [node.location!]
      )
    );
    
    // Link to referenced symbols with EXAMPLE_OF edge
    this.linkExampleToSymbols(exampleId, codeBlock.symbolReferences, node.location!);
    
    return exampleId;
  }

  /**
   * Link a documentation node to referenced symbols
   */
  private linkToSymbols(
    docNodeId: string,
    symbolReferences: string[],
    location: GraphNode['location']
  ): void {
    const linkedSymbols = new Set<string>();
    
    for (const symbolName of symbolReferences) {
      const symbolId = this.findSymbolId(symbolName);
      
      if (symbolId && !linkedSymbols.has(symbolId)) {
        // Create DOCUMENTS edge
        this.graph.addEdge(
          createGraphEdge(
            stableId('edge', 'DOCUMENTS', docNodeId, symbolId),
            'DOCUMENTS',
            docNodeId,
            symbolId,
            true,
            [location!],
            {
              symbolName,
              confidence: this.calculateLinkConfidence(symbolName),
            }
          )
        );
        
        linkedSymbols.add(symbolId);
      }
    }
  }

  /**
   * Link an example node to referenced symbols
   */
  private linkExampleToSymbols(
    exampleNodeId: string,
    symbolReferences: string[],
    location: GraphNode['location']
  ): void {
    const linkedSymbols = new Set<string>();
    
    for (const symbolName of symbolReferences) {
      const symbolId = this.findSymbolId(symbolName);
      
      if (symbolId && !linkedSymbols.has(symbolId)) {
        // Create EXAMPLE_OF edge
        this.graph.addEdge(
          createGraphEdge(
            stableId('edge', 'EXAMPLE_OF', exampleNodeId, symbolId),
            'EXAMPLE_OF',
            exampleNodeId,
            symbolId,
            true,
            [location!],
            {
              symbolName,
            }
          )
        );
        
        linkedSymbols.add(symbolId);
      }
    }
  }

  /**
   * Find a symbol ID by name (with fuzzy matching)
   */
  private findSymbolId(symbolName: string): string | undefined {
    // Try exact match first
    let symbolId = this.symbolIndex.get(symbolName);
    if (symbolId) {
      return symbolId;
    }
    
    // Try case-insensitive match
    const lowerName = symbolName.toLowerCase();
    for (const [name, id] of this.symbolIndex) {
      if (name.toLowerCase() === lowerName) {
        return id;
      }
    }
    
    // Try partial match (symbol name ends with the reference)
    for (const [name, id] of this.symbolIndex) {
      if (name.endsWith(`.${symbolName}`) || name.endsWith(`/${symbolName}`)) {
        return id;
      }
    }
    
    return undefined;
  }

  /**
   * Calculate confidence score for a symbol link
   */
  private calculateLinkConfidence(symbolName: string): number {
    // Exact match in symbol index
    if (this.symbolIndex.has(symbolName)) {
      return 1.0;
    }
    
    // Case-insensitive match
    const lowerName = symbolName.toLowerCase();
    for (const name of this.symbolIndex.keys()) {
      if (name.toLowerCase() === lowerName) {
        return 0.9;
      }
    }
    
    // Partial match
    for (const name of this.symbolIndex.keys()) {
      if (name.endsWith(`.${symbolName}`) || name.endsWith(`/${symbolName}`)) {
        return 0.8;
      }
    }
    
    return 0.5; // Low confidence
  }

  /**
   * Get documentation statistics
   */
  getStats(): DocumentationStats {
    const allNodes = this.graph.getNodes();
    const docNodes = allNodes.filter(n => n.type === 'doc');
    const exampleNodes = allNodes.filter(n => n.type === 'example');
    const codeNodes = allNodes.filter(n => 
      n.type !== 'doc' && 
      n.type !== 'example' && 
      n.type !== 'file' && 
      n.type !== 'project' &&
      n.type !== 'module'
    );
    
    // Count symbols with documentation
    const documentsEdges = this.graph.getEdgesByType('DOCUMENTS');
    const documentedSymbols = new Set(documentsEdges.map(e => e.to));
    
    return {
      totalDocs: docNodes.length,
      totalSections: docNodes.length,
      totalExamples: exampleNodes.length,
      linkedSymbols: documentedSymbols.size,
      coverage: codeNodes.length > 0 
        ? (documentedSymbols.size / codeNodes.length) * 100 
        : 0,
    };
  }

  /**
   * Find documentation for a specific symbol
   */
  findDocumentationForSymbol(symbolId: string): GraphNode[] {
    const documentsEdges = this.graph
      .getIncomingEdges(symbolId)
      .filter(e => e.type === 'DOCUMENTS');
    
    return documentsEdges
      .map(e => this.graph.getNode(e.from))
      .filter((node): node is GraphNode => Boolean(node));
  }

  /**
   * Find examples for a specific symbol
   */
  findExamplesForSymbol(symbolId: string): GraphNode[] {
    const exampleEdges = this.graph
      .getIncomingEdges(symbolId)
      .filter(e => e.type === 'EXAMPLE_OF');
    
    return exampleEdges
      .map(e => this.graph.getNode(e.from))
      .filter((node): node is GraphNode => Boolean(node));
  }
}
