# CodeArena Railway Deployment Helper Script
# This script helps set up the three Railway services

Write-Host "🚀 CodeArena Railway Deployment Setup" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

Write-Host "📋 Prerequisites:" -ForegroundColor Yellow
Write-Host "1. Install Railway CLI: npm install -g @railway/cli" -ForegroundColor White
Write-Host "2. Login to Railway: railway login" -ForegroundColor White
Write-Host "3. Ensure you have MongoDB connection string" -ForegroundColor White
Write-Host "4. Google OAuth credentials configured" -ForegroundColor White
Write-Host ""

Write-Host "🔧 Deployment Steps:" -ForegroundColor Yellow
Write-Host ""

Write-Host "Step 1: Deploy API Backend (codearena-server)" -ForegroundColor Cyan
Write-Host "  - Create new Railway project: codearena-server" -ForegroundColor White
Write-Host "  - Set source directory: server/" -ForegroundColor White
Write-Host "  - Set environment variables:" -ForegroundColor White
Write-Host "    NODE_ENV=production" -ForegroundColor Gray
Write-Host "    MONGODB_URI=<your_mongodb_uri>" -ForegroundColor Gray
Write-Host "    SESSION_SECRET=<your_session_secret>" -ForegroundColor Gray
Write-Host "    GOOGLE_CLIENT_ID=<your_google_client_id>" -ForegroundColor Gray
Write-Host "    GOOGLE_CLIENT_SECRET=<your_google_client_secret>" -ForegroundColor Gray
Write-Host "    FRONTEND_URL=<your_frontend_url>" -ForegroundColor Gray
Write-Host ""

Write-Host "Step 2: Deploy Frontend Client (codearena-client)" -ForegroundColor Cyan
Write-Host "  - Create new Railway project: codearena-client" -ForegroundColor White
Write-Host "  - Set source directory: client/" -ForegroundColor White
Write-Host "  - Set environment variables:" -ForegroundColor White
Write-Host "    NODE_ENV=production" -ForegroundColor Gray
Write-Host "    VITE_API_URL=<your_backend_url>" -ForegroundColor Gray
Write-Host ""

Write-Host "Step 3: Deploy Execution System (codearena-execution)" -ForegroundColor Cyan
Write-Host "  - Create new Railway project: codearena-execution" -ForegroundColor White
Write-Host "  - Set source directory: execution-system/" -ForegroundColor White
Write-Host "  - Set environment variables:" -ForegroundColor White
Write-Host "    NODE_ENV=production" -ForegroundColor Gray
Write-Host ""

Write-Host "📚 Important Notes:" -ForegroundColor Yellow
Write-Host "- Each service must be deployed as a SEPARATE Railway project" -ForegroundColor White
Write-Host "- Set the correct URLs for inter-service communication" -ForegroundColor White
Write-Host "- The execution system runs without Docker-in-Docker on Railway" -ForegroundColor White
Write-Host "- Health check endpoints: /health for API and execution, / for client" -ForegroundColor White
Write-Host ""

Write-Host "🔍 Troubleshooting:" -ForegroundColor Yellow
Write-Host "- Check Railway deployment logs for specific errors" -ForegroundColor White
Write-Host "- Verify all environment variables are set correctly" -ForegroundColor White
Write-Host "- Test services locally before deployment" -ForegroundColor White
Write-Host "- Ensure health check endpoints are accessible" -ForegroundColor White
Write-Host ""

Write-Host "📖 For detailed instructions, see: RAILWAY_DEPLOYMENT.md" -ForegroundColor Green
Write-Host ""

Write-Host "✅ Ready to deploy! Follow the steps above to set up your three Railway services." -ForegroundColor Green 