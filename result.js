document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('diff-container');
  const btnExport = document.getElementById('btn-export');
  const btnToggleView = document.getElementById('btn-toggle-view');
  let isTextMode = false;
  let analysisData = [];
  let analysisAdvice = [];
  let analysisGaps = [];
  let analysisDesc = [];

  // Result tab only opens after analysis is done
  chrome.storage.local.get(['currentAnalysis', 'analysisAdvice', 'analysisGaps', 'analysisDesc', 'resultMode'], (result) => {
    if (result.currentAnalysis && Array.isArray(result.currentAnalysis)) {
      analysisData = result.currentAnalysis.map(item => ({
        ...item,
        status: item.changed === false ? 'unchanged' : 'pending'
      }));
      analysisAdvice = result.analysisAdvice || [];
      analysisGaps = result.analysisGaps || [];
      analysisDesc = result.analysisDesc || [];
      
      container.innerHTML = '';
      if (result.resultMode === 'suggest' || result.resultMode === 'direct') {
        document.querySelector('.header-actions').style.display = 'none';
      } else {
        renderResults();
      }
      
      renderMeta();
    } else {
      container.innerHTML = '<div class="state-card error"><div class="state-icon">✕</div><h2>找不到分析結果</h2><p>請關閉此分頁並重新分析。</p></div>';
    }
  });

  // ── Helpers ──────────────────────────────────────────────────

  function escapeHtml(unsafe) {
    return (unsafe || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Rendering ────────────────────────────────────────────────

  function renderResults() {
    container.innerHTML = '';
    container.style.display = 'flex';

    const summary = document.createElement('div');
    summary.className = 'summary-bar';
    const changedCount = analysisData.filter(i => i.changed !== false).length;
    summary.innerHTML = `共 <strong>${analysisData.length}</strong> 個區塊，其中 <strong>${changedCount}</strong> 個有修改建議。`;
    container.appendChild(summary);

    analysisData.forEach((item) => {
      const blockEl = document.createElement('div');
      blockEl.className = `block ${item.status}`;

      // Header
      const headerEl = document.createElement('div');
      headerEl.className = 'block-header';

      const expEl = document.createElement('p');
      expEl.className = 'explanation';
      if (item.changed === false) {
        expEl.innerHTML = '<span class="tag unchanged-tag">未修改</span>';
      } else {
        const expText = item.explanation ? ` ${escapeHtml(item.explanation)}` : '';
        expEl.innerHTML = `<span class="tag changed-tag">有修改</span>${expText}`;
      }

      const actionsEl = document.createElement('div');
      actionsEl.className = 'actions';

      if (item.changed !== false) {
        if (item.status === 'pending') {
          const btnAccept = document.createElement('button');
          btnAccept.className = 'btn success';
          btnAccept.textContent = 'Accept';
          btnAccept.onclick = () => { item.status = 'accepted'; renderResults(); };

          const btnReject = document.createElement('button');
          btnReject.className = 'btn danger';
          btnReject.textContent = 'Reject';
          btnReject.onclick = () => { item.status = 'rejected'; renderResults(); };

          actionsEl.appendChild(btnAccept);
          actionsEl.appendChild(btnReject);
        } else {
          const statusText = document.createElement('span');
          statusText.style.fontWeight = 'bold';
          statusText.style.color = item.status === 'accepted' ? '#1e8e3e' : '#d93025';
          statusText.textContent = item.status === 'accepted' ? 'Accepted' : 'Rejected';

          const btnUndo = document.createElement('button');
          btnUndo.className = 'btn';
          btnUndo.style.marginLeft = '8px';
          btnUndo.textContent = 'Undo';
          btnUndo.onclick = () => { item.status = 'pending'; renderResults(); };

          actionsEl.appendChild(statusText);
          actionsEl.appendChild(btnUndo);
        }
      }

      headerEl.appendChild(expEl);
      headerEl.appendChild(actionsEl);

      // Split view
      const splitEl = document.createElement('div');
      splitEl.className = 'split-view';

      const origPane = document.createElement('div');
      origPane.className = 'pane original';
      const origLabel = item.status === 'rejected'
        ? '原文 <strong>（使用此版本）</strong>'
        : '原文';
      const origDisplay = document.createElement('div');
      origDisplay.className = 'content-display';
      origDisplay.setAttribute('data-raw', item.original);
      origDisplay.textContent = item.original; // default: source view
      const origH3 = document.createElement('h3');
      origH3.className = 'pane-label';
      origH3.innerHTML = origLabel;
      origPane.appendChild(origH3);
      origPane.appendChild(origDisplay);

      const modPane = document.createElement('div');
      modPane.className = 'pane modified';
      const modLabel = item.status === 'accepted'
        ? '修改後 <strong>（使用此版本）</strong>'
        : '修改後';
      const modDisplay = document.createElement('div');
      modDisplay.className = 'content-display';
      modDisplay.setAttribute('data-raw', item.modified);
      modDisplay.textContent = item.modified; // default: source view
      const modH3 = document.createElement('h3');
      modH3.className = 'pane-label';
      modH3.innerHTML = modLabel;
      modPane.appendChild(modH3);
      modPane.appendChild(modDisplay);
      
      // If already in text mode, render as HTML
      if (isTextMode) {
        origDisplay.innerHTML = item.original;
        modDisplay.innerHTML = item.modified;
      }

      if (item.changed === false) {
        origPane.querySelector('h3').textContent = '原文（無修改）';
        splitEl.appendChild(origPane);
      } else {
        splitEl.appendChild(origPane);
        splitEl.appendChild(modPane);
      }

      blockEl.appendChild(headerEl);
      blockEl.appendChild(splitEl);
      container.appendChild(blockEl);
    });
  }

  // ── Meta sections (gaps + desc) ──────────────────────────────

  function renderMeta() {
    // Remove previous meta if re-rendered
    document.querySelectorAll('.meta-section').forEach(el => el.remove());

    if (analysisAdvice.length > 0) {
      const section = document.createElement('section');
      section.className = 'meta-section';
      section.innerHTML = `<h2>整體文章建議（AI可能對事實誤判，需二次查證）</h2>
        <ol>${analysisAdvice.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ol>`;
      document.querySelector('main').appendChild(section);
    }

    if (analysisGaps.length > 0) {
      const section = document.createElement('section');
      section.className = 'meta-section';
      section.innerHTML = `<h2>💡 主題缺口（供作者參考）</h2>
        <ol>${analysisGaps.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ol>`;
      document.querySelector('main').appendChild(section);
    }

    if (analysisDesc.length > 0) {
      const section = document.createElement('section');
      section.className = 'meta-section';
      const cards = analysisDesc.map((d, index) => {
        const text = escapeHtml(d);
        return `<div class="desc-item" title="點擊複製" data-desc-index="${index}">${text}</div>`;
      }).join('');
      section.innerHTML = `<h2>📝 文章描述建議（點擊複製）</h2>${cards}`;
      
      // Bind click listener safely
      section.querySelectorAll('.desc-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.getAttribute('data-desc-index'), 10);
          const contentToCopy = analysisDesc[idx];
          navigator.clipboard.writeText(contentToCopy).then(() => {
            const originalHtml = el.innerHTML;
            el.innerHTML = '<span style="color:#1a73e8; font-weight:bold;">✅ 已複製！</span>';
            setTimeout(() => { el.innerHTML = originalHtml; }, 1500);
          }).catch(err => console.error('複製失敗', err));
        });
      });
      
      document.querySelector('main').appendChild(section);
    }
  }

  // ── Toggle View ───────────────────────────────────────────────

  btnToggleView.addEventListener('click', () => {
    isTextMode = !isTextMode;
    document.querySelectorAll('.content-display').forEach(el => {
      const rawHtml = el.getAttribute('data-raw');
      if (!rawHtml) return;
      if (isTextMode) {
        el.innerHTML = rawHtml; // render as HTML
      } else {
        el.textContent = rawHtml; // show raw source
      }
    });
    btnToggleView.textContent = isTextMode ? '🏷️ Source Code Mode' : '📝 Text Mode';
  });

  // ── Export ───────────────────────────────────────────────────

  btnExport.addEventListener('click', () => {
    if (analysisData.length === 0) return;

    const hasPending = analysisData.some(i => i.status === 'pending');
    if (hasPending) {
      if (!confirm('您還有未確認 (Pending) 的區塊，未確認的區塊將會使用「原文」。確定要匯出嗎？')) return;
    }

    const finalContent = analysisData
      .map(item => item.status === 'accepted' ? item.modified : item.original)
      .join('\n\n');

    const blob = new Blob([finalContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optimized_article.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
