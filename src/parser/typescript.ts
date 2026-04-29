import crypto from "crypto";
import fs from "fs";
import path from "path";
import ts from "typescript";
import {
  ParsedCall,
  ParsedExport,
  ParsedFile,
  ParsedImport,
  ParsedImportBinding,
  ParsedSymbol,
  SourceSpan,
} from "../types/models.js";
import { ParserError } from "../utils/index.js";

const ROUTE_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
]);

const TEST_CALLS = new Set(["describe", "it", "test"]);

export class TypeScriptParser {
  static parseFile(filePath: string): ParsedFile {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        this.getScriptKind(filePath),
      );

      const symbols: ParsedSymbol[] = [];
      const imports: ParsedImport[] = [];
      const exports: ParsedExport[] = [];
      const entryPoints = new Set<string>();
      const seenKeys = new Set<string>();
      const isTestFile = this.isTestFile(filePath);
      const isConfigFile = this.isConfigFile(filePath);

      // Track router variables dynamically
      const routerVars = new Set<string>(['app', 'router', 'server']);

      // First pass: collect router variables
      const collectRouterVars = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const init = node.initializer;
          if (init) {
            const initText = init.getText(sourceFile);
            if (
              initText.includes('express()') ||
              initText.includes('express.Router()') ||
              initText.includes('Router()') ||
              initText.includes('createRouter()') ||
              initText.includes('new Router')
            ) {
              routerVars.add(node.name.text);
            }
          }
        }
        ts.forEachChild(node, collectRouterVars);
      };
      collectRouterVars(sourceFile);

      const addSymbol = (symbol: ParsedSymbol): void => {
        const key = [
          symbol.type,
          symbol.name,
          symbol.owner || "",
          symbol.location.startLine,
          symbol.location.startCol,
        ].join("::");

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          symbols.push(symbol);
        }
      };

      const addExport = (item: ParsedExport): void => {
        const key = [
          item.kind,
          item.name,
          item.exportedName,
          item.location.startLine,
          item.location.startCol,
        ].join("::");

        if (!seenKeys.has(`export::${key}`)) {
          seenKeys.add(`export::${key}`);
          exports.push(item);
        }
      };

      const recordDocForSymbol = (targetName: string, node: ts.Node): void => {
        const summary = this.extractDocSummary(node, content);
        if (!summary) {
          return;
        }

        addSymbol({
          name: `doc:${targetName}`,
          type: "doc",
          location: summary.location,
          relatedTo: targetName,
          isExported: false,
          summary: summary.text,
          metadata: {
            source: "jsdoc",
          },
        });
      };

      for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement)) {
          const parsedImport = this.parseImportDeclaration(
            statement,
            sourceFile,
            filePath,
          );
          imports.push(parsedImport);

          if (parsedImport.module.endsWith(".json")) {
            addSymbol({
              name: `config:${parsedImport.module}`,
              type: "config",
              location: parsedImport.location,
              isExported: false,
              summary: `JSON config import ${parsedImport.module}`,
              metadata: {
                kind: "json-import",
                module: parsedImport.module,
              },
            });
          }

          continue;
        }

        if (ts.isExportDeclaration(statement)) {
          const statementSpan = this.createSpan(
            filePath,
            sourceFile,
            statement.getStart(sourceFile),
            statement.getEnd(),
          );
          const moduleSpecifier = statement.moduleSpecifier
            ? this.getStringLiteralText(statement.moduleSpecifier)
            : undefined;

          if (
            statement.exportClause &&
            ts.isNamedExports(statement.exportClause)
          ) {
            for (const element of statement.exportClause.elements) {
              addExport({
                name: element.propertyName?.text || element.name.text,
                exportedName: element.name.text,
                location: this.createSpan(
                  filePath,
                  sourceFile,
                  element.getStart(sourceFile),
                  element.getEnd(),
                ),
                kind: moduleSpecifier ? "reexport" : "named",
                sourceModule: moduleSpecifier,
              });
            }
          } else if (moduleSpecifier) {
            addExport({
              name: "*",
              exportedName: "*",
              location: statementSpan,
              kind: "reexport",
              sourceModule: moduleSpecifier,
            });
          }

          continue;
        }

        if (ts.isExportAssignment(statement)) {
          const name = ts.isIdentifier(statement.expression)
            ? statement.expression.text
            : "default";
          addExport({
            name,
            exportedName: "default",
            location: this.createSpan(
              filePath,
              sourceFile,
              statement.getStart(sourceFile),
              statement.getEnd(),
            ),
            kind: "default",
          });

          if (name === "main" || path.basename(filePath).startsWith("index")) {
            entryPoints.add(name);
          }

          continue;
        }

        if (ts.isFunctionDeclaration(statement) && statement.name) {
          const name = statement.name.text;
          const isExported = this.isNodeExported(statement);

          addSymbol({
            name,
            type: "function",
            location: this.createSpan(
              filePath,
              sourceFile,
              statement.getStart(sourceFile),
              statement.getEnd(),
            ),
            calls: this.extractCallsFromNode(
              statement.body,
              filePath,
              sourceFile,
            ),
            isExported,
            summary: this.extractDocSummary(statement, content)?.text,
          });

          if (isExported) {
            addExport({
              name,
              exportedName: this.isDefaultExport(statement) ? "default" : name,
              location: this.createSpan(
                filePath,
                sourceFile,
                statement.getStart(sourceFile),
                statement.getEnd(),
              ),
              kind: this.isDefaultExport(statement) ? "default" : "named",
            });
          }

          if (this.isEntrypointName(name, filePath, isExported)) {
            entryPoints.add(name);
          }

          recordDocForSymbol(name, statement);
          continue;
        }

        if (ts.isClassDeclaration(statement) && statement.name) {
          const name = statement.name.text;
          const heritage = this.parseHeritage(statement);
          const isExported = this.isNodeExported(statement);
          const decorators = this.extractDecoratorsFromNode(
            statement,
            filePath,
            sourceFile,
          );

          addSymbol({
            name,
            type: "class",
            location: this.createSpan(
              filePath,
              sourceFile,
              statement.getStart(sourceFile),
              statement.getEnd(),
            ),
            extendsName: heritage.extendsName,
            implements: heritage.implementsNames,
            isExported,
            summary: this.extractDocSummary(statement, content)?.text,
            decorators,
          });

          if (isExported) {
            addExport({
              name,
              exportedName: this.isDefaultExport(statement) ? "default" : name,
              location: this.createSpan(
                filePath,
                sourceFile,
                statement.getStart(sourceFile),
                statement.getEnd(),
              ),
              kind: this.isDefaultExport(statement) ? "default" : "named",
            });
          }

          if (this.isEntrypointName(name, filePath, isExported)) {
            entryPoints.add(name);
          }

          recordDocForSymbol(name, statement);

          for (const member of statement.members) {
            if (
              ts.isMethodDeclaration(member) ||
              ts.isGetAccessorDeclaration(member) ||
              ts.isSetAccessorDeclaration(member)
            ) {
              const methodName = this.getPropertyName(member.name);
              if (!methodName) {
                continue;
              }

              addSymbol({
                name: methodName,
                type: "method",
                location: this.createSpan(
                  filePath,
                  sourceFile,
                  member.getStart(sourceFile),
                  member.getEnd(),
                ),
                owner: name,
                calls: this.extractCallsFromNode(
                  member.body,
                  filePath,
                  sourceFile,
                ),
                isExported: false,
                summary: this.extractDocSummary(member, content)?.text,
              });

              recordDocForSymbol(`${name}.${methodName}`, member);
            }
          }

          continue;
        }

        if (ts.isInterfaceDeclaration(statement)) {
          const name = statement.name.text;
          const isExported = this.isNodeExported(statement);
          addSymbol({
            name,
            type: "interface",
            location: this.createSpan(
              filePath,
              sourceFile,
              statement.getStart(sourceFile),
              statement.getEnd(),
            ),
            isExported,
            summary: this.extractDocSummary(statement, content)?.text,
          });

          if (isExported) {
            addExport({
              name,
              exportedName: name,
              location: this.createSpan(
                filePath,
                sourceFile,
                statement.getStart(sourceFile),
                statement.getEnd(),
              ),
              kind: "named",
            });
          }

          recordDocForSymbol(name, statement);
          continue;
        }

        if (ts.isTypeAliasDeclaration(statement)) {
          const name = statement.name.text;
          const isExported = this.isNodeExported(statement);
          addSymbol({
            name,
            type: "type",
            location: this.createSpan(
              filePath,
              sourceFile,
              statement.getStart(sourceFile),
              statement.getEnd(),
            ),
            isExported,
            summary: this.extractDocSummary(statement, content)?.text,
          });

          if (isExported) {
            addExport({
              name,
              exportedName: name,
              location: this.createSpan(
                filePath,
                sourceFile,
                statement.getStart(sourceFile),
                statement.getEnd(),
              ),
              kind: "named",
            });
          }

          recordDocForSymbol(name, statement);
          continue;
        }

        if (ts.isEnumDeclaration(statement)) {
          const name = statement.name.text;
          const isExported = this.isNodeExported(statement);
          addSymbol({
            name,
            type: "enum",
            location: this.createSpan(
              filePath,
              sourceFile,
              statement.getStart(sourceFile),
              statement.getEnd(),
            ),
            isExported,
            summary: this.extractDocSummary(statement, content)?.text,
          });

          if (isExported) {
            addExport({
              name,
              exportedName: name,
              location: this.createSpan(
                filePath,
                sourceFile,
                statement.getStart(sourceFile),
                statement.getEnd(),
              ),
              kind: "named",
            });
          }

          recordDocForSymbol(name, statement);
          continue;
        }

        if (ts.isVariableStatement(statement)) {
          const isExported = this.isNodeExported(statement);
          for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) {
              continue;
            }

            const initializer = declaration.initializer;
            const name = declaration.name.text;
            const location = this.createSpan(
              filePath,
              sourceFile,
              declaration.getStart(sourceFile),
              declaration.getEnd(),
            );

            if (
              initializer &&
              (ts.isArrowFunction(initializer) ||
                ts.isFunctionExpression(initializer))
            ) {
              addSymbol({
                name,
                type: "function",
                location,
                calls: this.extractCallsFromNode(
                  initializer.body,
                  filePath,
                  sourceFile,
                ),
                isExported,
                summary: this.extractDocSummary(statement, content)?.text,
              });

              if (isExported) {
                addExport({
                  name,
                  exportedName: name,
                  location,
                  kind: "named",
                });
              }

              if (this.isEntrypointName(name, filePath, isExported)) {
                entryPoints.add(name);
              }
            } else if (isConfigFile) {
              addSymbol({
                name,
                type: "config",
                location,
                isExported,
                summary: `Config value ${name}`,
                metadata: {
                  kind: "config-variable",
                },
              });
            } else {
              addSymbol({
                name,
                type:
                  statement.declarationList.flags & ts.NodeFlags.Const
                    ? "constant"
                    : "variable",
                location,
                isExported,
                summary: this.extractDocSummary(statement, content)?.text,
              });
            }
          }

          continue;
        }
      }

      const envRefs = new Map<string, ParsedSymbol>();
      const seenRoutes = new Set<string>();
      const seenTests = new Set<string>();

      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node)) {
          const envRef = this.parseEnvReference(node, filePath, sourceFile);
          if (envRef) {
            envRefs.set(
              `${envRef.name}::${envRef.location.startLine}::${envRef.location.startCol}`,
              envRef,
            );
          }
        }

        if (ts.isCallExpression(node)) {
          const route = this.parseRouteCall(node, filePath, sourceFile, routerVars);
          if (route) {
            const key = `${route.name}::${route.location.startLine}::${route.location.startCol}`;
            if (!seenRoutes.has(key)) {
              seenRoutes.add(key);
              addSymbol(route);
              entryPoints.add(route.name);
            }
          }

          const testSymbol = this.parseTestCall(
            node,
            filePath,
            sourceFile,
            isTestFile,
          );
          if (testSymbol) {
            const key = `${testSymbol.name}::${testSymbol.location.startLine}::${testSymbol.location.startCol}`;
            if (!seenTests.has(key)) {
              seenTests.add(key);
              addSymbol(testSymbol);
            }
          }

          const configSymbol = this.parseConfigCall(node, filePath, sourceFile);
          if (configSymbol) {
            addSymbol(configSymbol);
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
      for (const symbol of envRefs.values()) {
        addSymbol(symbol);
      }

      if (this.isEntrypointFile(filePath)) {
        entryPoints.add(path.basename(filePath));
      }

      return {
        path: filePath,
        language: this.getLanguage(filePath),
        hash: crypto.createHash("sha256").update(content).digest("hex"),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile,
        isConfigFile,
      };
    } catch (error) {
      throw new ParserError(`Failed to parse file: ${filePath}`, error);
    }
  }

  private static parseImportDeclaration(
    node: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
  ): ParsedImport {
    const bindings: ParsedImportBinding[] = [];

    if (node.importClause) {
      if (node.importClause.name) {
        bindings.push({
          importedName: "default",
          localName: node.importClause.name.text,
          kind: "default",
        });
      }

      const namedBindings = node.importClause.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        bindings.push({
          importedName: "*",
          localName: namedBindings.name.text,
          kind: "namespace",
        });
      }

      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          bindings.push({
            importedName: element.propertyName?.text || element.name.text,
            localName: element.name.text,
            kind: "named",
          });
        }
      }
    }

    return {
      module: this.getStringLiteralText(node.moduleSpecifier),
      location: this.createSpan(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        node.getEnd(),
      ),
      bindings,
      isTypeOnly: Boolean(node.importClause?.isTypeOnly),
    };
  }

  private static parseRouteCall(
    node: ts.CallExpression,
    filePath: string,
    sourceFile: ts.SourceFile,
    routerVars: Set<string>,
  ): ParsedSymbol | null {
    if (!ts.isPropertyAccessExpression(node.expression)) {
      return null;
    }

    const objectName = node.expression.expression.getText(sourceFile);
    const methodName = node.expression.name.text;

    if (!routerVars.has(objectName) || !ROUTE_METHODS.has(methodName)) {
      return null;
    }

    const firstArg = node.arguments[0];
    if (!firstArg || !ts.isStringLiteralLike(firstArg)) {
      return null;
    }

    const handlerArg = node.arguments[1];
    const handlerName = handlerArg ? handlerArg.getText(sourceFile) : "unknown";

    return {
      name: `${methodName.toUpperCase()} ${firstArg.text}`,
      type: "route",
      location: this.createSpan(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        node.getEnd(),
      ),
      relatedTo: handlerName,
      isExported: false,
      summary: `Route ${methodName.toUpperCase()} ${firstArg.text}`,
      metadata: {
        handler: handlerName,
        method: methodName.toUpperCase(),
        path: firstArg.text,
      },
    };
  }

  private static parseTestCall(
    node: ts.CallExpression,
    filePath: string,
    sourceFile: ts.SourceFile,
    isTestFile: boolean,
  ): ParsedSymbol | null {
    const callee = node.expression;
    if (
      !ts.isIdentifier(callee) ||
      !TEST_CALLS.has(callee.text) ||
      !isTestFile
    ) {
      return null;
    }

    const firstArg = node.arguments[0];
    const label =
      firstArg && ts.isStringLiteralLike(firstArg) ? firstArg.text : "unknown";
    return {
      name: `${callee.text}:${label}`,
      type: "test",
      location: this.createSpan(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        node.getEnd(),
      ),
      isExported: false,
      summary: `${callee.text} ${label}`,
      metadata: {
        framework: "generic",
        label,
      },
    };
  }

  private static parseConfigCall(
    node: ts.CallExpression,
    filePath: string,
    sourceFile: ts.SourceFile,
  ): ParsedSymbol | null {
    const calleeText = node.expression.getText(sourceFile);
    if (calleeText !== "dotenv.config" && calleeText !== "config.get") {
      return null;
    }

    return {
      name: `config:${calleeText}`,
      type: "config",
      location: this.createSpan(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        node.getEnd(),
      ),
      isExported: false,
      summary: `Config call ${calleeText}`,
      metadata: {
        kind: "config-call",
      },
    };
  }

  private static parseEnvReference(
    node: ts.PropertyAccessExpression,
    filePath: string,
    sourceFile: ts.SourceFile,
  ): ParsedSymbol | null {
    if (!ts.isPropertyAccessExpression(node.expression)) {
      return null;
    }

    if (
      node.expression.expression.getText(sourceFile) !== "process" ||
      node.expression.name.text !== "env"
    ) {
      return null;
    }

    return {
      name: `env:${node.name.text}`,
      type: "config",
      location: this.createSpan(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        node.getEnd(),
      ),
      isExported: false,
      summary: `Environment variable ${node.name.text}`,
      metadata: {
        kind: "env",
        variable: node.name.text,
      },
    };
  }

  private static parseHeritage(node: ts.ClassDeclaration): {
    extendsName?: string;
    implementsNames?: string[];
  } {
    const result: {
      extendsName?: string;
      implementsNames?: string[];
    } = {};

    for (const heritage of node.heritageClauses || []) {
      if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
        const expr = heritage.types[0]?.expression;
        if (expr) {
          result.extendsName = expr.getText();
        }
      }

      if (heritage.token === ts.SyntaxKind.ImplementsKeyword) {
        result.implementsNames = heritage.types.map((item) =>
          item.expression.getText(),
        );
      }
    }

    return result;
  }

  private static extractDecoratorsFromNode(
    node: ts.ClassDeclaration | ts.MethodDeclaration,
    filePath: string,
    sourceFile: ts.SourceFile,
  ): string[] {
    void filePath;
    const decorators = ts.canHaveDecorators(node)
      ? ts.getDecorators(node)
      : undefined;
    if (!decorators || decorators.length === 0) {
      return [];
    }

    return decorators
      .map((dec: ts.Decorator) => {
        if (ts.isCallExpression(dec.expression)) {
          if (ts.isIdentifier(dec.expression.expression)) {
            return dec.expression.expression.text;
          }
          return dec.expression.expression.getText(sourceFile);
        }
        if (ts.isIdentifier(dec.expression)) {
          return dec.expression.text;
        }
        return dec.expression.getText(sourceFile);
      })
      .filter(Boolean);
  }

  private static extractCallsFromNode(
    body: ts.Node | undefined,
    filePath: string,
    sourceFile: ts.SourceFile,
  ): ParsedCall[] {
    if (!body) {
      return [];
    }

    const calls: ParsedCall[] = [];
    const seen = new Set<string>();
    const ignore = new Set(["describe", "it", "test", "expect", "require"]);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const normalized = this.normalizeCallExpression(
          node.expression,
          sourceFile,
        );
        if (normalized && !ignore.has(normalized.name)) {
          const call = {
            ...normalized,
            location: this.createSpan(
              filePath,
              sourceFile,
              node.getStart(sourceFile),
              node.getEnd(),
            ),
          };
          const key = `${call.fullName}::${call.location.startLine}::${call.location.startCol}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push(call);
          }
        }
      }

      if (ts.isNewExpression(node)) {
        const normalized = this.normalizeCallExpression(
          node.expression,
          sourceFile,
        );
        if (normalized) {
          const call = {
            ...normalized,
            location: this.createSpan(
              filePath,
              sourceFile,
              node.getStart(sourceFile),
              node.getEnd(),
            ),
          };
          const key = `${call.fullName}::${call.location.startLine}::${call.location.startCol}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push(call);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(body);
    return calls;
  }

  private static normalizeCallExpression(
    expression: ts.Expression,
    sourceFile: ts.SourceFile,
  ): Omit<ParsedCall, "location"> | null {
    if (ts.isIdentifier(expression)) {
      return {
        name: expression.text,
        fullName: expression.text,
      };
    }

    if (ts.isPropertyAccessExpression(expression)) {
      return {
        name: expression.name.text,
        fullName: expression.getText(sourceFile),
      };
    }

    if (ts.isElementAccessExpression(expression)) {
      return {
        name: expression.argumentExpression?.getText(sourceFile) || "unknown",
        fullName: expression.getText(sourceFile),
      };
    }

    return null;
  }

  private static extractDocSummary(
    node: ts.Node,
    content: string,
  ): { text: string; location: SourceSpan } | null {
    const ranges =
      ts.getLeadingCommentRanges(content, node.getFullStart()) || [];
    const jsDocRange = ranges.find((range) =>
      content.slice(range.pos, range.end).startsWith("/**"),
    );
    if (!jsDocRange) {
      return null;
    }

    const rawComment = content.slice(jsDocRange.pos, jsDocRange.end);
    const cleaned = rawComment
      .replace(/^\/\*\*?/, "")
      .replace(/\*\/$/, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!cleaned) {
      return null;
    }

    return {
      text: cleaned,
      location: this.createSpan(
        node.getSourceFile().fileName,
        node.getSourceFile(),
        jsDocRange.pos,
        jsDocRange.end,
      ),
    };
  }

  private static createSpan(
    filePath: string,
    sourceFile: ts.SourceFile,
    start: number,
    end: number,
  ): SourceSpan {
    const startPos = sourceFile.getLineAndCharacterOfPosition(start);
    const endPos = sourceFile.getLineAndCharacterOfPosition(end);
    return {
      file: filePath,
      startLine: startPos.line + 1,
      endLine: endPos.line + 1,
      startCol: startPos.character + 1,
      endCol: endPos.character + 1,
      text: sourceFile.text.slice(start, end),
    };
  }

  private static getPropertyName(name: ts.PropertyName): string | null {
    if (
      ts.isIdentifier(name) ||
      ts.isStringLiteralLike(name) ||
      ts.isNumericLiteral(name)
    ) {
      return name.text;
    }

    return null;
  }

  private static getStringLiteralText(node: ts.Expression): string {
    return ts.isStringLiteralLike(node) ? node.text : node.getText();
  }

  private static getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith(".tsx")) {
      return ts.ScriptKind.TSX;
    }
    if (filePath.endsWith(".jsx")) {
      return ts.ScriptKind.JSX;
    }
    if (
      filePath.endsWith(".js") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".cjs")
    ) {
      return ts.ScriptKind.JS;
    }
    return ts.ScriptKind.TS;
  }

  private static getLanguage(filePath: string): string {
    return /\.(ts|tsx)$/.test(filePath) ? "typescript" : "javascript";
  }

  private static isNodeExported(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node)
      ? ts.getModifiers(node)
      : undefined;
    return Boolean(
      modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ),
    );
  }

  private static isDefaultExport(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node)
      ? ts.getModifiers(node)
      : undefined;
    return Boolean(
      modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      ),
    );
  }

  private static isTestFile(filePath: string): boolean {
    return /(^|\/)__tests__\/|(\.|-)(test|spec)\.[jt]sx?$/.test(
      filePath.replace(/\\/g, "/"),
    );
  }

  private static isConfigFile(filePath: string): boolean {
    return /(?:^|\/)(?:.+\.)?(config|settings)\.[jt]sx?$/.test(
      filePath.replace(/\\/g, "/"),
    );
  }

  private static isEntrypointName(
    name: string,
    filePath: string,
    isExported: boolean,
  ): boolean {
    const entryNames = new Set([
      "main",
      "handler",
      "bootstrap",
      "start",
      "run",
      "default",
    ]);
    return (
      entryNames.has(name) ||
      (isExported &&
        /(?:^|\/)(index|main|app|server|cli)\.[jt]sx?$/.test(
          filePath.replace(/\\/g, "/"),
        ))
    );
  }

  private static isEntrypointFile(filePath: string): boolean {
    return /(?:^|\/)(index|main|app|server|cli)\.[jt]sx?$/.test(
      filePath.replace(/\\/g, "/"),
    );
  }
}
