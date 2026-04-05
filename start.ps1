Write-Host "🚀 Starting AI Assistant Platform..." -ForegroundColor Cyan

# Install dependencies
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing root dependencies..."
  npm install
}

if (-not (Test-Path "backend\node_modules")) {
  Write-Host "Installing backend dependencies..."
  Set-Location backend
  npm install
  Set-Location ..
}

if (-not (Test-Path "frontend\node_modules")) {
  Write-Host "Installing frontend dependencies..."
  Set-Location frontend
  npm install
  Set-Location ..
}

# Start concurrently
npx concurrently `
  "npm run backend" `
  "npm run frontend" `
  --kill-others `
  --prefix-colors "bgBlue.bold,bgGreen.bold"