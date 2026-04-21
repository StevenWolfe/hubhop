// HubHop — background service worker
// Handles omnibox input, repo caching, and periodic org repo refresh.

const GITHUB_API = 'https://api.github.com';
const REFRESH_ALARM = 'refresh-repos';
const REFRESH_INTERVAL_MINUTES = 60;

// ── Storage helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.sync.get({
    token: '',
    instances: [],  // [{ name, url }]
    orgs: [],       // [{ name, instance }]
    pinnedRepos: [] // [{ full_name, instance }]
  });
}

async function getCachedRepos() {
  const { repoCache = [] } = await chrome.storage.local.get('repoCache');
  return repoCache;
}

// ── Instance helpers ─────────────────────────────────────────────────────────

function apiBase(instanceUrl) {
  return instanceUrl === 'https://github.com'
    ? GITHUB_API
    : `${instanceUrl}/api/v3`;
}

function allInstances(settings) {
  return [{ name: 'GitHub', url: 'https://github.com' }, ...settings.instances];
}

function instanceByName(settings, name) {
  return allInstances(settings).find(i => i.name === name)
    ?? { name: 'GitHub', url: 'https://github.com' };
}

// ── Repo fetching ────────────────────────────────────────────────────────────

async function fetchOrgRepos(orgName, instance, token) {
  const base = apiBase(instance.url);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const repos = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${base}/orgs/${orgName}/repos?per_page=100&page=${page}&sort=updated`,
      { headers }
    );
    if (!res.ok) {
      console.warn(`HubHop: failed to fetch ${orgName} repos (${res.status})`);
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    repos.push(...batch.map(r => ({
      full_name: r.full_name,
      instance: instance.name,
      source: 'org',
      updated_at: r.updated_at,
    })));
    if (batch.length < 100) break;
    page++;
  }

  return repos;
}

// ── Cache refresh ────────────────────────────────────────────────────────────

async function refreshRepos() {
  const settings = await getSettings();
  const repos = [];

  for (const org of settings.orgs) {
    const instance = instanceByName(settings, org.instance);
    const orgRepos = await fetchOrgRepos(org.name, instance, settings.token);
    repos.push(...orgRepos);
  }

  // Merge in pinned repos (dedup by instance:full_name)
  for (const pinned of settings.pinnedRepos) {
    repos.push({ ...pinned, source: 'pinned' });
  }

  const seen = new Set();
  const deduped = repos.filter(r => {
    const key = `${r.instance}:${r.full_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await chrome.storage.local.set({ repoCache: deduped, lastRefresh: Date.now() });
  console.log(`HubHop: cached ${deduped.length} repos`);
  return deduped;
}

// ── Search ───────────────────────────────────────────────────────────────────

function scoreRepo(repo, query) {
  const name = repo.full_name.toLowerCase();
  const q = query.toLowerCase();
  if (name === q) return 3;
  if (name.split('/')[1] === q) return 2;
  if (name.includes(q)) return 1;
  // fuzzy: all chars present in order
  let qi = 0;
  for (const c of name) {
    if (c === q[qi]) qi++;
    if (qi === q.length) return 0.5;
  }
  return 0;
}

function searchRepos(repos, query) {
  if (!query.trim()) return repos.slice(0, 6);
  return repos
    .map(r => ({ repo: r, score: scoreRepo(r, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ repo }) => repo);
}

// ── Navigation ───────────────────────────────────────────────────────────────

async function navigateTo(url, disposition) {
  switch (disposition) {
    case 'newForegroundTab':
      return chrome.tabs.create({ url });
    case 'newBackgroundTab':
      return chrome.tabs.create({ url, active: false });
    default:
      return chrome.tabs.update({ url });
  }
}

// ── Omnibox ──────────────────────────────────────────────────────────────────

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const repos = await getCachedRepos();
  const matches = searchRepos(repos, text.trim());

  if (!matches.length) {
    suggest([{
      content: text,
      description: `Go to <url>github.com/${text}</url>`,
    }]);
    return;
  }

  suggest(matches.map(repo => ({
    content: repo.full_name,
    description: `<match>${repo.full_name}</match>` +
      (repo.instance !== 'GitHub' ? ` <dim>· ${repo.instance}</dim>` : ''),
  })));
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const settings = await getSettings();
  const repos = await getCachedRepos();

  const query = text.trim();
  const match = repos.find(r => r.full_name === query)
    ?? repos.find(r => scoreRepo(r, query) > 0);

  let url;
  if (match) {
    const instance = instanceByName(settings, match.instance);
    url = `${instance.url}/${match.full_name}`;
  } else {
    // Fallback: treat as owner/repo or search query on GitHub
    url = query.includes('/')
      ? `https://github.com/${query}`
      : `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`;
  }

  await navigateTo(url, disposition);
});

// ── Alarm-based refresh ──────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === REFRESH_ALARM) refreshRepos();
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  await refreshRepos();
});

chrome.runtime.onStartup.addListener(() => refreshRepos());

// ── Message bus (for options page) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'refresh') {
    refreshRepos().then(repos => sendResponse({ count: repos.length }));
    return true; // keep channel open for async response
  }
  if (msg.type === 'get-cache-status') {
    chrome.storage.local.get(['repoCache', 'lastRefresh']).then(({ repoCache = [], lastRefresh }) => {
      sendResponse({ count: repoCache.length, lastRefresh });
    });
    return true;
  }
});
