#!/bin/bash
set -e

echo "========================================"
echo "  NEXO — Local Setup"
echo "========================================"
echo ""

# 1. Check Docker
echo "[1/5] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "  Docker is not installed!"
    echo "  Install: https://docs.docker.com/engine/install/"
    exit 1
fi
echo "  Docker found"

# 2. Check Docker Compose
echo "[2/5] Checking Docker Compose..."
if ! docker compose version &> /dev/null; then
    echo "  Docker Compose not found!"
    exit 1
fi
echo "  Docker Compose found"

# 3. Start containers
echo "[3/5] Starting PostgreSQL + Dragonfly..."
docker compose up -d
echo "  Containers started"

# 4. Wait for services
echo "[4/5] Waiting for services to be ready..."

max_attempts=30
attempt=0
pg_ready=false
df_ready=false

while [ $attempt -lt $max_attempts ] && { [ "$pg_ready" = false ] || [ "$df_ready" = false ]; }; do
    attempt=$((attempt + 1))
    sleep 2

    if [ "$pg_ready" = false ]; then
        if docker exec nexo-postgres pg_isready -U nexouser -d nexodb &> /dev/null; then
            pg_ready=true
            echo "  PostgreSQL ready"
        fi
    fi

    if [ "$df_ready" = false ]; then
        if docker exec nexo-dragonfly redis-cli ping 2>&1 | grep -q "PONG"; then
            df_ready=true
            echo "  Dragonfly ready"
        fi
    fi
done

if [ "$pg_ready" = false ] || [ "$df_ready" = false ]; then
    echo "  Services did not start in time"
    exit 1
fi

# 5. Install deps + push schema
echo "[5/5] Installing dependencies and pushing DB schema..."
npm install
npx prisma db push

echo ""
echo "========================================"
echo "  Setup complete!"
echo "  Run: npm run dev"
echo "========================================"
