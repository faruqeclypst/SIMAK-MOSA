const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Require ssh2 from server node_modules
const serverNodeModules = path.join(__dirname, '../server/node_modules');
const ssh2Path = path.join(serverNodeModules, 'ssh2');
let Client;
try {
  Client = require(ssh2Path).Client;
} catch (e) {
  try {
    Client = require('ssh2').Client;
  } catch (err) {
    console.error('Cannot find ssh2 module. Please run npm install in ./server first.');
    process.exit(1);
  }
}

const rootDir = path.resolve(__dirname, '..');
const localArchive = path.join(rootDir, 'simak-mosa.tar.gz');
const remoteArchive = '/home/ubuntu/simak-mosa.tar.gz';
const remoteDir = '/opt/simak-mosa';

console.log('=================================================');
console.log('   SIMAK-MOSA NextGen Auto Deployment to VPS     ');
console.log('=================================================');

// 1. Build Client and Server locally
console.log('[1/5] Building client & server locally...');
try {
  execSync('npm run build', { cwd: path.join(rootDir, 'client'), stdio: 'inherit' });
  execSync('npm run build', { cwd: path.join(rootDir, 'server'), stdio: 'inherit' });
  console.log('  -> Build local berhasil.');
} catch (err) {
  console.error('Build lokal gagal! Deployment dibatalkan.');
  process.exit(1);
}

// 2. Packaging tar.gz
console.log('\n[2/5] Mengompresi file source ke tar.gz...');
try {
  execSync(
    'tar --exclude="node_modules" --exclude=".git" --exclude="simak-mosa.tar.gz" -czf simak-mosa.tar.gz client server docker-compose.yml package.json deploy.sh postgres postgrest',
    { cwd: rootDir, stdio: 'inherit' }
  );
  const stat = fs.statSync(localArchive);
  console.log(`  -> File terkompresi: ${(stat.size / 1024).toFixed(1)} KB`);
} catch (err) {
  console.error('Kompresi gagal:', err.message);
  process.exit(1);
}

// 3. Connect SSH & SFTP upload
console.log('\n[3/5] Menghubungkan ke VPS (43.134.175.87)...');
const conn = new Client();

conn.on('ready', () => {
  console.log('  -> Koneksi SSH berhasil.');
  console.log('  -> Mengunggah simak-mosa.tar.gz via SFTP...');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      process.exit(1);
    }

    sftp.fastPut(localArchive, remoteArchive, (uploadErr) => {
      if (uploadErr) {
        console.error('Upload gagal:', uploadErr);
        conn.end();
        process.exit(1);
      }

      console.log('  -> Arsip berhasil diunggah.');
      console.log('\n[4/5] Mengekstrak dan memperbarui container Docker di VPS...');

      const remoteCommands = [
        "echo 'Sudahlupa12#' | sudo -S mkdir -p " + remoteDir,
        "echo 'Sudahlupa12#' | sudo -S tar -xzf " + remoteArchive + " -C " + remoteDir + "/",
        "cd " + remoteDir + " && echo 'Sudahlupa12#' | sudo -S docker compose build client server",
        "cd " + remoteDir + " && echo 'Sudahlupa12#' | sudo -S docker compose up -d",
        "echo 'Sudahlupa12#' | sudo -S mkdir -p " + remoteDir + "/client/dist",
        "echo 'Sudahlupa12#' | sudo -S docker cp simak_web:/usr/share/nginx/html/. " + remoteDir + "/client/dist/",
        "echo 'Sudahlupa12#' | sudo -S systemctl reload caddy",
        "echo 'Sudahlupa12#' | sudo -S docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'"
      ].join(' && ');

      conn.exec(remoteCommands, { pty: true }, (execErr, stream) => {
        if (execErr) {
          console.error('Exec error:', execErr);
          conn.end();
          process.exit(1);
        }

        stream.on('close', (code) => {
          console.log(`\nContainer Docker berhasil diupdate (exit code ${code})`);
          conn.end();

          // 5. Verifikasi live
          console.log('\n[5/5] Memverifikasi status live server...');
          setTimeout(async () => {
            try {
              const resHealth = await fetch('https://perseverance.my.id/api/health');
              const healthJson = await resHealth.json();
              console.log('  OK  API Health (200):', healthJson.system, '| Postgres:', healthJson.postgres);
            } catch (e) {
              console.log('  !!  Cek API Health gagal:', e.message);
            }

            try {
              const resWeb = await fetch('https://perseverance.my.id/simak/');
              const html = await resWeb.text();
              const jsMatch = html.match(/assets\/index-[a-zA-Z0-9_-]+\.js/);
              console.log('  OK  Web SIMAK (200) | Bundle:', jsMatch ? jsMatch[0] : 'OK');
            } catch (e) {
              console.log('  !!  Cek Web SIMAK gagal:', e.message);
            }

            console.log('\n=================================================');
            console.log('  DEPLOYMENT SELESAI & BERHASIL!');
            console.log('  Akses web: https://perseverance.my.id/simak/');
            console.log('=================================================');
            process.exit(0);
          }, 2000);
        }).on('data', (d) => {
          process.stdout.write(d.toString());
        }).stderr.on('data', (d) => {
          process.stderr.write(d.toString());
        });
      });
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection error:', err.message);
  process.exit(1);
}).connect({
  host: '43.134.175.87',
  port: 22,
  username: 'ubuntu',
  password: 'Sudahlupa12#',
  readyTimeout: 30000,
});
