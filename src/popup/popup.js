// HubHop popup — search UI for toolbar icon; primary interface on Firefox for Android

const DEFAULT_INSTANCE_URL = 'https://github.com';

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
  if (!query.trim()) return repos.slice(0, 8);
  return repos
    .map(r => ({ repo: r, score: scoreRepo(r, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ repo }) => repo);
}

function instanceUrl(instances, instanceName) {
  if (!instanceName || instanceName === 'GitHub') return DEFAULT_INSTANCE_URL;
  return instances.find(i => i.name === instanceName)?.url ?? DEFAULT_INSTANCE_URL;
}

function navigate(url) {
  chrome.tabs.update({ url });
  window.close();
}

function renderResults(repos, instances, query) {
  const list = document.getElementById('results');
  list.innerHTML = '';

  if (!repos.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = query.trim()
      ? 'No matches'
      : 'No repos cached — open Settings to pin orgs.';
    list.appendChild(li);
    return;
  }

  for (const repo of repos) {
    const li = document.createElement('li');
    const base = instanceUrl(instances, repo.instance);
    const url = `${base}/${repo.full_name}`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'repo-name';
    nameSpan.textContent = repo.full_name;
    li.appendChild(nameSpan);

    if (repo.instance && repo.instance !== 'GitHub') {
      const instanceSpan = document.createElement('span');
      instanceSpan.className = 'repo-instance';
      instanceSpan.textContent = repo.instance;
      li.appendChild(instanceSpan);
    }

    li.addEventListener('click', () => navigate(url));
    list.appendChild(li);
  }
}

async function main() {
  const [{ repoCache: repos = [] }, { instances = [] }] = await Promise.all([
    chrome.storage.local.get('repoCache'),
    chrome.storage.sync.get({ instances: [] }),
  ]);

  const search = document.getElementById('search');

  renderResults(searchRepos(repos, ''), instances, '');

  search.addEventListener('input', () => {
    renderResults(searchRepos(repos, search.value), instances, search.value);
  });

  search.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = search.value.trim();
    if (!q) return;
    const match = repos.find(r => scoreRepo(r, q) > 0);
    if (match) {
      navigate(`${instanceUrl(instances, match.instance)}/${match.full_name}`);
    } else {
      navigate(q.includes('/')
        ? `https://github.com/${q}`
        : `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`);
    }
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  search.focus();
}

main();
