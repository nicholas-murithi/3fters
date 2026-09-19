// Generates sitemap.xml on the fly from whatever's currently listed —
// thrifted items are one-off stock, so a static sitemap would go stale
// within days. This always reflects what's actually available right now.

const API_BASE = 'https://threefters.onrender.com/api';
const SITE     = 'https://3fters.vercel.app';

module.exports = async (req, res) => {
  let listings = [];
  try {
    const r = await fetch(`${API_BASE}/listings`);
    if (r.ok) listings = await r.json();
  } catch (err) {
    // fall through — still serve the static pages below even if the API is down
  }

  const staticPages = [
    '/client/index.html',
    '/client/about.html'
  ];

  const urls = [
    ...staticPages.map(path => `
  <url>
    <loc>${SITE}${path}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`),
    ...listings.map(item => `
  <url>
    <loc>${SITE}/client/listing.html?id=${item.id}</loc>
    <changefreq>hourly</changefreq>
    <priority>0.6</priority>
  </url>`)
  ].join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 's-maxage=1800, stale-while-revalidate' // 30 min edge cache
  });
  res.end(xml);
};