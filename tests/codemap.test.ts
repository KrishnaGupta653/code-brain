import fs from "fs";
import os from "os";
import path from "path";
import { initCommand } from "../src/cli/commands/init";
import { indexCommand } from "../src/cli/commands/index";
import { CodemapGenerator } from "../src/codemap/generator";
import { AgentsGenerator } from "../src/codemap/agents-generator";
import { SQLiteStorage } from "../src/storage";
import { getDbPath } from "../src/utils";

describe("CODEMAP and AGENTS generators", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-brain-codemap-"));
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "index.ts"),
      `
      export function main() {
        return helper();
      }

      export function helper() {
        return "ok";
      }
    `,
    );

    await initCommand(testDir);
    await indexCommand(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("preserves user architecture content in CODEMAP.md", async () => {
    const storage = new SQLiteStorage(getDbPath(testDir));
    const generator = new CodemapGenerator(storage, testDir);
    const first = await generator.generate();

    const customized = first.replace(
      "(Add your architecture description here - it will be preserved across regenerations)",
      "Custom architecture notes",
    );
    await generator.save(customized);

    const second = await generator.generate();
    storage.close();

    expect(second).toContain("Custom architecture notes");
    expect(second).toContain("## How to Navigate This Codebase (for AI agents)");
  });

  it("generates AGENTS.md using CODEMAP architecture context", async () => {
    const storage = new SQLiteStorage(getDbPath(testDir));
    const codemap = new CodemapGenerator(storage, testDir);
    await codemap.save(await codemap.generate());

    const agents = new AgentsGenerator(storage, testDir);
    const markdown = await agents.generate();
    storage.close();

    expect(markdown).toContain("# AGENTS.md");
    expect(markdown).toContain("## Repository Structure");
    expect(markdown).toContain("## Quick Start (Run These First)");
  });
});
