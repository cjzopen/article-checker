const FLASH_SYSTEM_PROMPT = `你是專業文章與網頁內容優化專家。輸入格式為一個JSON物件：
{"h":[{"t":"h2","x":"標題文字"},...], "b":[{"i":0,"c":"區塊內容"},{"i":1,"c":"..."},...]}
其中h為全文標題清單，b為需處理的文章區塊。
對每個區塊執行以下逐塊任務：
1. 基本校對：修正錯字、贅字、全形/半形標點符號統一，並消除「過度的動詞名詞化」。中英文之間有無空格不需要特別處理。
2. 語意化HTML：
   - 如果原文沒有HTML標籤，請自動加上適當的語意化HTML標籤（如p,h2,ul,li,strong,table,figure,img,blockquote,cite等）。
   - 參考h清單檢查h標籤是否濫用與層級是否正確，並替換為正確的語意標籤。
   - 不需要換行符號"\n"。

輸出規則：
- [重要] 所有回傳的修改內容，必須被標準的語意化 HTML 標籤（如 <p>, <h2> 等）完整包覆。嚴禁回傳裸露、無標籤包裹的純文字！
- 只回傳一個JSON物件，不加任何Markdown標記。
- 格式：{"c":[...]} (c陣列中只包含「需要修改」的區塊，不需修改請省略)
- c的每個元素格式：{"i":區塊索引,"m":"修改後內容"}
`;

const PRO_SYSTEM_PROMPT_BLOCKS = `你是專業文章與網頁內容優化專家。輸入格式為一個JSON物件：
{"h":[{"t":"h2","x":"標題文字"},...], "b":[{"i":0,"c":"區塊內容"},{"i":1,"c":"..."},...]}
其中h為全文標題清單，b為需處理的文章區塊。

這是最後階段的進階分析，對每個區塊執行以下任務：
1. AI搜尋引擎友善度：
   - 資訊密度：將行銷廢話轉為具體的數據或事實。
   - 語義三元組：確保句子結構符合「主體→謂語→對象」，讓資訊易於被AI提取。
   - 獨立性：嚴禁使用模糊代名詞（如「它」、「這」），必須明確寫出主體。
   - 倒金字塔結構：如果內容夠長，請將重點放在前面，後續佐以細節，並善用清單或表格呈現數據。[重要] 若將內容「垂直換行」分項擴寫，請務必使用標準 HTML 標籤（如 <ul>, <ol>, <li>，或 <h3>、<details>），嚴禁以純文字破折號「-」或「1.」做換行假條列。但若是在單一 <p> 結構內部「行內羅列」（例如句子中提到 1... 2... 3...），則只需自然陳述，無需強制轉為清單標籤。
2. 術語一致性：找出同一概念使用不同名稱的情況，統一為最常出現或最專業的稱呼。注意：若該名詞前文已出現過括號縮寫（如 品質管制(QC) 或 縮寫 (QA)），後續出現時請直接使用縮寫，勿反覆展開全稱以避免冗餘。
3. 邏輯與事實查核：
   - 找出前後矛盾或明顯自誇、缺乏佐證的語句，改為有資料或事實支撐的描述，或刪除。

輸出規則：
- [重要] 所有回傳的修改內容，必須被標準的語意化 HTML 標籤（如 <p>, <h2>, <ul>）完整包覆。嚴禁回傳裸露、無標籤包裹的純文字
- 只回傳一個JSON物件，不加任何Markdown標記。
- 格式：{"c":[...]} (c陣列中只包含「需進階修改」的區塊，不需修改請省略)
- c的每個元素格式：{"i":區塊索引,"m":"修改後內容"}
`;

const PRO_SYSTEM_PROMPT_GLOBAL = `你是專業文章與網頁內容優化專家。輸入為整篇文章的結構化或預備純文字。
請執行以下全文層級任務：
1. 主題缺口（gaps）：列出文章完全沒有涵蓋、但讀者很可能會想知道的問題。每條為一個完整問題句，不超過40字。列出3~8條。
2. 文章描述建議（desc）：寫出3條吸引人的文章摘要描述。如果有指定語言，請以該語言輸出，否則預設繁體中文。中文版本不超過80字，英文不超過160字元。

輸出規則：
- 只回傳一個JSON物件，不加任何Markdown標記。
- 格式：{"gaps":["..."],"desc":["..."]}
`;

const PRO_SYSTEM_PROMPT_SUGGEST = `你是專業文章與網頁內容優化專家。輸入為整篇文章的預備純文字。
請執行以下全文級別的分析與文字建議任務：
1. 整體文章advice：針對全文提出純文字點評與修改建議。請涵蓋：
   - 基本校對：錯字、贅字、全/半形標點不統一、過度「動詞名詞化」。（中英文之間有無空格不用處理）
   - 術語一致性：同一概念是否統一稱呼。
   - 邏輯與事實查核：有無前後矛盾、缺乏佐證或自我吹噓。
   - 低階爬蟲友善度：是否具備足夠資訊密度、語義三元組、避免模糊代名詞、倒金字塔結構與可提取性。
   (盡量把所有問題都列出來，相同的問題發生多次也盡量完整地合併列出，條列產出 3~12 條具體建議)
2. 主題缺口（gaps）：列出文章完全沒有涵蓋、但讀者可能想知道的問題。每條為一問句，不超過40字。列出3~8條。
3. 文章描述建議（desc）：寫出3條吸引人的文章摘要描述。中文不超過80字。

輸出規則：
- 只回傳一個JSON物件，不加任何Markdown標記。
- 格式：{"advice":["..."],"gaps":["..."],"desc":["..."]}
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

async function callGeminiAPI(apiKey, model, thinkingLevel, systemPrompt, userText, maxRetries = 3) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingLevel: thinkingLevel
            }
          }
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 && attempt < maxRetries) {
          // Rate limit hit (429), wait and retry
          await new Promise(r => setTimeout(r, 3000 * attempt));
          continue;
        }
        if (response.status >= 500 && attempt < maxRetries) {
          // Server error (503/500), wait and retry
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`API 錯誤 ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      let outputText = '';
      const parts = data.candidates[0].content.parts || [];
      
      for (const p of parts) {
        if (p.thought) continue;
        outputText += p.text || '';
      }

      if (!outputText.trim()) outputText = parts.map(p => p.text).join('\n');
      outputText = outputText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      outputText = outputText.replace(/^```json/mg, '').replace(/^```/mg, '').trim();

      // JSON parsing 
      let startIdx = outputText.indexOf('{');
      if (startIdx === -1) throw new Error('無法找到 JSON 大括號。');
      
      let depth = 0, inString = false, escape = false, endIdx = -1;
      for (let i = startIdx; i < outputText.length; i++) {
          const char = outputText[i];
          if (inString) {
              if (escape) escape = false;
              else if (char === '\\') escape = true;
              else if (char === '"') inString = false;
          } else {
              if (char === '"') inString = true;
              else if (char === '{') depth++;
              else if (char === '}') {
                  depth--;
                  if (depth === 0) {
                      endIdx = i;
                      break;
                  }
              }
          }
      }
      
      if (endIdx === -1) throw new Error('物件沒有閉合。');
      return JSON.parse(outputText.substring(startIdx, endIdx + 1));

    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') {
         lastError = new Error('API 請求超時 (60 秒沒回傳)，請稍後再試或減少區塊大小。');
      }
      // If it's a JSON parse error, don't necessarily retry because prompt output might just be consistently bad, but we can try once.
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

async function runAnalysis({ blocks, headingMap }, tabId) {
  const settings = await chrome.storage.local.get(['apiKey', 'model', 'thinkingLevel', 'language', 'resultMode']);

  if (!settings.apiKey) {
    await chrome.tabs.sendMessage(tabId, { action: 'showError', message: 'API Key 未設定，請在擴充功能彈出視窗中輸入 Gemini API Key。' });
    return;
  }

  const sendBlocks = blocks.filter(b => !shouldSkipBlock(b));
  await chrome.storage.local.set({ originalBlocks: blocks });

  // Increase chunk size to 15 blocks (reduces frequency of API requests to avoid rate-limits)
  const CHUNK_SIZE = 15;
  const chunks = [];
  for (let i = 0; i < sendBlocks.length; i += CHUNK_SIZE) {
    chunks.push(sendBlocks.slice(i, i + CHUNK_SIZE));
  }

  const langNote = settings.language ? `請以 ${settings.language} 輸出並優化。` : '';
  const isDirectMode = settings.resultMode === 'direct';
  const isSuggestMode = settings.resultMode === 'suggest';
  const skipBlockAnalysis = isDirectMode || isSuggestMode;
  const totalStages = skipBlockAnalysis ? 1 : chunks.length * 2 + 1; // Flash chunks + Pro chunks + Global
  let completedStages = 0;

  function announceProgress(stageName) {
    completedStages++;
    const pct = Math.floor((completedStages / totalStages) * 100);
    chrome.tabs.sendMessage(tabId, {
      action: 'updateProgress', 
      percentage: pct,
      message: `${stageName} (${completedStages}/${totalStages})`
    }).catch(() => {});
  }

  try {
    const apiModelPro = settings.model || 'gemini-3.1-pro-preview';
    const thinkPro = settings.thinkingLevel || 'low';
    const apiModelFlash = 'gemini-3-flash-preview'; // Updated to your preferred flash mode

    const proModelNameDisplay = apiModelPro.includes('flash') ? "進階分析 (Flash)" : "進階分析 (Pro)";

    let flashModifiedBlocks = [];
    let finalAiMap = new Map();
    let flashChangedSet = new Set();
    let proChangedSet = new Set();

    if (!skipBlockAnalysis) {
      // 1. First Pass: Flash (HTML & Typo)
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const payload = { h: headingMap, b: chunk };
        const userText = langNote + JSON.stringify(payload);
        
        const result = await callGeminiAPI(settings.apiKey, apiModelFlash, 'low', FLASH_SYSTEM_PROMPT, userText);
        const changes = Array.isArray(result) ? result : (result.c || []);
        
        const flashAiMap = new Map(changes.map(r => [r.i, r.m]));
        changes.forEach(r => flashChangedSet.add(r.i));
        flashModifiedBlocks.push(...chunk.map(b => ({
          i: b.i,
          c: flashAiMap.has(b.i) ? flashAiMap.get(b.i) : b.c
        })));
        announceProgress(`初階校對 (Flash) - 區段 ${i + 1}/${chunks.length}`);
        
        await new Promise(r => setTimeout(r, 600));
      }

      // Prepare Flash modified chunks for Pro
      const flashChunks = [];
      for (let i = 0; i < flashModifiedBlocks.length; i += CHUNK_SIZE) {
        flashChunks.push(flashModifiedBlocks.slice(i, i + CHUNK_SIZE));
      }

      // 2. Second Pass: Pro/User Model (AI SEO & Density)
      for (let i = 0; i < flashChunks.length; i++) {
        const chunk = flashChunks[i];
        const payload = { h: headingMap, b: chunk };
        const userText = langNote + JSON.stringify(payload);
        
        const result = await callGeminiAPI(settings.apiKey, apiModelPro, thinkPro, PRO_SYSTEM_PROMPT_BLOCKS, userText);
        const changes = Array.isArray(result) ? result : (result.c || []);
        
        const proAiMap = new Map(changes.map(r => [r.i, r.m]));
        changes.forEach(r => proChangedSet.add(r.i));
        chunk.forEach(b => {
          const finalContent = proAiMap.has(b.i) ? proAiMap.get(b.i) : b.c;
          finalAiMap.set(b.i, finalContent);
        });
        announceProgress(`${proModelNameDisplay} - 區段 ${i + 1}/${chunks.length}`);
        
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // 3. Global Task: Pro (Gaps & Desc, or Suggest Advice)
    // Send only text content to minimize token payload
    const srcBlocksForGlobal = skipBlockAnalysis ? sendBlocks : flashModifiedBlocks;
    const fullTextContent = srcBlocksForGlobal.map(b => b.c.replace(/<[^>]*>?/gm, '')).join('\n');
    const globalPrompt = isSuggestMode ? PRO_SYSTEM_PROMPT_SUGGEST : PRO_SYSTEM_PROMPT_GLOBAL;
    const globalResult = await callGeminiAPI(settings.apiKey, apiModelPro, thinkPro, globalPrompt, langNote + fullTextContent);
    announceProgress(`全文彙整...`);

    const advice = globalResult.advice || [];
    const gaps = globalResult.gaps || [];
    const desc = globalResult.desc || [];

    // 4. Merge results
    const mergedResult = blocks.map(block => {
      // If the block wasn't in sendBlocks (e.g. skipped), finalAiMap won't have it
      if (!finalAiMap.has(block.i)) {
        return {
          original: block.c,
          modified: block.c,
          changed: false,
          explanation: ''
        };
      }
      
      const modifiedContent = finalAiMap.get(block.i);
      const isChanged = modifiedContent !== block.c;
      
      let expText = '';
      if (isChanged && !skipBlockAnalysis) {
        const byFlash = flashChangedSet.has(block.i);
        const byPro = proChangedSet.has(block.i);
        if (byFlash && byPro) expText = '全面改寫 (校對與規則優化)';
        else if (byFlash) expText = '基本校對 (錯字、標點或HTML)';
        else if (byPro) expText = '內容改寫 (爬蟲友善或邏輯優化)';
      }

      return {
        original: block.c,
        modified: modifiedContent,
        changed: isChanged,
        explanation: expText
      };
    });

    await chrome.storage.local.set({ 
      currentAnalysis: skipBlockAnalysis ? [] : mergedResult, 
      analysisAdvice: advice,
      analysisGaps: gaps, 
      analysisDesc: desc,
      resultMode: settings.resultMode
    });
    await chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' });
    chrome.tabs.create({ url: 'result.html' });

  } catch (error) {
    console.error('Analysis error:', error);
    chrome.tabs.sendMessage(tabId, { action: 'showError', message: error.message }).catch(() => {});
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
