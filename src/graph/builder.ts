import fs from "fs";
import os from "os";
import path from "path";
import { GraphModel, createGraphEdge, createGraphNode } from "./model.js";
import { SemanticAnalyzer } from "./semantics.js";
import { RelationshipAnalyzer } from "./relationships.js";
import { GraphAnalytics } from "./analytics.js";
import { Parser } from "../parser/index.js";
import { ParallelParser } from "../parser/parallel.js";
import { ProvenanceTracker } from "../provenance/tracker.js";
import {
  ParsedCall,
  ParsedFile,
  ParsedImport,
  ParsedImportBinding,
  ParsedSymbol,
} from "../types/models.js";
import { logger, scanSourceFiles, stableId } from "../utils/index.js";

interface ResolvedImportTarget {
  type: "file" | "module";
  path: string;
  id: string;
}

interface PathAlias {
  prefix: string;
  suffix: string;
  targets: string[];
}

export class GraphBuilder {
  private graph: GraphModel = new GraphModel();
  private parsedFiles: Map<string, ParsedFile> = new Map();
  private fileIdMap: Map<string, string> = new Map();
  private symbolIdMap: Map<string, string> = new Map();
  private fileHashMap: Map<string, { hash: string; language: string; size: number }> = new Map();
  private projectId = "";
  private projectRoot = "";
  private pathAliases: PathAlias[] = [];
  private provenanceTracker = new ProvenanceTracker();

  async buildFromRepository(
    root: string,
    include: string[] = ["**"],
    exclude: string[] = ["node_modules", "dist"],
    explicitFiles?: string[],
    useParallel: boolean = true,
  ): Promise<GraphModel> {
    this.graph = new GraphModel();
    this.parsedFiles.clear();
    this.fileIdMap.clear();
    this.symbolIdMap.clear();
    this.fileHashMap.clear();
    this.projectRoot = root;
    this.projectId = stableId("project", root);
    this.pathAliases = this.loadPathAliases(root);
    this.provenanceTracker = new ProvenanceTracker(); // fresh tracker per build

    logger.info(`Building graph from: ${root}`);

    const projectNode = createGraphNode(
      this.projectId,
      "project",
      path.basename(root),
      {
        file: root,
        startLine: 1,
        endLine: 1,
        startCol: 1,
        endCol: 1,
      },
      root,
      `Project ${path.basename(root)}`,
    );
    this.graph.addNode(projectNode);

    const files =
      explicitFiles && explicitFiles.length > 0
        ? [...explicitFiles].sort()
        : scanSourceFiles(root, include, exclude);
    logger.info(`Found ${files.length} source files`);

    // Parse files (parallel or sequential)
    if (useParallel && files.length >= 10) {
      await this.parseFilesParallel(files);
    } else {
      await this.parseFilesSequential(files);
    }

    await this.buildRelationshipEdges();

    // Apply semantic analysis for world-class exports
    logger.info("Analyzing semantic structure...");
    const semanticAnalyzer = new SemanticAnalyzer(this.graph, root);
    semanticAnalyzer.analyzeAllNodes();

    // Analyze relationships for explanations
    const relationshipAnalyzer = new RelationshipAnalyzer(this.graph);
    relationshipAnalyzer.analyzeAllEdges();

    // Run graph analytics (PageRank, dead code, cycles, bridges)
    logger.info("Running graph analytics...");
    const analytics = new GraphAnalytics(this.graph);
    analytics.run();
    analytics.populateCallCounts();
    
    // Store topological sort in project node metadata
    const topoOrder = analytics.topologicalSort();
    const projNode = this.graph.getNode(this.projectId);
    if (projNode) {
      projNode.metadata = {
        ...(projNode.metadata ?? {}),
        buildOrder: topoOrder,
      };
    }

    logger.success(
      `Graph built. ${this.graph.getStats().nodeCount} nodes, ${this.graph.getStats().edgeCount} edges`,
    );
    return this.graph;
  }

  /**
   * Enrich file nodes with git metadata (author, last modified, commit SHA, created date).
   * This is an optional post-processing step that should be called after buildFromRepository.
   * Only call this if --git-blame flag is passed, as it adds latency.
   */
  async enrichWithGitMetadata(): Promise<void> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(this.projectRoot);
    
    // Check if this is a git repo
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        logger.debug('Not a git repository, skipping git metadata enrichment');
        return;
      }
    } catch {
      logger.debug('Git not available, skipping git metadata enrichment');
      return;
    }
    
    const fileNodes = this.graph.getNodes().filter(n => n.type === 'file');
    logger.info(`Enriching ${fileNodes.length} file nodes with git metadata...`);
    
    let enriched = 0;
    for (const node of fileNodes) {
      const filePath = node.location?.file ?? '';
      if (!filePath) continue;
      
      const gitMeta = await this.getGitMetadata(git, filePath);
      if (Object.keys(gitMeta).length > 0) {
        node.metadata = { ...node.metadata, ...gitMeta };
        enriched++;
      }
    }
    
    logger.info(`Enriched ${enriched} files with git metadata`);
  }

  /**
   * Get git metadata for a specific file.
   */
  private async getGitMetadata(git: any, filePath: string): Promise<{
    gitAuthor?: string;
    gitLastModified?: string;
    gitCommit?: string;
    gitCreatedAt?: string;
  }> {
    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      
      // Get last commit for this file
      const log = await git.log({ file: relativePath, maxCount: 1 });
      const latest = log.latest;
      if (!latest) return {};
      
      // Get creation commit (first commit that added this file)
      const firstLog = await git.log({ 
        file: relativePath, 
        '--diff-filter': 'A', 
        maxCount: 1 
      });
      
      return {
        gitAuthor: latest.author_email,
        gitLastModified: latest.date,
        gitCommit: latest.hash.slice(0, 8),
        gitCreatedAt: firstLog.latest?.date,
      };
    } catch {
      return {}; // git not available or file not tracked — silently skip
    }
  }

  getGraph(): GraphModel {
    return this.graph;
  }

  getFileHashes(): Map<string, { hash: string; language: string; size: number }> {
    return new Map(this.fileHashMap);
  }

  private addFileAndSymbols(filePath: string, parsed: ParsedFile): void {
    const relativePath =
      path.relative(this.projectRoot, filePath) || path.basename(filePath);
    const fileId = stableId("file", filePath);
    this.fileIdMap.set(filePath, fileId);

    const fileNode = createGraphNode(
      fileId,
      "file",
      relativePath,
      {
        file: filePath,
        startLine: 1,
        endLine: 1,
        startCol: 1,
        endCol: 1,
      },
      filePath,
      parsed.isTestFile
        ? "Test file"
        : parsed.isConfigFile
          ? "Config file"
          : "Source file",
      {
        language: parsed.language,
        testFile: parsed.isTestFile,
        configFile: parsed.isConfigFile,
        entryPoints: parsed.entryPoints,
      },
    );
    this.graph.addNode(fileNode);
    this.graph.addEdge(
      createGraphEdge(
        stableId("edge", "OWNS", this.projectId, fileId),
        "OWNS",
        this.projectId,
        fileId,
        true,
        [fileNode.location!],
      ),
    );

    for (const symbol of parsed.symbols) {
      const symbolId = stableId(
        "sym",
        filePath,
        symbol.type,
        symbol.owner || "",
        symbol.name,
        symbol.location.startLine,
        symbol.location.startCol,
      );
      this.symbolIdMap.set(
        `${filePath}::${symbol.owner || ""}::${symbol.name}`,
        symbolId,
      );
      this.symbolIdMap.set(`${filePath}::${symbol.name}`, symbolId);

      const fullName = symbol.owner
        ? `${relativePath}#${symbol.owner}.${symbol.name}`
        : `${relativePath}#${symbol.name}`;

      const node = createGraphNode(
        symbolId,
        symbol.type,
        symbol.name,
        symbol.location,
        fullName,
        symbol.summary,
        {
          ...(symbol.metadata || {}),
          filePath,
          owner: symbol.owner,
          exported: symbol.isExported,
          ...(symbol.params && { params: symbol.params }),
          ...(symbol.returnType && { returnType: symbol.returnType }),
        },
      );
      this.graph.addNode(node);

      this.graph.addEdge(
        createGraphEdge(
          stableId(
            "edge",
            "DEFINES",
            fileId,
            symbolId,
            symbol.location.startLine,
            symbol.location.startCol,
          ),
          "DEFINES",
          fileId,
          symbolId,
          true,
          [symbol.location],
        ),
      );

      if (symbol.isExported) {
        this.graph.addEdge(
          createGraphEdge(
            stableId("edge", "EXPORTS", fileId, symbolId),
            "EXPORTS",
            fileId,
            symbolId,
            true,
            [symbol.location],
          ),
        );
      }

      if (symbol.owner) {
        const ownerId =
          this.symbolIdMap.get(`${filePath}::${symbol.owner}`) ||
          this.symbolIdMap.get(`${filePath}::::${symbol.owner}`);
        if (ownerId) {
          this.graph.addEdge(
            createGraphEdge(
              stableId("edge", "OWNS", ownerId, symbolId),
              "OWNS",
              ownerId,
              symbolId,
              true,
              [symbol.location],
            ),
          );
        }
      }

      if (parsed.entryPoints.includes(symbol.name)) {
        this.graph.addEdge(
          createGraphEdge(
            stableId("edge", "ENTRY_POINT", this.projectId, symbolId),
            "ENTRY_POINT",
            this.projectId,
            symbolId,
            true,
            [symbol.location],
          ),
        );
      }
    }

    if (parsed.entryPoints.length > 0) {
      this.graph.addEdge(
        createGraphEdge(
          stableId("edge", "ENTRY_POINT", this.projectId, fileId),
          "ENTRY_POINT",
          this.projectId,
          fileId,
          true,
          [fileNode.location!],
        ),
      );
    }
  }

  private async buildRelationshipEdges(): Promise<void> {
    const ora = (await import('ora')).default;
    const spinner = ora('Building import relationships...').start();
    
    // First pass: build import resolver maps for all files
    const importResolverMaps = new Map<string, Map<string, { resolvedFilePath: string; exportName: string }>>();
    
    let processed = 0;
    const total = this.parsedFiles.size;
    const startTime = Date.now();
    
    for (const [filePath, parsed] of this.parsedFiles) {
      const importAliasMap = new Map<string, { resolvedFilePath: string; exportName: string }>();
      
      for (const parsedImport of parsed.imports) {
        const target = this.resolveImportTarget(parsedImport, filePath);
        
        // For each binding, try to resolve to actual export
        for (const binding of parsedImport.bindings) {
          if (target.type === 'file') {
            const parsedTargetFile = this.parsedFiles.get(target.path);
            if (parsedTargetFile) {
              // Find matching export
              const matchedExport = parsedTargetFile.exports.find((item) => {
                if (binding.kind === 'default') {
                  return item.exportedName === 'default';
                }
                if (binding.kind === 'namespace') {
                  return false;
                }
                return (
                  item.exportedName === binding.importedName ||
                  item.name === binding.importedName
                );
              });
              
              if (matchedExport && matchedExport.name !== '*') {
                importAliasMap.set(binding.localName, {
                  resolvedFilePath: target.path,
                  exportName: matchedExport.name
                });
              }
            }
          }
        }
      }
      
      importResolverMaps.set(filePath, importAliasMap);
      
      processed++;
      if (processed % 10 === 0) {
        const percentage = Math.round((processed / total) * 100);
        const elapsed = Date.now() - startTime;
        const avgTimePerFile = elapsed / processed;
        const remaining = (total - processed) * avgTimePerFile;
        const remainingSeconds = Math.round(remaining / 1000);
        spinner.text = `Building import relationships: ${processed}/${total} (${percentage}%) - ${remainingSeconds}s remaining`;
      }
    }

    const phase1Time = Math.round((Date.now() - startTime) / 1000);
    spinner.text = `Building dependency edges... (Phase 1: ${phase1Time}s)`;
    processed = 0;
    const phase2Start = Date.now();

    // Second pass: build edges using import resolver maps
    for (const [filePath, parsed] of this.parsedFiles) {
      const fromFileId = this.fileIdMap.get(filePath);
      if (!fromFileId) {
        continue;
      }

      const importResolverMap = importResolverMaps.get(filePath) || new Map();

      for (const parsedImport of parsed.imports) {
        const target = this.resolveImportTarget(parsedImport, filePath);
        this.graph.addEdge(
          createGraphEdge(
            stableId(
              "edge",
              parsed.isTestFile ? "TESTS" : "IMPORTS",
              fromFileId,
              target.id,
              parsedImport.location.startLine,
              parsedImport.location.startCol,
            ),
            parsed.isTestFile ? "TESTS" : "IMPORTS",
            fromFileId,
            target.id,
            target.type !== "module" || !this.isExternalModule(target.path),
            [parsedImport.location],
            {
              module: parsedImport.module,
              bindings: parsedImport.bindings,
            },
          ),
        );

        if (target.type === "file") {
          this.graph.addEdge(
            createGraphEdge(
              stableId("edge", "DEPENDS_ON", fromFileId, target.id),
              "DEPENDS_ON",
              fromFileId,
              target.id,
              true,
              [parsedImport.location],
              {
                module: parsedImport.module,
              },
            ),
          );
        }

        for (const binding of parsedImport.bindings) {
          const resolvedSymbolId = this.resolveImportBindingTarget(
            target,
            binding,
          );
          if (resolvedSymbolId) {
            this.graph.addEdge(
              createGraphEdge(
                stableId(
                  "edge",
                  parsed.isTestFile ? "TESTS" : "IMPORTS",
                  fromFileId,
                  resolvedSymbolId,
                  parsedImport.location.startLine,
                  binding.localName,
                ),
                parsed.isTestFile ? "TESTS" : "IMPORTS",
                fromFileId,
                resolvedSymbolId,
                true,
                [parsedImport.location],
                {
                  importedName: binding.importedName,
                  localName: binding.localName,
                },
              ),
            );
          }
        }
      }

      for (const exportItem of parsed.exports) {
        if (exportItem.sourceModule) {
          const target = this.resolveImportTarget(
            {
              module: exportItem.sourceModule,
              location: exportItem.location,
              bindings: [],
              isTypeOnly: false,
            },
            filePath,
          );

          this.graph.addEdge(
            createGraphEdge(
              stableId(
                "edge",
                "EXPORTS",
                fromFileId,
                target.id,
                exportItem.exportedName,
              ),
              "EXPORTS",
              fromFileId,
              target.id,
              target.type === "file",
              [exportItem.location],
              {
                exportedName: exportItem.exportedName,
                sourceModule: exportItem.sourceModule,
              },
            ),
          );
        }
      }

      processed++;
      if (processed % 10 === 0) {
        const percentage = Math.round((processed / total) * 100);
        const elapsed = Date.now() - phase2Start;
        const avgTimePerFile = elapsed / processed;
        const remaining = (total - processed) * avgTimePerFile;
        const remainingSeconds = Math.round(remaining / 1000);
        spinner.text = `Building dependency edges: ${processed}/${total} (${percentage}%) - ${remainingSeconds}s remaining`;
      }
    }

    const phase2Time = Math.round((Date.now() - phase2Start) / 1000);
    spinner.succeed(`Built relationships for ${total} files (${phase1Time + phase2Time}s total)`);
    
    // Third pass: connect symbol relationships
    processed = 0;
    const phase3Start = Date.now();
    const spinnerSymbols = ora('Connecting symbol relationships...').start();
    
    for (const [filePath, parsed] of this.parsedFiles) {
      const importResolverMap = importResolverMaps.get(filePath) || new Map();
      
      for (const symbol of parsed.symbols) {
        this.connectSymbolRelationships(
          filePath,
          symbol,
          importResolverMap,
          parsed.isTestFile,
        );
      }
      
      processed++;
      if (processed % 10 === 0) {
        const percentage = Math.round((processed / total) * 100);
        const elapsed = Date.now() - phase3Start;
        const avgTimePerFile = elapsed / processed;
        const remaining = (total - processed) * avgTimePerFile;
        const remainingSeconds = Math.round(remaining / 1000);
        spinnerSymbols.text = `Connecting symbol relationships: ${processed}/${total} (${percentage}%) - ${remainingSeconds}s remaining`;
      }
    }
    
    const phase3Time = Math.round((Date.now() - phase3Start) / 1000);
    spinnerSymbols.succeed(`Connected symbol relationships for ${total} files (${phase3Time}s)`);
  }

  private connectSymbolRelationships(
    filePath: string,
    symbol: ParsedSymbol,
    importResolverMap: Map<string, { resolvedFilePath: string; exportName: string }>,
    isTestFile: boolean,
  ): void {
    const symbolId = this.resolveLocalSymbolId(
      filePath,
      symbol.name,
      symbol.owner,
    );
    if (!symbolId) {
      return;
    }

    if (symbol.type === "class") {
      if (symbol.extendsName) {
        const importResolution = importResolverMap.get(symbol.extendsName);
        const targetId = importResolution
          ? this.symbolIdMap.get(`${importResolution.resolvedFilePath}::${importResolution.exportName}`)
          : undefined;
        
        const finalTarget =
          targetId ||
          this.resolveLocalSymbolId(filePath, symbol.extendsName) ||
          this.findGlobalSymbolId(symbol.extendsName);
          
        if (finalTarget) {
          this.graph.addEdge(
            createGraphEdge(
              stableId("edge", "EXTENDS", symbolId, finalTarget),
              "EXTENDS",
              symbolId,
              finalTarget,
              true,
              [symbol.location],
            ),
          );
        }
      }

      for (const implemented of symbol.implements || []) {
        const importResolution = importResolverMap.get(implemented);
        const targetId = importResolution
          ? this.symbolIdMap.get(`${importResolution.resolvedFilePath}::${importResolution.exportName}`)
          : undefined;
        
        const finalTarget =
          targetId ||
          this.resolveLocalSymbolId(filePath, implemented) ||
          this.findGlobalSymbolId(implemented);
          
        if (finalTarget) {
          this.graph.addEdge(
            createGraphEdge(
              stableId("edge", "IMPLEMENTS", symbolId, finalTarget),
              "IMPLEMENTS",
              symbolId,
              finalTarget,
              true,
              [symbol.location],
            ),
          );
        }
      }

      for (const decorator of symbol.decorators || []) {
        const importResolution = importResolverMap.get(decorator);
        const targetId = importResolution
          ? this.symbolIdMap.get(`${importResolution.resolvedFilePath}::${importResolution.exportName}`)
          : undefined;
        
        const finalTarget =
          targetId ||
          this.resolveLocalSymbolId(filePath, decorator) ||
          this.findGlobalSymbolId(decorator);
          
        if (finalTarget) {
          this.graph.addEdge(
            createGraphEdge(
              stableId("edge", "DECORATES", finalTarget, symbolId),
              "DECORATES",
              finalTarget,
              symbolId,
              true,
              [symbol.location],
              {
                decoratorName: decorator,
              },
            ),
          );
        }
      }
    }

    if (symbol.type === "doc" && symbol.relatedTo) {
      const targetId =
        this.resolveLocalSymbolId(filePath, symbol.relatedTo) ||
        this.findGlobalSymbolId(
          symbol.relatedTo.split(".").pop() || symbol.relatedTo,
        ) ||
        this.fileIdMap.get(filePath);

      if (targetId) {
        this.graph.addEdge(
          createGraphEdge(
            stableId("edge", "DOCUMENTS", symbolId, targetId),
            "DOCUMENTS",
            symbolId,
            targetId,
            true,
            [symbol.location],
          ),
        );
      }
    }

    if (symbol.type === "route" && symbol.relatedTo) {
      const importResolution = importResolverMap.get(symbol.relatedTo);
      const targetId = importResolution
        ? this.symbolIdMap.get(`${importResolution.resolvedFilePath}::${importResolution.exportName}`)
        : undefined;
      
      const finalTarget =
        targetId ||
        this.resolveLocalSymbolId(filePath, symbol.relatedTo) ||
        this.findGlobalSymbolId(
          symbol.relatedTo.split(".").pop() || symbol.relatedTo,
        );

      if (finalTarget) {
        this.graph.addEdge(
          createGraphEdge(
            stableId("edge", "USES", symbolId, finalTarget),
            "USES",
            symbolId,
            finalTarget,
            true,
            [symbol.location],
          ),
        );
      }
    }

    for (const call of symbol.calls || []) {
      this.addCallEdge(symbolId, filePath, call, importResolverMap, isTestFile);
    }
  }

  private addCallEdge(
    fromSymbolId: string,
    filePath: string,
    call: ParsedCall,
    importResolverMap: Map<string, { resolvedFilePath: string; exportName: string }>,
    isTestFile: boolean,
  ): void {
    // First, check if the call target is in the import resolver map
    const importResolution = importResolverMap.get(call.name);
    
    let localTarget: string | undefined;
    
    if (importResolution) {
      // Resolve using import information
      localTarget = this.symbolIdMap.get(
        `${importResolution.resolvedFilePath}::${importResolution.exportName}`
      );
      
      if (!localTarget) {
        // Try without owner prefix
        localTarget = this.symbolIdMap.get(
          `${importResolution.resolvedFilePath}::${importResolution.exportName}`
        );
      }
    }
    
    // Fall back to local resolution
    if (!localTarget) {
      localTarget =
        this.resolveLocalSymbolId(filePath, call.name) ||
        this.resolveLocalSymbolId(
          filePath,
          call.fullName.split(".").pop() || call.name,
        ) ||
        this.findGlobalSymbolId(call.name) ||
        this.findGlobalSymbolId(call.fullName.split(".").pop() || call.name);
    }

    if (localTarget) {
      this.graph.addEdge(
        createGraphEdge(
          stableId(
            "edge",
            isTestFile ? "TESTS" : "CALLS",
            fromSymbolId,
            localTarget,
            call.location.startLine,
          ),
          isTestFile ? "TESTS" : "CALLS",
          fromSymbolId,
          localTarget,
          true,
          [call.location],
          {
            fullName: call.fullName,
            resolvedViaImport: Boolean(importResolution),
          },
        ),
      );
      return;
    }

    // Create unresolved call
    const unresolvedId = stableId("module", "unresolved-call", call.fullName);
    if (!this.graph.getNode(unresolvedId)) {
      this.graph.addNode(
        createGraphNode(
          unresolvedId,
          "module",
          call.fullName,
          call.location,
          `unresolved:${call.fullName}`,
          "unresolved",
          {
            inferred: false,
          },
        ),
      );
    }

    this.graph.addEdge(
      createGraphEdge(
        stableId(
          "edge",
          "CALLS_UNRESOLVED",
          fromSymbolId,
          unresolvedId,
          call.location.startLine,
        ),
        "CALLS_UNRESOLVED",
        fromSymbolId,
        unresolvedId,
        false,
        [call.location],
        {
          inferred: false,
          unresolvedName: call.name,
        },
      ),
    );
  }

  private resolveLocalSymbolId(
    filePath: string,
    name: string,
    owner?: string,
  ): string | undefined {
    if (owner) {
      const owned = this.symbolIdMap.get(`${filePath}::${owner}::${name}`);
      if (owned) {
        return owned;
      }
    }

    return this.symbolIdMap.get(`${filePath}::${name}`);
  }

  private findGlobalSymbolId(name: string): string | undefined {
    for (const [key, id] of this.symbolIdMap) {
      if (key.endsWith(`::${name}`)) {
        return id;
      }
    }

    return undefined;
  }

  private resolveImportTarget(
    parsedImport: ParsedImport,
    fromFile: string,
  ): ResolvedImportTarget {
    const resolvedPath = this.resolveModulePath(parsedImport.module, fromFile);
    if (resolvedPath && this.fileIdMap.has(resolvedPath)) {
      return {
        type: "file",
        path: resolvedPath,
        id: this.fileIdMap.get(resolvedPath)!,
      };
    }

    if (resolvedPath && fs.existsSync(resolvedPath)) {
      const fileId = stableId("file", resolvedPath);
      if (!this.graph.getNode(fileId)) {
        this.graph.addNode(
          createGraphNode(
            fileId,
            "file",
            path.relative(this.projectRoot, resolvedPath),
            {
              file: resolvedPath,
              startLine: 1,
              endLine: 1,
              startCol: 1,
              endCol: 1,
            },
            resolvedPath,
            "Referenced file",
          ),
        );
      }

      this.fileIdMap.set(resolvedPath, fileId);
      return {
        type: "file",
        path: resolvedPath,
        id: fileId,
      };
    }

    const moduleId = stableId("module", parsedImport.module);
    if (!this.graph.getNode(moduleId)) {
      this.graph.addNode(
        createGraphNode(
          moduleId,
          "module",
          parsedImport.module,
          parsedImport.location,
          parsedImport.module,
          this.isExternalModule(parsedImport.module)
            ? "External module"
            : "unresolved",
          {
            external: this.isExternalModule(parsedImport.module),
            inferred: false,
          },
        ),
      );
    }

    return {
      type: "module",
      path: parsedImport.module,
      id: moduleId,
    };
  }

  private resolveImportBindingTarget(
    target: ResolvedImportTarget,
    binding: ParsedImportBinding,
  ): string | undefined {
    if (target.type !== "file") {
      return undefined;
    }

    const parsedTargetFile = this.parsedFiles.get(target.path);
    if (!parsedTargetFile) {
      return undefined;
    }

    const matchedExport = parsedTargetFile.exports.find((item) => {
      if (binding.kind === "default") {
        return item.exportedName === "default";
      }

      if (binding.kind === "namespace") {
        return false;
      }

      return (
        item.exportedName === binding.importedName ||
        item.name === binding.importedName
      );
    });

    if (!matchedExport) {
      return undefined;
    }

    if (matchedExport.name === "*" || matchedExport.kind === "reexport") {
      return target.id;
    }

    return (
      this.resolveLocalSymbolId(target.path, matchedExport.name) ||
      this.findGlobalSymbolId(matchedExport.name)
    );
  }

  private resolveModulePath(
    moduleName: string,
    fromFile: string,
  ): string | undefined {
    if (!moduleName) {
      return undefined;
    }

    if (!moduleName.startsWith(".")) {
      for (const alias of this.pathAliases) {
        if (
          moduleName === alias.prefix ||
          (moduleName.startsWith(alias.prefix) &&
            moduleName.endsWith(alias.suffix))
        ) {
          const matched = moduleName.slice(
            alias.prefix.length,
            moduleName.length - alias.suffix.length,
          );
          for (const target of alias.targets) {
            const targetPath = target.replace("*", matched);
            const resolved = this.resolveFileCandidates(
              path.resolve(this.projectRoot, targetPath),
            );
            if (resolved) {
              return resolved;
            }
          }
        }
      }

      const directAlias = path.resolve(this.projectRoot, moduleName);
      const aliasResolved = this.resolveFileCandidates(directAlias);
      if (aliasResolved) {
        return aliasResolved;
      }

      const srcAlias = path.resolve(this.projectRoot, "src", moduleName);
      return this.resolveFileCandidates(srcAlias);
    }

    const base = path.resolve(path.dirname(fromFile), moduleName);
    return this.resolveFileCandidates(base);
  }

  private resolveFileCandidates(basePath: string): string | undefined {
    const parsed = path.parse(basePath);
    const withoutRuntimeExtension = [".js", ".jsx", ".mjs", ".cjs"].includes(
      parsed.ext,
    )
      ? path.join(parsed.dir, parsed.name)
      : basePath;

    const candidates = [
      basePath,
      withoutRuntimeExtension,
      `${withoutRuntimeExtension}.ts`,
      `${withoutRuntimeExtension}.tsx`,
      `${withoutRuntimeExtension}.js`,
      `${withoutRuntimeExtension}.jsx`,
      `${withoutRuntimeExtension}.mjs`,
      `${withoutRuntimeExtension}.cjs`,
      path.join(withoutRuntimeExtension, "index.ts"),
      path.join(withoutRuntimeExtension, "index.tsx"),
      path.join(withoutRuntimeExtension, "index.js"),
      path.join(withoutRuntimeExtension, "index.jsx"),
      path.join(withoutRuntimeExtension, "index.mjs"),
      path.join(withoutRuntimeExtension, "index.cjs"),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  private async parseFilesSequential(files: string[], showProgress: boolean = true): Promise<void> {
    let spinner: any = null;
    let processed = 0;
    const total = files.length;
    const startTime = Date.now();
    const slowFiles: string[] = [];
    
    if (showProgress) {
      const ora = (await import('ora')).default;
      spinner = ora({
        text: `Parsing files: 0/${total} (0%) - Starting...`,
        spinner: 'dots'
      }).start();
    }
    
    for (const file of files) {
      const fileStartTime = Date.now();
      try {
        // Show which file we're parsing
        if (spinner) {
          const shortPath = file.length > 50 ? '...' + file.slice(-47) : file;
          spinner.text = `Parsing: ${shortPath}`;
        }
        
        const parsed = Parser.parseFile(file);
        this.parsedFiles.set(file, parsed);
        this.addFileAndSymbols(file, parsed);
        this.fileHashMap.set(file, {
          hash: parsed.hash,
          language: parsed.language,
          size: fs.statSync(file).size
        });
        
        const fileTime = Date.now() - fileStartTime;
        if (fileTime > 5000) { // Track files that take more than 5 seconds
          slowFiles.push(`${file} (${Math.round(fileTime / 1000)}s)`);
        }
        
        processed++;
        if (spinner) {
          const percentage = Math.round((processed / total) * 100);
          const elapsed = Date.now() - startTime;
          const avgTimePerFile = elapsed / processed;
          const remaining = (total - processed) * avgTimePerFile;
          const remainingSeconds = Math.round(remaining / 1000);
          
          spinner.text = `Parsing files: ${processed}/${total} (${percentage}%) - ${remainingSeconds}s remaining`;
        }
      } catch (error) {
        if (spinner) {
          spinner.warn(`Failed to parse: ${file}`);
          const ora = (await import('ora')).default;
          spinner = ora({
            text: `Continuing... ${processed + 1}/${total}`,
            spinner: 'dots'
          }).start();
        } else {
          logger.warn(`Failed to parse: ${file}`, error);
        }
        processed++;
      }
    }
    
    if (spinner) {
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      spinner.succeed(`Parsed ${processed}/${total} files in ${totalTime}s`);
      
      if (slowFiles.length > 0) {
        logger.warn(`Slow files detected (>5s): ${slowFiles.slice(0, 5).join(', ')}${slowFiles.length > 5 ? ` and ${slowFiles.length - 5} more` : ''}`);
      }
    }
  }

  private async parseFilesParallel(files: string[]): Promise<void> {
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: `Parsing files: 0/${files.length} (0%) - Starting parallel parsing...`,
      spinner: 'dots'
    }).start();
    
    const startTime = Date.now();
    const parallelParser = new ParallelParser();
    
    // Parse files with progress callback
    const results = await parallelParser.parseFiles(files, (current, total) => {
      const percentage = Math.round((current / total) * 100);
      const elapsed = Date.now() - startTime;
      const avgTimePerFile = elapsed / Math.max(current, 1);
      const remaining = (total - current) * avgTimePerFile;
      const remainingSeconds = Math.round(remaining / 1000);
      
      spinner.text = `Parsing files: ${current}/${total} (${percentage}%) - ${remainingSeconds}s remaining`;
    });
    
    // Process results
    for (const [filePath, parsed] of results) {
      this.parsedFiles.set(filePath, parsed);
      this.addFileAndSymbols(filePath, parsed);
      this.fileHashMap.set(filePath, {
        hash: parsed.hash,
        language: parsed.language,
        size: fs.statSync(filePath).size
      });
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    spinner.succeed(`Parsed ${results.size}/${files.length} files in ${totalTime}s (parallel)`);
  }

  private isExternalModule(moduleName: string): boolean {
    return !moduleName.startsWith(".") && !path.isAbsolute(moduleName);
  }

  private loadPathAliases(root: string): PathAlias[] {
    const tsconfigPath = path.join(root, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
      return [];
    }

    try {
      const raw = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8")) as {
        compilerOptions?: {
          baseUrl?: string;
          paths?: Record<string, string[]>;
        };
      };
      const baseUrl = raw.compilerOptions?.baseUrl || ".";
      const paths = raw.compilerOptions?.paths || {};

      return Object.entries(paths).map(([pattern, targets]) => {
        const starIndex = pattern.indexOf("*");
        const prefix = starIndex >= 0 ? pattern.slice(0, starIndex) : pattern;
        const suffix = starIndex >= 0 ? pattern.slice(starIndex + 1) : "";
        return {
          prefix,
          suffix,
          targets: targets.map((target) => path.join(baseUrl, target)),
        };
      });
    } catch (error) {
      logger.debug("Failed to load tsconfig path aliases", error);
      return [];
    }
  }

  /**
   * Add documentation files to the graph
   */
  async addDocumentation(includePatterns?: string[]): Promise<void> {
    const { DocumentationBuilder } = await import('./documentation-builder.js');
    const { MarkdownParser } = await import('../parser/markdown.js');
    
    // Default patterns for documentation files
    const patterns = includePatterns || [
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'docs/**/*.md',
      'documentation/**/*.md',
      '*.md',
    ];
    
    // Find documentation files by walking the directory
    const docFiles: string[] = [];
    
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) {
        return;
      }
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.projectRoot, fullPath);
        
        // Skip excluded directories
        if (
          relativePath.includes('node_modules') ||
          relativePath.includes('dist') ||
          relativePath.includes('build') ||
          relativePath.includes('.git')
        ) {
          continue;
        }
        
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        
        // Check if it's a markdown file
        if (MarkdownParser.isMarkdownFile(fullPath)) {
          // Check if it matches any of the patterns
          const shouldInclude = patterns.some(pattern => {
            if (pattern === '*.md') {
              return path.dirname(fullPath) === this.projectRoot;
            }
            if (pattern.includes('**')) {
              const regex = new RegExp(
                pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
              );
              return regex.test(relativePath);
            }
            return relativePath === pattern || relativePath.endsWith('/' + pattern);
          });
          
          if (shouldInclude) {
            docFiles.push(fullPath);
          }
        }
      }
    };
    
    walk(this.projectRoot);
    
    // Remove duplicates
    const uniqueDocFiles = Array.from(new Set(docFiles)).sort();
    
    if (uniqueDocFiles.length === 0) {
      logger.info('No documentation files found');
      return;
    }
    
    logger.info(`Found ${uniqueDocFiles.length} documentation files`);
    
    // Create documentation builder
    const docBuilder = new DocumentationBuilder(this.graph, this.projectRoot);
    
    // Add documentation with progress tracking
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: `Processing documentation: 0/${uniqueDocFiles.length}`,
      spinner: 'dots',
    }).start();
    
    docBuilder.addDocumentation(uniqueDocFiles, (current, total) => {
      const percentage = Math.round((current / total) * 100);
      spinner.text = `Processing documentation: ${current}/${total} (${percentage}%)`;
    });
    
    const stats = docBuilder.getStats();
    spinner.succeed(
      `Processed ${stats.totalDocs} documentation sections, ` +
      `${stats.totalExamples} examples, ` +
      `linked to ${stats.linkedSymbols} symbols (${stats.coverage.toFixed(1)}% coverage)`
    );
  }

  /**
   * Add API schemas to the graph
   */
  async addAPISchemas(includePatterns?: string[]): Promise<void> {
    const { APIBuilder } = await import('./api-builder.js');
    const { OpenAPIParser } = await import('../parser/openapi.js');
    const { GraphQLSchemaParser } = await import('../parser/graphql-schema.js');
    
    // Default patterns for API schema files
    const patterns = includePatterns || [
      '**/openapi.yaml',
      '**/openapi.yml',
      '**/openapi.json',
      '**/swagger.yaml',
      '**/swagger.yml',
      '**/swagger.json',
      '**/api-spec.yaml',
      '**/api-spec.yml',
      '**/schema.graphql',
      '**/schema.gql',
      '**/*.graphql',
      '**/*.gql',
    ];
    
    // Find API schema files by walking the directory
    const schemaFiles: string[] = [];
    
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) {
        return;
      }
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.projectRoot, fullPath);
        
        // Skip excluded directories
        if (
          relativePath.includes('node_modules') ||
          relativePath.includes('dist') ||
          relativePath.includes('build') ||
          relativePath.includes('.git') ||
          relativePath.includes('test') ||
          relativePath.includes('tests')
        ) {
          continue;
        }
        
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        
        // Check if it's an API schema file
        if (OpenAPIParser.isOpenAPIFile(fullPath) || GraphQLSchemaParser.isGraphQLFile(fullPath)) {
          // Check if it matches any of the patterns
          const shouldInclude = patterns.some(pattern => {
            // Simple filename match
            if (!pattern.includes('/') && !pattern.includes('*')) {
              return entry.name === pattern;
            }
            
            // Escape dots first, then handle wildcards
            let regexPattern = pattern.replace(/\./g, '\\.');
            
            // Pattern with **
            if (pattern.includes('**')) {
              regexPattern = regexPattern
                .replace(/\*\*/g, '.*')  // ** matches any path
                .replace(/\*/g, '[^/]*'); // * matches any filename part
            } else if (pattern.includes('*')) {
              regexPattern = regexPattern.replace(/\*/g, '[^/]*');
            }
            
            const regex = new RegExp('^' + regexPattern + '$');
            const normalizedPath = relativePath.replace(/\\/g, '/');
            return regex.test(normalizedPath);
          });
          
          if (shouldInclude) {
            schemaFiles.push(fullPath);
          }
        }
      }
    };
    
    walk(this.projectRoot);
    
    // Remove duplicates
    const uniqueSchemaFiles = Array.from(new Set(schemaFiles)).sort();
    
    if (uniqueSchemaFiles.length === 0) {
      logger.info('No API schema files found');
      return;
    }
    
    logger.info(`Found ${uniqueSchemaFiles.length} API schema files`);
    
    // Create API builder
    const apiBuilder = new APIBuilder(this.graph, this.projectRoot);
    
    // Add API schemas with progress tracking
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: `Processing API schemas: 0/${uniqueSchemaFiles.length}`,
      spinner: 'dots',
    }).start();
    
    apiBuilder.addAPISchemas(uniqueSchemaFiles, (current, total) => {
      const percentage = Math.round((current / total) * 100);
      spinner.text = `Processing API schemas: ${current}/${total} (${percentage}%)`;
    });
    
    const stats = apiBuilder.getStats();
    spinner.succeed(
      `Processed ${stats.totalSchemas} API schemas, ` +
      `${stats.totalEndpoints} REST endpoints, ` +
      `${stats.totalOperations} GraphQL operations, ` +
      `${stats.totalTypes} types, ` +
      `linked ${stats.linkedHandlers} handlers (${stats.coverage.toFixed(1)}% coverage)`
    );
  }
}
