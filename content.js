(() => {
  // 防止被重复注入（静态 + 动态 + 手动注入）
  if (window.__gsEyeProtectorLoaded) return;
  window.__gsEyeProtectorLoaded = true;

  const DEFAULT_SETTINGS = {
    mode: 'day',             // 'day' | 'green' | 'night' | 'off'
    dayDim: 20,
    dayWarmth: 35,
    greenIntensity: 70,
    greenDim: 10,
    nightInvert: 88,
    nightBrightness: 92,
    nightContrast: 92
  };

  let overlay = null;
  let disabled = false; // 网站被移除后，在不刷新页面的情况下临时关闭

  function ensureOverlay() {
    if (!overlay) {
      overlay = document.getElementById('gs-eye-protector-overlay');
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'gs-eye-protector-overlay';
      (document.documentElement || document.body).appendChild(overlay);
    }
    return overlay;
  }

  function applySettings(settings) {
    if (disabled) settings = { ...settings, mode: 'off' };
    const el = ensureOverlay();
    const html = document.documentElement;

    if (settings.mode === 'night') {
      el.style.display = 'none';
      html.classList.add('gs-dark-mode-active');
      html.style.setProperty('--gs-dark-invert', (settings.nightInvert / 100).toFixed(2));
      html.style.setProperty('--gs-dark-brightness', (settings.nightBrightness / 100).toFixed(2));
      html.style.setProperty('--gs-dark-contrast', (settings.nightContrast / 100).toFixed(2));

    } else if (settings.mode === 'green') {
      html.classList.remove('gs-dark-mode-active');
      el.style.display = 'block';

      const intensity = settings.greenIntensity / 100;
      const dimFactor = 1 - (settings.greenDim / 100) * 0.45;

      const rBase = 255 - (255 - 199) * intensity;
      const gBase = 255 - (255 - 237) * intensity;
      const bBase = 255 - (255 - 204) * intensity;

      el.style.backgroundColor =
        `rgb(${Math.round(rBase * dimFactor)}, ${Math.round(gBase * dimFactor)}, ${Math.round(bBase * dimFactor)})`;
      el.style.mixBlendMode = 'multiply';

    } else if (settings.mode === 'day') {
      html.classList.remove('gs-dark-mode-active');
      el.style.display = 'block';

      const brightness = 1 - (settings.dayDim / 100) * 0.55;
      const blueFactor = 1 - (settings.dayWarmth / 100) * 0.65;
      const greenFactor = 1 - (settings.dayWarmth / 100) * 0.15;

      el.style.backgroundColor =
        `rgb(${Math.round(255 * brightness)}, ${Math.round(255 * greenFactor * brightness)}, ${Math.round(255 * blueFactor * brightness)})`;
      el.style.mixBlendMode = 'multiply';

    } else {
      html.classList.remove('gs-dark-mode-active');
      el.style.display = 'none';
    }
  }

  function refresh() {
    chrome.storage.local.get(DEFAULT_SETTINGS, applySettings);
  }

  refresh();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') refresh();
  });

  document.addEventListener('DOMContentLoaded', refresh);

  // 弹窗在添加 / 移除当前网站时发来的即时通知
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'gs-eye-enable') {
      disabled = false;
      refresh();
      sendResponse({ ok: true });
    } else if (msg && msg.type === 'gs-eye-disable') {
      disabled = true;
      applySettings({ mode: 'off' });
      sendResponse({ ok: true });
    }
  });
})();
