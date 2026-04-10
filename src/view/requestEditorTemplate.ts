import type { RequestModel } from '../models';
import type { EnvGroupOption, EnvGroupVariableMap } from './requestView';

type KeyValueRow = {
  key: string;
  value: string;
  enabled: boolean;
};

type CodeMirrorAssets = {
  cssUri?: string;
  coreUri?: string;
  modeJavascriptUri?: string;
  modeXmlUri?: string;
  modeCssUri?: string;
  modeHtmlmixedUri?: string;
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function splitUrlAndParams(rawUrl: string): { baseUrl: string; params: KeyValueRow[] } {
  try {
    const parsed = new URL(rawUrl);
    const params: KeyValueRow[] = [];
    parsed.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true });
    });
    const baseUrl = `${parsed.origin}${parsed.pathname}`;
    return { baseUrl, params };
  } catch {
    return { baseUrl: rawUrl, params: [] };
  }
}

export function buildRequestEditorHtml(
  request: RequestModel,
  collectionPath?: string,
  envGroupOptions: EnvGroupOption[] = [],
  envGroupVariableMap: EnvGroupVariableMap = {},
  requestEditorScriptUri = '',
  codeMirrorAssets: CodeMirrorAssets = {}
): string {
  const { params: urlParams } = splitUrlAndParams(request.url);
  const selectedBodyMode = request.bodyMode ?? 'raw';
  const selectedRawType = request.rawType ?? 'json';
  const params = Array.isArray(request.params) ? request.params : urlParams;
  const headerRows: KeyValueRow[] = Object.entries(request.headers).map(([key, value]) => ({
    key,
    value,
    enabled: true
  }));
  const normalizedCollectionPath = (collectionPath ?? '').trim();
  const requestEditorBootstrap = {
    requestId: request.id,
    requestName: request.name,
    collectionPath: normalizedCollectionPath,
    envGroupOptions,
    envGroupVariableMap,
    initialEnvGroupId: request.envGroupId ?? '',
    initialParams: params,
    initialHeaders: headerRows,
    initialRawType: selectedRawType,
    initialBodyItems: request.bodyItems ?? []
  };

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>请求编辑器</title>
  ${codeMirrorAssets.cssUri ? `<link rel="stylesheet" href="${codeMirrorAssets.cssUri}">` : ''}
  <style>
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .topbar { display: flex; gap: 8px; align-items: center; }
    .method-select { width: 110px; }
    .url-input { flex: 1; }
    .action-group { margin-left: auto; display: flex; gap: 8px; align-items: center; }
    .save-action-wrap { display: flex; align-items: center; gap: 8px; }
    .name-row { margin-top: 10px; display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: center; }
    .request-header { margin-bottom: 12px; }
    .request-header .name-row { margin-top: 0; }
    .request-path-wrap { display: flex; align-items: center; gap: 8px; }
    .request-path-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
    .request-path { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #444; background: #f5f5f5; border: 1px solid #e2e2e2; border-radius: 999px; padding: 4px 10px; }
    .env-select-wrap { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    .env-select-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
    .env-select { width: 220px; }
    .path-prefix { color: #666; white-space: nowrap; }
    .path-request-name { min-width: 120px; border: 0; outline: 0; background: transparent; padding: 0; margin: 0; font-size: 12px; font-weight: 600; color: #1f1f1f; }
    .description-row { margin-top: 10px; }
    .description-row label { display: block; margin-bottom: 6px; font-size: 12px; color: #666; }
    .description-input { min-height: 72px; resize: vertical; }
    .tabs { margin-top: 12px; display: flex; border-bottom: 1px solid #d9d9d9; }
    .tab { padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .tab-panel { display: none; margin-top: 10px; }
    .tab-panel.active { display: block; }
    .toolbar { margin-bottom: 8px; display: flex; gap: 8px; }
    .toolbar-spacer { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .raw-body-wrap { position: relative; }
    .fullscreen-panel {
      position: fixed !important;
      top: 12px;
      right: 12px;
      bottom: 12px;
      left: 12px;
      z-index: 1200;
      background: var(--vscode-editor-background, #ffffff);
      border: 1px solid var(--vscode-input-border, #cfcfcf);
      border-radius: 8px;
      padding: 10px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
    }
    .fullscreen-panel #body,
    .fullscreen-panel #respBody {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      height: 100% !important;
      overflow: auto !important;
    }
    .fullscreen-panel .raw-body-wrap {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .fullscreen-panel .response-body-wrap {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .fullscreen-panel #rawBodySection,
    .fullscreen-panel #resp-panel-body {
      min-height: 0;
    }
    .fullscreen-panel #jsonFindReplace,
    .fullscreen-panel #respFindWidget {
      flex-shrink: 0;
    }
    .fullscreen-panel .body-resize-handle {
      margin-top: 6px;
    }
    .fullscreen-exit-btn {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 2;
    }
    .find-replace-wrap {
      margin-bottom: 0;
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 6px;
      border: 1px solid var(--vscode-editorWidget-border, var(--vscode-input-border, #cfcfcf));
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background, #ffffff));
      border-radius: 4px;
      position: absolute;
      top: 8px;
      right: 8px;
      width: min(520px, calc(100% - 16px));
      z-index: 20;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    }
    .find-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .find-input {
      height: 26px;
      padding: 4px 8px;
      border-radius: 3px;
      border: 1px solid var(--vscode-input-border, #cfcfcf);
      background: var(--vscode-input-background, #ffffff);
      color: var(--vscode-input-foreground, inherit);
    }
    .find-row .find-input { flex: 1; min-width: 0; }
    .find-btn-group {
      display: inline-flex;
      border: 1px solid var(--vscode-input-border, #cfcfcf);
      border-radius: 3px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .find-btn {
      border: 0;
      border-right: 1px solid var(--vscode-input-border, #cfcfcf);
      border-radius: 0;
      min-width: 30px;
      padding: 4px 8px;
      line-height: 1;
      background: var(--vscode-editorWidget-background, var(--vscode-input-background, #ffffff));
      color: var(--vscode-foreground, inherit);
    }
    .find-btn:last-child { border-right: 0; }
    .find-btn:hover { background: var(--vscode-toolbar-hoverBackground, #f3f3f3); }
    .find-close-btn { min-width: 28px; font-size: 14px; font-weight: 600; }
    .find-status {
      min-width: 80px;
      text-align: right;
      margin-left: auto;
      white-space: nowrap;
    }
    input, select, textarea, button { font-family: inherit; font-size: 13px; }
    input, select, textarea { width: 100%; padding: 8px; border: 1px solid #cfcfcf; border-radius: 4px; box-sizing: border-box; }
    textarea { resize: none; }
    #body { min-height: 120px; height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; line-height: 1.5; }
    .CodeMirror {
      min-height: 120px;
      height: 220px;
      border: 1px solid #cfcfcf;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.5;
    }
    .CodeMirror-focused {
      border-color: var(--vscode-focusBorder, #007acc);
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 0;
    }
    .fullscreen-panel .CodeMirror {
      flex: 1 1 auto;
      min-height: 0;
      height: 100% !important;
    }
    #requestPrettyBody { min-height: 120px; height: 220px; max-height: none; }
    .body-resize-handle { height: 8px; margin-top: 4px; border-radius: 4px; background: linear-gradient(90deg, transparent 0%, #c9c9c9 20%, #c9c9c9 80%, transparent 100%); cursor: ns-resize; }
    .body-resize-handle:hover { background: linear-gradient(90deg, transparent 0%, #9e9e9e 20%, #9e9e9e 80%, transparent 100%); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e5e5; padding: 6px; text-align: left; }
    th { background: #f8f8f8; font-weight: 600; }
    .row-actions { width: 80px; text-align: center; }
    .row-input { width: 100%; border: 1px solid #d9d9d9; border-radius: 4px; padding: 6px; }
    .checkbox { width: 16px; height: 16px; }
    .btn { border: 1px solid #d0d0d0; background: #ffffff; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
    .btn-primary { background: #007acc; color: #fff; border-color: #007acc; }
    .topbar .btn { white-space: nowrap; }
    .footer { margin-top: 10px; display: flex; gap: 8px; }
    .hint { margin-top: 8px; font-size: 12px; color: #d32f2f; font-weight: 700; }
    .hidden { display: none; }
    .response-wrap { margin-top: 14px; border-top: 1px solid #e5e5e5; padding-top: 12px; }
    .response-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .response-meta { display: flex; gap: 12px; font-size: 12px; margin-bottom: 8px; }
    .response-url { font-size: 12px; color: #666; margin-bottom: 8px; word-break: break-all; }
    .response-tabs { display: flex; border-bottom: 1px solid #d9d9d9; }
    .response-tab { padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px; }
    .response-tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .response-panel { display: none; margin-top: 10px; }
    .response-panel.active { display: block; }
    .response-body-wrap { position: relative; }
    .response-find-widget {
      top: 8px;
      right: 8px;
      width: min(440px, calc(100% - 16px));
      z-index: 15;
    }
    .response-pre {
      margin: 0;
      padding: 10px;
      background: #f7f8fa;
      color: #1f2328;
      border: 1px solid #d0d7de;
      border-radius: 4px;
      overflow-x: auto;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 220px;
      height: 320px;
      max-height: 75vh;
      line-height: 1.5;
    }
    .response-empty { font-size: 12px; color: #666; }
    .response-pre.no-wrap {
      white-space: pre;
      word-break: normal;
    }
    #body,
    #respBody,
    #requestPrettyBody,
    #respHeaders {
      scrollbar-width: thin;
      scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4)) transparent;
    }
    #body::-webkit-scrollbar,
    #respBody::-webkit-scrollbar,
    #requestPrettyBody::-webkit-scrollbar,
    #respHeaders::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    #body::-webkit-scrollbar-thumb,
    #respBody::-webkit-scrollbar-thumb,
    #requestPrettyBody::-webkit-scrollbar-thumb,
    #respHeaders::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
      border-radius: 8px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    #body::-webkit-scrollbar-thumb:hover,
    #respBody::-webkit-scrollbar-thumb:hover,
    #requestPrettyBody::-webkit-scrollbar-thumb:hover,
    #respHeaders::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7));
      background-clip: content-box;
    }
    #body::-webkit-scrollbar-thumb:active,
    #respBody::-webkit-scrollbar-thumb:active,
    #requestPrettyBody::-webkit-scrollbar-thumb:active,
    #respHeaders::-webkit-scrollbar-thumb:active {
      background: var(--vscode-scrollbarSlider-activeBackground, rgba(191, 191, 191, 0.4));
      background-clip: content-box;
    }
    #body::-webkit-scrollbar-corner,
    #respBody::-webkit-scrollbar-corner,
    #requestPrettyBody::-webkit-scrollbar-corner,
    #respHeaders::-webkit-scrollbar-corner {
      background: transparent;
    }
    .json-status { font-size: 12px; color: #666; }
    .json-status.error { color: #d32f2f; font-weight: 700; }
    .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); font-weight: 700; }
    .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); font-weight: 500; }
    .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); font-weight: 600; }
    .json-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); font-weight: 700; }
    .json-null { color: var(--vscode-debugTokenExpression-value, #c586c0); font-style: normal; font-weight: 700; }
    .var-suggest {
      position: fixed;
      z-index: 999;
      min-width: 220px;
      max-width: 420px;
      max-height: 220px;
      overflow: auto;
      border: 1px solid var(--vscode-input-border, #cfcfcf);
      border-radius: 6px;
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background, #ffffff));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      padding: 4px;
    }
    .var-suggest-item {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--vscode-foreground, inherit);
      border-radius: 4px;
      padding: 6px 8px;
      cursor: pointer;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .var-suggest-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      white-space: nowrap;
      color: var(--vscode-foreground, inherit);
    }
    .var-suggest-match {
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .var-suggest-value {
      color: var(--vscode-descriptionForeground, #666);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      text-align: right;
    }
    .var-suggest-item.active,
    .var-suggest-item:hover {
      background: var(--vscode-list-hoverBackground, #f1f3f5);
    }
  </style>
</head>
<body>
  <div class="request-header">
    <div class="request-path-wrap">
      <span class="request-path-label">Path</span>
      <div class="request-path" id="requestPath">
        <span class="path-prefix" id="pathPrefix"></span>
        <input type="text" id="pathRequestName" class="path-request-name" value="${escapeHtml(request.name)}" aria-label="请求名称">
      </div>
      <div class="save-action-wrap">
        <button class="btn" id="saveBtn" type="button">Save</button>
        <button class="btn" id="saveAsBtn" type="button">Save As</button>
      </div>
      <div class="env-select-wrap">
        <span class="env-select-label">Environment</span>
        <select id="envGroupSelect" class="env-select"></select>
      </div>
    </div>
  </div>

  <div class="description-row">
    <label for="requestDescription">Description</label>
    <textarea id="requestDescription" class="description-input" placeholder="为该请求添加说明（可选）">${escapeHtml(request.description ?? '')}</textarea>
  </div>

  <div class="topbar">
    <select id="method" class="method-select">
      <option value="GET" ${request.method === 'GET' ? 'selected' : ''}>GET</option>
      <option value="POST" ${request.method === 'POST' ? 'selected' : ''}>POST</option>
      <option value="PUT" ${request.method === 'PUT' ? 'selected' : ''}>PUT</option>
      <option value="DELETE" ${request.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
      <option value="PATCH" ${request.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
      <option value="HEAD" ${request.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
      <option value="OPTIONS" ${request.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
    </select>
    <input type="text" id="baseUrl" class="url-input" value="${escapeHtml(request.url)}" placeholder="https://api.example.com/resource">
    <div class="action-group">
      <button class="btn btn-primary" id="sendBtn">Send</button>
      <button class="btn" id="sendAndDownloadBtn">Send & Download</button>
      <button class="btn" id="codeBtn">Code</button>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="params">Params</div>
    <div class="tab" data-tab="headers">Headers</div>
    <div class="tab" data-tab="auth">Auth</div>
    <div class="tab" data-tab="body">Body</div>
  </div>

  <section class="tab-panel active" id="tab-params">
    <div class="toolbar">
      <button class="btn" id="addParamBtn">+ Add Param</button>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:36px;">On</th>
          <th>Key</th>
          <th>Value</th>
          <th class="row-actions">操作</th>
        </tr>
      </thead>
      <tbody id="paramsBody"></tbody>
    </table>
  </section>

  <section class="tab-panel" id="tab-headers">
    <div class="toolbar">
      <button class="btn" id="addHeaderBtn">+ Add Header</button>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:36px;">On</th>
          <th>Key</th>
          <th>Value</th>
          <th class="row-actions">操作</th>
        </tr>
      </thead>
      <tbody id="headersBody"></tbody>
    </table>
  </section>

  <section class="tab-panel" id="tab-body">
    <div class="toolbar">
      <label for="bodyMode">Body Type</label>
      <select id="bodyMode">
        <option value="none" ${selectedBodyMode === 'none' ? 'selected' : ''}>none</option>
        <option value="form-data" ${selectedBodyMode === 'form-data' ? 'selected' : ''}>form-data</option>
        <option value="x-www-form-urlencoded" ${selectedBodyMode === 'x-www-form-urlencoded' ? 'selected' : ''}>x-www-form-urlencoded</option>
        <option value="raw" ${selectedBodyMode === 'raw' ? 'selected' : ''}>raw</option>
        <option value="binary" ${selectedBodyMode === 'binary' ? 'selected' : ''}>binary</option>
        <option value="graphql" ${selectedBodyMode === 'graphql' ? 'selected' : ''}>GraphQL</option>
      </select>
    </div>
    <div id="noneBodySection" class="hidden">
      <div class="hint">当前为 none 模式，请求不会携带 Body。</div>
    </div>
    <div id="rawBodyContainer">
      <div class="toolbar" id="rawTypeToolbar">
        <label for="rawType">Raw Type</label>
        <select id="rawType">
          <option value="text" ${selectedRawType === 'text' ? 'selected' : ''}>Text</option>
          <option value="javascript" ${selectedRawType === 'javascript' ? 'selected' : ''}>JavaScript</option>
          <option value="json" ${selectedRawType === 'json' ? 'selected' : ''}>JSON</option>
          <option value="html" ${selectedRawType === 'html' ? 'selected' : ''}>HTML</option>
          <option value="xml" ${selectedRawType === 'xml' ? 'selected' : ''}>XML</option>
        </select>
      </div>
      <div id="rawBodyActions" class="toolbar">
        <button class="btn" id="requestBodyFullscreenBtn" type="button">全屏</button>
        <button class="btn" id="requestBodyRawBtn" type="button">编辑</button>
        <button class="btn" id="requestBodyPrettyBtn" type="button">格式化</button>
        <button class="btn" id="copyRequestBodyBtn" type="button">Copy Body</button>
        <div class="toolbar-spacer">
          <button class="btn" id="requestBodySearchBtn" type="button">搜索</button>
        </div>
        <span id="jsonStatus" class="json-status"></span>
      </div>
      <div id="rawBodySection" class="raw-body-wrap">
      <div id="jsonFindReplace" class="find-replace-wrap hidden">
        <div class="find-row">
          <input id="findText" class="find-input" type="text" placeholder="查找">
          <div class="find-btn-group">
            <button class="btn find-btn" id="findPrevBtn" type="button" aria-label="上一项">↑</button>
            <button class="btn find-btn" id="findNextBtn" type="button" aria-label="下一项">↓</button>
          </div>
          <span id="findStatus" class="json-status find-status"></span>
          <button class="btn find-btn find-close-btn" id="findCloseBtn" type="button" aria-label="关闭查找">×</button>
        </div>
        <div class="find-row">
          <input id="replaceText" class="find-input" type="text" placeholder="替换">
          <div class="find-btn-group">
            <button class="btn find-btn" id="replaceOneBtn" type="button">替换</button>
            <button class="btn find-btn" id="replaceAllBtn" type="button">全部替换</button>
          </div>
        </div>
      </div>
      <textarea id="body" spellcheck="false" placeholder='请输入 JSON 请求体，例如 {"name":"free-request"}'>${escapeHtml(request.body || '')}</textarea>
      <pre id="requestPrettyBody" class="response-pre hidden"></pre>
      <div id="bodyResizeHandle" class="body-resize-handle" title="拖动调整 JSON 输入框高度"></div>
      </div>
    </div>
    <div id="binaryBodySection" class="hidden">
      <div class="toolbar">
        <button class="btn" id="pickBinaryFileBtn" type="button">选择文件</button>
      </div>
      <input id="binaryFilePath" type="text" value="${escapeHtml(request.binaryFilePath ?? '')}" placeholder="请选择二进制文件路径">
    </div>
    <div id="graphqlBodySection" class="hidden">
      <div class="name-row" style="margin-top:0; grid-template-columns: 90px 1fr;">
        <label for="graphQLQuery">Query</label>
        <textarea id="graphQLQuery" spellcheck="false" style="min-height: 160px; resize: vertical;" placeholder="query GetUser($id: ID!) { user(id: $id) { id name } }">${escapeHtml(request.graphQLQuery ?? '')}</textarea>
      </div>
      <div class="name-row" style="grid-template-columns: 90px 1fr; margin-top:8px;">
        <label for="graphQLVariables">Variables</label>
        <textarea id="graphQLVariables" spellcheck="false" style="min-height: 120px; resize: vertical;" placeholder='{"id":"1"}'>${escapeHtml(request.graphQLVariables ?? '')}</textarea>
      </div>
    </div>
    <div id="kvBodySection" class="hidden">
      <div class="toolbar">
        <button class="btn" id="addBodyItemBtn">+ Add Field</button>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:36px;">On</th>
            <th>Key</th>
            <th>Value</th>
            <th class="row-actions">操作</th>
          </tr>
        </thead>
        <tbody id="bodyItemsBody"></tbody>
      </table>
    </div>
  </section>

  <section class="tab-panel" id="tab-auth">
    <div class="toolbar">
      <label for="authType">Auth Type</label>
      <select id="authType">
        <option value="none" ${(request.authType ?? 'none') === 'none' ? 'selected' : ''}>No Auth</option>
        <option value="bearer" ${(request.authType ?? 'none') === 'bearer' ? 'selected' : ''}>Bearer Token</option>
        <option value="basic" ${(request.authType ?? 'none') === 'basic' ? 'selected' : ''}>Basic Auth</option>
      </select>
    </div>
    <div id="bearerSection" class="hidden">
      <input type="text" id="authBearerToken" value="${escapeHtml(request.authBearerToken ?? '')}" placeholder="Bearer Token">
    </div>
    <div id="basicSection" class="hidden">
      <div class="name-row" style="margin-top:0;">
        <label for="authBasicUsername">Username</label>
        <input type="text" id="authBasicUsername" value="${escapeHtml(request.authBasicUsername ?? '')}" placeholder="Username">
      </div>
      <div class="name-row" style="margin-top:8px;">
        <label for="authBasicPassword">Password</label>
        <input type="password" id="authBasicPassword" value="${escapeHtml(request.authBasicPassword ?? '')}" placeholder="Password">
      </div>
    </div>
  </section>

  <div class="hint">支持在 Params / URL / Header / Body / Auth 中使用自定义环境变量。例如: {{HOST}}</div>

  <div id="envVarSuggest" class="var-suggest hidden"></div>

  <div class="response-wrap">
    <div class="response-title">Response</div>
    <div id="responseEmpty" class="response-empty">点击 Send 后在此查看响应结果</div>
    <div id="responseContent" class="hidden">
      <div class="response-meta">
        <strong id="respStatus">Status: -</strong>
        <span id="respTime">Time: - ms</span>
        <span id="respSize">Size: - B</span>
      </div>
      <div id="respUrl" class="response-url"></div>

      <div class="response-tabs">
        <div class="response-tab active" data-resp-tab="body">Body</div>
        <div class="response-tab" data-resp-tab="headers">Headers</div>
      </div>

      <section id="resp-panel-body" class="response-panel active">
        <div class="toolbar">
          <button class="btn" id="responseBodyFullscreenBtn" type="button">全屏</button>
          <button class="btn" id="copyResponseBodyBtn" type="button">Copy Body</button>
          <button class="btn" id="exportResponseFileBtn" type="button">导出文件</button>
          <button class="btn" id="respWrapToggleBtn" type="button">自动换行</button>
          <button class="btn" id="respPrettyBtn" type="button">Pretty</button>
          <button class="btn" id="respRawBtn" type="button">Raw</button>
          <select id="respBodyFormat" style="width: 140px;">
            <option value="auto">Auto</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
            <option value="html">HTML</option>
            <option value="text">Text</option>
          </select>
          <span id="respJsonHint" class="json-status"></span>
          <div class="toolbar-spacer">
            <button class="btn" id="responseBodySearchBtn" type="button">搜索</button>
          </div>
        </div>
        <div class="response-body-wrap">
          <div id="respBodyResizeHandleTop" class="body-resize-handle" title="向上拖动可增大响应 Body 高度"></div>
          <div id="respFindWidget" class="find-replace-wrap response-find-widget hidden">
            <div class="find-row">
              <input id="respFindText" class="find-input" type="text" placeholder="查找响应内容">
              <div class="find-btn-group">
                <button class="btn find-btn" id="respFindPrevBtn" type="button" aria-label="上一项">↑</button>
                <button class="btn find-btn" id="respFindNextBtn" type="button" aria-label="下一项">↓</button>
              </div>
              <span id="respFindStatus" class="json-status find-status"></span>
              <button class="btn find-btn find-close-btn" id="respFindCloseBtn" type="button" aria-label="关闭查找">×</button>
            </div>
          </div>
          <pre id="respBody" class="response-pre"></pre>
          <div id="respBodyResizeHandle" class="body-resize-handle" title="拖动调整响应 Body 高度"></div>
        </div>
      </section>
      <section id="resp-panel-headers" class="response-panel">
        <pre id="respHeaders" class="response-pre"></pre>
      </section>
    </div>
  </div>

  <script id="requestEditorBootstrap" type="application/json">${toScriptJson(requestEditorBootstrap)}</script>
  ${codeMirrorAssets.coreUri ? `<script src="${codeMirrorAssets.coreUri}"></script>` : ''}
  ${codeMirrorAssets.modeJavascriptUri ? `<script src="${codeMirrorAssets.modeJavascriptUri}"></script>` : ''}
  ${codeMirrorAssets.modeXmlUri ? `<script src="${codeMirrorAssets.modeXmlUri}"></script>` : ''}
  ${codeMirrorAssets.modeCssUri ? `<script src="${codeMirrorAssets.modeCssUri}"></script>` : ''}
  ${codeMirrorAssets.modeHtmlmixedUri ? `<script src="${codeMirrorAssets.modeHtmlmixedUri}"></script>` : ''}
  <script src="${requestEditorScriptUri}"></script>
</body>
</html>
  `;
}
