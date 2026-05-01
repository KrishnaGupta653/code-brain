import fs from "fs";
import path from "path";
import { GraphModel, createGraphEdge, createGraphNode } from "./model.js";
import { SemanticAnalyzer } from "./semantics.js";
import { RelationshipAnalyzer } from "./relationships.js";
import { Parser } from "../parser/index.js";
import {
  GraphNode,
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
  private parseErrors: Array<{ filePath: string; error: string }> = [];
  private projectId = "";
  private projectRoot = "";
  private pathAliases: PathAlias[] = [];

  buildFromRepository(
    root: string,
    include: string[] = ["**"],
    exclude: string[] = ["node_modules", "dist"],
    explicitFiles?: string[],
  ): GraphModel {
    this.graph = new GraphModel();
    this.parsedFiles.clear();
    this.fileIdMap.clear();
    this.symbolIdMap.clear();
    this.fileHashMap.clear();
    this.parseErrors = [];
    this.projectRoot = root;
    this.projectId = stableId("project", root);
    this.pathAliases = this.loadPathAliases(root);

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

    for (const file of files) {
      try {
        const parsed = Parser.parseFile(file);
        this.parsedFiles.set(file, parsed);
        this.addFileAndSymbols(file, parsed);
        // Store file hash for later use
        this.fileHashMap.set(file, {
          hash: parsed.hash,
          language: parsed.language,
          size: fs.statSync(file).size
        });
      } catch (error) {
        this.parseErrors.push({
          filePath: file,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.warn(`Failed to parse: ${file}`, error);
      }
    }

    this.buildRelationshipEdges();
    this.resolveReexportChains();
    this.connectRenderRelationships();

    // Apply semantic analysis for world-class exports
    logger.info("Analyzing semantic structure...");
    const semanticAnalyzer = new SemanticAnalyzer(this.graph, root);
    semanticAnalyzer.analyzeAllNodes();

    // Analyze relationships for explanations
    const relationshipAnalyzer = new RelationshipAnalyzer(this.graph);
    relationshipAnalyzer.analyzeAllEdges();

    logger.success(
      `Graph built. ${this.graph.getStats().nodeCount} nodes, ${this.graph.getStats().edgeCount} edges`,
    );
    return this.graph;
  }

  getGraph(): GraphModel {
    return this.graph;
  }

  getFileHashes(): Map<string, { hash: string; language: string; size: number }> {
    return new Map(this.fileHashMap);
  }

  getParseErrors(): Array<{ filePath: string; error: string }> {
    return [...this.parseErrors];
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
          exportKind: symbol.exportKind,
          async: symbol.async,
          propsType: symbol.propsType,
          hooks: symbol.hooks,
          renderedComponents: symbol.renderedComponents,
          decoratorRoles: symbol.decoratorRoles,
          typeParameters: symbol.typeParameters,
        },
      );
      if (typeof symbol.metadata?.semanticRole === "string") {
        node.semanticRole = symbol.metadata.semanticRole as string;
      }
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

  private buildRelationshipEdges(): void {
    // First pass: build import resolver maps for all files
    const importResolverMaps = new Map<string, Map<string, { resolvedFilePath: string; exportName: string }>>();
    
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
    }

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
                kind: exportItem.kind,
              },
            ),
          );
        }
      }

      for (const symbol of parsed.symbols) {
        this.connectSymbolRelationships(
          filePath,
          symbol,
          importResolverMap,
          parsed.isTestFile,
        );
      }
    }
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

  private resolveExportReference(
    filePath: string,
    exportName: string,
    visited: Set<string> = new Set(),
  ): { resolvedFilePath: string; exportName: string } | undefined {
    const visitKey = `${filePath}::${exportName}`;
    if (visited.has(visitKey)) {
      return undefined;
    }
    visited.add(visitKey);

    const parsedTargetFile = this.parsedFiles.get(filePath);
    if (!parsedTargetFile) {
      return undefined;
    }

    const matchedExport = parsedTargetFile.exports.find((item) => {
      if (exportName === "default") {
        return item.exportedName === "default";
      }
      return item.exportedName === exportName || item.name === exportName;
    });

    if (!matchedExport) {
      return undefined;
    }

    if (matchedExport.kind === "reexport" && matchedExport.sourceModule) {
      const reexportTarget = this.resolveImportTarget(
        {
          module: matchedExport.sourceModule,
          location: matchedExport.location,
          bindings: [],
          isTypeOnly: false,
        },
        filePath,
      );

      if (reexportTarget.type !== "file") {
        return undefined;
      }

      const nextExportName =
        matchedExport.name === "*" ? exportName : matchedExport.name;

      return (
        this.resolveExportReference(
          reexportTarget.path,
          nextExportName,
          visited,
        ) || {
          resolvedFilePath: reexportTarget.path,
          exportName: nextExportName,
        }
      );
    }

    if (matchedExport.name === "*") {
      return undefined;
    }

    return {
      resolvedFilePath: filePath,
      exportName: matchedExport.name,
    };
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

    if (binding.kind === "namespace") {
      return target.id;
    }

    const resolved = this.resolveExportReference(
      target.path,
      binding.kind === "default" ? "default" : binding.importedName,
    );

    if (!resolved) {
      return undefined;
    }

    return (
      this.resolveLocalSymbolId(resolved.resolvedFilePath, resolved.exportName) ||
      this.findGlobalSymbolId(resolved.exportName)
    );
  }

  private resolveReexportChains(): void {
    for (const [filePath, parsed] of this.parsedFiles) {
      const exportingFileId = this.fileIdMap.get(filePath);
      if (!exportingFileId) {
        continue;
      }

      for (const exportItem of parsed.exports) {
        if (!exportItem.sourceModule) {
          continue;
        }

        if (exportItem.name === "*" || exportItem.exportedName === "*") {
          const target = this.resolveImportTarget(
            {
              module: exportItem.sourceModule,
              location: exportItem.location,
              bindings: [],
              isTypeOnly: false,
            },
            filePath,
          );

          if (target.type !== "file") {
            continue;
          }

          const exportedSymbols = this.graph
            .getOutgoingEdges(target.id)
            .filter((edge) => edge.type === "EXPORTS")
            .map((edge) => this.graph.getNode(edge.to))
            .filter(
              (node): node is GraphNode =>
                node !== undefined &&
                node.type !== "file" &&
                node.type !== "module",
            );

          for (const symbol of exportedSymbols) {
            const edgeId = stableId(
              "edge",
              "EXPORTS_TRANSITIVE",
              exportingFileId,
              symbol.id,
            );
            if (!this.graph.getEdge(edgeId)) {
              this.graph.addEdge(
                createGraphEdge(
                  edgeId,
                  "EXPORTS",
                  exportingFileId,
                  symbol.id,
                  true,
                  [exportItem.location],
                  {
                    transitive: true,
                    kind: "reexport",
                    viaFile: target.path,
                  },
                ),
              );
            }
          }
          continue;
        }

        const resolved = this.resolveExportReference(filePath, exportItem.exportedName);
        if (!resolved) {
          continue;
        }

        const symbolId =
          this.resolveLocalSymbolId(resolved.resolvedFilePath, resolved.exportName) ||
          this.findGlobalSymbolId(resolved.exportName);

        if (!symbolId) {
          continue;
        }

        const edgeId = stableId(
          "edge",
          "EXPORTS_TRANSITIVE",
          exportingFileId,
          symbolId,
          exportItem.exportedName,
        );
        if (!this.graph.getEdge(edgeId)) {
          this.graph.addEdge(
            createGraphEdge(
              edgeId,
              "EXPORTS",
              exportingFileId,
              symbolId,
              true,
              [exportItem.location],
              {
                transitive: true,
                kind: "reexport",
                exportedName: exportItem.exportedName,
                sourceModule: exportItem.sourceModule,
              },
            ),
          );
        }
      }
    }
  }

  private connectRenderRelationships(): void {
    for (const [filePath, parsed] of this.parsedFiles) {
      for (const symbol of parsed.symbols) {
        if (symbol.type !== "component" || !symbol.renderedComponents?.length) {
          continue;
        }

        const fromId = this.resolveLocalSymbolId(filePath, symbol.name, symbol.owner);
        if (!fromId) {
          continue;
        }

        for (const renderedName of symbol.renderedComponents) {
          const targetId =
            this.resolveLocalSymbolId(filePath, renderedName) ||
            this.findGlobalSymbolId(renderedName);

          const target = targetId ? this.graph.getNode(targetId) : undefined;
          if (!target || target.type !== "component") {
            continue;
          }

          const edgeId = stableId(
            "edge",
            "RENDERS",
            fromId,
            target.id,
            renderedName,
          );
          if (!this.graph.getEdge(edgeId)) {
            this.graph.addEdge(
              createGraphEdge(
                edgeId,
                "RENDERS",
                fromId,
                target.id,
                true,
                [symbol.location],
                {
                  componentName: renderedName,
                },
              ),
            );
          }
        }
      }
    }
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
}
