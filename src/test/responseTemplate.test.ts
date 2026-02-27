import test from 'node:test';
import assert from 'node:assert/strict';
import type { AxiosResponse } from 'axios';
import { buildResponseHtml } from '../view/responseTemplate';

function createResponse(data: unknown): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} },
    request: {}
  } as AxiosResponse;
}

test('buildResponseHtml 在对象响应时应启用 JSON Pretty/Raw 视图', () => {
  const html = buildResponseHtml(
    createResponse({ ok: true, name: 'free-request' }),
    12,
    128,
    'https://example.com/api'
  );

  assert.match(html, /const hasPrettyView = true;/);
  assert.match(html, /JSON 响应，支持 Pretty\/Raw 视图/);
});

test('buildResponseHtml 在非 JSON 文本响应时不启用 Pretty/Raw 视图', () => {
  const html = buildResponseHtml(
    createResponse('plain text response'),
    8,
    24,
    'https://example.com/text'
  );

  assert.match(html, /const hasPrettyView = false;/);
  assert.match(html, /非 JSON 响应/);
});
