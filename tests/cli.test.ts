import fs from "fs";
import os from "os";
import path from "path";
import { jest } from "@jest/globals";
import { initCommand } from "../src/cli/commands/init";
import { indexCommand } from "../src/cli/commands/index";
import { doctorCommand } from "../src/cli/commands/doctor";
import { snapshotCommand } from "../src/cli/commands/snapshot";
import { diffCommand } from "../src/cli/commands/diff";

describe("CLI extensions", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-brain-cli-"));
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "index.ts"),
      `
      export function helper() {
        return 1;
      }

      export function main() {
        return helper();
      }
    `,
    );

    await initCommand(testDir);
    await indexCommand(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("doctor emits JSON health data", async () => {
    const output: string[] = [];
    const writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: any) => {
        output.push(String(chunk));
        return true;
      });

    await doctorCommand(testDir, { json: true });
    writeSpy.mockRestore();

    const parsed = JSON.parse(output.join(""));
    expect(parsed.schema).toBeDefined();
    expect(parsed.health.score).toBeGreaterThanOrEqual(0);
  });

  it("snapshot and diff commands produce snapshot artifacts", async () => {
    const first = await snapshotCommand(testDir);
    expect(fs.existsSync(first)).toBe(true);

    fs.writeFileSync(
      path.join(testDir, "src", "extra.ts"),
      `export const extra = 42;`,
    );
    await indexCommand(testDir);

    const second = await snapshotCommand(testDir);
    expect(fs.existsSync(second)).toBe(true);

    const output: string[] = [];
    const writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: any) => {
        output.push(String(chunk));
        return true;
      });

    await diffCommand(testDir, first, second);
    writeSpy.mockRestore();

    expect(output.join("")).toContain("code-brain diff");
    expect(output.join("")).toContain("Edges");
  });
});
