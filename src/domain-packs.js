const YOUTUBE_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com',
  'tv.youtube.com',
  'youtube-nocookie.com',
  'youtube.googleapis.com',
  'youtubei.googleapis.com',
  'youtubeembeddedplayer.googleapis.com',
  'googlevideo.com',
  'redirector.googlevideo.com',
  'ytimg.com',
  'i.ytimg.com',
  's.ytimg.com',
  'yt3.ggpht.com',
  'jnn-pa.googleapis.com',
  'youtube-ui.l.google.com',
  'youtube-stats.google.com',
  'wide-youtube.l.google.com',
  'studio.youtube.com',
];

const PACKS = {
  youtube: {
    id: 'youtube',
    name: 'YouTube block pack',
    description: 'Blocks ~20 YouTube-related domains via the hosts file.',
    domains: YOUTUBE_DOMAINS,
  },
};

function listDomainPacks() {
  return Object.values(PACKS).map(({ id, name, description, domains }) => ({
    id,
    name,
    description,
    domainCount: domains.length,
  }));
}

function getDomainPack(packId) {
  return PACKS[packId] || null;
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
  domainsToWebsiteEntries,
  mergeWebsiteEntries,
};
