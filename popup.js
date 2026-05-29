document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const thinkingLevelSelect = document.getElementById('thinking-level');
  const languageInput = document.getElementById('language');
  const selectPageBtn = document.getElementById('btn-select-page');
  const fileInput = document.getElementById('file-input');
  const statusDiv = document.getElementById('status');

  // Load settings
  chrome.storage.local.get(['apiKey', 'model', 'thinkingLevel', 'language', 'resultMode'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.model) modelSelect.value = result.model;
    if (result.thinkingLevel) thinkingLevelSelect.value = result.thinkingLevel;
    if (result.language) languageInput.value = result.language;
    if (result.resultMode) document.getElementById('result-mode').value = result.resultMode;
  });

  // Save settings on change
  const saveSettings = () => {
    chrome.storage.local.set({
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      thinkingLevel: thinkingLevelSelect.value,
      language: languageInput.value.trim(),
      resultMode: document.getElementById('result-mode').value
    });
  };

  apiKeyInput.addEventListener('change', saveSettings);
  modelSelect.addEventListener('change', saveSettings);
  thinkingLevelSelect.addEventListener('change', saveSettings);
  languageInput.addEventListener('change', saveSettings);
  document.getElementById('result-mode').addEventListener('change', saveSettings);

  const checkSettings = () => {
    if (!apiKeyInput.value.trim()) {
      statusDiv.textContent = 'Please enter your Gemini API Key.';
      return false;
    }
    statusDiv.textContent = '';
    return true;
  };

  // ── Select Page Element ───────────────────────────────────────

  selectPageBtn.addEventListener('click', async () => {
    if (!checkSettings()) return;
    saveSettings();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.url.startsWith('chrome://')) {
      statusDiv.textContent = 'Cannot select element on this page.';
      return;
    }

    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }, () => window.close());
    } catch (error) {
      console.error(error);
      statusDiv.textContent = 'Error injecting script: ' + error.message;
    }
  });

  // ── Block splitting helpers ───────────────────────────────────

  const BLOCK_TAGS = new Set([
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'P', 'UL', 'OL', 'TABLE', 'FIGURE', 'BLOCKQUOTE',
    'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'PRE', 'HR', 'DIV'
  ]);

  function compressHtml(html) {
    return html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/> </g, '><')
      .trim();
  }

  // ── Upload-only preprocessing ─────────────────────────────────

  const KEEP_ATTRS = new Set(['alt', 'href', 'src', 'colspan', 'rowspan', 'lang', 'datetime']);

  function preprocessUploadHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('*').forEach(el => {
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (src.startsWith('data:')) el.removeAttribute('src');
      }
      Array.from(el.attributes).forEach(attr => {
        if (!KEEP_ATTRS.has(attr.name) && !attr.name.startsWith('aria-')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  function isEmptyBlock(c) {
    return c.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, '').trim().length === 0;
  }

  function splitContentIntoBlocks(contentText, isUpload = false) {
    const isHtml = /<[a-z]/i.test(contentText);
    if (!isHtml) {
      return contentText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
        .map((c, i) => ({ i, c }));
    }
    const processed = isUpload ? preprocessUploadHtml(contentText) : contentText;
    const tmp = document.createElement('div');
    tmp.innerHTML = processed;
    const children = Array.from(tmp.children).filter(c => BLOCK_TAGS.has(c.tagName));
    if (children.length > 1) {
      const grouped = [];
      let currentGroup = [];
      let currentLength = 0;
      
      for (const child of children) {
        const childHtml = compressHtml(child.outerHTML);
        if (isUpload && isEmptyBlock(childHtml)) continue;
        
        const childLen = childHtml.length;
        if (currentGroup.length > 0 && (currentLength + childLen > 800 || currentGroup.length >= 4)) {
           grouped.push(currentGroup.join(''));
           currentGroup = [];
           currentLength = 0;
        }
        currentGroup.push(childHtml);
        currentLength += childLen;
      }
      
      if (currentGroup.length > 0) grouped.push(currentGroup.join(''));
      return grouped.map((c, i) => ({ i, c }));
    }
    return [{ i: 0, c: compressHtml(tmp.innerHTML || contentText) }];
  }

  function buildHeadingMap(contentText) {
    const isHtml = /<[a-z]/i.test(contentText);
    if (!isHtml) return [];
    const tmp = document.createElement('div');
    tmp.innerHTML = contentText;
    return Array.from(tmp.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
      t: h.tagName.toLowerCase(),
      x: h.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
    })).filter(h => h.x);
  }

  // ── File Upload Handler ───────────────────────────────────────

  fileInput.addEventListener('change', async (e) => {
    if (!checkSettings()) return;
    const file = e.target.files[0];
    if (!file) return;

    saveSettings();
    statusDiv.textContent = 'Processing file...';

    try {
      let contentText = '';

      if (file.name.endsWith('.txt')) {
        contentText = await file.text();
      } else if (file.name.endsWith('.docx')) {
        if (typeof mammoth === 'undefined') throw new Error('mammoth.js not loaded properly.');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        contentText = result.value;
      } else {
        statusDiv.textContent = 'Unsupported file type.';
        return;
      }

      if (!contentText.trim()) {
        statusDiv.textContent = 'File is empty.';
        return;
      }

      const blocks = splitContentIntoBlocks(contentText, true);
      const headingMap = buildHeadingMap(contentText);
      chrome.runtime.sendMessage({ action: 'analyzeContent', blocks, headingMap });
      window.close();

    } catch (error) {
      console.error(error);
      statusDiv.textContent = 'Error processing file: ' + error.message;
    }
  });
});
