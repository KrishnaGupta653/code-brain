#!/usr/bin/env node

import { setupCLI } from './cli/cli.js';

async function main() {
  const program = setupCLI();

  try {
    await program.parseAsync(process.argv);
  } catch {
    process.exit(1);
  }
}

main();
