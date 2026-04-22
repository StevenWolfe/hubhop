// HubHop — background service worker

const GITHUB_API = 'https://api.github.com';
const REFRESH_ALARM = 'refresh-repos';
const REFRESH_INTERVAL_MINUTES = 60;

// ── Storage helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.sync.get({
    tokens: {},        // { [instanceName]: PAT }
    instances: [],     // [{ name, url }]
    orgs: [],          // [{ name, instance }]
    pinnedRepos: [],   // [{ full_name, instance }]
  });
}

async function getCachedRepos() {
  const { repoCache = [] } = await chrome.storage.local.get('repoCache');
  return repoCache;
}

// ── Instance helpers ─────────────────────────────────────────────────────────

const DEFAULT_INSTANCE = { name: 'GitHub', url: 'https://github.com' };

function apiBase(instanceUrl) {
  return instanceUrl === 'https://github.com'
    ? GITHUB_API
    : `${instanceUrl}/api/v3`;
}

function allInstances(settings) {
  return [DEFAULT_INSTANCE, ...settings.instances];
}

function instanceByName(settings, name) {
  return allInstances(settings).find(i => i.name === name) ?? DEFAULT_INSTANCE;
}

function tokenFor(settings, instanceName) {
  return settings.tokens?.[instanceName] ?? '';
}

// ── Repo fetching ────────────────────────────────────────────────────────────

// Returns { repos, error, rateLimitRemaining }
// error: null | 'auth' | 'not_found' | 'rate_limited' | 'forbidden' | `http_NNN`
async function fetchOrgRepos(orgName, instance, token) {
  const base = apiBase(instance.url);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const repos = [];
  let page = 1;
  let rateLimitRemaining = null;

  while (true) {
    let res;
    try {
      res = await fetch(
        `${base}/orgs/${orgName}/repos?per_page=100&page=${page}&sort=updated`,
        { headers }
      );
    } catch (e) {
      return { repos, error: 'network', rateLimitRemaining };
    }

    const rlHeader = res.headers.get('X-RateLimit-Remaining');
    if (rlHeader !== null) rateLimitRemaining = parseInt(rlHeader, 10);

    if (res.status === 401) return { repos, error: 'auth', rateLimitRemaining };
    if (res.status === 404) return { repos, error: 'not_found', rateLimitRemaining };
    if (res.status === 403) {
      return { repos, error: rateLimitRemaining === 0 ? 'rate_limited' : 'forbidden', rateLimitRemaining };
    }
    if (!res.ok) return { repos, error: `http_${res.status}`, rateLimitRemaining };

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

  return { repos, error: null, rateLimitRemaining };
}

// ── Cache refresh ────────────────────────────────────────────────────────────

async function refreshRepos() {
  const settings = await getSettings();
  const allRepos = [];
  const fetchErrors = [];

  for (const org of settings.orgs) {
    const instance = instanceByName(settings, org.instance);
    const token = tokenFor(settings, instance.name);
    const result = await fetchOrgRepos(org.name, instance, token);

    if (result.error) {
      fetchErrors.push({ org: org.name, instance: org.instance, error: result.error });
      console.warn(`HubHop: ${org.name} (${org.instance}): ${result.error}`);
    } else {
      allRepos.push(...result.repos);
    }
  }

  for (const pinned of settings.pinnedRepos) {
    allRepos.push({ ...pinned, source: 'pinned' });
  }

  const seen = new Set();
  const repoCache = allRepos.filter(r => {
    const key = `${r.instance}:${r.full_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await chrome.storage.local.set({ repoCache, lastRefresh: Date.now(), fetchErrors });
  console.log(`HubHop: cached ${repoCache.length} repos, ${fetchErrors.length} error(s)`);
  return { count: repoCache.length, errors: fetchErrors };
}

// ── Search ───────────────────────────────────────────────────────────────────

function scoreRepo(repo, query) {
  const name = repo.full_name.toLowerCase();
  const q = query.toLowerCase();
  if (name === q) return 3;
  if (name.split('/')[1] === q) return 2;
  if (name.includes(q)) return 1;
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
    case 'newForegroundTab': return chrome.tabs.create({ url });
    case 'newBackgroundTab': return chrome.tabs.create({ url, active: false });
    default: return chrome.tabs.update({ url });
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

// ── Message bus (options page) ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'refresh') {
    refreshRepos().then(result => sendResponse(result));
    return true;
  }
  if (msg.type === 'get-cache-status') {
    chrome.storage.local.get(['repoCache', 'lastRefresh', 'fetchErrors']).then(data => {
      sendResponse({
        count: (data.repoCache ?? []).length,
        lastRefresh: data.lastRefresh,
        errors: data.fetchErrors ?? [],
      });
    });
    return true;
  }
});
