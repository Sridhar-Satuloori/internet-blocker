const REPO = 'Sridhar-Satuloori/internet-blocker';

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function platformLabel(name) {
  if (name.includes('-win-')) return { title: 'Windows (x64)', hint: 'Extract and run InternetBlocker.exe as Administrator' };
  if (name.includes('-mac-arm64')) return { title: 'macOS (Apple Silicon)', hint: 'Extract and open InternetBlocker.app with admin privileges' };
  if (name.includes('-mac-x64')) return { title: 'macOS (Intel)', hint: 'Extract and open InternetBlocker.app with admin privileges' };
  return { title: name, hint: 'Download and extract the archive' };
}

async function loadDownloads() {
  const container = document.getElementById('download-grid');
  const versionEl = document.getElementById('latest-version');
  const statusEl = document.getElementById('download-status');

  if (!container) return;

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!response.ok) throw new Error('No release found yet');

    const release = await response.json();
    versionEl.textContent = `Latest release: ${release.tag_name}`;
    statusEl.textContent = '';

    const zips = (release.assets || [])
      .filter((asset) => asset.name.endsWith('.zip'))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!zips.length) {
      container.innerHTML = '<p class="downloads-error">No downloadable binaries published for this release yet.</p>';
      return;
    }

    container.innerHTML = zips
      .map((asset) => {
        const { title, hint } = platformLabel(asset.name);
        return `
          <a class="download-card" href="${asset.browser_download_url}" rel="noopener">
            <strong>${title}</strong>
            <span>${asset.name}</span>
            <span class="size">${formatBytes(asset.size)}</span>
            <span>${hint}</span>
          </a>
        `;
      })
      .join('');
  } catch (error) {
    versionEl.textContent = 'Downloads';
    statusEl.textContent = '';
    container.innerHTML = `
      <p class="downloads-error">
        Releases are not available yet. Check
        <a href="https://github.com/${REPO}/releases">GitHub Releases</a>
        after the first tagged build completes.
      </p>
    `;
  }
}

loadDownloads();
