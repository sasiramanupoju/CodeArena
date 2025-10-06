# PowerShell build script for CodeArena client

Write-Host "Cleaning previous build..." -ForegroundColor Green
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

Write-Host "Installing dependencies..." -ForegroundColor Green
npm install

Write-Host "Building application..." -ForegroundColor Green
npm run build

# Check if build was successful
if (Test-Path "dist") {
    Write-Host "Build successful! Output directory: dist/" -ForegroundColor Green
    Get-ChildItem "dist" | Format-Table Name, Length, LastWriteTime
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
} 