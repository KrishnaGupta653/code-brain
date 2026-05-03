# ✅ npm Publishing Checklist

## Before You Publish

### 1. Update package.json (2 minutes)

Open `package.json` and replace these placeholders:

```json
"author": "Your Name <your.email@example.com>",
"repository": {
  "type": "git",
  "url": "https://github.com/yourusername/code-brain.git"
},
"bugs": {
  "url": "https://github.com/yourusername/code-brain/issues"
},
"homepage": "https://github.com/yourusername/code-brain#readme"
```

**Replace:**
- [ ] `Your Name <your.email@example.com>` → Your actual name and email
- [ ] `yourusername` → Your GitHub username (3 places)

### 2. Create npm Account (1 minute)

- [ ] Go to https://www.npmjs.com/signup
- [ ] Create account (if you don't have one)
- [ ] Verify email

### 3. Login to npm (30 seconds)

```bash
npm login
```

Enter:
- [ ] Username
- [ ] Password  
- [ ] Email
- [ ] One-time password (if 2FA enabled)

### 4. Build the Project (1 minute)

```bash
npm run clean
npm run build
```

Verify:
- [ ] `dist/cli/cli.js` exists
- [ ] `ui/dist/index.html` exists
- [ ] No build errors

### 5. Test Locally (2 minutes)

```bash
npm link
code-brain --version
code-brain init --path .
npm unlink -g code-brain
```

Verify:
- [ ] CLI command works
- [ ] Version shows correctly
- [ ] No errors

## Publish to npm

### 6. Check Package Contents (30 seconds)

```bash
npm pack --dry-run
```

Verify it includes:
- [ ] `dist/` folder
- [ ] `python/` folder
- [ ] `ui/dist/` folder
- [ ] `README.md`
- [ ] Documentation files

### 7. Publish! (30 seconds)

```bash
npm publish --access public
```

Expected output:
```
+ code-brain@1.0.0
```

### 8. Verify on npm (30 seconds)

- [ ] Visit https://www.npmjs.com/package/code-brain
- [ ] Check package page loads
- [ ] Verify README displays correctly

### 9. Test Installation (1 minute)

```bash
npm install -g code-brain
code-brain --version
```

Verify:
- [ ] Installs without errors
- [ ] CLI works globally
- [ ] Version is 1.0.0

## After Publishing

### 10. Create GitHub Release (2 minutes)

```bash
git tag -a v1.0.0 -m "Release v1.0.0: Production ready"
git push origin v1.0.0
```

On GitHub:
- [ ] Go to Releases → "Draft a new release"
- [ ] Select tag `v1.0.0`
- [ ] Title: "v1.0.0 - Production Release"
- [ ] Copy release notes from `PUBLISHING.md`
- [ ] Publish release

### 11. Update README (1 minute)

Add npm badges at the top of README.md:

```markdown
[![npm version](https://badge.fury.io/js/code-brain.svg)](https://www.npmjs.com/package/code-brain)
[![npm downloads](https://img.shields.io/npm/dm/code-brain.svg)](https://www.npmjs.com/package/code-brain)
```

- [ ] Add badges to README.md
- [ ] Commit and push

### 12. Announce! (5 minutes)

**Twitter/X:**
- [ ] Post announcement (see `MARKETING_COMPLETE.md` for template)

**Reddit:**
- [ ] r/programming
- [ ] r/MachineLearning
- [ ] r/coding

**Hacker News:**
- [ ] Submit: "code-brain: 100× token reduction for AI-assisted development"

**Dev Communities:**
- [ ] dev.to
- [ ] Medium
- [ ] LinkedIn

## If Package Name is Taken

### Option 1: Scoped Package

Update `package.json`:
```json
{
  "name": "@yourusername/code-brain"
}
```

Publish:
```bash
npm publish --access public
```

Users install:
```bash
npm install -g @yourusername/code-brain
```

### Option 2: Different Name

Update `package.json`:
```json
{
  "name": "codebrain-ai"
}
```

Publish:
```bash
npm publish --access public
```

## Quick Commands Reference

```bash
# Login
npm login

# Build
npm run build

# Test locally
npm link

# Check contents
npm pack --dry-run

# Publish
npm publish --access public

# Tag release
git tag -a v1.0.0 -m "Release v1.0.0"
git push --tags

# Update version
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```

## Troubleshooting

**"Package name already exists"**
→ Use scoped package: `@yourusername/code-brain`

**"You must be logged in"**
→ Run `npm login`

**"Missing files"**
→ Run `npm run build` first

**"Permission denied"**
→ Use scoped package or different name

## Total Time: ~15 minutes

- Setup: 5 minutes
- Publish: 2 minutes
- Verify: 3 minutes
- Announce: 5 minutes

---

**Ready?** Start with step 1! 🚀
