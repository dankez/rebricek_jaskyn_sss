import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EMBED_OPTIONS, makeEmbedCode, makeShareUrls, readEmbedOptions, readShareSettings } from './share';

test('links preserve the metric and distinguish latest from a fixed year', () => {
  const latest = makeShareUrls('https://jaskyne.sss.sk', 'rankings', 'depth', null);
  const fixed = makeShareUrls('https://jaskyne.sss.sk', 'rankings', 'length', 2005);
  assert.equal(latest.link, 'https://jaskyne.sss.sk/?metric=depth&year=latest#rankings');
  assert.deepEqual(readShareSettings(new URL(latest.embed).search), { view: 'rankings', metric: 'depth', year: null });
  assert.deepEqual(readShareSettings(new URL(fixed.embed).search), { view: 'rankings', metric: 'length', year: 2005 });
  const code = makeEmbedCode(fixed.embed, 'rankings');
  assert.match(code, /&amp;year=2005/);
  assert.match(code, /Rebríček najdlhších jaskýň/);
  assert.match(code, /data-sss-ranking/);
  assert.match(code, /src="https:\/\/jaskyne\.sss\.sk\/embed-resize\.js"/);
  assert.match(makeEmbedCode(latest.embed, 'rankings'), /Rebríček najhlbších jaskýň/);
});

test('presentation links retain the selected animation and reject invalid year settings', () => {
  const urls = makeShareUrls('https://jaskyne.sss.sk', 'presentations', 'depth', null);
  assert.equal(urls.link, 'https://jaskyne.sss.sk/?metric=depth#presentations');
  assert.deepEqual(readShareSettings(new URL(urls.embed).search), { view: 'presentations', metric: 'depth', year: null });
  assert.doesNotMatch(makeEmbedCode(urls.embed, 'presentations'), /embed-resize\.js/);
  assert.equal(readShareSettings('?year=2005junk').year, null);
});

test('embed options round-trip while ordinary share links remain unchanged', () => {
  const options = { columns: ['name', 'value', 'change'] as const, colors: false, date: false };
  const urls = makeShareUrls('https://jaskyne.sss.sk', 'rankings', 'depth', 2005, { ...options, columns: [...options.columns] });
  assert.deepEqual(readEmbedOptions(new URL(urls.embed).search), options);
  assert.equal(urls.link, 'https://jaskyne.sss.sk/?metric=depth&year=2005#rankings');
  assert.deepEqual(readEmbedOptions(''), DEFAULT_EMBED_OPTIONS);
  assert.deepEqual(readEmbedOptions('?columns=unknown&colors=invalid'), DEFAULT_EMBED_OPTIONS);
});

test('fixed height embed works without a resize script', () => {
  const url = makeShareUrls('https://jaskyne.sss.sk', 'rankings', 'length', null).embed;
  const code = makeEmbedCode(url, 'rankings', 4200);
  assert.match(code, /height="4200"/);
  assert.doesNotMatch(code, /embed-resize\.js|data-sss-ranking/);
  assert.match(makeEmbedCode(url, 'rankings', -10), /height="100"/);
});
