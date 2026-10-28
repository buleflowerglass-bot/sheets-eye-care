// 背景脚本与弹窗共用的工具函数
const CUSTOM_SITES_KEY = 'customSites';

// 把用户输入（网址或域名）规范化为主域名，如 https://www.foo.com/a?b → foo.com
function normalizeHost(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes('.') && host !== 'localhost') return null;
  return host;
}

function isIpOrLocal(host) {
  return host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

// 域名 → 匹配规则（同时覆盖所有子域名，http 与 https）
function hostToPatterns(host) {
  const patterns = [];
  for (const scheme of ['https', 'http']) {
    patterns.push(`${scheme}://${host}/*`);
    if (!isIpOrLocal(host)) patterns.push(`${scheme}://*.${host}/*`);
  }
  return patterns;
}

function hostMatches(host, site) {
  return host === site || host.endsWith('.' + site);
}
