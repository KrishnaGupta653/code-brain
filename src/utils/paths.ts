import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Tried in order when resolving a relative import path in the graph builder. */
export const MODULE_RESOLVE_EXTENSION_SUFFIXES = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".java",
  ".py",
  ".pyi",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".cxx",
  ".hxx",
  ".S",
  ".s",
  ".m",
  ".mm",
  ".php",
  ".phtml",
  ".rb",
  ".cs",
  ".fs",
  ".fsx",
  ".vb",
  ".kt",
  ".kts",
  ".swift",
  ".scala",
  ".pl",
  ".pm",
  ".r",
  ".elm",
  ".ex",
  ".exs",
  ".hs",
  ".lua",
  ".ps1",
  ".zig",
  ".v",
  ".sv",
  ".clj",
  ".cljs",
  ".dart",
  ".nim",
  ".cr",
  ".vue",
  ".svelte",
] as const;

const BINARY_LIKE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".avif",
  ".bmp",
  ".tiff",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".woff",
  ".woff2",
  ".eot",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
  ".ogg",
  ".ico",
  ".pyc",
  ".pyo",
  ".o",
  ".a",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".class",
  ".jar",
  ".wasm",
  ".sqlite",
  ".db",
  ".bin",
  ".dat",
  ".lock",
  ".pdb",
  ".dSYM",
  ".nib",
  ".xcdatamodeld",
  ".xcdatamodel",
]);

const NOT_GENERIC_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".java",
]);
const GENERIC_CODE_EXTS = new Set<string>([
  ...MODULE_RESOLVE_EXTENSION_SUFFIXES.filter((e) => !NOT_GENERIC_EXTS.has(e)),
  ".pyw",
  ".hrl",
  ".fsi",
  ".groovy",
  ".jl",
  ".R",
  ".f90",
  ".F90",
  ".pas",
  ".d",
  ".lisp",
  ".lsp",
  ".cl",
  ".scm",
  ".ss",
  ".ml",
  ".mli",
  ".vim",
  ".ksh",
  ".psm1",
  ".psd1",
  ".csh",
  ".jbuilder",
  ".podspec",
  ".yml",
  ".yaml",
  ".toml",
  ".json",
  ".jsonc",
  ".ini",
  ".cfg",
  ".conf",
  ".pro",
  ".proto",
  ".sql",
  ".graphql",
  ".gql",
]);

const SPECIAL_BASENAMES = new Set([
  "makefile",
  "gnumakefile",
  "rakefile",
  "vagrantfile",
  "cmakelists.txt",
  "justfile",
  "dune",
  "build.bazel",
  "gemfile",
]);

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".pyw": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".S": "asm",
  ".s": "asm",
  ".m": "objc",
  ".mm": "objc",
  ".php": "php",
  ".rb": "ruby",
  ".cs": "csharp",
  ".fs": "fsharp",
  ".fsi": "fsharp",
  ".fsx": "fsharp",
  ".vb": "vb",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".scala": "scala",
  ".pl": "perl",
  ".pm": "perl",
  ".r": "r",
  ".ex": "elixir",
  ".exs": "elixir",
  ".hs": "haskell",
  ".lua": "lua",
  ".ps1": "powershell",
  ".sql": "sql",
  ".vue": "vue",
  ".svelte": "svelte",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".json": "json",
  ".jsonc": "jsonc",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".ksh": "shell",
  ".csh": "shell",
  ".clj": "clojure",
  ".cljs": "clojure",
  ".dart": "dart",
  ".elm": "elm",
  ".zig": "zig",
  ".v": "verilog",
  ".sv": "systemverilog",
  ".nim": "nim",
  ".cr": "crystal",
  ".pro": "prolog",
  ".md": "markdown",
  ".proto": "protobuf",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".groovy": "groovy",
  ".psm1": "powershell",
  ".psd1": "powershell",
};

function basenameIn(nodePath: string): string {
  return path.basename(nodePath).toLowerCase();
}

/**
 * Heuristic: skip obvious binary or vendor blobs. Null byte in the first 8K → binary.
 */
export function isTextLikelyBinary(buf: { length: number; [key: number]: number }): boolean {
  const n = Math.min(8192, buf.length);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export function getLanguageIdForPath(filePath: string): string {
  const b = basenameIn(filePath);
  if (b === "dockerfile" || b.startsWith("dockerfile.")) return "dockerfile";
  if (b === "cmakelists.txt") return "cmake";
  if (b === "makefile" || b === "gnumakefile" || b.endsWith("makefile")) return "makefile";
  if (b === "gemfile" || b === "rakefile") return "ruby";
  if (b === "build.bazel" || b === "workspace" || b.endsWith(".bazel") || b.endsWith(".bzl")) {
    return "starlark";
  }
  if (b === "dune") return "dune";
  if (b === "justfile") return "just";
  const e = path.extname(filePath).toLowerCase();
  return e ? EXT_TO_LANG[e] || e.replace(/^\./, "") : "text";
}

/**
 * Not TS/JS/Java, but a text file we heuristically index (regex imports/symbols).
 */
export function isGenericScannableFile(filePath: string): boolean {
  const b = basenameIn(filePath);
  if (SPECIAL_BASENAMES.has(b)) {
    return true;
  }
  if (/^dockerfile(\.|$)/.test(b)) {
    return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    return false;
  }
  if (BINARY_LIKE_EXTS.has(ext)) {
    return false;
  }
  return GENERIC_CODE_EXTS.has(ext);
}

export function getProjectRoot(): string {
  return path.resolve(__dirname, "../../");
}

export function getCodeBrainDir(projectRoot: string): string {
  return path.join(projectRoot, ".codebrain");
}

export function getDbPath(projectRoot: string): string {
  return path.join(getCodeBrainDir(projectRoot), "graph.db");
}

export function getPythonDir(): string {
  return path.resolve(__dirname, "../../python");
}

export function getPythonScript(scriptName: string): string {
  return path.join(getPythonDir(), "analytics", `${scriptName}.py`);
}

export function normalizePath(filePath: string, baseDir: string): string {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
  return path.normalize(absolute);
}

export function getRelativePath(filePath: string, baseDir: string): string {
  return path.relative(baseDir, filePath);
}

export function isTypescriptFile(filePath: string): boolean {
  return /\.(ts|tsx)$/.test(filePath);
}

export function isJavascriptFile(filePath: string): boolean {
  return /\.(js|jsx|mjs|cjs)$/.test(filePath);
}

export function isJavaFile(filePath: string): boolean {
  return /\.java$/.test(filePath);
}

export function isSupportedSourceFile(filePath: string): boolean {
  return (
    isTypescriptFile(filePath) || isJavascriptFile(filePath) || isJavaFile(filePath) || isGenericScannableFile(filePath)
  );
}

export function getTempDir(): string {
  return path.join(os.tmpdir(), "code-brain");
}

export function getHomeDir(): string {
  return os.homedir();
}
