const fs = require('node:fs/promises');

const API_TOKEN = process.env.WEBFLOW_TOKEN;
const COLLECTION_ID = '677c5483872e84e4fa358f56';
const BASE_URL = 'https://www.freeway66.com/news/';
const SITEMAP_FILE = 'news-sitemap.xml';
const SITE_NAME = 'Freeway66';
const LANGUAGE = 'en';
// Freeway66 API field key observed in the live workflow response.
const DATE_FIELD = 'published-date';

async function fetchItems(fetchImpl = fetch) {
  const items = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const response = await fetchImpl(`https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live?limit=${limit}&offset=${offset}`, {
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

function filterRecentItems(items, now = Date.now()) {
  const cutoff = now - 48 * 60 * 60 * 1000;
  return items.filter(item => !item.isDraft && !item.isArchived &&
    item.fieldData?.['shareable-draft'] !== true).map(item => {
    const value = item.fieldData?.[DATE_FIELD];
    const publishedAt = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
    if (!Number.isFinite(publishedAt)) {
      const keys = Object.keys(item.fieldData || {}).join(', ');
      throw new Error(`Missing or invalid "${DATE_FIELD}" for item ${item.id}. Available field keys: ${keys}. Confirm the API slug and populate dates on all published articles.`);
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
  const entries = items.map(({ item, pubDate }) => {
    const slug = item.fieldData?.slug;
    if (!slug) throw new Error(`Missing slug for Webflow item ${item.id}`);
    const title = item.fieldData?.name || 'Untitled Article';

    return `
  <url>
    <loc>${escapeXml(BASE_URL + slug)}</loc>
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

async function main() {
  if (!API_TOKEN) throw new Error('WEBFLOW_TOKEN is required.');
  const items = await fetchItems();
  const recentItems = filterRecentItems(items);
  const sitemap = generateSitemap(recentItems);
  await fs.writeFile(SITEMAP_FILE, sitemap, 'utf8');
  console.log(`✅ Sitemap generated with ${recentItems.length} recent items`);
}

if (require.main === module) main().catch((err) => {
  console.error('Error generating sitemap:', err);
  process.exitCode = 1;
});

module.exports = { fetchItems, filterRecentItems, generateSitemap };
