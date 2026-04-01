/* background.js */

const SYSTEM_PROMPT = `你是專業文章與網頁內容優化專家。輸入格式為一個JSON物件：
{"h":[{"t":"h2","x":"標題文字"},...], "b":[{"i":0,"c":"區塊內容"},{"i":1,"c":"..."},...]
其中h為全文標題清單（供判斷h1~h6層級），b為文章區塊陣列。

對每個區塊執行以下逐塊任務：
1. 基本校對：修正錯字、贅字、全形/半形標點符號統一，並消除「過度的動詞名詞化」。中英文之間有無空格不需要特別處理。
2. 語意化HTML：
   - 如果原文沒有HTML標籤，請自動加上適當的語意化HTML標籤（如p,h2,ul,li,strong,table,figure,img,blockquote,cite等）。
   - 如果原文已經有HTML標籤，請參考h清單檢查h1~h6標籤是否濫用與層級是否正確，並替換為正確的語意標籤。
3. 閱讀器模式：
   - 閱讀器會忽略ul和ol標籤，不影響正常閱讀，不需處理，只需告知最好補足說明文字。
   - 閱讀器會忽略圖片，不需處理，只需告知要確保無圖片的閱讀體驗。
4. AI搜尋引擎友善度：
   - 資訊密度：將行銷廢話轉為具體的數據或事實。
   - 語義三元組：確保句子結構符合「主體→謂語→對象」，讓資訊易於被AI提取。
   - 獨立性：嚴禁使用模糊代名詞（如「它」、「這」），必須明確寫出主體。
   - 倒金字塔結構：如果內容夠長，請將重點放在前面，後續佐以細節，並善用清單或表格呈現數據。
5. 長句可讀性：如果段落中有難以閱讀的長句（單句超過50字），請拆分為多個句子或段落（多個<p>），或簡化句子結構。
6. 術語一致性：參考所有區塊，找出同一概念使用不同名稱的情況（如「SEO」與「搜尋引擎優化」混用），統一為最常出現或最專業的稱呼，並在explanation中說明統一方向。
7. 邏輯與事實查核：
   - 找出前後矛盾或邏輯漏洞，在修改版本中修正或標注。
   - 找出明顯自誇、缺乏佐證的語句（如「業界最強」、「獨一無二」），在修改版本中改為有數據或事實支撐的描述，或刪除。

接著執行以下全文層級任務（結果放在頂層欄位，不修改任何區塊）：
8. 主題缺口（gaps）：列出文章完全沒有涵蓋、但讀者很可能會想知道的問題，供作者參考補充。每條為一個完整問題句，不超過40字。列出3~8條。
9. 文章描述建議（desc）：寫出3條吸引人的文章摘要描述。語言與整篇文章的輸出語言相同（預設繁體中文）。中文版本不超過80字，英文版本不超過160字元。

輸出規則：
- 只回傳一個JSON物件，不加任何Markdown標記或其他文字。
- 格式：{"c":[...],"gaps":[...],"desc":[...]}
- c陣列中只包含「需要修改」的區塊，完全不需修改的區塊請省略（前端會自動補回原文）。
- c的每個元素格式：{"i":區塊索引,"m":"修改後內容","e":"修改說明"}
- gaps為字串陣列，每條為一個問題句。
- desc為字串陣列，共3條，語言與整篇文章的輸出語言相同（預設繁體中文）。
`;

// ── Block utilities ───────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'H1','H2','H3','H4','H5','H6',
  'P','UL','OL','TABLE','FIGURE','BLOCKQUOTE',
  'SECTION','ARTICLE','HEADER','FOOTER','NAV','ASIDE','PRE','HR','DIV'
]);

/** Remove HTML comments and collapse whitespace in an HTML string */
function compressHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')   // strip comments
    .replace(/\s+/g, ' ')              // collapse whitespace
    .replace(/> </g, '><')            // trim gaps between tags
    .trim();
}

/**
 * Split an HTML string into block-level chunks.
 * Works purely on strings (no DOM) — safe for service workers.
 * Strategy: top-level block element boundaries.
 */
function splitHtmlIntoBlocks(html) {
  // Regex to match a complete top-level block element (non-greedy, handles self-closing hr)
  const tagList = 'h[1-6]|p|ul|ol|table|figure|blockquote|section|article|header|footer|nav|aside|pre|div|hr';
  const blockRe = new RegExp(
    `(<(?:${tagList})[^>]*>[\\s\\S]*?</(?:${tagList})>|<hr[^>]*?>)`,
    'gi'
  );

  const blocks = [];
  let lastIndex = 0;
  let match;

  while ((match = blockRe.exec(html)) !== null) {
    // Capture any leading text between previous match and this one
    const gap = html.slice(lastIndex, match.index).trim();
    if (gap) blocks.push(gap);
    blocks.push(match[0]);
    lastIndex = blockRe.lastIndex;
  }

  // Trailing text
  const tail = html.slice(lastIndex).trim();
  if (tail) blocks.push(tail);

  // Fallback: treat entire content as single block
  if (blocks.length === 0) blocks.push(html.trim());

  return blocks.map((c, i) => ({ i, c: compressHtml(c) }));
}

/** Build heading map from HTML string (for global hierarchy check) */
function buildHeadingMap(html) {
  const headingRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const map = [];
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (text) map.push({ t: m[1].toLowerCase(), x: text });
  }
  return map;
}

/** Split plain text into blocks by paragraph breaks */
function splitTextIntoBlocks(text) {
  return text
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((c, i) => ({ i, c }));
}

// ── Pre-filter ───────────────────────────────────────────────

/** Blocks whose root tag is one of these are passed through unchanged without calling AI */
const SKIP_TAG_RE = /^<(iframe|video|pre|img|script|style|canvas|svg|audio|noscript|object|embed|map)\b/i;

function shouldSkipBlock(block) {
  return SKIP_TAG_RE.test(block.c.trim());
}

// ── Main analysis ─────────────────────────────────────────────

async function runAnalysis({ blocks, headingMap }, tabId) {
  const settings = await chrome.storage.local.get(['apiKey', 'model', 'thinkingLevel', 'language']);

  if (!settings.apiKey) {
    await chrome.tabs.sendMessage(tabId, { action: 'showError', message: 'API Key 未設定，請在擴充功能彈出視窗中輸入 Gemini API Key。' });
    return;
  }

  // Pre-filter blocks that don't need AI analysis
  const sendBlocks = blocks.filter(b => !shouldSkipBlock(b));

  // Store originals so result page can reconstruct unchanged blocks
  await chrome.storage.local.set({ originalBlocks: blocks });

  try {
    const apiModel = settings.model || 'gemini-3.1-pro-preview';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${settings.apiKey}`;

    // Build compressed payload (no pretty-print, short keys)
    const langNote = settings.language ? `請以 ${settings.language} 輸出並優化。` : '';
    const payload = { h: headingMap, b: sendBlocks };
    const userText = langNote + JSON.stringify(payload);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: settings.thinkingLevel || 'low'
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    let outputText = data.candidates[0].content.parts[0].text;

    // Strip stray markdown if any
    outputText = outputText.replace(/^```json/mg, '').replace(/^```/mg, '').trim();

    let aiResult;
    try {
      // Extract outermost {...} to tolerate any preamble/postamble text from AI
      const start = outputText.indexOf('{');
      const end = outputText.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        throw new Error('無法在回傳內容中找到 JSON 物件，請重試。');
      }
      aiResult = JSON.parse(outputText.slice(start, end + 1));
    } catch (e) {
      throw new Error('無法解析 Gemini 回傳的 JSON：' + e.message);
    }

    // Support both new {c, gaps, desc} format and legacy bare array
    const changes = Array.isArray(aiResult) ? aiResult : (aiResult.c || []);
    const gaps = Array.isArray(aiResult) ? [] : (aiResult.gaps || []);
    const desc = Array.isArray(aiResult) ? [] : (aiResult.desc || []);

    // Merge AI result with stored originals
    const aiMap = new Map(changes.map(r => [r.i, r]));
    const mergedResult = blocks.map(block => {
      const aiBlock = aiMap.get(block.i);
      if (aiBlock) {
        return {
          original: block.c,
          modified: aiBlock.m,
          changed: true,
          explanation: aiBlock.e || ''
        };
      }
      return {
        original: block.c,
        modified: block.c,
        changed: false,
        explanation: ''
      };
    });

    await chrome.storage.local.set({ currentAnalysis: mergedResult, analysisGaps: gaps, analysisDesc: desc });
    await chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' });
    chrome.tabs.create({ url: 'result.html' });

  } catch (error) {
    console.error('Analysis error:', error);
    chrome.tabs.sendMessage(tabId, { action: 'showError', message: error.message });
  }
}

// ── Overlay injection ─────────────────────────────────────────

async function injectOverlay(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  await new Promise(resolve => setTimeout(resolve, 150));
  await chrome.tabs.sendMessage(tabId, { action: 'showOverlay' });
}

// ── Message handler ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeContent') {
    // Support both pre-split blocks (from content.js/popup.js) and raw content (legacy)
    let analysisPayload;

    if (request.blocks) {
      // New path: blocks already split by sender
      analysisPayload = { blocks: request.blocks, headingMap: request.headingMap || [] };
    } else {
      // Legacy path: raw content string — split here
      const raw = request.content || '';
      const isHtml = /<[a-z]/i.test(raw);
      const blocks = isHtml ? splitHtmlIntoBlocks(raw) : splitTextIntoBlocks(raw);
      const headingMap = isHtml ? buildHeadingMap(raw) : [];
      analysisPayload = { blocks, headingMap };
    }

    if (sender.tab) {
      injectOverlay(sender.tab.id)
        .then(() => runAnalysis(analysisPayload, sender.tab.id))
        .catch(err => console.error('Overlay inject error:', err));
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        const tabId = tabs[0].id;
        injectOverlay(tabId)
          .then(() => runAnalysis(analysisPayload, tabId))
          .catch(err => console.error('Overlay inject error:', err));
      });
    }
  }
});
