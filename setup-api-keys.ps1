# code-brain API Key Setup Script
# Run this to easily set up your API keys

Write-Host "🔑 code-brain API Key Setup" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Check if .env exists
if (Test-Path .env) {
    Write-Host "✓ .env file found" -ForegroundColor Green
    Write-Host "`nCurrent .env file:" -ForegroundColor Yellow
    Get-Content .env | Select-String -Pattern "^[A-Z_]+" | ForEach-Object {
        $line = $_.Line
        if ($line -match "^([A-Z_]+)=(.*)$") {
            $key = $matches[1]
            $value = $matches[2]
            if ($value -eq "your-key-here" -or $value -eq "") {
                Write-Host "  $key : ❌ Not set" -ForegroundColor Red
            } else {
                Write-Host "  $key : ✓ Set" -ForegroundColor Green
            }
        }
    }
} else {
    Write-Host "✗ .env file not found" -ForegroundColor Red
    Write-Host "`nCreating .env from template..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "✓ .env file created" -ForegroundColor Green
}

Write-Host "`n📝 To set up your API keys:" -ForegroundColor Cyan
Write-Host "1. Open .env file: notepad .env"
Write-Host "2. Replace 'your-key-here' with your actual API keys"
Write-Host "3. Save the file"
Write-Host "4. Run: code-brain chat `"your question`"`

Write-Host "`n📍 Get your API keys from:" -ForegroundColor Cyan
Write-Host "  • Anthropic: https://console.anthropic.com/"
Write-Host "  • OpenAI: https://platform.openai.com/api-keys"
Write-Host "  • Voyage: https://www.voyageai.com/"
Write-Host "  • Ollama: No key needed! Just run: ollama pull llama3"

Write-Host "`n💡 Quick test:" -ForegroundColor Cyan
Write-Host "  # Set a key temporarily"
Write-Host "  `$env:ANTHROPIC_API_KEY = `"sk-ant-your-key`""
Write-Host "  code-brain chat `"test question`""

Write-Host "`n✨ For more help, see: SETUP_API_KEYS.md`n" -ForegroundColor Green
