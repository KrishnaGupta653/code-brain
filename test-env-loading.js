#!/usr/bin/env node

// Test if .env loading works
import { loadEnv, getApiKey, getChatProvider, getChatModel } from './dist/utils/env.js';

console.log('Testing .env loading...\n');

// Load .env
loadEnv(process.cwd());

console.log('Environment variables loaded:');
console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Not set');
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set');
console.log('- VOYAGE_API_KEY:', process.env.VOYAGE_API_KEY ? '✓ Set' : '✗ Not set');
console.log('- CODE_BRAIN_CHAT_PROVIDER:', process.env.CODE_BRAIN_CHAT_PROVIDER || 'not set');

console.log('\nDefault chat settings:');
console.log('- Provider:', getChatProvider());
console.log('- Model:', getChatModel(getChatProvider()));

console.log('\n✅ .env loading works!');
