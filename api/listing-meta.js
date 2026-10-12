// Serves a lightweight, bot-only HTML page with the CORRECT title/image/price
// for a single listing, so sharing a product link on WhatsApp/Facebook/
// Instagram shows the actual item instead of a generic 3FTERS card.
//
// Real human visitors never see this file directly — vercel.json only routes
// known link-preview bots here (see the rewrite rule); everyone else still
// gets the normal client/listing.html single-page app.

const API_BASE = 'https://threefters.onrender.com/api';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  const id = req.query.id;

  if (!id) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing listing id');
    return;
  }

  let item = null;
  try {
    const r = await fetch(`${API_BASE}/listings/${id}`);
    if (r.ok) item = await r.json();
  } catch (err) {
    // fall through to generic fallback below
  }

  const canonicalUrl = `https://www.3ftersstore.co.ke/client/listing.html?id=${encodeURIComponent(id)}`;

  const title = item
    ? `${item.title} — KSh ${Number(item.price).toLocaleString()} | 3FTERS`
    : '3FTERS  Thrift Everything';

  const description = item
    ? `${item.condition || 'Thrifted'} · ${item.size ? 'Size ' + item.size : 'One size'} — ${item.description ? item.description.slice(0, 140) : 'Shop this item and more on 3FTERS.'}`
    : 'Affordable, unique, and sustainable thrifted clothing and shoes curated just for you.';

  const image = item?.images?.[0] || 'https://www.3ftersstore.co.ke/eimages/logo-v2.png';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}"/>

  <meta property="og:site_name" content="3FTERS"/>
  <meta property="og:type" content="product"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(description)}"/>
  <meta property="og:image" content="${escapeHtml(image)}"/>
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}"/>

  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(title)}"/>
  <meta name="twitter:description" content="${escapeHtml(description)}"/>
  <meta name="twitter:image" content="${escapeHtml(image)}"/>

  <!-- If a real browser somehow lands here directly, send it to the real page -->
  <meta http-equiv="refresh" content="0; url=${escapeHtml(canonicalUrl)}"/>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(canonicalUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 's-maxage=600, stale-while-revalidate' // cache 10 min at the edge
  });
  res.end(html);
};