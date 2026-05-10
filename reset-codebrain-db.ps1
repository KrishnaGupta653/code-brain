param([string]$ProjectPath = ".")
$ProjectPath = (Resolve-Path -Path $ProjectPath).ProviderPath
Write-Host "=================================================="
Write-Host "Code-Brain Database Reset Utility"
Write-Host "=================================================="
Write-Host "Project: $ProjectPath"
Write-Host ""

$codebrainPath = Join-Path $ProjectPath ".codebrain"
if (-not (Test-Path $codebrainPath)) {
    Write-Host "No .codebrain directory found."
    Write-Host "Run: code-brain init --path $ProjectPath"
    exit 0
}

Write-Host "Creating backup..."
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $ProjectPath ".codebrain.backup.$timestamp"
Copy-Item $codebrainPath $backupPath -Recurse -ErrorAction SilentlyContinue
Write-Host "Backup created: .codebrain.backup.$timestamp"
Write-Host ""

Write-Host "Removing old database..."
Remove-Item $codebrainPath -Recurse -Force
Write-Host "Database removed"
Write-Host ""

Write-Host "Re-initializing..."
$null = & node dist/index.js init --path "$ProjectPath" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Initialized"
}
else {
    Write-Host "ERROR: Initialization failed"
    exit 1
}
Write-Host ""

Write-Host "Re-indexing (this may take a moment)..."
& node dist/index.js index --path "$ProjectPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Indexing failed"
    exit 1
}

Write-Host ""
Write-Host "=================================================="
Write-Host "Database Reset Complete!"
Write-Host "=================================================="
Write-Host "Backup saved to: .codebrain.backup.$timestamp"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  code-brain graph --path $ProjectPath --port 4010"
Write-Host "  code-brain export --path $ProjectPath --format json"
Write-Host ""
