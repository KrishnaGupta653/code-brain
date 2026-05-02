#!/usr/bin/env node

// Quick test to verify chat command is available
import { setupCLI } from './dist/cli/cli.js';

const program = setupCLI();

// Parse test arguments
program.parse(['node', 'test', 'chat', '--help']);
