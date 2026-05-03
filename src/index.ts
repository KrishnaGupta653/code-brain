#!/usr/bin/env node

import { setupCLI } from './cli/cli.js';

async function main() {
  const program = setupCLI();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Log fatal errors before exiting
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
