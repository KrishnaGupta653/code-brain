# Quick Start

## Install

```bash
npm install
python3 -m pip install -r python/requirements.txt
npm run build
```

## Run On A Repository

```bash
node dist/index.js init --path /path/to/repo
node dist/index.js index --path /path/to/repo
node dist/index.js graph --path /path/to/repo --port 3000
node dist/index.js export --format ai --path /path/to/repo
```


## Keep It Updated

```bash
node dist/index.js update --path /path/to/repo
```

## Focused Export

```bash
node dist/index.js export --format ai --path /path/to/repo --focus src/server/app.ts
```

## Development

```bash
npm test
```
