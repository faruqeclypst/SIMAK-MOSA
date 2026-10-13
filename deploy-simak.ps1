# ==============================================================================
# SIMAK-MOSA - Deploy dari Windows ke VPS (opsi A: kamu yang jalankan)
#
# Cara pakai (dari folder project, PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\deploy-simak.ps1 -Mode Inspect
#   powershell -ExecutionPolicy Bypass -File .\deploy-simak.ps1 -Mode Deploy
#
# Password TIDAK disimpan di file ini. Skrip memanggil `ssh`/`scp` langsung,
# jadi password diketik olehmu di jendela terminal saat diminta.
# ==============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Inspect', 'Deploy')]
    [string]$Mode,

    [string]$SshUser = 'ubuntu',
    [string]$SshHost = '43.134.175.87',
    [int]$SshPort = 22,
    [string]$RemoteDir = '/opt/simak-mosa'
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Target = "$SshUser@$SshHost"
$SshExe = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$ScpExe = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
if (-not (Test-Path $SshExe)) { $SshExe = 'ssh' }
if (-not (Test-Path $ScpExe)) { $ScpExe = 'scp' }
$SshArgs = @('-p', "$SshPort", '-o', 'StrictHostKeyChecking=accept-new')

function Write-Step { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host "  OK  $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  !!  $Text" -ForegroundColor Yellow }

function Invoke-Remote {
    param([string]$Command)
    & $SshExe @SshArgs $Target $Command
    if ($LASTEXITCODE -ne 0) { throw "Perintah remote gagal (exit $LASTEXITCODE): $Command" }
}

# ==============================================================================
# MODE 1: INSPECT - hanya membaca, tidak mengubah apa pun di VPS
# ==============================================================================
if ($Mode -eq 'Inspect') {
    Write-Step "Membaca kondisi VPS $Target (read-only)"

    Write-Host "`n[1] Identitas & Docker"
    Invoke-Remote "whoami; id; uname -a; docker --version; docker compose version"

    Write-Host "`n[2] Isi $RemoteDir"
    Invoke-Remote "sudo ls -la $RemoteDir 2>/dev/null || echo 'DIREKTORI BELUM ADA'"

    Write-Host "`n[3] File .env yang sedang dipakai (nilai disamarkan)"
    Invoke-Remote @"
if [ -f $RemoteDir/.env ]; then
  sed -E 's/(PASSWORD|SECRET)=.*/\1=***disamarkan***/' $RemoteDir/.env
  echo '--- jumlah baris ---'; wc -l < $RemoteDir/.env
else
  echo 'TIDAK ADA FILE .env'
fi
"@

    Write-Host "`n[4] Ukuran database & data"
    Invoke-Remote "sudo du -sh $RemoteDir/data 2>/dev/null || echo 'belum ada data/pgdata'"

    Write-Host "`n[5] Status container"
    Invoke-Remote "sudo docker compose -f $RemoteDir/docker-compose.yml ps 2>/dev/null || echo 'compose belum jalan'"

    Write-Host "`n[6] Container lain yang pakai port 8085 (agar tidak bentrok)"
    Invoke-Remote "sudo ss -ltnp 2>/dev/null | grep -E ':8085|:4000|:5433|:3001' || echo 'tidak ada yang pakai port tersebut'"

    Write-Step "Selesai (tidak ada yang diubah)"
    Write-Host "Kirim output di atas, lalu jalankan -Mode Deploy jika sudah aman." -ForegroundColor Cyan
    exit 0
}

# ==============================================================================
# MODE 2: DEPLOY
# ==============================================================================
Write-Step "Deploy SIMAK-MOSA ke $Target`:$RemoteDir"

Write-Warn "Pastikan kamu sudah menjalankan -Mode Inspect dan sudah tahu isi .env produksi."
$confirm = Read-Host "Ketik DEPLOY untuk lanjut"
if ($confirm -ne 'DEPLOY') { throw "Dibatalkan oleh pengguna." }

# --- 1. Build lokal supaya yang diupload sudah lolos TypeScript -----------------
Write-Step "[1/6] Build client & server di lokal"
Push-Location (Join-Path $Root 'client')
try { npm run build; Write-Ok "client build selesai" } finally { Pop-Location }
Push-Location (Join-Path $Root 'server')
try { npm run build; Write-Ok "server build selesai" } finally { Pop-Location }

# --- 2. Cek prasyarat di VPS ---------------------------------------------------
Write-Step "[2/6] Cek prasyarat di VPS"
Invoke-Remote "docker --version && docker compose version"
Invoke-Remote "sudo mkdir -p $RemoteDir"
Write-Ok "Docker OK, direktori siap"

# --- 3. Backup .env dan database sebelum ditimpa -------------------------------
Write-Step "[3/6] Backup .env dan database (agar bisa dipulihkan)"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Invoke-Remote @"
set -e
TS=$stamp
if [ -f $RemoteDir/.env ]; then
  sudo cp $RemoteDir/.env $RemoteDir/.env.backup-`$TS
  echo "  .env disalin ke .env.backup-`$TS"
else
  echo "  tidak ada .env, akan dibuat dari .env.example"
fi
if [ -d $RemoteDir/data/pgdata ]; then
  sudo docker compose -f $RemoteDir/docker-compose.yml stop db 2>/dev/null || true
  sudo tar czf $RemoteDir/pgdata-backup-`$TS.tar.gz -C $RemoteDir data/pgdata
  sudo docker compose -f $RemoteDir/docker-compose.yml start db 2>/dev/null || true
  echo "  database dibackup ke pgdata-backup-`$TS.tar.gz"
else
  echo "  belum ada data/pgdata, lewati backup database"
fi
"@
Write-Ok "Backup selesai"

# --- 4. Upload hanya file source yang diperlukan --------------------------------
Write-Step "[4/6] Upload source (client, server, postgres, docker-compose.yml)"
$remoteTmp = "$RemoteDir/.incoming-$stamp"
Invoke-Remote "mkdir -p $remoteTmp/client $remoteTmp/server"

$items = @('docker-compose.yml', 'client', 'server', 'postgres')
foreach ($item in $items) {
    $localPath = Join-Path $Root $item
    if (-not (Test-Path -LiteralPath $localPath)) { Write-Warn "lewati (tidak ada): $item"; continue }
    Write-Host "  mengirim $item ..."
    # node_modules dan dist di-exclude supaya upload cepat; Docker yang membangun ulang.
    if ($item -eq 'client') {
        $clientFiles = @(
            'package.json', 'package-lock.json', 'Dockerfile', 'nginx.conf', 'index.html',
            'tsconfig.json', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js'
        )
        foreach ($f in $clientFiles) {
            $src = Join-Path $localPath $f
            & $ScpExe @SshArgs $src "$remoteTmp/client/"
            if ($LASTEXITCODE -ne 0) { throw "Upload gagal: client/$f" }
        }
        & $ScpExe @SshArgs -r (Join-Path $localPath 'src') "$remoteTmp/client/"
        if ($LASTEXITCODE -ne 0) { throw "Upload gagal: client/src" }
    }
    elseif ($item -eq 'server') {
        foreach ($f in @('package.json', 'package-lock.json', 'Dockerfile', 'tsconfig.json')) {
            $src = Join-Path $localPath $f
            & $ScpExe @SshArgs $src "$remoteTmp/server/"
            if ($LASTEXITCODE -ne 0) { throw "Upload gagal: server/$f" }
        }
        & $ScpExe @SshArgs -r (Join-Path $localPath 'src') "$remoteTmp/server/"
        if ($LASTEXITCODE -ne 0) { throw "Upload gagal: server/src" }
    }
    else {
        & $ScpExe @SshArgs -r $localPath "$remoteTmp/"
        if ($LASTEXITCODE -ne 0) { throw "Upload gagal: $item" }
    }
}
Write-Ok "Upload selesai ke $remoteTmp"

# --- 5. Pasang file di tempatnya, lalu build & up ------------------------------
Write-Step "[5/6] Pasang file, build image, dan jalankan container"
Invoke-Remote @"
set -e
cd $RemoteDir
# Salin file baru tanpa menyentuh .env maupun ./data/pgdata
sudo cp -a $remoteTmp/. $RemoteDir/
sudo rm -rf $remoteTmp
# Pertahankan .env lama jika ada; buat baru dari .env.example jika belum ada
if [ ! -f $RemoteDir/.env ]; then
  if [ -f $RemoteDir/.env.example ]; then
    sudo cp $RemoteDir/.env.example $RemoteDir/.env
    echo '  .env dibuat dari .env.example, periksa password-nya'
  else
    echo '  PERINGATAN: tidak ada .env maupun .env.example'
  fi
fi
cd $RemoteDir
sudo docker compose build
sudo docker compose up -d
"@
Write-Ok "Container dijalankan ulang"

# --- 6. Verifikasi kesehatan ---------------------------------------------------
Write-Step "[6/6] Verifikasi"
Invoke-Remote "sudo docker compose -f $RemoteDir/docker-compose.yml ps"
Invoke-Remote "curl -s -o /dev/null -w 'client HTTP %{http_code}\n' http://127.0.0.1:8085/ || true"
Invoke-Remote "curl -s -o /dev/null -w 'api HTTP %{http_code}\n' http://127.0.0.1:4000/ || true"

Write-Step "Deploy selesai"
Write-Host "Cek: http://$SshHost`:8085 dan https://perseverance.my.id/simak/" -ForegroundColor Cyan
Write-Host "Rollback bila perlu: .env.backup-$stamp dan pgdata-backup-$stamp.tar.gz ada di $RemoteDir" -ForegroundColor Cyan
Write-Warn "Ganti password VPS kamu sekarang, karena sudah pernah tertulis di chat."
