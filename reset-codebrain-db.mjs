#!/usr/bin/env node

// Cross-platform database reset helper
// Automatically runs the appropriate reset script based on OS

import { exec } from "child_process";
import { platform } from "os";
import { resolve } from "path";
import { promisify } from "util";

const execPromise = promisify(exec);
const os = platform();

async function runReset(projectPath = ".") {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Code-Brain Database Reset Utility                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nOS: ${os}`);
  console.log(`\nRunning appropriate reset script for ${os}...\n`);

  try {
    let command;
    if (os === "win32") {
      // Use PowerShell on Windows
      command = `powershell -NoProfile -ExecutionPolicy Bypass -File reset-codebrain-db.ps1 -ProjectPath "${projectPath}"`;
    } else {
      // Use bash on macOS and Linux
      command = `bash reset-codebrain-db.sh "${projectPath}"`;
    }

    const { stdout, stderr } = await execPromise(command);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error("Error running reset script:", error.message);
    process.exit(1);
  }
}

// Get project path from command line or use current directory
const projectPath = process.argv[2] || ".";
runReset(projectPath);
