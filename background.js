importScripts('shared.js');

const SCRIPT_ID = 'gs-eye-custom-sites';
let queue = Promise.resolve();

function enqueue(fn) {
  queue = queue.then(fn).catch((e) => console.warn('护眼助手后台任务失败', e));
  return queue;
}

// 返回已拿到权限的网站匹配规则
async function grantedPatterns() {
  const data = await chrome.storage.local.get({ [CUSTOM_SITES_KEY]: [] });
  const matches = [];
  for (const host of data[CUSTOM_SITES_KEY]) {
    const patterns = hostToPatterns(host);
    if (await chrome.permissions.contains({ origins: patterns })) matches.push(...patterns);
  }
  return matches;
}

// 根据用户保存的网站列表，重新注册动态内容脚本
async function doSync() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch (e) { /* 尚未注册，忽略 */ }

  const matches = await grantedPatterns();
  if (!matches.length) return;

  await chrome.scripting.registerContentScripts([{
    id: SCRIPT_ID,
    matches,
    js: ['content.js'],
    css: ['content.css'],
    runAt: 'document_start',
    persistAcrossSessions: true
  }]);
}

// 让已经打开的匹配标签页立刻生效
async function activateOpenTabs() {
  const matches = await grantedPatterns();
  if (!matches.length) return;
  const tabs = await chrome.tabs.query({ url: matches });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'gs-eye-enable' });
    } catch (e) {
      try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch (err) { /* 受限页面，忽略 */ }
    }
  }
}

chrome.runtime.onInstalled.addListener(() => enqueue(doSync));
chrome.runtime.onStartup.addListener(() => enqueue(doSync));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[CUSTOM_SITES_KEY]) enqueue(doSync);
});

// 授权完成 / 撤销后重新同步
chrome.permissions.onAdded.addListener(() => {
  enqueue(doSync);
  enqueue(activateOpenTabs);
});
chrome.permissions.onRemoved.addListener(() => enqueue(doSync));
