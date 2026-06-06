const fs = require('fs');
const path = require('path');

function resolveConfigPath() {
  try {
    const { app } = require('electron');
    if (app?.isPackaged) {
      return path.join(app.getAppPath(), 'config', 'domain-packs.json');
    }
  } catch {
    // electron not available during some tooling runs
  }

  return path.join(__dirname, '..', 'config', 'domain-packs.json');
}

function loadPacksFromConfig() {
  const configPath = resolveConfigPath();
  const raw = fs.readFileSync(configPath, 'utf8');
  const data = JSON.parse(raw);
  const packs = {};

  for (const pack of data.packs || []) {
    if (!pack?.id || !pack?.name || !Array.isArray(pack.domains)) {
      continue;
    }

    const domains = [...new Set(
      pack.domains
        .map((domain) => String(domain).toLowerCase().trim())
        .filter((domain) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-][a-z0-9-]*)+$/.test(domain)),
    )];

    if (domains.length === 0) {
      continue;
    }

    packs[pack.id] = {
      id: pack.id,
      name: pack.name,
      description: pack.description || '',
      domains,
    };
  }

  return { configPath, packs, note: data.note || '' };
}

function listDomainPacks() {
  const { packs } = loadPacksFromConfig();
  return Object.values(packs).map(({ id, name, description, domains }) => ({
    id,
    name,
    description,
    domainCount: domains.length,
  }));
}

function getDomainPack(packId) {
  const { packs } = loadPacksFromConfig();
  return packs[packId] || null;
}

function getDomainPacksMeta() {
  const { configPath, packs, note } = loadPacksFromConfig();
  return {
    configPath,
    note,
    packs: Object.values(packs).map(({ id, name, description, domains }) => ({
      id,
      name,
      description,
      domainCount: domains.length,
    })),
  };
}

function domainsToWebsiteEntries(domains, packId = null) {
  return domains.map((domain) => ({
    id: packId ? `${packId}:${domain}` : domain,
    domain,
    pack: packId,
  }));
}

function mergeWebsiteEntries(existing, newEntries) {
  const seen = new Set(existing.map((site) => site.domain.toLowerCase()));
  const merged = [...existing];

  for (const entry of newEntries) {
    const key = entry.domain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

module.exports = {
  listDomainPacks,
  getDomainPack,
  getDomainPacksMeta,
  domainsToWebsiteEntries,
  mergeWebsiteEntries,
};
