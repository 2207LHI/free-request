    const vscode = acquireVsCodeApi();
    const bootstrapEl = document.getElementById('requestEditorBootstrap');
    let bootstrapData = {};
    try {
      bootstrapData = JSON.parse(bootstrapEl?.textContent || '{}');
    } catch {
      bootstrapData = {};
    }

    const requestId = String(bootstrapData.requestId || '');
    let requestName = String(bootstrapData.requestName || '');
    const collectionPath = String(bootstrapData.collectionPath || '');
    const envGroupOptions = Array.isArray(bootstrapData.envGroupOptions) ? bootstrapData.envGroupOptions : [];
    const envGroupVariableMap = bootstrapData.envGroupVariableMap && typeof bootstrapData.envGroupVariableMap === 'object'
      ? bootstrapData.envGroupVariableMap
      : {};
    const initialEnvGroupId = String(bootstrapData.initialEnvGroupId || '');
    const initialParams = Array.isArray(bootstrapData.initialParams) ? bootstrapData.initialParams : [];
    const initialHeaders = Array.isArray(bootstrapData.initialHeaders) ? bootstrapData.initialHeaders : [];
    const initialRawType = String(bootstrapData.initialRawType || 'json');
    const responseWrapStorageKey = 'freeRequestResponseWrapEnabled';
    let responseBodyRawText = '';
    let responseBodyPrettyText = '';
    let responseBodyIsJson = false;
    let responseBodyViewMode = 'pretty';
    let responseBodyWrapEnabled = true;
    let responseBodyFormatMode = 'auto';
    let responseBodyDetectedFormat = 'text';
    let responseBodyContentType = '';
    let latestResponseMeta = {
      status: 0,
      statusText: '',
      resolvedUrl: '',
      headersText: '',
      bodyBase64: '',
      contentType: ''
    };
    let requestBodyViewMode = 'raw';
    let isSendingRequest = false;
    let isFindWidgetVisible = false;
    let isResponseFindWidgetVisible = false;
    let lastResponseFindQuery = '';
    let lastResponseFindIndex = -1;
    let activeFullscreenTarget = null;
    let activeFullscreenButton = null;
    let autocompleteTargetEl = null;
    let autocompleteTriggerIndex = -1;
    let autocompleteCandidates = [];
    let autocompleteActiveIndex = 0;
    let autocompleteQuery = '';
    let requestBodyCodeEditor = null;
    let isSyncingRequestBodyEditor = false;

    function getRequestBodyMode(rawType) {
      if (rawType === 'json') {
        return { name: 'javascript', json: true };
      }
      if (rawType === 'javascript') {
        return 'javascript';
      }
      if (rawType === 'xml') {
        return 'xml';
      }
      if (rawType === 'html') {
        return 'htmlmixed';
      }
      return 'text/plain';
    }

    function getRequestBodyTextarea() {
      return document.getElementById('body');
    }

    function getRequestBodyWrapper() {
      return requestBodyCodeEditor ? requestBodyCodeEditor.getWrapperElement() : null;
    }

    function getRequestBodyValue() {
      if (requestBodyCodeEditor) {
        return requestBodyCodeEditor.getValue();
      }
      const bodyEl = getRequestBodyTextarea();
      return bodyEl ? bodyEl.value : '';
    }

    function setRequestBodyValue(nextValue, triggerInput) {
      const bodyEl = getRequestBodyTextarea();
      const value = String(nextValue ?? '');

      if (requestBodyCodeEditor) {
        isSyncingRequestBodyEditor = true;
        requestBodyCodeEditor.setValue(value);
        isSyncingRequestBodyEditor = false;
      }
      if (bodyEl) {
        bodyEl.value = value;
        if (triggerInput) {
          bodyEl.dispatchEvent(new Event('input'));
        }
      }
    }

    function getRequestBodySelection() {
      if (requestBodyCodeEditor) {
        const from = requestBodyCodeEditor.indexFromPos(requestBodyCodeEditor.getCursor('from'));
        const to = requestBodyCodeEditor.indexFromPos(requestBodyCodeEditor.getCursor('to'));
        return { start: from, end: to };
      }

      const bodyEl = getRequestBodyTextarea();
      if (!bodyEl) {
        return { start: 0, end: 0 };
      }
      return {
        start: Math.max(0, bodyEl.selectionStart || 0),
        end: Math.max(0, bodyEl.selectionEnd || 0)
      };
    }

    function setRequestBodySelection(start, end) {
      if (requestBodyCodeEditor) {
        requestBodyCodeEditor.setSelection(
          requestBodyCodeEditor.posFromIndex(Math.max(0, start)),
          requestBodyCodeEditor.posFromIndex(Math.max(0, end))
        );
        requestBodyCodeEditor.focus();
        return;
      }

      const bodyEl = getRequestBodyTextarea();
      if (!bodyEl) {
        return;
      }
      bodyEl.focus();
      bodyEl.setSelectionRange(Math.max(0, start), Math.max(0, end));
    }

    function ensureRequestBodySelectionVisible() {
      if (requestBodyCodeEditor) {
        const cursor = requestBodyCodeEditor.getCursor('to');
        requestBodyCodeEditor.scrollIntoView(cursor, 80);
        return;
      }

      const bodyEl = getRequestBodyTextarea();
      if (bodyEl) {
        ensureTextareaSelectionVisible(bodyEl);
      }
    }

    function focusRequestBodyEditor() {
      if (requestBodyCodeEditor) {
        requestBodyCodeEditor.focus();
        return;
      }

      const bodyEl = getRequestBodyTextarea();
      bodyEl?.focus();
    }

    function setRequestBodyInputVisible(visible) {
      const bodyEl = getRequestBodyTextarea();
      const wrapperEl = getRequestBodyWrapper();
      if (wrapperEl) {
        wrapperEl.classList.toggle('hidden', !visible);
        if (visible && requestBodyCodeEditor) {
          window.requestAnimationFrame(() => {
            requestBodyCodeEditor.refresh();
          });
        }
      }
      if (bodyEl) {
        bodyEl.classList.toggle('hidden', wrapperEl ? true : !visible);
      }
    }

    function setRequestBodyEditorHeight(heightPx) {
      const bodyEl = getRequestBodyTextarea();
      if (bodyEl) {
        bodyEl.style.height = heightPx + 'px';
      }
      if (requestBodyCodeEditor) {
        requestBodyCodeEditor.setSize(null, heightPx);
      }
    }

    function syncRequestBodyCodeEditorMode() {
      if (!requestBodyCodeEditor) {
        return;
      }
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      if (!bodyModeEl || !rawTypeEl) {
        return;
      }

      requestBodyCodeEditor.setOption('mode', getRequestBodyMode(rawTypeEl.value));
      requestBodyCodeEditor.setOption('readOnly', bodyModeEl.value === 'raw' && requestBodyViewMode === 'pretty');
      requestBodyCodeEditor.refresh();
    }

    function initializeRequestBodyCodeEditor() {
      const bodyEl = getRequestBodyTextarea();
      if (!bodyEl || typeof window.CodeMirror === 'undefined') {
        return;
      }

      requestBodyCodeEditor = window.CodeMirror.fromTextArea(bodyEl, {
        lineNumbers: true,
        lineWrapping: false,
        viewportMargin: Infinity,
        mode: getRequestBodyMode(String(initialRawType || 'json')),
        indentUnit: 2,
        tabSize: 2
      });

      requestBodyCodeEditor.on('change', () => {
        if (isSyncingRequestBodyEditor) {
          return;
        }
        const textareaEl = getRequestBodyTextarea();
        if (!textareaEl) {
          return;
        }
        textareaEl.value = requestBodyCodeEditor.getValue();
        textareaEl.dispatchEvent(new Event('input'));
      });

      const maybeSwitchToEditMode = () => {
        const bodyModeEl = document.getElementById('bodyMode');
        const rawTypeEl = document.getElementById('rawType');
        if (!bodyModeEl || !rawTypeEl) {
          return;
        }
        if (bodyModeEl.value !== 'raw' || !canUseRequestPrettyRaw(rawTypeEl.value)) {
          return;
        }
        if (requestBodyViewMode !== 'pretty') {
          return;
        }

        requestBodyViewMode = 'raw';
        updateRequestBodyView();
        updateRequestBodyButtons();
      };

      requestBodyCodeEditor.on('mousedown', () => {
        maybeSwitchToEditMode();
      });

      const initialHeight = bodyEl.offsetHeight || 220;
      setRequestBodyEditorHeight(initialHeight);
    }

    try {
      const storedWrapState = window.localStorage.getItem(responseWrapStorageKey);
      if (storedWrapState === 'false') {
        responseBodyWrapEnabled = false;
      }
      if (storedWrapState === 'true') {
        responseBodyWrapEnabled = true;
      }
    } catch {
      // ignore localStorage read errors in restricted environments
    }

    function escapeHtmlForAutocomplete(input) {
      return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function highlightAutocompleteMatch(text, query) {
      const sourceText = String(text ?? '');
      const normalizedQuery = String(query ?? '').trim();
      if (!normalizedQuery) {
        return escapeHtmlForAutocomplete(sourceText);
      }

      const lowerText = sourceText.toLowerCase();
      const lowerQuery = normalizedQuery.toLowerCase();
      const matchIndex = lowerText.indexOf(lowerQuery);
      if (matchIndex < 0) {
        return escapeHtmlForAutocomplete(sourceText);
      }

      const before = sourceText.slice(0, matchIndex);
      const matched = sourceText.slice(matchIndex, matchIndex + normalizedQuery.length);
      const after = sourceText.slice(matchIndex + normalizedQuery.length);
      return (
        escapeHtmlForAutocomplete(before)
        + '<span class="var-suggest-match">'
        + escapeHtmlForAutocomplete(matched)
        + '</span>'
        + escapeHtmlForAutocomplete(after)
      );
    }

    function getAutocompletePopup() {
      return document.getElementById('envVarSuggest');
    }

    function hideAutocompletePopup() {
      const popupEl = getAutocompletePopup();
      if (!popupEl) {
        return;
      }

      popupEl.classList.add('hidden');
      popupEl.innerHTML = '';
      autocompleteCandidates = [];
      autocompleteActiveIndex = 0;
      autocompleteQuery = '';
      autocompleteTriggerIndex = -1;
      autocompleteTargetEl = null;
    }

    function setSendingState(isSending) {
      isSendingRequest = !!isSending;
      const sendBtn = document.getElementById('sendBtn');
      const sendAndDownloadBtn = document.getElementById('sendAndDownloadBtn');
      if (!sendBtn) {
        return;
      }
      sendBtn.textContent = isSendingRequest ? 'Cancel' : 'Send';
      sendBtn.classList.toggle('btn-primary', !isSendingRequest);
      if (sendAndDownloadBtn) {
        sendAndDownloadBtn.disabled = isSendingRequest;
      }
    }

    function exitFullscreenPanel() {
      if (!activeFullscreenTarget) {
        return;
      }

      activeFullscreenTarget.classList.remove('fullscreen-panel');
      if (activeFullscreenButton) {
        activeFullscreenButton.textContent = '全屏';
      }

      activeFullscreenTarget = null;
      activeFullscreenButton = null;
    }

    function toggleFullscreenPanel(targetEl, buttonEl) {
      if (!targetEl || !buttonEl) {
        return;
      }

      if (activeFullscreenTarget === targetEl) {
        exitFullscreenPanel();
        return;
      }

      exitFullscreenPanel();
      targetEl.classList.add('fullscreen-panel');
      buttonEl.textContent = '退出全屏';

      activeFullscreenTarget = targetEl;
      activeFullscreenButton = buttonEl;
    }

    function getSelectedEnvVariables() {
      const envGroupSelectEl = document.getElementById('envGroupSelect');
      if (!envGroupSelectEl) {
        return [];
      }

      const envGroupId = envGroupSelectEl.value || '';
      const candidates = envGroupVariableMap?.[envGroupId] ?? [];
      return Array.isArray(candidates) ? candidates : [];
    }

    function getAutocompleteContext(targetEl) {
      if (!targetEl || typeof targetEl.value !== 'string') {
        return null;
      }

      const cursor = typeof targetEl.selectionStart === 'number'
        ? targetEl.selectionStart
        : targetEl.value.length;
      const beforeCursor = targetEl.value.slice(0, cursor);
      const triggerIndex = beforeCursor.lastIndexOf('{{');
      if (triggerIndex < 0) {
        return null;
      }

      const query = beforeCursor.slice(triggerIndex + 2);
      if (/\{|\}|\s/.test(query)) {
        return null;
      }

      return {
        cursor,
        triggerIndex,
        query
      };
    }

    function positionAutocompletePopup(targetEl) {
      const popupEl = getAutocompletePopup();
      if (!popupEl || !targetEl) {
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      popupEl.style.left = Math.max(8, rect.left) + 'px';
      popupEl.style.top = Math.min(window.innerHeight - 40, rect.bottom + 4) + 'px';
      popupEl.style.minWidth = Math.max(220, Math.floor(rect.width)) + 'px';
    }

    function applyAutocompleteCandidate(variableName) {
      if (!autocompleteTargetEl || !variableName) {
        return;
      }

      const targetEl = autocompleteTargetEl;
      const context = getAutocompleteContext(targetEl);
      const triggerIndex = context ? context.triggerIndex : autocompleteTriggerIndex;
      if (triggerIndex < 0) {
        hideAutocompletePopup();
        return;
      }

      const cursor = typeof targetEl.selectionStart === 'number'
        ? targetEl.selectionStart
        : targetEl.value.length;
      const before = targetEl.value.slice(0, triggerIndex);
      const after = targetEl.value.slice(cursor);
      const replacement = '{{' + variableName + '}}';

      targetEl.value = before + replacement + after;
      targetEl.focus();
      const nextCursor = (before + replacement).length;
      if (typeof targetEl.setSelectionRange === 'function') {
        targetEl.setSelectionRange(nextCursor, nextCursor);
      }
      targetEl.dispatchEvent(new Event('input'));
      hideAutocompletePopup();
    }

    function renderAutocompletePopup() {
      const popupEl = getAutocompletePopup();
      if (!popupEl || autocompleteCandidates.length === 0) {
        hideAutocompletePopup();
        return;
      }

      popupEl.innerHTML = '';
      autocompleteCandidates.forEach((candidate, index) => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'var-suggest-item';
        itemBtn.classList.toggle('active', index === autocompleteActiveIndex);
        const nameEl = document.createElement('span');
        nameEl.className = 'var-suggest-name';
        nameEl.innerHTML = '{{' + highlightAutocompleteMatch(candidate.name, autocompleteQuery) + '}}';

        const valueEl = document.createElement('span');
        valueEl.className = 'var-suggest-value';
        valueEl.textContent = candidate.value ?? '';

        itemBtn.appendChild(nameEl);
        itemBtn.appendChild(valueEl);
        itemBtn.addEventListener('mousedown', (event) => {
          event.preventDefault();
          applyAutocompleteCandidate(candidate.name);
        });
        popupEl.appendChild(itemBtn);
      });

      popupEl.classList.remove('hidden');
      if (autocompleteTargetEl) {
        positionAutocompletePopup(autocompleteTargetEl);
      }
    }

    function updateAutocompleteForTarget(targetEl) {
      if (!targetEl) {
        hideAutocompletePopup();
        return;
      }

      const context = getAutocompleteContext(targetEl);
      if (!context) {
        hideAutocompletePopup();
        return;
      }

      const availableVariables = getSelectedEnvVariables();
      if (availableVariables.length === 0) {
        hideAutocompletePopup();
        return;
      }

      const normalizedQuery = context.query.toLowerCase();
      const matchedCandidates = availableVariables.filter(variable =>
        variable.name.toLowerCase().includes(normalizedQuery)
      );

      if (matchedCandidates.length === 0) {
        hideAutocompletePopup();
        return;
      }

      autocompleteTargetEl = targetEl;
      autocompleteTriggerIndex = context.triggerIndex;
      autocompleteCandidates = matchedCandidates;
      autocompleteActiveIndex = 0;
      autocompleteQuery = context.query;
      renderAutocompletePopup();
    }

    function handleAutocompleteKeydown(event) {
      const popupEl = getAutocompletePopup();
      if (!popupEl || popupEl.classList.contains('hidden') || autocompleteCandidates.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex + 1) % autocompleteCandidates.length;
        renderAutocompletePopup();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex - 1 + autocompleteCandidates.length) % autocompleteCandidates.length;
        renderAutocompletePopup();
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applyAutocompleteCandidate(autocompleteCandidates[autocompleteActiveIndex]?.name);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        hideAutocompletePopup();
      }
    }

    function setupAutocompleteForElement(targetEl) {
      if (!targetEl || targetEl.dataset.envAutocompleteBound === '1') {
        return;
      }

      targetEl.dataset.envAutocompleteBound = '1';
      targetEl.addEventListener('input', () => updateAutocompleteForTarget(targetEl));
      targetEl.addEventListener('click', () => updateAutocompleteForTarget(targetEl));
      targetEl.addEventListener('keydown', handleAutocompleteKeydown);
      targetEl.addEventListener('blur', () => {
        window.setTimeout(() => {
          if (document.activeElement?.closest?.('#envVarSuggest')) {
            return;
          }
          hideAutocompletePopup();
        }, 80);
      });
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

    function ensureRangeVisibleInScrollableContainer(container, range) {
      if (!container || !range) {
        return;
      }

      const rects = range.getClientRects();
      const rangeRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const padding = 16;
      const canScrollContainer = container.scrollHeight > container.clientHeight || container.scrollWidth > container.clientWidth;

      if (canScrollContainer) {
        if (rangeRect.top < containerRect.top + padding) {
          container.scrollTop -= (containerRect.top + padding - rangeRect.top);
        } else if (rangeRect.bottom > containerRect.bottom - padding) {
          container.scrollTop += (rangeRect.bottom - (containerRect.bottom - padding));
        }

        if (rangeRect.left < containerRect.left + padding) {
          container.scrollLeft -= (containerRect.left + padding - rangeRect.left);
        } else if (rangeRect.right > containerRect.right - padding) {
          container.scrollLeft += (rangeRect.right - (containerRect.right - padding));
        }
        return;
      }

      container.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function ensureTextareaSelectionVisible(textareaEl) {
      if (!textareaEl) {
        return;
      }

      const value = textareaEl.value || '';
      const selectionStart = Math.max(0, textareaEl.selectionStart || 0);
      const beforeText = value.slice(0, selectionStart);
      const lastLineBreak = beforeText.lastIndexOf('\n');
      const lineIndex = beforeText.split('\n').length - 1;
      const columnIndex = lastLineBreak === -1 ? beforeText.length : beforeText.length - lastLineBreak - 1;

      const style = window.getComputedStyle(textareaEl);
      const parsedLineHeight = Number.parseFloat(style.lineHeight || '');
      const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
        ? parsedLineHeight
        : 20;
      const parsedFontSize = Number.parseFloat(style.fontSize || '');
      const approxCharWidth = (Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 13) * 0.62;

      const targetTop = Math.max(0, lineIndex * lineHeight - textareaEl.clientHeight / 2);
      const targetLeft = Math.max(0, columnIndex * approxCharWidth - textareaEl.clientWidth / 2);

      textareaEl.scrollTop = targetTop;
      textareaEl.scrollLeft = targetLeft;
    }

    function setSelectionInElementByOffset(container, start, end) {
      const textNodes = walkTextNodes(container);
      if (textNodes.length === 0) {
        return false;
      }

      let offset = 0;
      let startNode = null;
      let endNode = null;
      let startOffset = 0;
      let endOffset = 0;

      for (const node of textNodes) {
        const textLength = node.textContent?.length ?? 0;
        const nextOffset = offset + textLength;

        if (!startNode && start >= offset && start <= nextOffset) {
          startNode = node;
          startOffset = Math.max(0, start - offset);
        }

        if (!endNode && end >= offset && end <= nextOffset) {
          endNode = node;
          endOffset = Math.max(0, end - offset);
        }

        offset = nextOffset;
      }

      if (!startNode || !endNode) {
        return false;
      }

      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);

      const selection = window.getSelection();
      if (!selection) {
        return false;
      }

      selection.removeAllRanges();
      selection.addRange(range);
      ensureRangeVisibleInScrollableContainer(container, range);
      return true;
    }

        function populateEnvGroupSelect() {
          const envGroupSelectEl = document.getElementById('envGroupSelect');
          if (!envGroupSelectEl) {
            return;
          }

          envGroupSelectEl.innerHTML = '';

          const allOption = document.createElement('option');
          allOption.value = '';
          allOption.textContent = 'NO ENVIRONMENTS';
          envGroupSelectEl.appendChild(allOption);

          (Array.isArray(envGroupOptions) ? envGroupOptions : []).forEach((item) => {
            const optionEl = document.createElement('option');
            optionEl.value = item.id;
            optionEl.textContent = item.path;
            envGroupSelectEl.appendChild(optionEl);
          });

          envGroupSelectEl.value = initialEnvGroupId || '';
          if (envGroupSelectEl.value !== (initialEnvGroupId || '')) {
            envGroupSelectEl.value = '';
            if (initialEnvGroupId) {
              vscode.postMessage({
                command: 'envGroupFallbackNotice',
                data: { envGroupId: initialEnvGroupId }
              });
            }
          }
        }

    const initialBodyItems = Array.isArray(bootstrapData.initialBodyItems) ? bootstrapData.initialBodyItems : [];

    function createRow(containerId, row, onChanged) {
      const tbody = document.getElementById(containerId);
      if (!tbody) {
        return;
      }
      const tr = document.createElement('tr');

      const enabledTd = document.createElement('td');
      const enabledInput = document.createElement('input');
      enabledInput.className = 'checkbox row-enabled';
      enabledInput.type = 'checkbox';
      enabledInput.checked = !!row.enabled;
      enabledInput.addEventListener('change', () => {
        if (typeof onChanged === 'function') {
          onChanged();
        }
      });
      enabledTd.appendChild(enabledInput);

      const keyTd = document.createElement('td');
      const keyInput = document.createElement('input');
      keyInput.className = 'row-input row-key';
      keyInput.type = 'text';
      keyInput.placeholder = 'Key';
      keyInput.value = row.key || '';
      keyInput.addEventListener('input', () => {
        if (typeof onChanged === 'function') {
          onChanged();
        }
      });
      keyTd.appendChild(keyInput);

      const valueTd = document.createElement('td');
      const valueInput = document.createElement('input');
      valueInput.className = 'row-input row-value';
      valueInput.type = 'text';
      valueInput.placeholder = 'Value';
      valueInput.value = row.value || '';
      valueInput.addEventListener('input', () => {
        if (typeof onChanged === 'function') {
          onChanged();
        }
      });
      valueTd.appendChild(valueInput);
      setupAutocompleteForElement(keyInput);
      setupAutocompleteForElement(valueInput);

      const actionTd = document.createElement('td');
      actionTd.className = 'row-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn row-delete';
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Del';
      deleteBtn.addEventListener('click', () => {
        tr.remove();
        if (typeof onChanged === 'function') {
          onChanged();
        }
      });
      actionTd.appendChild(deleteBtn);

      tr.appendChild(enabledTd);
      tr.appendChild(keyTd);
      tr.appendChild(valueTd);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }

    function replaceRows(containerId, rows, onChanged) {
      const tbody = document.getElementById(containerId);
      if (!tbody) {
        return;
      }

      tbody.innerHTML = '';
      rows.forEach((row) => createRow(containerId, row, onChanged));
    }

    function collectRows(containerId) {
      const rows = [];
      const container = document.getElementById(containerId);
      if (!container) {
        return rows;
      }

      const trs = container.querySelectorAll('tr');
      trs.forEach((tr) => {
        const enabledEl = tr.querySelector('.row-enabled');
        const keyEl = tr.querySelector('.row-key');
        const valueEl = tr.querySelector('.row-value');
        if (!enabledEl || !keyEl || !valueEl) {
          return;
        }
        rows.push({
          enabled: enabledEl.checked,
          key: keyEl.value.trim(),
          value: valueEl.value
        });
      });
      return rows;
    }

    function parseUrlInput(rawUrl) {
      const normalized = String(rawUrl || '').trim();
      const hashIndex = normalized.indexOf('#');
      const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : '';
      const urlWithoutHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
      const queryIndex = urlWithoutHash.indexOf('?');
      const baseUrl = queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
      const query = queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '';

      const paramsRows = [];
      if (query) {
        const searchParams = new URLSearchParams(query);
        searchParams.forEach((value, key) => {
          paramsRows.push({
            key,
            value,
            enabled: true
          });
        });
      }

      return {
        baseUrl,
        hash,
        paramsRows
      };
    }

    function buildFinalUrl(baseUrl, hash, paramsRows) {
      const enabledRows = paramsRows.filter((r) => r.enabled && r.key);
      const encodePartPreservingTemplates = (input) => {
        const value = String(input ?? '');
        const tokens = value.split(/(\{\{\s*[\w.-]+\s*\}\})/g);
        return tokens
          .map((segment) => {
            if (/^\{\{\s*[\w.-]+\s*\}\}$/.test(segment)) {
              return segment;
            }
            return encodeURIComponent(segment);
          })
          .join('');
      };
      const query = enabledRows
        .map((r) => encodePartPreservingTemplates(r.key) + '=' + encodePartPreservingTemplates(r.value))
        .join('&');

      if (!query) {
        return baseUrl + hash;
      }

      if (!baseUrl) {
        return '?' + query + hash;
      }

      return baseUrl + '?' + query + hash;
    }

    function ensureParamsRows(onChanged) {
      const rows = collectRows('paramsBody');
      if (rows.length === 0) {
        createRow('paramsBody', { key: '', value: '', enabled: true }, onChanged);
      }
    }

    function syncUrlFromParamsRows() {
      const baseUrlEl = document.getElementById('baseUrl');
      if (!baseUrlEl) {
        return;
      }

      const parsedUrl = parseUrlInput(baseUrlEl.value);
      const paramsRows = collectRows('paramsBody');
      baseUrlEl.value = buildFinalUrl(parsedUrl.baseUrl, parsedUrl.hash, paramsRows);
      ensureParamsRows(syncUrlFromParamsRows);
    }

    function syncParamsRowsFromUrl() {
      const baseUrlEl = document.getElementById('baseUrl');
      if (!baseUrlEl) {
        return;
      }

      const parsedUrl = parseUrlInput(baseUrlEl.value);
      replaceRows('paramsBody', parsedUrl.paramsRows, syncUrlFromParamsRows);
      ensureParamsRows(syncUrlFromParamsRows);
    }

    function buildHeaders(headersRows) {
      const headers = {};
      headersRows
        .filter((r) => r.enabled && r.key)
        .forEach((r) => {
          headers[r.key] = r.value;
        });
      return headers;
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('tab-' + tabName));
      });

      if (tabName === 'body' && requestBodyCodeEditor) {
        window.requestAnimationFrame(() => {
          requestBodyCodeEditor.refresh();
        });
      }
    }

    function updateRequestPath() {
      const pathPrefixEl = document.getElementById('pathPrefix');
      const requestNameEl = document.getElementById('pathRequestName');
      if (!pathPrefixEl || !requestNameEl) {
        return;
      }

      const normalizedRequestName = (requestName || '').trim() || 'untitled';
      requestNameEl.value = normalizedRequestName;
      pathPrefixEl.textContent = collectionPath ? (collectionPath + '/') : '';
    }

    function commitRequestNameRename() {
      const requestNameEl = document.getElementById('pathRequestName');
      if (!requestNameEl) {
        return;
      }

      const nextName = requestNameEl.value.trim();
      if (!nextName) {
        requestNameEl.value = requestName;
        return;
      }
      if (nextName === requestName) {
        return;
      }

      requestName = nextName;
      vscode.postMessage({
        command: 'renameRequestName',
        data: {
          id: requestId,
          name: nextName
        }
      });
      updateRequestPath();
    }

    function syncRequestNameFromPathInput() {
      const requestNameEl = document.getElementById('pathRequestName');
      if (!requestNameEl) {
        return;
      }

      const nextName = requestNameEl.value.trim();
      if (!nextName) {
        requestNameEl.value = requestName;
        return;
      }

      if (nextName !== requestName) {
        requestName = nextName;
        updateRequestPath();
      }
    }

    function switchResponseTab(tabName) {
      document.querySelectorAll('.response-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.respTab === tabName);
      });
      document.querySelectorAll('.response-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('resp-panel-' + tabName));
      });

      if (tabName !== 'body') {
        hideResponseFindWidget();
      }
    }

    function updateJsonStatus(message, isError) {
      const jsonStatusEl = document.getElementById('jsonStatus');
      if (!jsonStatusEl) {
        return;
      }

      jsonStatusEl.textContent = message || '';
      jsonStatusEl.classList.toggle('error', !!isError);
    }

    function isRawJsonMode() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      if (!bodyModeEl || !rawTypeEl) {
        return false;
      }
      return bodyModeEl.value === 'raw' && rawTypeEl.value === 'json';
    }

    function updateRawBodyPlaceholder() {
      const bodyEl = document.getElementById('body');
      const rawTypeEl = document.getElementById('rawType');
      if (!bodyEl || !rawTypeEl) {
        return;
      }

      const placeholders = {
        text: '请输入 Text 请求体',
        javascript: '请输入 JavaScript 文本请求体',
        json: '请输入 JSON 请求体，例如 {"name":"free-request"}',
        html: '请输入 HTML 请求体，例如 <html><body>...</body></html>',
        xml: '请输入 XML 请求体，例如 <root><name>free-request</name></root>'
      };
      bodyEl.placeholder = placeholders[rawTypeEl.value] || placeholders.text;
    }

    function canUseRequestPrettyRaw(rawType) {
      return rawType === 'json' || rawType === 'xml' || rawType === 'html';
    }

    function formatXmlLikeRequestText(rawText) {
      const source = String(rawText || '').trim();
      if (!source) {
        return '';
      }

      const tokens = source.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean);
      let indent = 0;
      const lines = [];

      tokens.forEach((token) => {
        const piece = token.trim();
        if (!piece) {
          return;
        }

        const isClosingTag = /^<\//.test(piece);
        const isSelfClosingTag = /^<[^>]+\/>$/.test(piece) || /^<\?/.test(piece) || /^<!/.test(piece);
        const isOpeningTag = /^<[^/!][^>]*>$/.test(piece);

        if (isClosingTag) {
          indent = Math.max(0, indent - 1);
        }

        lines.push('  '.repeat(indent) + piece);

        if (isOpeningTag && !isSelfClosingTag && !isClosingTag) {
          indent += 1;
        }
      });

      return lines.join('\n');
    }

    function updateRequestBodyButtons() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      const prettyBtn = document.getElementById('requestBodyPrettyBtn');
      const rawBtn = document.getElementById('requestBodyRawBtn');
      if (!bodyModeEl || !rawTypeEl || !prettyBtn || !rawBtn) {
        return;
      }

      if (bodyModeEl.value !== 'raw' || !canUseRequestPrettyRaw(rawTypeEl.value)) {
        prettyBtn.disabled = true;
        rawBtn.disabled = true;
        return;
      }

      const text = getRequestBodyValue();
      if (!text || text.trim() === '') {
        prettyBtn.disabled = true;
        rawBtn.disabled = true;
        return;
      }

      if (rawTypeEl.value === 'json') {
        try {
          JSON.parse(text);
        } catch {
          prettyBtn.disabled = true;
          rawBtn.disabled = true;
          return;
        }
      }

      prettyBtn.disabled = requestBodyViewMode === 'pretty';
      rawBtn.disabled = requestBodyViewMode === 'raw';
    }

    function updateRequestBodyView() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      const prettyBodyEl = document.getElementById('requestPrettyBody');
      const bodyResizeHandleEl = document.getElementById('bodyResizeHandle');
      const jsonFindReplaceEl = document.getElementById('jsonFindReplace');
      if (!bodyModeEl || !rawTypeEl || !prettyBodyEl || !bodyResizeHandleEl || !jsonFindReplaceEl) {
        return;
      }

      const isRawMode = bodyModeEl.value === 'raw';
      const canUseJsonTools = isRawMode && rawTypeEl.value === 'json';
      setRequestBodyInputVisible(true);
      prettyBodyEl.classList.add('hidden');
      bodyResizeHandleEl.classList.remove('hidden');
      syncRequestBodyCodeEditorMode();

      if (!canUseJsonTools || requestBodyViewMode === 'raw') {
        updateJsonStatus('', false);
      }

      if (canUseJsonTools && requestBodyViewMode === 'pretty') {
        isFindWidgetVisible = false;
        jsonFindReplaceEl.classList.add('hidden');
      }
    }

    function validateRawJson(showSuccess) {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      if (!bodyModeEl || !rawTypeEl) {
        return false;
      }

      if (bodyModeEl.value !== 'raw' || rawTypeEl.value !== 'json') {
        updateJsonStatus('', false);
        return true;
      }

      const text = getRequestBodyValue();
      if (!text || text.trim() === '') {
        updateJsonStatus('', false);
        return true;
      }

      try {
        JSON.parse(text);
        updateJsonStatus(showSuccess ? 'JSON 有效' : '', false);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'JSON 格式错误';
        updateJsonStatus('JSON 错误：' + message, true);
        return false;
      }
    }

    function prettyRawJsonBody() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      if (!bodyModeEl || !rawTypeEl || bodyModeEl.value !== 'raw' || !canUseRequestPrettyRaw(rawTypeEl.value)) {
        return;
      }

      const text = getRequestBodyValue();
      if (!text || text.trim() === '') {
        updateJsonStatus('', false);
        return;
      }

      if (rawTypeEl.value === 'json') {
        try {
          const parsed = JSON.parse(text);
          setRequestBodyValue(JSON.stringify(parsed, null, 2), false);
          requestBodyViewMode = 'pretty';
          updateJsonStatus('JSON 已美化', false);
          updateRequestBodyView();
          updateRequestBodyButtons();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'JSON 格式错误';
          updateJsonStatus('JSON 错误：' + message, true);
          updateRequestBodyView();
          updateRequestBodyButtons();
        }
        return;
      }

      setRequestBodyValue(formatXmlLikeRequestText(text), false);
      requestBodyViewMode = 'pretty';
      updateJsonStatus('', false);
      updateRequestBodyView();
      updateRequestBodyButtons();
    }

    function rawRawJsonBody() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      if (!bodyModeEl || !rawTypeEl || bodyModeEl.value !== 'raw' || !canUseRequestPrettyRaw(rawTypeEl.value)) {
        return;
      }

      const text = getRequestBodyValue();
      if (!text || text.trim() === '') {
        updateJsonStatus('', false);
        return;
      }
      requestBodyViewMode = 'raw';
      updateJsonStatus('', false);
      updateRequestBodyView();
      updateRequestBodyButtons();
    }

    function updateRawBodyActionsVisibility() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      const rawTypeToolbarEl = document.getElementById('rawTypeToolbar');
      const rawBodyActionsEl = document.getElementById('rawBodyActions');
      const jsonFindReplaceEl = document.getElementById('jsonFindReplace');
      if (!bodyModeEl || !rawTypeEl || !rawTypeToolbarEl || !rawBodyActionsEl || !jsonFindReplaceEl) {
        return;
      }

      const isRawMode = bodyModeEl.value === 'raw';
      const isRawJson = isRawMode && rawTypeEl.value === 'json';

      rawTypeToolbarEl.classList.toggle('hidden', !isRawMode);
      rawBodyActionsEl.classList.toggle('hidden', !isRawMode);
      if (!isRawJson) {
        isFindWidgetVisible = false;
        jsonFindReplaceEl.classList.add('hidden');
        updateJsonStatus('', false);
      } else {
        jsonFindReplaceEl.classList.toggle('hidden', !isFindWidgetVisible);
      }
      updateRequestBodyView();
      updateRequestBodyButtons();
    }

    function showFindWidget() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      const findTextEl = document.getElementById('findText');
      const jsonFindReplaceEl = document.getElementById('jsonFindReplace');
      if (!bodyModeEl || !rawTypeEl || !findTextEl || !jsonFindReplaceEl || bodyModeEl.value !== 'raw' || rawTypeEl.value !== 'json') {
        return;
      }

      const bodyText = getRequestBodyValue();
      const selection = getRequestBodySelection();
      const selectedText = bodyText.slice(selection.start, selection.end);
      if (selectedText && !findTextEl.value) {
        findTextEl.value = selectedText;
      }

      isFindWidgetVisible = true;
      jsonFindReplaceEl.classList.remove('hidden');
      findTextEl.focus();
      findTextEl.select();
    }

    function hideFindWidget() {
      const jsonFindReplaceEl = document.getElementById('jsonFindReplace');
      if (!jsonFindReplaceEl) {
        return;
      }

      isFindWidgetVisible = false;
      jsonFindReplaceEl.classList.add('hidden');
      updateFindStatus('', false);
      focusRequestBodyEditor();
    }

    function updateResponseFindStatus(message, isError) {
      const statusEl = document.getElementById('respFindStatus');
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message || '';
      statusEl.classList.toggle('error', !!isError);
    }

    function showResponseFindWidget() {
      const responseContentEl = document.getElementById('responseContent');
      const widgetEl = document.getElementById('respFindWidget');
      const inputEl = document.getElementById('respFindText');
      if (!responseContentEl || !widgetEl || !inputEl || responseContentEl.classList.contains('hidden')) {
        return;
      }

      switchResponseTab('body');
      isResponseFindWidgetVisible = true;
      widgetEl.classList.remove('hidden');
      inputEl.focus();
      inputEl.select();
    }

    function hideResponseFindWidget() {
      const widgetEl = document.getElementById('respFindWidget');
      if (!widgetEl) {
        return;
      }

      isResponseFindWidgetVisible = false;
      widgetEl.classList.add('hidden');
      updateResponseFindStatus('', false);
    }

    function countMatches(source, query) {
      if (!query) {
        return 0;
      }
      let count = 0;
      let from = 0;
      while (true) {
        const index = source.indexOf(query, from);
        if (index === -1) {
          break;
        }
        count += 1;
        from = index + query.length;
      }
      return count;
    }

    function findInResponse(forward) {
      const responseBodyEl = document.getElementById('respBody');
      const findTextEl = document.getElementById('respFindText');
      if (!responseBodyEl || !findTextEl) {
        return false;
      }

      const query = findTextEl.value;
      if (!query) {
        updateResponseFindStatus('请输入要搜索的文本', true);
        findTextEl.focus();
        return false;
      }

      const source = responseBodyEl.textContent || '';
      if (!source) {
        updateResponseFindStatus('当前响应为空', true);
        return false;
      }

      if (query !== lastResponseFindQuery) {
        lastResponseFindQuery = query;
        lastResponseFindIndex = -1;
      }

      const fromIndex = forward
        ? Math.max(0, lastResponseFindIndex + 1)
        : Math.max(0, lastResponseFindIndex - 1);

      let matchIndex = forward
        ? source.indexOf(query, fromIndex)
        : source.lastIndexOf(query, fromIndex);

      if (matchIndex === -1) {
        matchIndex = forward
          ? source.indexOf(query, 0)
          : source.lastIndexOf(query);
      }

      if (matchIndex === -1) {
        updateResponseFindStatus('未找到匹配', true);
        return false;
      }

      const selected = setSelectionInElementByOffset(responseBodyEl, matchIndex, matchIndex + query.length);
      if (!selected) {
        updateResponseFindStatus('定位失败', true);
        return false;
      }

      lastResponseFindIndex = matchIndex;
      const total = countMatches(source, query);
      const current = countMatches(source.slice(0, matchIndex + query.length), query);
      updateResponseFindStatus(current + '/' + total, false);
      return true;
    }

    function updateFindStatus(message, isError) {
      const findStatusEl = document.getElementById('findStatus');
      if (!findStatusEl) {
        return;
      }

      findStatusEl.textContent = message || '';
      findStatusEl.classList.toggle('error', !!isError);
    }

    function findInBody(forward) {
      const findTextEl = document.getElementById('findText');
      if (!findTextEl) {
        return false;
      }

      const query = findTextEl.value;
      if (!query) {
        updateFindStatus('请输入要搜索的文本', true);
        findTextEl.focus();
        return false;
      }

      const source = getRequestBodyValue();
      if (!source) {
        updateFindStatus('当前请求体为空', true);
        return false;
      }

      const selection = getRequestBodySelection();
      const cursor = forward ? selection.end : Math.max(0, selection.start - 1);
      let index = forward
        ? source.indexOf(query, cursor)
        : source.lastIndexOf(query, cursor);

      if (index === -1) {
        index = forward
          ? source.indexOf(query, 0)
          : source.lastIndexOf(query);
      }

      if (index === -1) {
        updateFindStatus('未找到匹配', true);
        return false;
      }

      setRequestBodySelection(index, index + query.length);
      ensureRequestBodySelectionVisible();
      updateFindStatus('已定位到匹配项', false);
      return true;
    }

    function replaceCurrentInBody() {
      const findTextEl = document.getElementById('findText');
      const replaceTextEl = document.getElementById('replaceText');
      if (!findTextEl || !replaceTextEl) {
        return;
      }

      const query = findTextEl.value;
      if (!query) {
        updateFindStatus('请输入要替换的文本', true);
        findTextEl.focus();
        return;
      }

      const sourceText = getRequestBodyValue();
      const selection = getRequestBodySelection();
      const selectedText = sourceText.slice(selection.start, selection.end);
      if (selectedText !== query) {
        const found = findInBody(true);
        if (!found) {
          return;
        }
      }

      const latestSelection = getRequestBodySelection();
      const start = latestSelection.start;
      const end = latestSelection.end;
      const replacement = replaceTextEl.value;
      setRequestBodyValue(sourceText.slice(0, start) + replacement + sourceText.slice(end), true);
      setRequestBodySelection(start, start + replacement.length);
      ensureRequestBodySelectionVisible();
      updateFindStatus('已替换当前匹配', false);
    }

    function replaceAllInBody() {
      const findTextEl = document.getElementById('findText');
      const replaceTextEl = document.getElementById('replaceText');
      if (!findTextEl || !replaceTextEl) {
        return;
      }

      const query = findTextEl.value;
      if (!query) {
        updateFindStatus('请输入要替换的文本', true);
        findTextEl.focus();
        return;
      }

      const source = getRequestBodyValue();
      if (!source.includes(query)) {
        updateFindStatus('未找到可替换内容', true);
        return;
      }

      let count = 0;
      let searchFrom = 0;
      while (true) {
        const index = source.indexOf(query, searchFrom);
        if (index === -1) {
          break;
        }
        count += 1;
        searchFrom = index + query.length;
      }

      setRequestBodyValue(source.split(query).join(replaceTextEl.value), true);
      setRequestBodySelection(0, 0);
      ensureRequestBodySelectionVisible();
      updateFindStatus('已替换 ' + count + ' 处', false);
    }

    function tryParseJsonText(text) {
      const normalized = typeof text === 'string' ? text.trim() : '';
      if (!normalized) {
        return { ok: false };
      }

      try {
        return {
          ok: true,
          value: JSON.parse(normalized)
        };
      } catch {
        return { ok: false };
      }
    }

    function normalizeResponseFormat(format) {
      const normalized = String(format || '').trim().toLowerCase();
      if (normalized === 'json' || normalized === 'xml' || normalized === 'html' || normalized === 'text' || normalized === 'auto') {
        return normalized;
      }
      return 'auto';
    }

    function detectResponseBodyFormat(rawText, contentType) {
      const lowerContentType = String(contentType || '').toLowerCase();
      const trimmed = String(rawText || '').trim();

      if (lowerContentType.includes('json')) {
        return 'json';
      }
      if (lowerContentType.includes('html')) {
        return 'html';
      }
      if (lowerContentType.includes('xml')) {
        return 'xml';
      }
      if (lowerContentType.startsWith('text/')) {
        return 'text';
      }

      if (trimmed) {
        try {
          JSON.parse(trimmed);
          return 'json';
        } catch {
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.startsWith('<!doctype html') || lowerTrimmed.startsWith('<html')) {
            return 'html';
          }
          if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
            return 'xml';
          }
        }
      }

      return 'text';
    }

    function extractContentTypeFromHeadersText(headersText) {
      if (!headersText) {
        return '';
      }

      try {
        const parsed = JSON.parse(headersText);
        if (!parsed || typeof parsed !== 'object') {
          return '';
        }

        const entries = Object.entries(parsed);
        const matched = entries.find(([key]) => String(key).toLowerCase() === 'content-type');
        return matched ? String(matched[1] || '') : '';
      } catch {
        return '';
      }
    }

    function formatXmlLikeText(rawText) {
      const source = String(rawText || '').trim();
      if (!source) {
        return '';
      }

      const tokens = source.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean);
      let indent = 0;
      const lines = [];

      tokens.forEach((token) => {
        const piece = token.trim();
        if (!piece) {
          return;
        }

        const isClosingTag = /^<\//.test(piece);
        const isSelfClosingTag = /^<[^>]+\/>$/.test(piece) || /^<\?/.test(piece) || /^<!/.test(piece);
        const isOpeningTag = /^<[^/!][^>]*>$/.test(piece);

        if (isClosingTag) {
          indent = Math.max(0, indent - 1);
        }

        lines.push('  '.repeat(indent) + piece);

        if (isOpeningTag && !isSelfClosingTag && !isClosingTag) {
          indent += 1;
        }
      });

      return lines.join('\n');
    }

    function buildResponsePrettyText(rawText, format) {
      const normalized = String(rawText || '');
      if (!normalized.trim()) {
        return '';
      }

      if (format === 'json') {
        const parsed = tryParseJsonText(normalized);
        return parsed.ok ? JSON.stringify(parsed.value, null, 2) : normalized;
      }
      if (format === 'xml' || format === 'html') {
        return formatXmlLikeText(normalized);
      }
      return normalized;
    }

    function getEffectiveResponseFormat() {
      return responseBodyFormatMode === 'auto'
        ? responseBodyDetectedFormat
        : responseBodyFormatMode;
    }

    function updateResponseBodyButtons() {
      const copyBtn = document.getElementById('copyResponseBodyBtn');
      const exportBtn = document.getElementById('exportResponseFileBtn');
      const wrapBtn = document.getElementById('respWrapToggleBtn');
      const prettyBtn = document.getElementById('respPrettyBtn');
      const rawBtn = document.getElementById('respRawBtn');
      const formatSelectEl = document.getElementById('respBodyFormat');
      const hintEl = document.getElementById('respJsonHint');
      if (!copyBtn || !exportBtn || !wrapBtn || !prettyBtn || !rawBtn || !formatSelectEl || !hintEl) {
        return;
      }

      const hasBody = !!responseBodyRawText;
      const effectiveFormat = getEffectiveResponseFormat();
      copyBtn.disabled = !responseBodyRawText;
      exportBtn.disabled = !responseBodyRawText;
      wrapBtn.disabled = !hasBody;
      wrapBtn.textContent = responseBodyWrapEnabled ? '自动换行' : '不换行';
      prettyBtn.disabled = !hasBody || responseBodyViewMode === 'pretty';
      rawBtn.disabled = !hasBody || responseBodyViewMode === 'raw';
      formatSelectEl.value = normalizeResponseFormat(responseBodyFormatMode);

      if (!hasBody) {
        hintEl.textContent = '暂无响应内容';
        return;
      }

      const formatLabel = responseBodyFormatMode === 'auto'
        ? 'Auto (' + String(effectiveFormat).toUpperCase() + ')'
        : String(effectiveFormat).toUpperCase();
      hintEl.textContent = '响应格式：' + formatLabel;
    }

    function escapeHtmlForDisplay(input) {
      return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderJsonPrimitive(value) {
      if (value === null) {
        return '<span class="json-null">null</span>';
      }
      if (typeof value === 'number') {
        return '<span class="json-number">' + String(value) + '</span>';
      }
      if (typeof value === 'boolean') {
        return '<span class="json-boolean">' + String(value) + '</span>';
      }
      return '<span class="json-string">"' + escapeHtmlForDisplay(String(value)) + '"</span>';
    }

    function renderJsonValue(value, indentLevel) {
      const indentUnit = '  ';
      const currentIndent = indentUnit.repeat(indentLevel);
      const nextIndent = indentUnit.repeat(indentLevel + 1);

      if (Array.isArray(value)) {
        if (value.length === 0) {
          return '[]';
        }
        const items = value.map((item) => nextIndent + renderJsonValue(item, indentLevel + 1));
        return '[\n' + items.join(',\n') + '\n' + currentIndent + ']';
      }

      if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) {
          return '{}';
        }
        const lines = entries.map(([key, item]) => {
          return (
            nextIndent +
            '<span class="json-key">"' + escapeHtmlForDisplay(key) + '"</span>: ' +
            renderJsonValue(item, indentLevel + 1)
          );
        });
        return '{\n' + lines.join(',\n') + '\n' + currentIndent + '}';
      }

      return renderJsonPrimitive(value);
    }

    function updateResponseBodyView() {
      const bodyEl = document.getElementById('respBody');
      if (!bodyEl) {
        return;
      }

      const shouldUsePretty = responseBodyViewMode === 'pretty';
      const effectiveFormat = getEffectiveResponseFormat();
      if (shouldUsePretty) {
        responseBodyPrettyText = buildResponsePrettyText(responseBodyRawText, effectiveFormat);
        if (effectiveFormat === 'json') {
          try {
            bodyEl.innerHTML = renderJsonValue(JSON.parse(responseBodyPrettyText), 0);
          } catch {
            bodyEl.textContent = responseBodyPrettyText;
          }
        } else {
          bodyEl.textContent = responseBodyPrettyText;
        }
      } else {
        bodyEl.textContent = responseBodyRawText;
      }
      bodyEl.classList.toggle('no-wrap', !responseBodyWrapEnabled);
      updateResponseBodyButtons();
    }

    function renderResponse(payload) {
      const emptyEl = document.getElementById('responseEmpty');
      const contentEl = document.getElementById('responseContent');
      const statusEl = document.getElementById('respStatus');
      const timeEl = document.getElementById('respTime');
      const sizeEl = document.getElementById('respSize');
      const urlEl = document.getElementById('respUrl');
      const bodyEl = document.getElementById('respBody');
      const headersEl = document.getElementById('respHeaders');
      if (!emptyEl || !contentEl || !statusEl || !timeEl || !sizeEl || !urlEl || !bodyEl || !headersEl) {
        return;
      }

      emptyEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
      statusEl.textContent = 'Status: ' + (payload.status ?? 0) + (payload.statusText ? (' ' + payload.statusText) : '');
      timeEl.textContent = 'Time: ' + (payload.durationMs ?? 0) + ' ms';
      sizeEl.textContent = 'Size: ' + (payload.responseSizeBytes ?? 0) + ' B';
      urlEl.textContent = payload.resolvedUrl || '';
      latestResponseMeta = {
        status: Number(payload.status ?? 0),
        statusText: String(payload.statusText || ''),
        resolvedUrl: String(payload.resolvedUrl || ''),
        headersText: String(payload.headersText || ''),
        bodyBase64: String(payload.bodyBase64 || ''),
        contentType: String(payload.contentType || '')
      };

      if (payload.ok) {
        responseBodyRawText = payload.bodyText || '';
        responseBodyContentType = payload.contentType || extractContentTypeFromHeadersText(payload.headersText || '');
        responseBodyDetectedFormat = detectResponseBodyFormat(responseBodyRawText, responseBodyContentType);
        responseBodyIsJson = responseBodyDetectedFormat === 'json';
        responseBodyPrettyText = buildResponsePrettyText(responseBodyRawText, responseBodyDetectedFormat);
        responseBodyFormatMode = 'auto';
        responseBodyViewMode = 'pretty';
        updateResponseBodyView();
        headersEl.textContent = payload.headersText || '';
      } else {
        responseBodyRawText = payload.errorMessage || '请求失败';
        responseBodyContentType = '';
        responseBodyDetectedFormat = 'text';
        responseBodyPrettyText = responseBodyRawText;
        responseBodyIsJson = false;
        responseBodyFormatMode = 'text';
        responseBodyViewMode = 'raw';
        updateResponseBodyView();
        headersEl.textContent = '';
      }

      switchResponseTab('body');
    }

    function toggleBodyMode() {
      const modeEl = document.getElementById('bodyMode');
      const rawSection = document.getElementById('rawBodySection');
      const rawContainer = document.getElementById('rawBodyContainer');
      const noneSection = document.getElementById('noneBodySection');
      const binarySection = document.getElementById('binaryBodySection');
      const graphqlSection = document.getElementById('graphqlBodySection');
      const kvSection = document.getElementById('kvBodySection');
      if (!modeEl || !rawSection || !rawContainer || !noneSection || !binarySection || !graphqlSection || !kvSection) {
        return;
      }

      const mode = modeEl.value;
      rawContainer.classList.toggle('hidden', mode !== 'raw');
      rawSection.classList.toggle('hidden', mode !== 'raw');
      noneSection.classList.toggle('hidden', mode !== 'none');
      binarySection.classList.toggle('hidden', mode !== 'binary');
      graphqlSection.classList.toggle('hidden', mode !== 'graphql');
      kvSection.classList.toggle('hidden', mode !== 'form-data' && mode !== 'x-www-form-urlencoded');
      updateRawBodyActionsVisibility();
      updateRawBodyPlaceholder();
      if (mode === 'raw') {
        validateRawJson(false);
      } else {
        updateJsonStatus('', false);
      }
    }

    function toggleAuthFields() {
      const modeEl = document.getElementById('authType');
      const bearerSection = document.getElementById('bearerSection');
      const basicSection = document.getElementById('basicSection');
      if (!modeEl || !bearerSection || !basicSection) {
        return;
      }

      const mode = modeEl.value;
      bearerSection.classList.toggle('hidden', mode !== 'bearer');
      basicSection.classList.toggle('hidden', mode !== 'basic');
    }

    function buildRequestData() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawTypeEl = document.getElementById('rawType');
      const binaryFilePathEl = document.getElementById('binaryFilePath');
      const graphQLQueryEl = document.getElementById('graphQLQuery');
      const graphQLVariablesEl = document.getElementById('graphQLVariables');
      const baseUrlEl = document.getElementById('baseUrl');
      const requestDescriptionEl = document.getElementById('requestDescription');
      const methodEl = document.getElementById('method');
      const authTypeEl = document.getElementById('authType');
      const authBearerTokenEl = document.getElementById('authBearerToken');
      const authBasicUsernameEl = document.getElementById('authBasicUsername');
      const authBasicPasswordEl = document.getElementById('authBasicPassword');
      const envGroupSelectEl = document.getElementById('envGroupSelect');
      if (!bodyModeEl || !rawTypeEl || !binaryFilePathEl || !graphQLQueryEl || !graphQLVariablesEl || !baseUrlEl || !requestDescriptionEl || !methodEl || !authTypeEl || !authBearerTokenEl || !authBasicUsernameEl || !authBasicPasswordEl || !envGroupSelectEl) {
        alert('编辑器初始化失败，请关闭后重新打开请求编辑页。');
        return null;
      }

      const bodyMode = bodyModeEl.value;
      const rawType = rawTypeEl.value;
      const body = getRequestBodyValue();
      const binaryFilePath = binaryFilePathEl.value;
      const graphQLQuery = graphQLQueryEl.value;
      const graphQLVariables = graphQLVariablesEl.value;
      const paramsRows = collectRows('paramsBody');
      const headersRows = collectRows('headersBody');
      const bodyItemsRows = collectRows('bodyItemsBody');

      if (bodyMode === 'raw' && rawType === 'json' && body && body.trim() !== '') {
        try {
          JSON.parse(body);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'JSON 格式错误';
          switchTab('body');
          updateJsonStatus('JSON 错误：' + message, true);
          focusRequestBodyEditor();
          return null;
        }
      }

      if (bodyMode === 'graphql' && graphQLVariables.trim() !== '') {
        try {
          JSON.parse(graphQLVariables);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'JSON 格式错误';
          switchTab('body');
          alert('GraphQL Variables 必须是合法 JSON：' + message);
          graphQLVariablesEl.focus();
          return null;
        }
      }

      const parsedUrl = parseUrlInput(baseUrlEl.value);
      const finalUrl = buildFinalUrl(parsedUrl.baseUrl, parsedUrl.hash, paramsRows);
      const finalHeaders = buildHeaders(headersRows);

      return {
        id: requestId,
        name: requestName,
        description: requestDescriptionEl.value,
        method: methodEl.value,
        url: finalUrl,
        params: paramsRows,
        headers: finalHeaders,
        body: body,
        bodyMode: bodyMode,
        rawType: rawType,
        bodyItems: bodyItemsRows,
        binaryFilePath: binaryFilePath,
        graphQLQuery: graphQLQuery,
        graphQLVariables: graphQLVariables,
        authType: authTypeEl.value,
        authBearerToken: authBearerTokenEl.value,
        authBasicUsername: authBasicUsernameEl.value,
        authBasicPassword: authBasicPasswordEl.value,
        envGroupId: envGroupSelectEl.value || undefined
      };
    }

    function saveRequest() {
      syncRequestNameFromPathInput();
      const requestData = buildRequestData();
      if (!requestData) {
        return false;
      }

      vscode.postMessage({
        command: 'saveRequest',
        data: requestData
      });
      return true;
    }

    function saveAsRequest() {
      syncRequestNameFromPathInput();
      const requestData = buildRequestData();
      if (!requestData) {
        return false;
      }

      const suggestedName = (requestData.name || '').trim() ? (requestData.name + ' Copy') : 'New Request Copy';
      vscode.postMessage({
        command: 'saveAsRequest',
        data: {
          ...requestData,
          suggestedName
        }
      });
      return true;
    }

    function openCodePreview() {
      syncRequestNameFromPathInput();
      const requestData = buildRequestData();
      if (!requestData) {
        return;
      }

      vscode.postMessage({
        command: 'showCode',
        data: requestData
      });
    }

    function initBodyResize() {
      const bodyEl = document.getElementById('body');
      const resizeHandleEl = document.getElementById('bodyResizeHandle');
      if (!bodyEl || !resizeHandleEl) {
        return;
      }

      const storageKey = 'freeRequestBodyHeight:' + requestId;
      const savedHeight = Number(window.localStorage.getItem(storageKey) || '0');
      if (Number.isFinite(savedHeight) && savedHeight >= 120) {
        setRequestBodyEditorHeight(savedHeight);
      }

      const minHeight = 120;
      const maxHeight = Math.floor(window.innerHeight * 0.8);
      let startY = 0;
      let startHeight = 0;
      let resizing = false;

      const onMouseMove = (event) => {
        if (!resizing) {
          return;
        }
        const offset = event.clientY - startY;
        const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + offset));
        setRequestBodyEditorHeight(nextHeight);
      };

      const onMouseUp = () => {
        if (!resizing) {
          return;
        }
        resizing = false;
        document.body.style.userSelect = '';
        window.localStorage.setItem(storageKey, String(bodyEl.offsetHeight));
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      resizeHandleEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
        resizing = true;
        startY = event.clientY;
        const wrapperEl = getRequestBodyWrapper();
        startHeight = wrapperEl ? wrapperEl.offsetHeight : bodyEl.offsetHeight;
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    function initResponseBodyResize() {
      const respBodyEl = document.getElementById('respBody');
      const resizeHandleEl = document.getElementById('respBodyResizeHandle');
      const topResizeHandleEl = document.getElementById('respBodyResizeHandleTop');
      if (!respBodyEl || !resizeHandleEl || !topResizeHandleEl) {
        return;
      }

      const storageKey = 'freeRequestRespBodyHeight:' + requestId;
      const savedHeight = Number(window.localStorage.getItem(storageKey) || '0');
      if (Number.isFinite(savedHeight) && savedHeight >= 220) {
        respBodyEl.style.height = savedHeight + 'px';
      }

      const minHeight = 220;
      const maxHeight = Math.floor(window.innerHeight * 0.8);
      let startY = 0;
      let startHeight = 0;
      let resizing = false;

      const onMouseMove = (event, reverseDirection) => {
        if (!resizing) {
          return;
        }
        const offset = event.clientY - startY;
        const delta = reverseDirection ? -offset : offset;
        const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
        respBodyEl.style.height = nextHeight + 'px';
      };

      const attachResize = (handleEl, reverseDirection) => {
        const onMouseMoveBound = (event) => onMouseMove(event, reverseDirection);
        const onMouseUp = () => {
          if (!resizing) {
            return;
          }
          resizing = false;
          document.body.style.userSelect = '';
          window.localStorage.setItem(storageKey, String(respBodyEl.offsetHeight));
          window.removeEventListener('mousemove', onMouseMoveBound);
          window.removeEventListener('mouseup', onMouseUp);
        };

        handleEl.addEventListener('mousedown', (event) => {
          event.preventDefault();
          resizing = true;
          startY = event.clientY;
          startHeight = respBodyEl.offsetHeight;
          document.body.style.userSelect = 'none';
          window.addEventListener('mousemove', onMouseMoveBound);
          window.addEventListener('mouseup', onMouseUp);
        });
      };

      attachResize(resizeHandleEl, false);
      attachResize(topResizeHandleEl, true);
    }

    (Array.isArray(initialParams) ? initialParams : []).forEach((row) => createRow('paramsBody', row, syncUrlFromParamsRows));
    (Array.isArray(initialHeaders) ? initialHeaders : []).forEach((row) => createRow('headersBody', row));
    (Array.isArray(initialBodyItems) ? initialBodyItems : []).forEach((row) => createRow('bodyItemsBody', row));
    if (initialParams.length === 0) createRow('paramsBody', { key: '', value: '', enabled: true }, syncUrlFromParamsRows);
    if (initialHeaders.length === 0) createRow('headersBody', { key: '', value: '', enabled: true });
    if (initialBodyItems.length === 0) createRow('bodyItemsBody', { key: '', value: '', enabled: true });
    syncUrlFromParamsRows();
    populateEnvGroupSelect();
    try {
      initializeRequestBodyCodeEditor();
      toggleBodyMode();
      toggleAuthFields();
      initBodyResize();
      initResponseBodyResize();
    } catch (error) {
      console.error('Editor init error', error);
    }

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.querySelectorAll('.response-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchResponseTab(tab.dataset.respTab));
    });

    const addParamBtn = document.getElementById('addParamBtn');
    const addHeaderBtn = document.getElementById('addHeaderBtn');
    const addBodyItemBtn = document.getElementById('addBodyItemBtn');
    const saveBtn = document.getElementById('saveBtn');
    const saveAsBtn = document.getElementById('saveAsBtn');
    const codeBtn = document.getElementById('codeBtn');
    const baseUrlEl = document.getElementById('baseUrl');
    const requestDescriptionEl = document.getElementById('requestDescription');
    const bodyModeEl = document.getElementById('bodyMode');
    const rawTypeEl = document.getElementById('rawType');
    const bodyEl = document.getElementById('body');
    const binaryFilePathEl = document.getElementById('binaryFilePath');
    const pickBinaryFileBtn = document.getElementById('pickBinaryFileBtn');
    const graphQLQueryEl = document.getElementById('graphQLQuery');
    const graphQLVariablesEl = document.getElementById('graphQLVariables');
    const copyRequestBodyBtn = document.getElementById('copyRequestBodyBtn');
    const requestBodyPrettyBtn = document.getElementById('requestBodyPrettyBtn');
    const requestBodyRawBtn = document.getElementById('requestBodyRawBtn');
    const requestBodyFullscreenBtn = document.getElementById('requestBodyFullscreenBtn');
    const requestBodySearchBtn = document.getElementById('requestBodySearchBtn');
    const responseBodyFullscreenBtn = document.getElementById('responseBodyFullscreenBtn');
    const responseBodySearchBtn = document.getElementById('responseBodySearchBtn');
    const findTextEl = document.getElementById('findText');
    const replaceTextEl = document.getElementById('replaceText');
    const findPrevBtn = document.getElementById('findPrevBtn');
    const findNextBtn = document.getElementById('findNextBtn');
    const replaceOneBtn = document.getElementById('replaceOneBtn');
    const replaceAllBtn = document.getElementById('replaceAllBtn');
    const findCloseBtn = document.getElementById('findCloseBtn');
    const respFindTextEl = document.getElementById('respFindText');
    const respFindPrevBtn = document.getElementById('respFindPrevBtn');
    const respFindNextBtn = document.getElementById('respFindNextBtn');
    const respFindCloseBtn = document.getElementById('respFindCloseBtn');
    const authTypeEl = document.getElementById('authType');
    const pathRequestNameEl = document.getElementById('pathRequestName');
    const copyResponseBodyBtn = document.getElementById('copyResponseBodyBtn');
    const exportResponseFileBtn = document.getElementById('exportResponseFileBtn');
    const respWrapToggleBtn = document.getElementById('respWrapToggleBtn');
    const respPrettyBtn = document.getElementById('respPrettyBtn');
    const respRawBtn = document.getElementById('respRawBtn');
    const respBodyFormatEl = document.getElementById('respBodyFormat');
    const authBearerTokenEl = document.getElementById('authBearerToken');
    const authBasicUsernameEl = document.getElementById('authBasicUsername');
    const authBasicPasswordEl = document.getElementById('authBasicPassword');
    const envGroupSelectEl = document.getElementById('envGroupSelect');

    addParamBtn?.addEventListener('click', () => createRow('paramsBody', { key: '', value: '', enabled: true }, syncUrlFromParamsRows));
    addHeaderBtn?.addEventListener('click', () => createRow('headersBody', { key: '', value: '', enabled: true }));
    addBodyItemBtn?.addEventListener('click', () => createRow('bodyItemsBody', { key: '', value: '', enabled: true }));
    document.getElementById('baseUrl')?.addEventListener('input', syncParamsRowsFromUrl);
    saveBtn?.addEventListener('click', () => saveRequest());
    saveAsBtn?.addEventListener('click', () => saveAsRequest());
    codeBtn?.addEventListener('click', openCodePreview);
    bodyModeEl?.addEventListener('change', toggleBodyMode);
    rawTypeEl?.addEventListener('change', () => {
      requestBodyViewMode = 'raw';
      syncRequestBodyCodeEditorMode();
      updateRawBodyPlaceholder();
      validateRawJson(false);
      updateRawBodyActionsVisibility();
    });
    bodyEl?.addEventListener('input', () => {
      requestBodyViewMode = 'raw';
      validateRawJson(false);
      updateRequestBodyView();
      updateRequestBodyButtons();
    });
    pickBinaryFileBtn?.addEventListener('click', () => {
      vscode.postMessage({ command: 'browseBinaryFile', data: { id: requestId } });
    });
    copyRequestBodyBtn?.addEventListener('click', () => {
      const text = getRequestBodyValue();
      vscode.postMessage({
        command: 'copyText',
        data: {
          text,
          label: '请求 Body'
        }
      });
    });
    requestBodyFullscreenBtn?.addEventListener('click', () => {
      const rawBodyContainer = document.getElementById('rawBodyContainer');
      toggleFullscreenPanel(rawBodyContainer, requestBodyFullscreenBtn);
    });
    requestBodySearchBtn?.addEventListener('click', () => {
      switchTab('body');
      showFindWidget();
    });
    responseBodyFullscreenBtn?.addEventListener('click', () => {
      const responseBodyPanel = document.getElementById('resp-panel-body');
      toggleFullscreenPanel(responseBodyPanel, responseBodyFullscreenBtn);
    });
    responseBodySearchBtn?.addEventListener('click', () => {
      switchResponseTab('body');
      showResponseFindWidget();
    });
    requestBodyPrettyBtn?.addEventListener('click', prettyRawJsonBody);
    requestBodyRawBtn?.addEventListener('click', rawRawJsonBody);
    findPrevBtn?.addEventListener('click', () => findInBody(false));
    findNextBtn?.addEventListener('click', () => findInBody(true));
    replaceOneBtn?.addEventListener('click', replaceCurrentInBody);
    replaceAllBtn?.addEventListener('click', replaceAllInBody);
    findCloseBtn?.addEventListener('click', hideFindWidget);
    findTextEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        findInBody(!event.shiftKey);
      }
    });
    replaceTextEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        replaceCurrentInBody();
      }
    });
    respFindPrevBtn?.addEventListener('click', () => findInResponse(false));
    respFindNextBtn?.addEventListener('click', () => findInResponse(true));
    respFindCloseBtn?.addEventListener('click', hideResponseFindWidget);
    respFindTextEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        findInResponse(!event.shiftKey);
      }
    });
    document.addEventListener('keydown', (event) => {
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (isSaveShortcut) {
        event.preventDefault();
        saveRequest();
        return;
      }

      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) {
        const respPanelBody = document.getElementById('resp-panel-body');
        const responseContentEl = document.getElementById('responseContent');
        const selection = window.getSelection();
        const activeEl = document.activeElement;
        const selectionInResponse = !!(selection?.anchorNode && respPanelBody?.contains(selection.anchorNode));
        const focusInResponse = !!(activeEl && respPanelBody?.contains(activeEl));
        const canOpenResponseFind =
          !!respPanelBody &&
          !!responseContentEl &&
          !responseContentEl.classList.contains('hidden') &&
          respPanelBody.classList.contains('active') &&
          (selectionInResponse || focusInResponse);

        if (canOpenResponseFind) {
          event.preventDefault();
          showResponseFindWidget();
          return;
        }

        const bodyModeEl = document.getElementById('bodyMode');
        const rawTypeEl = document.getElementById('rawType');
        if (bodyModeEl?.value !== 'raw' || rawTypeEl?.value !== 'json') {
          return;
        }
        event.preventDefault();
        switchTab('body');
        showFindWidget();
        return;
      }

      if (event.key === 'Escape' && isFindWidgetVisible) {
        event.preventDefault();
        hideFindWidget();
        return;
      }

      if (event.key === 'Escape' && isResponseFindWidgetVisible) {
        event.preventDefault();
        hideResponseFindWidget();
        return;
      }

      if (event.key === 'Escape' && activeFullscreenTarget) {
        event.preventDefault();
        exitFullscreenPanel();
      }
    });
    authTypeEl?.addEventListener('change', toggleAuthFields);
    copyResponseBodyBtn?.addEventListener('click', () => {
      const text = responseBodyIsJson && responseBodyViewMode === 'pretty'
        ? responseBodyPrettyText
        : responseBodyRawText;
      vscode.postMessage({
        command: 'copyText',
        data: {
          text,
          label: '响应 Body'
        }
      });
    });
    exportResponseFileBtn?.addEventListener('click', () => {
      const text = responseBodyRawText || '';
      if (!text) {
        return;
      }
      vscode.postMessage({
        command: 'exportResponseToFile',
        data: {
          requestName,
          status: latestResponseMeta.status,
          statusText: latestResponseMeta.statusText,
          resolvedUrl: latestResponseMeta.resolvedUrl,
          headersText: latestResponseMeta.headersText,
          bodyText: text,
          bodyBase64: latestResponseMeta.bodyBase64,
          detectedFormat: responseBodyDetectedFormat,
          contentType: latestResponseMeta.contentType || responseBodyContentType
        }
      });
    });
    respWrapToggleBtn?.addEventListener('click', () => {
      responseBodyWrapEnabled = !responseBodyWrapEnabled;
      try {
        window.localStorage.setItem(responseWrapStorageKey, responseBodyWrapEnabled ? 'true' : 'false');
      } catch {
        // ignore localStorage write errors in restricted environments
      }
      updateResponseBodyView();
    });
    respPrettyBtn?.addEventListener('click', () => {
      responseBodyViewMode = 'pretty';
      updateResponseBodyView();
    });
    respRawBtn?.addEventListener('click', () => {
      responseBodyViewMode = 'raw';
      updateResponseBodyView();
    });
    respBodyFormatEl?.addEventListener('change', () => {
      responseBodyFormatMode = normalizeResponseFormat(respBodyFormatEl.value);
      updateResponseBodyView();
    });
    pathRequestNameEl?.addEventListener('blur', commitRequestNameRename);
    pathRequestNameEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRequestNameRename();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (pathRequestNameEl) {
          pathRequestNameEl.value = requestName;
          pathRequestNameEl.blur();
        }
      }
    });

    const sendBtn = document.getElementById('sendBtn');
    const sendAndDownloadBtn = document.getElementById('sendAndDownloadBtn');
    sendBtn?.addEventListener('click', () => {
      if (isSendingRequest) {
        vscode.postMessage({ command: 'cancelRequest', data: { id: requestId } });
        return;
      }

      const ok = saveRequest();
      if (ok) {
        setSendingState(true);
        setTimeout(() => {
          vscode.postMessage({ command: 'sendRequest', data: { id: requestId } });
        }, 120);
      }
    });

    sendAndDownloadBtn?.addEventListener('click', () => {
      if (isSendingRequest) {
        vscode.postMessage({ command: 'cancelRequest', data: { id: requestId } });
        return;
      }

      const ok = saveRequest();
      if (ok) {
        setSendingState(true);
        setTimeout(() => {
          vscode.postMessage({
            command: 'sendRequest',
            data: { id: requestId, exportAfterResponse: true }
          });
        }, 120);
      }
    });

    document.addEventListener('keydown', (event) => {
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if (!isModifierPressed || event.key.toLowerCase() !== 's') {
        const key = event.key.toLowerCase();
        if (isModifierPressed && key === 'h') {
          event.preventDefault();
          switchTab('body');
          showFindWidget();
          replaceTextEl?.focus();
          replaceTextEl?.select();
          return;
        }
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        saveAsRequest();
      } else {
        saveRequest();
      }
    });

    updateRequestPath();
    if (rawTypeEl) {
      rawTypeEl.value = initialRawType || 'json';
    }
    if (respBodyFormatEl) {
      respBodyFormatEl.value = normalizeResponseFormat(responseBodyFormatMode);
    }
    updateResponseBodyButtons();
    updateRequestBodyView();
    updateRequestBodyButtons();
    setSendingState(false);

    setupAutocompleteForElement(baseUrlEl);
    setupAutocompleteForElement(requestDescriptionEl);
    setupAutocompleteForElement(bodyEl);
    setupAutocompleteForElement(binaryFilePathEl);
    setupAutocompleteForElement(graphQLQueryEl);
    setupAutocompleteForElement(graphQLVariablesEl);
    setupAutocompleteForElement(authBearerTokenEl);
    setupAutocompleteForElement(authBasicUsernameEl);
    setupAutocompleteForElement(authBasicPasswordEl);
    envGroupSelectEl?.addEventListener('change', () => {
      if (autocompleteTargetEl) {
        updateAutocompleteForTarget(autocompleteTargetEl);
      }
    });
    window.addEventListener('resize', () => {
      if (autocompleteTargetEl) {
        positionAutocompletePopup(autocompleteTargetEl);
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.command !== 'requestResponse') {
        if (message && message.command === 'requestSendingState') {
          setSendingState(!!message.data?.isSending);
          return;
        }
        if (message && message.command === 'requestNameUpdated' && typeof message.data?.name === 'string') {
          requestName = message.data.name;
          updateRequestPath();
          return;
        }
        if (message && message.command === 'binaryFileSelected' && typeof message.data?.filePath === 'string') {
          if (binaryFilePathEl) {
            binaryFilePathEl.value = message.data.filePath;
          }
          return;
        }
        return;
      }
      setSendingState(false);
      renderResponse(message.data || {});
    });
