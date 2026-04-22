// HubHop options page

const DEFAULT_INSTANCE = { name: 'GitHub', url: 'https://github.com' };

// ── State ────────────────────────────────────────────────────────────────────

let settings = {
  tokens: {},
  instances: [],
  orgs: [],
  pinnedRepos: [],
};

// ── Load / save ──────────────────────────────────────────────────────────────

async function loadSettings() {
  settings = await chrome.storage.sync.get({
    tokens: {},
    instances: [],
    orgs: [],
    pinnedRepos: [],
  });
  render();
  loadCacheStatus();
}

async function saveSettings() {
  await chrome.storage.sync.set(settings);
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function el(tag, { cls, text, attrs = {}, dataset = {} } = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const [k, v] of Object.entries(dataset)) e.dataset[k] = v;
  return e;
}

function setStatus(id, msg, type = '') {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = msg;
  node.className = `status ${type}`;
  if (type === 'ok') setTimeout(() => { if (node.textContent === msg) node.textContent = ''; }, 3000);
}

function allInstances() {
  return [DEFAULT_INSTANCE, ...settings.instances];
}

// ── Instance <select> population ─────────────────────────────────────────────

function populateInstanceSelect(selectEl, selectedName) {
  const current = selectedName || selectEl.value || 'GitHub';
  selectEl.innerHTML = '';
  for (const inst of allInstances()) {
    const opt = el('option', { text: inst.name, attrs: { value: inst.name } });
    if (inst.name === current) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

// ── Generic item list ─────────────────────────────────────────────────────────

function renderList(ulId, items, buildRow, removeFn) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = '';
  if (!items.length) return;

  for (let i = 0; i < items.length; i++) {
    const li = document.createElement('li');
    const contentSpan = document.createElement('span');
    buildRow(contentSpan, items[i]);

    const btn = el('button', { cls: 'remove-btn', text: '×', attrs: { 'aria-label': 'Remove' } });
    btn.addEventListener('click', () => removeFn(i));

    li.appendChild(contentSpan);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}


// ── Tokens (per-instance) ─────────────────────────────────────────────────────

function renderTokens() {
  const container = document.getElementById('tokens-list');
  container.innerHTML = '';

  const helpLink = document.getElementById('token-help-link');
  const firstMissing = allInstances().find(i => !settings.tokens[i.name]);
  if (helpLink) {
    const base = firstMissing ? firstMissing.url : 'https://github.com';
    helpLink.href = `${base}/settings/tokens/new?description=HubHop&scopes=repo,read:org`;
    helpLink.textContent = firstMissing
      ? `Create a token for ${firstMissing.name} →`
      : 'Manage tokens →';
  }

  for (const inst of allInstances()) {
    const hasToken = !!settings.tokens[inst.name];

    const row = el('div', { cls: 'token-row' });
    row.appendChild(el('span', { cls: 'token-instance-name', text: inst.name }));

    const input = el('input', {
      cls: 'token-input',
      attrs: {
        type: 'password',
        placeholder: hasToken ? '••••••••••••••••' : 'ghp_…',
        autocomplete: 'off',
        spellcheck: 'false',
      },
      dataset: { instance: inst.name },
    });

    const saveBtn = el('button', { cls: 'btn-small save-token-btn', text: 'Save', dataset: { instance: inst.name } });
    saveBtn.addEventListener('click', async () => {
      const val = input.value.trim();
      if (!val) { setStatus('tokens-status', 'Enter a token first.', 'err'); return; }
      settings.tokens = { ...settings.tokens, [inst.name]: val };
      await saveSettings();
      input.value = '';
      setStatus('tokens-status', `Token saved for ${inst.name}.`, 'ok');
      renderTokens();
    });

    input.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });

    row.appendChild(input);
    row.appendChild(saveBtn);

    if (hasToken) {
      const clearBtn = el('button', { cls: 'btn-small btn-secondary clear-token-btn', text: 'Clear', dataset: { instance: inst.name } });
      clearBtn.addEventListener('click', async () => {
        const { [inst.name]: _, ...rest } = settings.tokens;
        settings.tokens = rest;
        await saveSettings();
        setStatus('tokens-status', `Token cleared for ${inst.name}.`, 'ok');
        renderTokens();
      });
      row.appendChild(clearBtn);
      row.appendChild(el('span', { cls: 'token-set-indicator', text: '✓ set' }));
    }

    container.appendChild(row);
  }
}

// ── Full render ───────────────────────────────────────────────────────────────

function render() {
  populateInstanceSelect(document.getElementById('org-instance'));
  populateInstanceSelect(document.getElementById('repo-instance'));

  renderTokens();

  renderList(
    'instances-list',
    settings.instances,
    (span, i) => {
      span.appendChild(el('span', { cls: 'item-label', text: i.name }));
      span.appendChild(el('span', { cls: 'item-meta', text: i.url }));
    },
    idx => {
      // Remove token for deleted instance too
      const removed = settings.instances[idx];
      settings.instances.splice(idx, 1);
      if (removed) {
        const { [removed.name]: _, ...rest } = settings.tokens;
        settings.tokens = rest;
      }
      saveSettings().then(render);
    }
  );

  renderList(
    'orgs-list',
    settings.orgs,
    (span, o) => {
      span.appendChild(el('span', { cls: 'item-label', text: o.name }));
      span.appendChild(el('span', { cls: 'item-meta', text: o.instance }));
    },
    idx => { settings.orgs.splice(idx, 1); saveSettings().then(render); }
  );

  renderList(
    'repos-list',
    settings.pinnedRepos,
    (span, r) => {
      span.appendChild(el('span', { cls: 'item-label', text: r.full_name }));
      span.appendChild(el('span', { cls: 'item-meta', text: r.instance }));
    },
    idx => { settings.pinnedRepos.splice(idx, 1); saveSettings().then(render); }
  );
}

// ── Cache status ─────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  auth: 'Authentication failed — check your token.',
  not_found: 'Org not found — verify the name.',
  rate_limited: 'Rate limited — add a token to get 5000 req/hr.',
  forbidden: 'Access denied — token may lack read:org scope.',
  network: 'Network error — check connectivity.',
};

async function loadCacheStatus() {
  const statusEl = document.getElementById('cache-status');
  const errorsEl = document.getElementById('fetch-errors');
  if (!statusEl) return;

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'get-cache-status' });
    if (resp?.count !== undefined) {
      const when = resp.lastRefresh
        ? `Last refreshed ${new Date(resp.lastRefresh).toLocaleString()}.`
        : 'Never refreshed.';
      statusEl.textContent = `${resp.count} repos cached. ${when}`;
    }

    errorsEl.innerHTML = '';
    if (resp?.errors?.length) {
      const callout = el('div', { cls: 'callout callout-warn' });
      callout.appendChild(el('strong', { text: `${resp.errors.length} org(s) failed to refresh:` }));
      const ul = document.createElement('ul');
      for (const e of resp.errors) {
        const li = document.createElement('li');
        li.appendChild(el('code', { text: e.org }));
        li.appendChild(document.createTextNode(` on ${e.instance} — ${ERROR_MESSAGES[e.error] ?? e.error}`));
        ul.appendChild(li);
      }
      callout.appendChild(ul);
      errorsEl.appendChild(callout);
    }
  } catch {
    statusEl.textContent = 'Could not reach background worker.';
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('add-instance').addEventListener('click', async () => {
  const name = document.getElementById('instance-name').value.trim();
  const url = document.getElementById('instance-url').value.trim().replace(/\/$/, '');
  if (!name || !url) { setStatus('instances-status', 'Name and URL are required.', 'err'); return; }
  if (!/^https?:\/\//.test(url)) { setStatus('instances-status', 'URL must start with https://', 'err'); return; }
  if (name === 'GitHub' || settings.instances.find(i => i.name === name)) {
    setStatus('instances-status', `"${name}" already exists.`, 'err'); return;
  }
  settings.instances.push({ name, url });
  await saveSettings();
  document.getElementById('instance-name').value = '';
  document.getElementById('instance-url').value = '';
  setStatus('instances-status', `Added ${name}.`, 'ok');
  render();
});

document.getElementById('add-org').addEventListener('click', async () => {
  const name = document.getElementById('org-name').value.trim().replace(/^@/, '');
  const instance = document.getElementById('org-instance').value;
  if (!name) { setStatus('orgs-status', 'Org name is required.', 'err'); return; }
  if (settings.orgs.find(o => o.name === name && o.instance === instance)) {
    setStatus('orgs-status', `"${name}" on ${instance} already pinned.`, 'err'); return;
  }
  settings.orgs.push({ name, instance });
  await saveSettings();
  document.getElementById('org-name').value = '';
  setStatus('orgs-status', `Pinned ${name}. Refreshing…`, 'ok');
  render();
  chrome.runtime.sendMessage({ type: 'refresh' }).then(result => {
    setStatus('orgs-status', `Pinned ${name}. ${result?.count ?? 0} repos cached.`, 'ok');
    loadCacheStatus();
  });
});

document.getElementById('add-repo').addEventListener('click', async () => {
  // Accept full GitHub URLs in addition to owner/repo
  const raw = document.getElementById('repo-name').value.trim();
  const full_name = raw.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
  const instance = document.getElementById('repo-instance').value;
  if (!full_name || !full_name.includes('/')) {
    setStatus('repos-status', 'Enter as owner/repo or paste the full GitHub URL.', 'err'); return;
  }
  if (settings.pinnedRepos.find(r => r.full_name === full_name && r.instance === instance)) {
    setStatus('repos-status', 'Already pinned.', 'err'); return;
  }
  settings.pinnedRepos.push({ full_name, instance });
  await saveSettings();
  document.getElementById('repo-name').value = '';
  setStatus('repos-status', `Pinned ${full_name}.`, 'ok');
  render();
  chrome.runtime.sendMessage({ type: 'refresh' }).then(() => loadCacheStatus());
});

document.getElementById('refresh-now').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-now');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    await chrome.runtime.sendMessage({ type: 'refresh' });
    await loadCacheStatus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh Now';
  }
});

// Enter key for add forms
[
  ['instance-name', 'add-instance'],
  ['instance-url', 'add-instance'],
  ['org-name', 'add-org'],
  ['repo-name', 'add-repo'],
].forEach(([inputId, btnId]) => {
  document.getElementById(inputId)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById(btnId)?.click();
  });
});

// ── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
