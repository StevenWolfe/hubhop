// HubHop options page

const DEFAULT_INSTANCE = { name: 'GitHub', url: 'https://github.com' };

// ── State ────────────────────────────────────────────────────────────────────

let settings = {
  token: '',
  instances: [],
  orgs: [],
  pinnedRepos: [],
};

// ── Load / save ──────────────────────────────────────────────────────────────

async function loadSettings() {
  settings = await chrome.storage.sync.get({
    token: '',
    instances: [],
    orgs: [],
    pinnedRepos: [],
  });
  render();
  refreshCacheStatus();
}

async function saveSettings() {
  await chrome.storage.sync.set(settings);
}

// ── Render helpers ───────────────────────────────────────────────────────────

function allInstances() {
  return [DEFAULT_INSTANCE, ...settings.instances];
}

function instanceOptions(selectedName) {
  return allInstances()
    .map(i => `<option value="${i.name}" ${i.name === selectedName ? 'selected' : ''}>${i.name}</option>`)
    .join('');
}

function renderList(ulId, items, labelFn, removeFn) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = items.map((item, i) => `
    <li>
      <span>${labelFn(item)}</span>
      <button class="remove-btn" data-idx="${i}" aria-label="Remove">×</button>
    </li>
  `).join('');
  ul.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFn(parseInt(btn.dataset.idx, 10));
    });
  });
}

function render() {
  // Token
  const tokenInput = document.getElementById('token');
  if (tokenInput && settings.token) tokenInput.placeholder = '••••••••••••••••';

  // Instance selects
  document.querySelectorAll('#org-instance, #repo-instance').forEach(sel => {
    sel.innerHTML = instanceOptions(sel.dataset.selected);
  });

  // Instances list
  renderList(
    'instances-list',
    settings.instances,
    i => `<span class="item-label">${i.name}</span><span class="item-meta">${i.url}</span>`,
    idx => {
      settings.instances.splice(idx, 1);
      saveSettings().then(render);
    }
  );

  // Orgs list
  renderList(
    'orgs-list',
    settings.orgs,
    o => `<span class="item-label">${o.name}</span><span class="item-meta">${o.instance}</span>`,
    idx => {
      settings.orgs.splice(idx, 1);
      saveSettings().then(render);
    }
  );

  // Repos list
  renderList(
    'repos-list',
    settings.pinnedRepos,
    r => `<span class="item-label">${r.full_name}</span><span class="item-meta">${r.instance}</span>`,
    idx => {
      settings.pinnedRepos.splice(idx, 1);
      saveSettings().then(render);
    }
  );
}

function setStatus(id, msg, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type}`;
}

// ── Cache status ─────────────────────────────────────────────────────────────

async function refreshCacheStatus() {
  const el = document.getElementById('cache-status');
  if (!el) return;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'get-cache-status' });
    if (resp?.count !== undefined) {
      const when = resp.lastRefresh
        ? `Last refreshed ${new Date(resp.lastRefresh).toLocaleTimeString()}.`
        : 'Never refreshed.';
      el.textContent = `${resp.count} repos cached. ${when}`;
    }
  } catch {
    el.textContent = 'Could not reach background worker.';
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('save-token').addEventListener('click', async () => {
  const val = document.getElementById('token').value.trim();
  if (!val) {
    setStatus('token-status', 'Enter a token first.', 'err');
    return;
  }
  settings.token = val;
  await saveSettings();
  document.getElementById('token').value = '';
  setStatus('token-status', 'Saved.', 'ok');
});

document.getElementById('add-instance').addEventListener('click', async () => {
  const name = document.getElementById('instance-name').value.trim();
  const url = document.getElementById('instance-url').value.trim().replace(/\/$/, '');
  if (!name || !url) {
    setStatus('instances-status', 'Name and URL are required.', 'err');
    return;
  }
  if (settings.instances.find(i => i.name === name)) {
    setStatus('instances-status', `"${name}" already exists.`, 'err');
    return;
  }
  settings.instances.push({ name, url });
  await saveSettings();
  document.getElementById('instance-name').value = '';
  document.getElementById('instance-url').value = '';
  setStatus('instances-status', `Added ${name}.`, 'ok');
  render();
});

document.getElementById('add-org').addEventListener('click', async () => {
  const name = document.getElementById('org-name').value.trim();
  const instance = document.getElementById('org-instance').value;
  if (!name) {
    setStatus('orgs-status', 'Org name is required.', 'err');
    return;
  }
  if (settings.orgs.find(o => o.name === name && o.instance === instance)) {
    setStatus('orgs-status', `"${name}" on ${instance} already added.`, 'err');
    return;
  }
  settings.orgs.push({ name, instance });
  await saveSettings();
  document.getElementById('org-name').value = '';
  setStatus('orgs-status', `Added ${name}. Refresh to fetch repos.`, 'ok');
  render();
});

document.getElementById('add-repo').addEventListener('click', async () => {
  const full_name = document.getElementById('repo-name').value.trim();
  const instance = document.getElementById('repo-instance').value;
  if (!full_name || !full_name.includes('/')) {
    setStatus('repos-status', 'Enter as owner/repo.', 'err');
    return;
  }
  if (settings.pinnedRepos.find(r => r.full_name === full_name && r.instance === instance)) {
    setStatus('repos-status', 'Already pinned.', 'err');
    return;
  }
  settings.pinnedRepos.push({ full_name, instance });
  await saveSettings();
  document.getElementById('repo-name').value = '';
  setStatus('repos-status', `Pinned ${full_name}.`, 'ok');
  render();
});

document.getElementById('refresh-now').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-now');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'refresh' });
    document.getElementById('cache-status').textContent =
      `${resp?.count ?? '?'} repos cached. Just now.`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh Now';
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
