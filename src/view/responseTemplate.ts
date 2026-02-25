import type { AxiosResponse } from 'axios';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function stringifyResponseBody(data: unknown): string {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return data;
      }
    }
    return data;
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function buildResponseHtml(
  response: AxiosResponse,
  durationMs: number,
  responseSizeBytes: number,
  resolvedUrl: string
): string {
  const responseHeaders = escapeHtml(JSON.stringify(response.headers, null, 2));
  const responseBodyRaw = typeof response.data === 'string' ? response.data : stringifyResponseBody(response.data);
  const responseBodyPretty = stringifyResponseBody(response.data);
  const responseBodyRawEscaped = escapeHtml(responseBodyRaw);
  const responseBodyPrettyEscaped = escapeHtml(responseBodyPretty);
  const isJsonLikeResponse = responseBodyRaw !== responseBodyPretty;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>响应结果</title>
  <style>
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .meta { display: flex; gap: 14px; font-size: 13px; margin-bottom: 8px; align-items: center; }
    .meta strong { font-size: 14px; }
    .url { margin-bottom: 10px; font-size: 12px; color: #666; word-break: break-all; }
    .tabs { display: flex; border-bottom: 1px solid #d9d9d9; }
    .tab { padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .panel { display: none; margin-top: 10px; }
    .panel.active { display: block; }
    .toolbar { margin-top: 10px; margin-bottom: 8px; display: flex; gap: 8px; align-items: center; }
    .hint { font-size: 12px; color: #666; }
    .btn { border: 1px solid #d0d0d0; background: #ffffff; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 13px; }
    .response-body-wrap { position: relative; }
    .search-widget {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      width: min(420px, calc(100% - 16px));
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px;
      border: 1px solid var(--vscode-editorWidget-border, #d0d7de);
      border-radius: 4px;
      background: var(--vscode-editorWidget-background, #ffffff);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    }
    .search-widget.hidden { display: none; }
    .search-input {
      flex: 1;
      min-width: 0;
      height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, #cfcfcf);
      border-radius: 3px;
      background: var(--vscode-input-background, #ffffff);
      color: var(--vscode-input-foreground, #1f2328);
      font-size: 13px;
    }
    .search-btn-group { display: inline-flex; border: 1px solid #d0d0d0; border-radius: 3px; overflow: hidden; }
    .search-btn { border: 0; border-right: 1px solid #d0d0d0; border-radius: 0; min-width: 30px; padding: 4px 8px; }
    .search-btn:last-child { border-right: 0; }
    .search-status { min-width: 56px; text-align: right; font-size: 12px; color: #666; }
    .search-close { min-width: 28px; font-weight: 700; }
    pre { margin: 0; padding: 10px; background: #f7f8fa; color: #1f2328; border: 1px solid #d0d7de; border-radius: 4px; overflow-x: auto; overflow-y: auto; max-height: 64vh; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
    .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); font-weight: 700; }
    .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); font-weight: 500; }
    .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); font-weight: 600; }
    .json-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); font-weight: 700; }
    .json-null { color: var(--vscode-debugTokenExpression-value, #c586c0); font-style: normal; font-weight: 700; }
    .find-hit { background: rgba(255, 215, 0, 0.38); border-radius: 2px; }
    .find-hit.active { background: rgba(255, 149, 0, 0.55); outline: 1px solid rgba(255, 149, 0, 0.9); }
  </style>
</head>
<body>
  <div class="meta">
    <strong>Status: ${response.status} ${escapeHtml(response.statusText || '')}</strong>
    <span>Time: ${durationMs} ms</span>
    <span>Size: ${responseSizeBytes} B</span>
  </div>
  <div class="url">${escapeHtml(resolvedUrl)}</div>

  <div class="tabs">
    <div class="tab active" data-tab="body">Body</div>
    <div class="tab" data-tab="headers">Headers</div>
  </div>

  <section id="panel-body" class="panel active">
    <div class="toolbar">
      <button class="btn" id="copyBodyBtn" type="button">Copy Body</button>
      <button class="btn" id="prettyBtn" type="button">Pretty</button>
      <button class="btn" id="rawBtn" type="button">Raw</button>
      <span class="hint" id="formatHint"></span>
    </div>
    <div class="response-body-wrap">
      <div id="searchWidget" class="search-widget hidden">
        <input id="searchInput" class="search-input" type="text" placeholder="查找响应内容">
        <div class="search-btn-group">
          <button class="btn search-btn" id="searchPrevBtn" type="button" aria-label="上一项">↑</button>
          <button class="btn search-btn" id="searchNextBtn" type="button" aria-label="下一项">↓</button>
        </div>
        <span id="searchStatus" class="search-status"></span>
        <button class="btn search-btn search-close" id="searchCloseBtn" type="button" aria-label="关闭查找">×</button>
      </div>
      <pre id="responseBody">${responseBodyPrettyEscaped}</pre>
    </div>
  </section>
  <section id="panel-headers" class="panel">
    <pre>${responseHeaders}</pre>
  </section>

  <script>
    const responseBodyRaw = ${toScriptJson(responseBodyRaw)};
    const responseBodyPretty = ${toScriptJson(responseBodyPretty)};
    const hasPrettyView = ${isJsonLikeResponse ? 'true' : 'false'};
    let bodyViewMode = 'pretty';
    let isSearchVisible = false;
    let currentMatchIndex = -1;
    let matchElements = [];

    function updateSearchStatus(message) {
      const statusEl = document.getElementById('searchStatus');
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message || '';
    }

    function clearHighlights() {
      const bodyEl = document.getElementById('responseBody');
      if (!bodyEl) {
        return;
      }

      bodyEl.querySelectorAll('span.find-hit').forEach((node) => {
        const parent = node.parentNode;
        if (!parent) {
          return;
        }
        parent.replaceChild(document.createTextNode(node.textContent || ''), node);
        parent.normalize();
      });

      matchElements = [];
      currentMatchIndex = -1;
      updateSearchStatus('');
    }

    function walkTextNodes(root) {
      const nodes = [];
      if (!root) {
        return nodes;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        nodes.push(current);
        current = walker.nextNode();
      }
      return nodes;
    }

    function applyHighlights(query) {
      const bodyEl = document.getElementById('responseBody');
      if (!bodyEl) {
        return;
      }
      clearHighlights();
      if (!query) {
        return;
      }

      const textNodes = walkTextNodes(bodyEl);
      textNodes.forEach((textNode) => {
        const text = textNode.textContent || '';
        if (!text) {
          return;
        }

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let from = 0;
        let matchIndex = lowerText.indexOf(lowerQuery, from);
        if (matchIndex === -1) {
          return;
        }

        const fragment = document.createDocumentFragment();
        while (matchIndex !== -1) {
          const before = text.slice(from, matchIndex);
          if (before) {
            fragment.appendChild(document.createTextNode(before));
          }

          const hitEl = document.createElement('span');
          hitEl.className = 'find-hit';
          hitEl.textContent = text.slice(matchIndex, matchIndex + query.length);
          fragment.appendChild(hitEl);
          matchElements.push(hitEl);

          from = matchIndex + query.length;
          matchIndex = lowerText.indexOf(lowerQuery, from);
        }

        const tail = text.slice(from);
        if (tail) {
          fragment.appendChild(document.createTextNode(tail));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
      });

      if (matchElements.length > 0) {
        currentMatchIndex = 0;
        activateCurrentMatch();
      } else {
        updateSearchStatus('0');
      }
    }

    function activateCurrentMatch() {
      if (matchElements.length === 0 || currentMatchIndex < 0) {
        updateSearchStatus('0');
        return;
      }

      matchElements.forEach((node, index) => {
        node.classList.toggle('active', index === currentMatchIndex);
      });

      const current = matchElements[currentMatchIndex];
      const bodyEl = document.getElementById('responseBody');
      current?.scrollIntoView({ block: 'center', inline: 'nearest' });
      bodyEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      updateSearchStatus((currentMatchIndex + 1) + '/' + matchElements.length);
    }

    function jumpMatch(forward) {
      if (matchElements.length === 0) {
        updateSearchStatus('0');
        return;
      }
      currentMatchIndex = forward
        ? (currentMatchIndex + 1) % matchElements.length
        : (currentMatchIndex - 1 + matchElements.length) % matchElements.length;
      activateCurrentMatch();
    }

    function showSearchWidget() {
      const widgetEl = document.getElementById('searchWidget');
      const inputEl = document.getElementById('searchInput');
      if (!widgetEl || !inputEl) {
        return;
      }
      isSearchVisible = true;
      widgetEl.classList.remove('hidden');
      inputEl.focus();
      inputEl.select();
    }

    function hideSearchWidget() {
      const widgetEl = document.getElementById('searchWidget');
      if (!widgetEl) {
        return;
      }
      isSearchVisible = false;
      widgetEl.classList.add('hidden');
      clearHighlights();
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tabs .tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('panel-' + tabName));
      });
    }

    function updateBodyView() {
      const bodyEl = document.getElementById('responseBody');
      const copyBtn = document.getElementById('copyBodyBtn');
      const prettyBtn = document.getElementById('prettyBtn');
      const rawBtn = document.getElementById('rawBtn');
      const formatHint = document.getElementById('formatHint');
      const searchInputEl = document.getElementById('searchInput');
      if (!bodyEl || !copyBtn || !prettyBtn || !rawBtn || !formatHint) {
        return;
      }

      const usePretty = hasPrettyView && bodyViewMode === 'pretty';
      const selectedText = usePretty ? responseBodyPretty : responseBodyRaw;
      if (hasPrettyView) {
        bodyEl.innerHTML = highlightJsonText(selectedText);
      } else {
        bodyEl.textContent = selectedText;
      }

      copyBtn.disabled = !responseBodyRaw;
      prettyBtn.disabled = !hasPrettyView || bodyViewMode === 'pretty';
      rawBtn.disabled = !hasPrettyView || bodyViewMode === 'raw';
      formatHint.textContent = hasPrettyView ? 'JSON 响应，支持 Pretty/Raw 视图' : '非 JSON 响应';

      if (isSearchVisible) {
        applyHighlights(searchInputEl?.value || '');
      } else {
        clearHighlights();
      }
    }

    function escapeHtmlForDisplay(input) {
      return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function highlightJsonText(text) {
      const escaped = escapeHtmlForDisplay(text);
      return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*"\\s*:?|\\btrue\\b|\\bfalse\\b|\\bnull\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+\\-]?\\d+)?)/g, (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return '<span class="json-key">' + match + '</span>';
          }
          return '<span class="json-string">' + match + '</span>';
        }
        if (/true|false/.test(match)) {
          return '<span class="json-boolean">' + match + '</span>';
        }
        if (/null/.test(match)) {
          return '<span class="json-null">' + match + '</span>';
        }
        return '<span class="json-number">' + match + '</span>';
      });
    }

    async function copyText(text) {
      if (!text) {
        return;
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    document.querySelectorAll('.tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    const prettyBtn = document.getElementById('prettyBtn');
    const rawBtn = document.getElementById('rawBtn');
    const copyBtn = document.getElementById('copyBodyBtn');
    const searchInputEl = document.getElementById('searchInput');
    const searchPrevBtn = document.getElementById('searchPrevBtn');
    const searchNextBtn = document.getElementById('searchNextBtn');
    const searchCloseBtn = document.getElementById('searchCloseBtn');

    prettyBtn?.addEventListener('click', () => {
      bodyViewMode = 'pretty';
      updateBodyView();
    });

    rawBtn?.addEventListener('click', () => {
      bodyViewMode = 'raw';
      updateBodyView();
    });

    copyBtn?.addEventListener('click', async () => {
      const text = hasPrettyView && bodyViewMode === 'pretty' ? responseBodyPretty : responseBodyRaw;
      try {
        await copyText(text);
        formatHint.textContent = 'Body 已复制到剪贴板';
      } catch {
        formatHint.textContent = '复制失败，请手动选择内容';
      }
    });

    searchInputEl?.addEventListener('input', () => {
      applyHighlights(searchInputEl.value || '');
    });
    searchInputEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        jumpMatch(!event.shiftKey);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideSearchWidget();
      }
    });
    searchPrevBtn?.addEventListener('click', () => jumpMatch(false));
    searchNextBtn?.addEventListener('click', () => jumpMatch(true));
    searchCloseBtn?.addEventListener('click', hideSearchWidget);

    document.addEventListener('keydown', (event) => {
      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) {
        event.preventDefault();
        showSearchWidget();
        return;
      }
      if (event.key === 'Escape' && isSearchVisible) {
        event.preventDefault();
        hideSearchWidget();
      }
    });

    updateBodyView();
  </script>
</body>
</html>
  `;
}
