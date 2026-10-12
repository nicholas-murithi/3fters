const sharp = require('sharp');
const fs = require('fs');
const pngToIco = require('png-to-ico');

const src = 'eimages/logo.png';
const clear = { r: 0, g: 0, b: 0, alpha: 0 };
const sq = (s) => sharp(src).resize(s, s, { fit: 'contain', background: clear }).png();

(async () => {
  await sq(48).toFile('favicon-48.png');
  await sq(96).toFile('favicon-96.png');
  await sq(192).toFile('icon-192.png');
  await sq(512).toFile('icon-512.png');
  await sq(180).flatten({ background: '#ffffff' }).toFile('apple-touch-icon.png');

  const bufs = await Promise.all([16, 32, 48].map((s) => sq(s).toBuffer()));
  fs.writeFileSync('favicon.ico', await pngToIco(bufs));

  // lighter header logo (replaces the 541 KB copy)
  await sharp(src).resize({ width: 480 }).png({ compressionLevel: 9, palette: true }).toFile('eimages/logo-v2.png');

  fs.writeFileSync('site.webmanifest', JSON.stringify({
    name: '3FTERS', short_name: '3FTERS', start_url: '/',
    display: 'browser', theme_color: '#5a3a22', background_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  }, null, 2));
  console.log('done');
})();
