/**
 * Package Internet Blocker for release.
 * Usage: node scripts/build-release.js <platform> <arch>
 *   platform: win32 | darwin
 *   arch: x64 | arm64
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const packager = require('@electron/packager');

const { version, name } = require('../package.json');

const platform = process.argv[2];
const arch = process.argv[3] || 'x64';

if (!platform || !['win32', 'darwin'].includes(platform)) {
  console.error('Usage: node scripts/build-release.js <win32|darwin> [x64|arm64]');
  process.exit(1);
}

const platformLabel = platform === 'win32' ? 'win' : 'mac';
const zipName = `InternetBlocker-${version}-${platformLabel}-${arch}.zip`;
const distDir = path.join(__dirname, '..', 'dist');
const zipPath = path.join(distDir, zipName);

function zipFolder(sourceDir, targetZip) {
  fs.mkdirSync(path.dirname(targetZip), { recursive: true });
  if (fs.existsSync(targetZip)) fs.unlinkSync(targetZip);

  if (process.platform === 'win32') {
    const escapedSource = sourceDir.replace(/'/g, "''");
    const escapedTarget = targetZip.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedTarget}' -Force"`,
      { stdio: 'inherit' }
    );
    return;
  }

  const parent = path.dirname(sourceDir);
  const folder = path.basename(sourceDir);
  execSync(`cd "${parent}" && zip -r "${targetZip}" "${folder}"`, { stdio: 'inherit' });
}

async function main() {
  console.log(`Building Internet Blocker v${version} for ${platform}/${arch}...`);

  const appPaths = await packager({
    dir: path.join(__dirname, '..'),
    name: 'InternetBlocker',
    platform,
    arch,
    out: distDir,
    overwrite: true,
    asar: true,
    prune: true,
    ignore: [
      /^\/dist($|\/)/,
      /^\/out($|\/)/,
      /^\/docs($|\/)/,
      /^\/\.github($|\/)/,
      /^\/\.git($|\/)/,
      /node_modules\/\.cache/,
    ],
  });

  if (!appPaths.length) {
    throw new Error('Packager produced no output');
  }

  zipFolder(appPaths[0], zipPath);
  console.log(`Created ${zipPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
