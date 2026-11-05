const fs = require('node:fs/promises');

const API_TOKEN = process.env.WEBFLOW_TOKEN;
const COLLECTION_ID = '677c5483872e84e4fa358f56';
const BASE_URL = 'https://www.freeway66.com/news/';
const SITEMAP_FILE = 'news-sitemap.xml';
const SITE_NAME = 'Freeway66';
const LANGUAGE = 'en';
// Freeway66 API field key observed in the live workflow response.
const DATE_FIELD = 'published-date';
const COLLECTIONS = [
  { name: 'News', id: COLLECTION_ID, baseUrl: BASE_URL, dateField: DATE_FIELD },
  { name: 'Trending News', id: '677c5483872e84e4fa358f64',
    baseUrl: 'https://www.freeway66.com/trending-news/', dateFieldName: 'Custom Published Date' },
];

async function resolveDateField(collection, fetchImpl = fetch) {
  if (collection.dateField) return collection.dateField;
  const response = await fetchImpl(`https://api.webflow.com/v2/collections/${collection.id}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${collection.name}: Webflow schema request failed with status ${response.status}`);
  const schema = await response.json();
  const fields = schema.fields?.filter(field =>
    field.displayName === collection.dateFieldName && field.type === 'DateTime');
  if (fields?.length !== 1 || !fields[0].slug) {
    throw new Error(`${collection.name}: expected one DateTime field named "${collection.dateFieldName}".`);
  }
  return fields[0].slug;
}

async function fetchItems(fetchImpl = fetch, collectionId = COLLECTION_ID) {
  const items = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const response = await fetchImpl(`https://api.webflow.com/v2/collections/${collectionId}/items/live?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Webflow API request failed with status ${response.status}`);
    }
    const resJson = await response.json();
    if (!Array.isArray(resJson.items)) {
      throw new Error('Webflow response is missing an items array.');
    }
    items.push(...resJson.items);
    const total = resJson.pagination?.total;
    if (resJson.items.length === 0 ||
        (Number.isFinite(total) && items.length >= total) ||
        (!Number.isFinite(total) && resJson.items.length < limit)) break;
    offset += resJson.items.length;
  }
  return items;
}

function filterRecentItems(items, now = Date.now(), dateField = DATE_FIELD) {
  const cutoff = now - 48 * 60 * 60 * 1000;
  return items.filter(item => !item.isDraft && !item.isArchived &&
    item.fieldData?.['shareable-draft'] !== true).map(item => {
    const value = item.fieldData?.[dateField];
    const publishedAt = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
    if (!Number.isFinite(publishedAt)) {
      const keys = Object.keys(item.fieldData || {}).join(', ');
      throw new Error(`Missing or invalid "${dateField}" for item ${item.id}. Available field keys: ${keys}. Confirm the API slug and populate dates on all published articles.`);
    }
    return { item, publishedAt, pubDate: new Date(publishedAt).toISOString() };
  }).filter(({ publishedAt }) => publishedAt > cutoff && publishedAt <= now);
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function generateSitemap(items) {
  if (items.length > 1000) throw new Error('More than 1,000 news articles: split into multiple news sitemaps before publishing.');
  const entries = items.map(({ item, pubDate, baseUrl = BASE_URL }) => {
    const slug = item.fieldData?.slug;
    if (!slug) throw new Error(`Missing slug for Webflow item ${item.id}`);
    const title = item.fieldData?.name || 'Untitled Article';

    return `
  <url>
    <loc>${escapeXml(baseUrl + slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>${SITE_NAME}</news:name>
        <news:language>${LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXml(title)}</news:title>
    </news:news>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>`;
}

async function collectRecentItems(fetchImpl = fetch, now = Date.now()) {
  const recentItems = [];
  for (const collection of COLLECTIONS) {
    try {
      const dateField = await resolveDateField(collection, fetchImpl);
      const items = await fetchItems(fetchImpl, collection.id);
      recentItems.push(...filterRecentItems(items, now, dateField)
        .map(row => ({ ...row, baseUrl: collection.baseUrl })));
    } catch (error) {
      throw new Error(`${collection.name}: ${error.message}`, { cause: error });
    }
  }
  return recentItems;
}

async function main() {
  if (!API_TOKEN) throw new Error('WEBFLOW_TOKEN is required.');
  const recentItems = await collectRecentItems();
  const sitemap = generateSitemap(recentItems);
  await fs.writeFile(SITEMAP_FILE, sitemap, 'utf8');
  console.log(`✅ Sitemap generated with ${recentItems.length} recent items`);
}

if (require.main === module) main().catch((err) => {
  console.error('Error generating sitemap:', err);
  process.exitCode = 1;
});

module.exports = { fetchItems, filterRecentItems, generateSitemap, collectRecentItems, resolveDateField, COLLECTIONS };
