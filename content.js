// Prevent duplicate injection
if (!window.__articleCheckerLoaded) {
  window.__articleCheckerLoaded = true;

  // ── Overlay ──────────────────────────────────────────────────

  let overlayEl = null;

  function ensureOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'ac-overlay';
    overlayEl.innerHTML = `
      <div id="ac-card">
        <div id="ac-spinner"></div>
        <p id="ac-msg">AI 分析中，請稍候⋯</p>
      </div>`;
    document.body.appendChild(overlayEl);
  }

  function showOverlay() {
    ensureOverlay();
    // Reset to loading state
    document.getElementById('ac-spinner').style.display = 'block';
    document.getElementById('ac-msg').innerHTML = 'AI 分析中，請稍候⋯';
    overlayEl.dataset.state = 'loading';
    overlayEl.style.display = 'flex';
  }

  function showOverlayError(msg) {
    ensureOverlay();
    overlayEl.dataset.state = 'error';
    document.getElementById('ac-spinner').style.display = 'none';
    document.getElementById('ac-msg').innerHTML =
      `<strong style="color:#d93025;font-size:1.1em;">⚠ 分析失敗</strong>
       <span id="ac-err-detail">${msg}</span>
       <button id="ac-close-btn">關閉</button>`;
    document.getElementById('ac-close-btn').onclick = hideOverlay;
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.style.display = 'none';
  }

  // ── Selection Mode ────────────────────────────────────────────

  let selectionMode = false;
  let hoveredEl = null;

  function mouseOverHandler(e) {
    if (!selectionMode) return;
    e.stopPropagation();
    if (hoveredEl) hoveredEl.classList.remove('ac-hover');
    hoveredEl = e.target;
    hoveredEl.classList.add('ac-hover');
  }

  function mouseOutHandler(e) {
    if (!selectionMode) return;
    if (hoveredEl) hoveredEl.classList.remove('ac-hover');
    hoveredEl = null;
  }

  // ── Block splitting (DOM-based) ───────────────────────────────

  const BLOCK_TAGS = new Set([
    'H1','H2','H3','H4','H5','H6',
    'P','UL','OL','TABLE','FIGURE','BLOCKQUOTE',
    'SECTION','ARTICLE','HEADER','FOOTER','NAV','ASIDE','PRE','HR','DIV'
  ]);

  function compressHtml(html) {
    return html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/> </g, '><')
      .trim();
  }

  function splitElementIntoBlocks(el) {
    const children = Array.from(el.children).filter(c => BLOCK_TAGS.has(c.tagName));
    if (children.length > 1) {
      return children.map((child, i) => ({ i, c: compressHtml(child.outerHTML) }));
    }
    // Single block or inline content
    return [{ i: 0, c: compressHtml(el.outerHTML) }];
  }

  function buildHeadingMap(el) {
    return Array.from(el.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
      t: h.tagName.toLowerCase(),
      x: h.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
    })).filter(h => h.x);
  }

  function clickHandler(e) {
    if (!selectionMode) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    stopSelectionMode();
    const blocks = splitElementIntoBlocks(target);
    const headingMap = buildHeadingMap(target);
    chrome.runtime.sendMessage({ action: 'analyzeContent', blocks, headingMap });
  }

  function stopSelectionMode() {
    selectionMode = false;
    document.body.style.cursor = '';
    if (hoveredEl) { hoveredEl.classList.remove('ac-hover'); hoveredEl = null; }
    document.removeEventListener('mouseover', mouseOverHandler, true);
    document.removeEventListener('mouseout', mouseOutHandler, true);
    document.removeEventListener('click', clickHandler, true);
    const toast = document.getElementById('ac-toast');
    if (toast) toast.remove();
  }

  function startSelectionMode() {
    if (selectionMode) return;
    selectionMode = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', mouseOverHandler, true);
    document.addEventListener('mouseout', mouseOutHandler, true);
    document.addEventListener('click', clickHandler, true);

    const toast = document.createElement('div');
    toast.id = 'ac-toast';
    toast.textContent = '點擊要分析的元素，ESC 取消';
    toast.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'background:#333', 'color:#fff', 'padding:10px 20px', 'border-radius:20px',
      'z-index:2147483646', 'font-family:sans-serif', 'font-size:14px',
      'pointer-events:none', 'box-shadow:0 4px 12px rgba(0,0,0,.3)'
    ].join(';');
    document.body.appendChild(toast);

    const keydownHandler = (e) => {
      if (e.key === 'Escape') {
        stopSelectionMode();
        document.removeEventListener('keydown', keydownHandler);
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }

  // ── Message Listener ──────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startSelection') {
      startSelectionMode();
      sendResponse({ status: 'started' });
    } else if (request.action === 'showOverlay') {
      showOverlay();
      sendResponse({ status: 'ok' });
    } else if (request.action === 'showError') {
      showOverlayError(request.message);
      sendResponse({ status: 'ok' });
    } else if (request.action === 'hideOverlay') {
      hideOverlay();
      sendResponse({ status: 'ok' });
    }
    return true;
  });
}
