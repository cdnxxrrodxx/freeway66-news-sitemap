const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchItems, filterRecentItems, generateSitemap } = require('./index');

const now = Date.parse('2026-10-30T12:00:00Z');
function article(date, extra = {}) {
  return { id: 'example', lastPublished: new Date(now).toISOString(),
    fieldData: { name: 'News & updates ]]>', slug: 'example',
      'published-date': date }, ...extra };
}

test('custom date controls selection, including future and 48-hour boundaries', () => {
  const items = [
    article('2026-10-29T12:00:00Z'),
    article('2026-10-27T12:00:00Z'), // Republished today, originally older.
    article('2026-10-31T12:00:00Z'),
    article('2026-10-28T12:00:00Z'),
    article('2026-10-30T12:00:00Z')
  ];
  assert.deepEqual(filterRecentItems(items, now).map(row => row.item), [items[0], items[4]]);
});

test('unpublished, archived and shareable draft articles are excluded before date validation', () => {
  assert.deepEqual(filterRecentItems([
    article(undefined, { isDraft: true }),
    article(undefined, { isArchived: true }),
    article(undefined, { fieldData: { 'shareable-draft': true } })
  ], now), []);
});

test('missing or invalid custom date fails with field-key diagnostics', () => {
  for (const date of [undefined, null, '', 'invalid']) {
    assert.throws(() => filterRecentItems([article(date)], now), /published-date.*Available field keys/);
  }
});

test('XML uses custom date and Freeway66 URL, escaping title safely', () => {
  const xml = generateSitemap(filterRecentItems([article('2026-10-29T08:00:00-04:00')], now));
  assert.match(xml, /<news:publication_date>2026-10-29T12:00:00.000Z/);
  assert.match(xml, /https:\/\/www.freeway66.com\/news\/example/);
  assert.match(xml, /News &amp; updates ]]&gt;/);
  assert.doesNotMatch(generateSitemap([]), /<url>/);
});

test('live API pagination retrieves every page', async () => {
  const urls = [];
  const items = await fetchItems(async url => {
    urls.push(url);
    return { ok: true, json: async () => ({
      items: [{ id: urls.length }], pagination: { total: 2 }
    }) };
  });
  assert.equal(items.length, 2);
  assert.match(urls[0], /\/items\/live\?limit=100&offset=0$/);
  assert.match(urls[1], /offset=1$/);
});

test('API failures and malformed payloads fail the run', async () => {
  await assert.rejects(fetchItems(async () => ({ ok: false, status: 401 })), /401/);
  await assert.rejects(fetchItems(async () => ({ ok: true, json: async () => ({}) })), /items array/);
});
