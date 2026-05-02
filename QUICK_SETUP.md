# 🚀 Quick Setup - Get Started in 2 Minutes

## Current Status ✅

Your code-brain installation is **almost ready**! Here's what's working:

- ✅ Project is indexed (`.codebrain/graph.db` exists)
- ✅ Chat command is installed and working
- ✅ Multi-provider AI support (Anthropic, OpenAI, Ollama)
- ✅ `.env` file is created
- ⚠️ **API keys need to be added** (currently has placeholders)

## What You Need to Do

### Step 1: Get an API Key (Choose One)

#### Option A: Anthropic Claude (Recommended for Code)
1. Go to: https://console.anthropic.com/
2. Sign up or log in
3. Click "API Keys" → "Create Key"
4. Copy the key (starts with `sk-ant-`)

#### Option B: OpenAI GPT-4
1. Go to: https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

#### Option C: Ollama (Free, Local)
```powershell
# Install Ollama
winget install Ollama.Ollama

# Pull a model
ollama pull llama3

# No API key needed!
```

### Step 2: Add Your API Key to .env

Open the `.env` file in your project root:

```powershell
notepad .env
```

Replace the placeholder with your **real API key**:

```env
# Before (placeholder):
ANTHROPIC_API_KEY=your-key-here

# After (real key):
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here-with-many-characters
```

**Save the file!**

### Step 3: Test It!

```powershell
# Ask a question about your codebase
code-brain chat "where is the main function?"

# Try different providers
code-brain chat --provider openai "show me all API endpoints"
code-brain chat --provider ollama "which functions have no tests?"
```

## Example .env File

Here's what your `.env` should look like with a **real** Anthropic key:

```env
# code-brain Environment Variables

# Anthropic (Claude) - Best for code reasoning
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI (GPT-4) - Fast and reliable
OPENAI_API_KEY=sk-your-key-here

# Voyage AI (Embeddings)
VOYAGE_API_KEY=pa-your-key-here

# Ollama - Local AI (no key needed)
OLLAMA_BASE_URL=http://localhost:11434

# Default Chat Settings
CODE_BRAIN_CHAT_PROVIDER=anthropic
CODE_BRAIN_ANTHROPIC_MODEL=claude-sonnet-4-20250514
CODE_BRAIN_OPENAI_MODEL=gpt-4-turbo-preview
CODE_BRAIN_OLLAMA_MODEL=llama3
```

## Troubleshooting

### "ANTHROPIC_API_KEY not set"

**Problem:** The .env file isn't being loaded or the key is still a placeholder.

**Solution:**
```powershell
# Check if .env exists
ls .env

# Check the key value (should be long, ~100+ characters)
node -e "require('dotenv').config(); console.log('Key length:', process.env.ANTHROPIC_API_KEY?.length || 0)"

# If it shows "13", you still have the placeholder "your-key-here"
# Edit .env and add your real key
notepad .env
```

### "FTS5 syntax error"

**Problem:** Special characters in your question (like "?") caused a search error.

**Solution:** This is now fixed! Rebuild if needed:
```powershell
npm run build
```

### "No relevant code found"

**Problem:** The search didn't find matching code.

**Solutions:**
1. Try a different question
2. Make sure your project is indexed: `code-brain index`
3. Try broader search terms

### Chat command produces no output

**Problem:** The command runs but shows nothing.

**Possible causes:**
1. Invalid API key (still has placeholder)
2. Network error (can't reach API)
3. Project not indexed

**Solution:**
```powershell
# 1. Verify API key is set
node -e "require('dotenv').config(); console.log('Key:', process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...')"

# 2. Test with debug output
$env:DEBUG = "*"
code-brain chat "test"

# 3. Re-index if needed
code-brain index
```

## What's Next?

Once your API key is set up, you can:

### 1. Chat with Your Codebase
```powershell
code-brain chat "how does authentication work?"
code-brain chat "show me all database queries"
code-brain chat "which files import the logger?"
```

### 2. Use Different AI Providers
```powershell
# Use OpenAI
code-brain chat --provider openai "your question"

# Use Ollama (local, free)
code-brain chat --provider ollama "your question"

# Use specific models
code-brain chat --provider anthropic --model claude-3-5-sonnet-20241022 "your question"
```

### 3. Enable Semantic Search
```powershell
# Generate embeddings for better search
code-brain embeddings

# Use hybrid search (BM25 + vector similarity)
code-brain query --type search --text "JWT validation" --hybrid
```

### 4. Explore Other Features
```powershell
# Visual graph explorer
code-brain graph

# Export for AI context
code-brain export --format ai

# Analyze code quality
code-brain analyze --git

# Watch for changes
code-brain watch
```

## Provider Comparison

| Provider | Best For | Cost | Speed | Setup |
|----------|----------|------|-------|-------|
| **Anthropic Claude** | Code reasoning, complex queries | $$ | Fast | API key |
| **OpenAI GPT-4** | General purpose, reliable | $$$ | Very fast | API key |
| **Ollama** | Privacy, offline, free | Free | Medium | Install app |

### Model Options

**Anthropic:**
- `claude-sonnet-4-20250514` (default) - Best balance
- `claude-3-5-sonnet-20241022` - Fast and capable
- `claude-3-opus-20240229` - Most powerful

**OpenAI:**
- `gpt-4-turbo-preview` (default) - Latest GPT-4
- `gpt-4` - Stable GPT-4
- `gpt-3.5-turbo` - Fast and cheap

**Ollama:**
- `llama3` (default) - Meta's latest
- `codellama` - Specialized for code
- `mistral` - Fast and capable

## Need More Help?

- **User guide:** See `USER_GUIDE.md`
- **Quick start:** See `QUICKSTART.md`
- **Commands:** See `COMMANDS.md`
- **Architecture:** See `docs/ARCHITECTURE.md`

## Summary

**You're almost there!** Just:

1. ✅ Get an API key from Anthropic or OpenAI
2. ✅ Add it to `.env` (replace "your-key-here")
3. ✅ Run `code-brain chat "your question"`

That's it! 🎉
