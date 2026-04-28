import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  ParsedExport,
  ParsedFile,
  ParsedImport,
  ParsedImportBinding,
  ParsedSymbol,
  SourceSpan,
} from "../types/models.js";
import { ParserError } from "../utils/index.js";

const CLASS_REGEX = /\b(class|interface|enum)\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_][\w.<>]*))?(?:\s+implements\s+([A-Za-z0-9_.,\s<>]+))?/;
const METHOD_REGEX = /^\s*(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp|\s)+(?:<[^>]+>\s*)?[\w\[\]<>?,\s]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[^{}]+)?\{/;
const PACKAGE_REGEX = /^\s*package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;/;
const IMPORT_REGEX = /^\s*import\s+(static\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_*]\w*)*(?:\.\*)?)\s*;/;
const RESERVED_CALL_NAMES = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "new",
  "throw",
  "super",
  "this",
]);

interface JavaClassScope {
  name: string;
  depth: number;
}

export class JavaParser {
  static parseFile(filePath: string): ParsedFile {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split(/\r?\n/);
      const symbols: ParsedSymbol[] = [];
      const imports: ParsedImport[] = [];
      const exports: ParsedExport[] = [];
      const entryPoints = new Set<string>();
      const seen = new Set<string>();

      const addSymbol = (symbol: ParsedSymbol): void => {
        const key = [
          symbol.type,
          symbol.name,
          symbol.owner || "",
          symbol.location.startLine,
          symbol.location.startCol,
        ].join("::");
        if (!seen.has(key)) {
          seen.add(key);
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
        if (!seen.has(`export::${key}`)) {
          seen.add(`export::${key}`);
          exports.push(item);
        }
      };

      let depth = 0;
      const classStack: JavaClassScope[] = [];
      let packageName = "";

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const lineNo = i + 1;

        while (classStack.length > 0 && depth < classStack[classStack.length - 1].depth) {
          classStack.pop();
        }

        const packageMatch = line.match(PACKAGE_REGEX);
        if (packageMatch) {
          packageName = packageMatch[1];
        }

        const importMatch = line.match(IMPORT_REGEX);
        if (importMatch) {
          const importedModule = importMatch[2];
          const importName = importedModule.split(".").pop() || importedModule;
          const binding: ParsedImportBinding = importedModule.endsWith(".*")
            ? {
                importedName: "*",
                localName: importName === "*" ? importedModule.split(".").slice(-2, -1)[0] || "*" : importName,
                kind: "namespace",
              }
            : {
                importedName: importName,
                localName: importName,
                kind: "named",
              };

          imports.push({
            module: importedModule,
            location: this.createLineSpan(filePath, lineNo, line, line.indexOf("import") + 1),
            bindings: [binding],
            isTypeOnly: false,
          });
        }

        const classMatch = line.match(CLASS_REGEX);
        if (classMatch) {
          const classKind = classMatch[1];
          const className = classMatch[2];
          const extendsName = classMatch[3]?.split("<")[0];
          const implementsNames = classMatch[4]
            ? classMatch[4].split(",").map((item) => item.trim().split("<")[0]).filter(Boolean)
            : [];
          const isPublic = /\bpublic\b/.test(line);

          const classType = classKind === "class" ? "class" : classKind === "interface" ? "interface" : "enum";
          const span = this.createLineSpan(filePath, lineNo, line, line.indexOf(classKind) + 1);

          addSymbol({
            name: className,
            type: classType,
            location: span,
            extendsName,
            implements: implementsNames,
            isExported: isPublic,
            summary: `${classKind} ${className}`,
            metadata: packageName ? { package: packageName } : undefined,
          });

          if (isPublic) {
            addExport({
              name: className,
              exportedName: className,
              location: span,
              kind: "named",
            });
          }

          if (line.includes("{")) {
            classStack.push({ name: className, depth: depth + 1 });
          }
        }

        const activeClass = classStack[classStack.length - 1]?.name;
        const methodMatch = line.match(METHOD_REGEX);
        if (activeClass && methodMatch) {
          const methodName = methodMatch[1];
          const methodStart = line.indexOf(methodName) + 1;

          const methodCalls = this.extractCallsFromLine(line, filePath, lineNo);

          addSymbol({
            name: methodName,
            type: "method",
            owner: activeClass,
            location: this.createLineSpan(filePath, lineNo, line, methodStart),
            calls: methodCalls,
            isExported: false,
            summary: `Method ${activeClass}.${methodName}`,
          });

          if (methodName === "main" && /\bstatic\b/.test(line) && /\bvoid\b/.test(line)) {
            entryPoints.add(`${activeClass}.main`);
          }
        }

        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        depth += openBraces - closeBraces;
      }

      if (this.isEntrypointFile(filePath)) {
        entryPoints.add(path.basename(filePath));
      }

      return {
        path: filePath,
        language: "java",
        hash: crypto.createHash("sha256").update(content).digest("hex"),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath),
        isConfigFile: this.isConfigFile(filePath),
      };
    } catch (error) {
      throw new ParserError(`Failed to parse Java file: ${filePath}`, error);
    }
  }

  private static extractCallsFromLine(line: string, filePath: string, lineNo: number) {
    const callRegex = /([A-Za-z_]\w*)\s*\(/g;
    const calls: Array<{ name: string; fullName: string; location: SourceSpan }> = [];
    let match: RegExpExecArray | null = callRegex.exec(line);

    while (match) {
      const callName = match[1];
      if (!RESERVED_CALL_NAMES.has(callName)) {
        calls.push({
          name: callName,
          fullName: callName,
          location: {
            file: filePath,
            startLine: lineNo,
            endLine: lineNo,
            startCol: match.index + 1,
            endCol: match.index + callName.length,
          },
        });
      }
      match = callRegex.exec(line);
    }

    return calls;
  }

  private static createLineSpan(filePath: string, lineNo: number, line: string, startCol: number): SourceSpan {
    const start = Math.max(1, startCol || 1);
    return {
      file: filePath,
      startLine: lineNo,
      endLine: lineNo,
      startCol: start,
      endCol: Math.max(start, line.length),
      text: line,
    };
  }

  private static isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");
    return /(?:^|\/)src\/test\//.test(normalized) || /(?:Test|IT)\.java$/.test(normalized);
  }

  private static isConfigFile(filePath: string): boolean {
    return /(?:Config|Configuration)\.java$/.test(filePath.replace(/\\/g, "/"));
  }

  private static isEntrypointFile(filePath: string): boolean {
    return /(?:Application|Main)\.java$/.test(path.basename(filePath));
  }
}
