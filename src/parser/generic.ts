import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ParsedFile, ParsedImport, ParsedSymbol, SourceSpan } from "../types/models.js";
import { ParserError } from "../utils/errors.js";
import { getLanguageIdForPath, isTextLikelyBinary } from "../utils/paths.js";

const MAX_SYM = 300;
const MAX_IMP = 250;
const MAX_LEN = 1_000_000;

function sp(file: string, line: number, a: number, b: number): SourceSpan {
  return { file, startLine: line, endLine: line, startCol: a, endCol: b };
}

function addImp(imports: ParsedImport[], file: string, mod: string, line: number): void {
  if (imports.length >= MAX_IMP) return;
  const m = mod.trim().replace(/;+$/g, "").trim();
  if (!m || m.length > 500) return;
  imports.push({
    module: m,
    location: sp(file, line, 1, 1 + m.length),
    bindings: [{ importedName: m, localName: m, kind: "namespace" }],
  });
}

function addSym(
  out: ParsedSymbol[],
  file: string,
  name: string,
  t: ParsedSymbol["type"],
  line: number,
  exported: boolean,
  owner?: string,
): void {
  if (out.length >= MAX_SYM) return;
  if (!/^[\w$]+$/.test(name) || name.length > 200) return;
  out.push({ name, type: t, location: sp(file, line, 1, 1 + name.length), isExported: exported, owner });
}

function isTestFile(filePath: string, text: string): boolean {
  const p = (path.basename(filePath) + filePath).toLowerCase();
  if (/test|_spec|_test|__tests__|spec\//.test(p)) return true;
  return /pytest|unittest|jest|mocha/.test(text.slice(0, 20_000));
}

function isConfigName(file: string, ext: string): boolean {
  if ([".yml", ".yaml", ".toml", ".json", ".jsonc", ".ini", ".cfg", ".conf"].includes(ext)) {
    return /config|settings|app\.(ya?ml|json)|^\.env|application\./.test(
      path.basename(file).toLowerCase() + file.toLowerCase(),
    );
  }
  return false;
}

/**
 * Heuristic, language-agnostic: includes/imports, then class/fn/def/func-like top-level symbols.
 */
export class GenericParser {
  static parseFile(filePath: string): ParsedFile {
    let text: string;
    try {
      const buf = fs.readFileSync(filePath);
      if (buf.length > 0 && isTextLikelyBinary(buf)) {
        throw new ParserError("Binary or non-text file", filePath);
      }
      text = buf.toString("utf8", 0, Math.min(buf.length, MAX_LEN));
    } catch (e) {
      if (e instanceof ParserError) throw e;
      throw new ParserError("Unable to read file", filePath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const lang = getLanguageIdForPath(filePath);
    const cLike = [".c", ".h", ".cc", ".cpp", ".hpp", ".hxx", ".cxx", ".S", ".s"].includes(ext);
    const py = [".py", ".pyi", ".pyw"].includes(ext);
    const sh = [".sh", ".bash", ".zsh", ".ksh", ".csh", ".ps1", ".psm1"].includes(ext);
    const rb = [".rb", ".rake", ".gemspec", ".jbuilder", ".podspec"].includes(ext) ||
      ["gemfile", "rakefile", "gnumakefile", "vagrantfile"].includes(name.toLowerCase());
    const go = ext === ".go";
    const rs = ext === ".rs";
    const ph = [".php", ".phtml", ".inc"].includes(ext);
    const web = [".vue", ".svelte"].includes(ext);
    const isTest = isTestFile(filePath, text);
    const isCfg = isConfigName(filePath, ext) && [".yml", ".yaml", ".toml", ".json", ".jsonc", ".ini", ".cfg", ".conf"].includes(ext);
    const lines = text.split(/\r?\n/);
    const imports: ParsedImport[] = [];
    const syms: ParsedSymbol[] = [];
    let pycl: string | undefined;
    const anyExport = (s: string) => /^\s*(export|pub|open|public)\b/.test(s);

    for (let i = 0; i < lines.length; i += 1) {
      const n = i + 1;
      const raw = lines[i] || "";
      const s = raw.trim();
      if (s.length === 0) continue;
      if (cLike && s.startsWith("//")) continue;
      if (cLike && /^\s*#include\b/.test(s)) {
        const m = s.match(/#include\s+[<]([^>]+)[>]|#include\s+"([^"]+)"/);
        if (m) addImp(imports, filePath, m[1] || m[2] || "", n);
        continue;
      }
      if (!cLike) {
        if (s.startsWith("#") && !s.startsWith("#!") && !s.startsWith("#include") && (py || rb || sh)) {
          continue;
        }
      } else {
        if (/^\s*#(define|ifdef|if|else|endif|pragma)\b/.test(s)) {
          // keep scanning (could contain symbols) — skip
          continue;
        }
      }
      if (s.startsWith("//") && !web) continue;

      const ex = anyExport(s);
      if (s.startsWith("import ") || s.match(/^import\s+(?:static\s+)?[\w.]+;/)) {
        if (s.includes(" from ") && /import\s+[\s\S]+from\s+['"](.+)['"]/.test(s)) {
          const m2 = s.match(
            /import\s+[\s\S]+?from\s+['"](.+)['"]/,
          );
          if (m2) addImp(imports, filePath, m2[1]!, n);
        } else {
          const m1 = s.match(
            /^\s*import\s+"(.+)"/,
          );
          if (m1) addImp(imports, filePath, m1[1]!, n);
        }
      }
      if (s.match(
        /require\(\s*['"](.+)['"]/,
      )) {
        const r = s.match(
          /require\(\s*['"](.+)['"]/,
        )!;
        addImp(imports, filePath, r[1]!, n);
      }

      if (py) {
        const f = s.match(
          /^\s*from\s+([\w.]+)\s+import\b/,
        );
        if (f) addImp(imports, filePath, f[1]!, n);
        const im = s.match(
          /^\s*import\s+([\w.]+)(?:\s+as|\s*;|\s*,|\s*$)/,
        );
        if (im) addImp(imports, filePath, im[1]!, n);
        const c = s.match(
          /^\s*class\s+([A-Za-z_][\w]*)(?:\s*[(:]|\b)/,
        );
        if (c) {
          pycl = c[1];
          addSym(syms, filePath, c[1]!, "class", n, ex);
        }
        const d = s.match(
          /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/,
        );
        if (d) {
          addSym(
            syms,
            filePath,
            d[1]!,
            "function",
            n,
            ex,
            pycl,
          );
        }
        continue;
      }
      if (go) {
        if (/^\s*import\s*"/.test(s)) {
          const g = s.match(
            /^\s*import\s*"(.+)"/,
          );
          if (g) addImp(imports, filePath, g[1]!, n);
        }
        const f = s.match(
          /^\s*func\s+(\*?\s*\*?\s*\w+\s*\.)*(\w+)\s*\(/,
        ) || s.match(
          /^\s*func\s+(\w+)\s*\(/,
        );
        if (f) {
          const who = f[2] || f[1];
          if (who) addSym(
            syms,
            filePath,
            who,
            /^[a-z]/.test(who) && s.includes("func (") ? "method" : "function",
            n,
            ex,
          );
        }
        const st = s.match(
          /^\s*type\s+([A-Z_a-z][\w]*)\s+/,
        );
        if (st) addSym(syms, filePath, st[1]!, "type", n, ex);
        continue;
      }
      if (rs) {
        const m = s.match(
          /^\s*use\s+([^;]+);/,
        );
        if (m) {
          const p = m[1]!.split("::")[0]!.replace(/^pub\s+/, "");
          if (p) addImp(imports, filePath, p, n);
        }
        if (/^\s*mod\s+\w+\s*;/.test(s)) {
          const o = s.match(
            /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/,
          )!;
          addSym(syms, filePath, o[1]!, "module", n, /pub/.test(s) || ex);
        }
        if (s.match(
          /^\s*(?:pub\s+)?fn\s+(\w+)/,
        )) {
          const v = s.match(
            /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/,
          )!;
          addSym(
            syms,
            filePath,
            v[1]!,
            "function",
            n,
            /pub/.test(s) || ex,
          );
        }
        for (const kw of ["struct", "enum", "trait", "type"]) {
          if (s.match(
            new RegExp(`^\\s*(?:pub\\s+)?${kw}\\s+([A-Z_a-z][\\w]*)`),
          )) {
            const x = s.match(
              new RegExp(`^\\s*(?:pub\\s+)?${kw}\\s+([A-Z_a-z][\\w]*)\\b`),
            )!;
            addSym(
              syms,
              filePath,
              x[1]!,
              kw === "trait" ? "interface" : "class",
              n,
              /pub/.test(s) || ex,
            );
            break;
          }
        }
        continue;
      }
      if (rb) {
        const m = s.match(
          /^\s*require(?:_relative)?\s*['"](.+)['"]/,
        );
        if (m) addImp(imports, filePath, m[1]!, n);
        const b = s.match(
          /^\s*(?:gem|source|load)\s+['"]?([^\s'"]+)/,
        );
        if (b) addImp(imports, filePath, b[1]!, n);
        const c = s.match(
          /^\s*class\s+([A-Z][A-Za-z0-9_]*)/,
        );
        if (c) addSym(syms, filePath, c[1]!, "class", n, ex);
        const f = s.match(
          /^\s*def\s+([A-Za-z_][\w]*)(?:\s*[!?]?\s*\(|\b)/,
        );
        if (f) addSym(syms, filePath, f[1]!, "function", n, ex);
        continue;
      }
      if (ph) {
        const p = s.match(
          /(?:include|require)(?:_once)?\s*\(\s*['"](.+)['"]/i,
        );
        if (p) addImp(imports, filePath, p[1]!, n);
        if (/function\s+(\w+)\s*\(/i.test(s)) {
          const f = s.match(
            /function\s+(&?\s*)(\w+)\s*\(/i,
          )!;
          addSym(syms, filePath, f[2]!, "function", n, ex);
        }
        continue;
      }
      if (sh) {
        const t = s.match(
          /^\s*(?:source|\.)\s*["']?([^\s"']+)/,
        );
        if (t) addImp(imports, filePath, t[1]!, n);
        continue;
      }
      if (cLike) {
        // Imports via #include only; skip keyword-based symbol heuristics (too noisy for C).
        continue;
      }
      if (s.match(
        /^\s*class\s+([A-Z_a-z][\w$]*)(?:\s*[:<{\s]|\bextends|\bimplements|\bwhere)/,
      )) {
        const z = s.match(
          /^\s*class\s+([A-Z_a-z][\w$]*)/,
        )!;
        pycl = z[1];
        addSym(syms, filePath, z[1]!, "class", n, ex);
        continue;
      }
      if (s.match(
        /^\s*interface\s+([A-Z_a-z][\w$]*)\b/,
      )) {
        const z = s.match(
          /interface\s+([A-Z_a-z][\w$]*)\b/,
        )!;
        addSym(syms, filePath, z[1]!, "interface", n, ex);
        continue;
      }
      if (s.match(
        /^\s*(export\s+)?(async\s+)?function\s+([A-Z_a-z$][\w$]*)\b/,
      ) && (web || ext.length > 0)) {
        const z = s.match(
          /function\s+([A-Z_a-z$][\w$]*)\b/,
        )!;
        addSym(
          syms,
          filePath,
          z[1]!,
          "function",
          n,
          /\bexport\b/.test(s) || ex,
        );
        continue;
      }
      if (web) {
        const f = s.match(
          /^\s*import\s+[\s\S]+?from\s+['"](.+)['"]/,
        );
        if (f) addImp(imports, filePath, f[1]!, n);
        continue;
      }
    }

    if (isCfg) {
      syms.length = 0;
    } else if (syms.length === 0) {
      addSym(syms, filePath, name || "file", "module", 1, true);
    }
    const ep: string[] = [];
    for (const s of syms) {
      if (s.name === "main" || s.name === "__main__") {
        ep.push(s.name);
      }
    }
    return {
      path: filePath,
      language: lang,
      hash: crypto.createHash("sha256").update(text).digest("hex"),
      symbols: syms,
      imports,
      exports: [],
      entryPoints: ep,
      isTestFile: isTest,
      isConfigFile: isCfg,
    };
  }
}
