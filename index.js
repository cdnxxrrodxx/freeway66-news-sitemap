import fetch from 'node-fetch';
import fs from 'fs/promises';
import { config } from 'dotenv';
config();

const API_TOKEN = process.env.WEBFLOW_TOKEN;
const COLLECTION_ID = '677c5483872e84e4fa358f56';
const BASE_URL = 'https://www.freeway66.com/news/';
const SITEMAP_FILE = 'news-sitemap.xml';
const SITE_NAME = 'Freeway66';
const LANGUAGE = 'en';

async function fetchItems() {
  const response = await fetch(`https://api.webflow.com/v2/collections/${COLLECTION_ID}/items`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'accept-version': '1.0.0',
    },
  });

  const resJson = await response.json();
  if (!resJson.items) {
    console.error('❌ "items" is missing in the API response. Exiting...');
    console.log(JSON.stringify(resJson, null, 2));
    process.exit(1);
  }

  return resJson.items;
}

function filterRecentItems(items) {
  const now = new Date();
  return items.filter((item) => {
    const pubDate = new Date(item.lastPublished);
    const ageHours = (now - pubDate) / (1000 * 60 * 60);
    return ageHours <= 48;
  });
}

function generateSitemap(items) {
  const entries = items.map((item) => {
    const slug = item.fieldData?.slug || 'undefined';
    const title = item.fieldData?.name || 'Untitled Article';
    const pubDate = item.lastPublished;

    return `
  <url>
    <loc>${BASE_URL}${slug}</loc>
    <news:news>
      <news:publication>
        <news:name>${SITE_NAME}</news:name>
        <news:language>${LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title><![CDATA[${title}]]></news:title>
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
  const items = await fetchItems();
  const recentItems = filterRecentItems(items);
  const sitemap = generateSitemap(recentItems);
  await fs.writeFile(SITEMAP_FILE, sitemap, 'utf8');
  console.log(`✅ Sitemap generated with ${recentItems.length} recent items`);
}

main().catch((err) => {
  console.error('Error generating sitemap:', err);
});
