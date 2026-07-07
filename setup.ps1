Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NEXO — Local Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker
Write-Host "[1/5] Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "  Docker found" -ForegroundColor Green
} catch {
    Write-Host "  Docker is not installed!" -ForegroundColor Red
    Write-Host "  Install: https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Gray
    exit 1
}

# 2. Check Docker Compose
Write-Host "[2/5] Checking Docker Compose..." -ForegroundColor Yellow
try {
    docker compose version | Out-Null
    Write-Host "  Docker Compose found" -ForegroundColor Green
} catch {
    Write-Host "  Docker Compose not found!" -ForegroundColor Red
    exit 1
}

# 3. Start containers
Write-Host "[3/5] Starting PostgreSQL + Dragonfly..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed to start containers" -ForegroundColor Red
    exit 1
}
Write-Host "  Containers started" -ForegroundColor Green

# 4. Wait for services
Write-Host "[4/5] Waiting for services to be ready..." -ForegroundColor Yellow

$maxAttempts = 30
$attempt = 0
$pgReady = $false
$dfReady = $false

while (($attempt -lt $maxAttempts) -and (-not ($pgReady -and $dfReady))) {
    $attempt++
    Start-Sleep -Seconds 2

    if (-not $pgReady) {
        $pgCheck = docker exec nexo-postgres pg_isready -U nexouser -d nexodb 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pgReady = $true
            Write-Host "  PostgreSQL ready" -ForegroundColor Green
        }
    }

    if (-not $dfReady) {
        $dfCheck = docker exec nexo-dragonfly redis-cli ping 2>&1
        if ($dfCheck -match "PONG") {
            $dfReady = $true
            Write-Host "  Dragonfly ready" -ForegroundColor Green
        }
    }
}

if (-not ($pgReady -and $dfReady)) {
    Write-Host "  Services did not start in time" -ForegroundColor Red
    exit 1
}

# 5. Install deps + push schema
Write-Host "[5/5] Installing dependencies and pushing DB schema..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm install failed" -ForegroundColor Red
    exit 1
}

npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Prisma db push failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  Run: npm run dev" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
