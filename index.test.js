const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchItems, filterRecentItems, generateSitemap, collectRecentItems, resolveDateField, COLLECTIONS } = require('./index');

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

test('both collections use their own paths and date fields, including pagination', async () => {
  const urls = [];
  const rows = await collectRecentItems(async url => {
    urls.push(url);
    const trending = url.includes(COLLECTIONS[1].id);
    if (!url.includes('/items/live')) return { ok: true, json: async () => ({
      fields: [{ displayName: 'Custom Published Date', type: 'DateTime', slug: 'client-date' }]
    }) };
    const secondPage = url.includes('offset=1');
    const item = article('2026-10-29T12:00:00Z');
    if (trending) item.fieldData = { name: 'Trending story', slug: 'example',
      'client-date': secondPage ? '2026-10-20T12:00:00Z' : '2026-10-30T10:00:00Z' };
    return { ok: true, json: async () => ({ items: [item], pagination: { total: trending ? 2 : 1 } }) };
  }, now);
  const xml = generateSitemap(rows);
  assert.equal(rows.length, 2);
  assert.match(xml, /https:\/\/www.freeway66.com\/news\/example/);
  assert.match(xml, /https:\/\/www.freeway66.com\/trending-news\/example/);
  assert.match(xml, /2026-10-30T10:00:00.000Z/);
  assert.ok(urls.some(url => url.includes(COLLECTIONS[1].id) && url.includes('offset=1')));
});

test('Trending News schema errors fail instead of guessing a date field', async () => {
  for (const fields of [[], [{ displayName: 'Custom Published Date', type: 'PlainText', slug: 'date' }]]) {
    await assert.rejects(resolveDateField(COLLECTIONS[1], async () => ({
      ok: true, json: async () => ({ fields })
    })), /expected one DateTime field/);
  }
  await assert.rejects(resolveDateField(COLLECTIONS[1], async () => ({ ok: false, status: 403 })), /403/);
});

test('failure in the second collection prevents a partial combined result', async () => {
  await assert.rejects(collectRecentItems(async url => {
    if (url.includes(COLLECTIONS[1].id)) return { ok: false, status: 403 };
    return { ok: true, json: async () => ({ items: [article('2026-10-29T12:00:00Z')] }) };
  }, now), /Trending News.*403/);
});

test('news sitemap accepts 1,000 stories and rejects overflow', () => {
  const row = filterRecentItems([article('2026-10-29T12:00:00Z')], now)[0];
  assert.equal((generateSitemap(Array(1000).fill(row)).match(/<url>/g) || []).length, 1000);
  assert.throws(() => generateSitemap(Array(1001).fill(row)), /More than 1,000/);
});
