# Fix and Restart Script for code-brain
# This script rebuilds and restarts the server

Write-Host "🔧 Fixing code-brain UI..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Build
Write-Host "📦 Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful!" -ForegroundColor Green
Write-Host ""

# Step 2: Instructions
Write-Host "🚀 Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Stop any running code-brain server (Ctrl+C)" -ForegroundColor White
Write-Host "2. Run: code-brain serve" -ForegroundColor White
Write-Host "3. Open: http://localhost:3000" -ForegroundColor White
Write-Host "4. Hard refresh browser: Ctrl+Shift+R" -ForegroundColor White
Write-Host "5. Click any FUNCTION or CLASS node" -ForegroundColor White
Write-Host "6. Scroll down to see code below RELATIONSHIPS" -ForegroundColor White
Write-Host ""
Write-Host "💡 Tip: The code viewer is already built-in!" -ForegroundColor Yellow
Write-Host "   It shows automatically when you click nodes with source code." -ForegroundColor Yellow
Write-Host ""
