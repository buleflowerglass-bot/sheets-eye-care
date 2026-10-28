const DEFAULT_SETTINGS = {
  mode: 'day',
  dayDim: 20,
  dayWarmth: 35,
  greenIntensity: 70,
  greenDim: 10,
  nightInvert: 88,
  nightBrightness: 92,
  nightContrast: 92
};

const sliders = [
  'dayDim', 'dayWarmth',
  'greenIntensity', 'greenDim',
  'nightInvert', 'nightBrightness', 'nightContrast'
];

function renderUI(settings) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === settings.mode);
  });

  const badge = document.getElementById('status-badge');
  if (settings.mode === 'off') {
    badge.textContent = '已停用';
    badge.className = 'badge off';
  } else {
    badge.textContent = '生效中';
    badge.className = 'badge';
  }

  document.getElementById('panel-day').classList.toggle('show', settings.mode === 'day');
  document.getElementById('panel-green').classList.toggle('show', settings.mode === 'green');
  document.getElementById('panel-night').classList.toggle('show', settings.mode === 'night');
  document.getElementById('panel-off').classList.toggle('show', settings.mode === 'off');

  sliders.forEach(key => {
    const input = document.getElementById(key);
    const label = document.getElementById(`${key}-val`);
    if (input && label) {
      input.value = settings[key];
      label.textContent = `${settings[key]}%`;
    }
  });
}

function updateSetting(key, val) {
  chrome.storage.local.set({ [key]: val });
}

/* ---------------- 生效网站管理 ---------------- */

const SHEETS_PREFIX = 'https://docs.google.com/spreadsheets/';
let customSites = [];
let currentTab = null; // { id, host, isSheets, supported }

const $ = (id) => document.getElementById(id);

function showMsg(text, isError = false) {
  const el = $('site-msg');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = { id: tab && tab.id, host: null, isSheets: false, supported: false };
  if (!tab || !tab.url) return;
  currentTab.isSheets = tab.url.startsWith(SHEETS_PREFIX);
  currentTab.host = normalizeHost(tab.url);
  currentTab.supported = !!currentTab.host;
}

async function loadSites() {
  const data = await chrome.storage.local.get({ [CUSTOM_SITES_KEY]: [] });
  const saved = data[CUSTOM_SITES_KEY];
  // 清理那些记录了但没有拿到权限的网站（例如授权被拒绝）
  const kept = [];
  for (const site of saved) {
    try {
      if (await chrome.permissions.contains({ origins: hostToPatterns(site) })) kept.push(site);
    } catch (e) { /* 忽略 */ }
  }
  if (kept.length !== saved.length) {
    await chrome.storage.local.set({ [CUSTOM_SITES_KEY]: kept });
  }
  customSites = kept;
}

function coveringSite() {
  if (!currentTab || !currentTab.host) return null;
  return customSites.find((s) => hostMatches(currentTab.host, s)) || null;
}

function renderSites() {
  // 当前网站卡片
  const hostEl = $('current-host');
  const btn = $('toggle-site');
  hostEl.classList.remove('muted');
  btn.hidden = true;
  btn.classList.remove('primary', 'danger');

  if (currentTab && currentTab.isSheets) {
    hostEl.textContent = 'Google 表格（内置支持）';
  } else if (!currentTab || !currentTab.supported) {
    hostEl.textContent = '当前页面不支持';
    hostEl.classList.add('muted');
  } else {
    hostEl.textContent = currentTab.host;
    btn.hidden = false;
    if (coveringSite()) {
      btn.textContent = '停用此网站';
      btn.classList.add('danger');
    } else {
      btn.textContent = '在此网站启用';
      btn.classList.add('primary');
    }
  }

  // 网站列表
  const list = $('site-list');
  list.textContent = '';

  const builtin = document.createElement('li');
  const bName = document.createElement('span');
  bName.className = 'site-name';
  bName.textContent = 'docs.google.com/spreadsheets';
  const bTag = document.createElement('span');
  bTag.className = 'tag';
  bTag.textContent = '内置';
  builtin.append(bName, bTag);
  list.appendChild(builtin);

  customSites.forEach((site) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = site;
    name.title = `${site} 及其所有子域名`;
    const rm = document.createElement('button');
    rm.className = 'remove';
    rm.textContent = '×';
    rm.title = '移除';
    rm.addEventListener('click', () => removeSite(site));
    li.append(name, rm);
    list.appendChild(li);
  });
}

// 让已打开的标签页立刻生效（无需刷新）
async function activateTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'gs-eye-enable' });
  } catch (e) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (err) {
      console.warn('注入失败', err);
    }
  }
}

async function addSite(rawInput) {
  const host = normalizeHost(rawInput);
  if (!host) {
    showMsg('请输入有效的网址或域名', true);
    return;
  }
  if (customSites.includes(host)) {
    showMsg('该网站已在列表中');
    return;
  }

  const patterns = hostToPatterns(host);
  const tabId = currentTab && currentTab.id;
  const tabHost = currentTab && currentTab.host;

  // 先记录再请求权限：授权弹窗可能会让本弹窗关闭，
  // 授权完成后由后台脚本负责注册并让已打开的页面生效
  customSites.push(host);
  chrome.storage.local.set({ [CUSTOM_SITES_KEY]: customSites });

  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: patterns });
  } catch (e) {
    showMsg('请求权限失败：' + e.message, true);
  }

  if (!granted) {
    customSites = customSites.filter((s) => s !== host);
    await chrome.storage.local.set({ [CUSTOM_SITES_KEY]: customSites });
    if (!$('site-msg').textContent) showMsg('未授予权限，无法在该网站生效', true);
    renderSites();
    return;
  }

  showMsg(`已添加 ${host}`);
  $('site-input').value = '';
  renderSites();
  if (tabHost && hostMatches(tabHost, host)) await activateTab(tabId);
}

async function removeSite(host) {
  customSites = customSites.filter((s) => s !== host);
  await chrome.storage.local.set({ [CUSTOM_SITES_KEY]: customSites });
  try {
    await chrome.permissions.remove({ origins: hostToPatterns(host) });
  } catch (e) { /* 忽略 */ }
  showMsg(`已移除 ${host}`);

  if (currentTab && currentTab.id && currentTab.host &&
      hostMatches(currentTab.host, host) && !coveringSite() && !currentTab.isSheets) {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { type: 'gs-eye-disable' });
    } catch (e) { /* 页面里没有脚本，忽略 */ }
  }
  renderSites();
}

async function initSites() {
  await Promise.all([loadCurrentTab(), loadSites()]);
  renderSites();

  $('toggle-site').addEventListener('click', () => {
    const covering = coveringSite();
    if (covering) removeSite(covering);
    else if (currentTab && currentTab.host) addSite(currentTab.host);
  });

  $('add-site').addEventListener('click', () => addSite($('site-input').value));
  $('site-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite(e.target.value);
  });
}

/* ---------------- 初始化 ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    renderUI(settings);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        settings.mode = mode;
        updateSetting('mode', mode);
        renderUI(settings);
      });
    });

    sliders.forEach(key => {
      const input = document.getElementById(key);
      const label = document.getElementById(`${key}-val`);

      input.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        label.textContent = `${val}%`;
        settings[key] = val;
        updateSetting(key, val);
      });
    });
  });

  initSites();
});
