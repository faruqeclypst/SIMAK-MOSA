#!/usr/bin/env bash
# ==============================================================================
# SIMAK-MOSA (SMA Negeri Modal Bangsa) VPS Deployment Script
# Isolated directory: /opt/simak-mosa/
# ==============================================================================
set -e

echo "=== [1/4] Preparing /opt/simak-mosa/ Directory ==="
mkdir -p /opt/simak-mosa/data/pgdata

echo "=== [2/4] Checking Docker & Docker Compose ==="
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing docker.io..."
    sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
    sudo systemctl enable --now docker
fi

echo "=== [3/4] Pulling & Building Containers ==="
cd /opt/simak-mosa
docker compose down || true
docker compose build
docker compose up -d

echo "=== [4/4] Deployment Status ==="
docker compose ps

echo "=============================================================================="
echo "SIMAK-MOSA NextGen berhasil dijalankan!"
echo "Web App:     http://43.134.175.87:8085 (dan https://perseverance.my.id/simak/)"
echo "API Backend: http://43.134.175.87:4000"
echo "PostgREST:   http://43.134.175.87:3001"
echo "Database:    PostgreSQL 16 (Port 5433)"
echo "Directory:   /opt/simak-mosa/ (Isolated, /opt/pocketbase remains untouched)"
echo "=============================================================================="
