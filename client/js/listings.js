import { formatPrice } from './preferences.js';

const API = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : 'https://threefters.onrender.com/api';

const WHATSAPP_NUMBER = '254721153625';

// ========================
// "THRIFT ONE FOR ME" — shown when an item is sold/out of stock, or when
// checkout loses the reservation race to another buyer.
// ========================
export function buildThriftRequestUrl(item) {
  const desc = item?.title ? `like "${item.title}"` : 'like the one I was looking at';
  const message =
    `Hi 3FTERS! The item I wanted is out of stock. ` +
    `Could you thrift something ${desc} for me? I'm happy to book your personal ` +
    `thrifting service (KSh 300/hr) if needed.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function renderOutOfStockNotice(item) {
  const waUrl = buildThriftRequestUrl(item);
  return `
    <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:14px;margin:12px 0">
      <strong style="color:#9a3412">This item is out of stock</strong>
      <p style="font-size:13px;color:#7c2d12;margin:6px 0 10px">
        Someone already snagged it — but we can thrift a similar piece for you.
      </p>
      <a href="${waUrl}" target="_blank" rel="noopener"
         style="display:inline-block;background:#8b5e3c;color:#fff;padding:10px 16px;
                border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
        🧭 Ask us to thrift one for you
      </a>
    </div>
  `;
}

// ========================
// LOAD ALL LISTINGS
// ========================
export async function loadListings() {
  const search    = document.getElementById('searchInput')?.value.trim() || '';
  const category  = document.getElementById('filterCategory')?.value || '';
  const size      = document.getElementById('filterSize')?.value || '';
  const condition = document.getElementById('filterCondition')?.value || '';
  const minPrice  = document.getElementById('filterMinPrice')?.value || '';
  const maxPrice  = document.getElementById('filterMaxPrice')?.value || '';
  const sort      = document.getElementById('filterSort')?.value || '';
  const gender    = document.getElementById('filterGender')?.value || '';
  const style     = document.getElementById('filterStyle')?.value || '';

  const params = new URLSearchParams();
  if (search)    params.append('search', search);
  if (category)  params.append('category', category);
  if (size)      params.append('size', size);
  if (condition) params.append('condition', condition);
  if (minPrice)  params.append('min_price', minPrice);
  if (maxPrice)  params.append('max_price', maxPrice);
  if (sort)      params.append('sort', sort);
  if (gender)    params.append('gender', gender);
  if (style)     params.append('style', style);

  const grid = document.getElementById('listingsGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-state">Loading...</div>';

  try {
    const res  = await fetch(`${API}/listings?${params}`);
    const data = await res.json();

    if (!data.length) {
      grid.innerHTML = '<div class="empty-state">No thrift finds found. Try different filters.</div>';
      return;
    }

    const wishlist = JSON.parse(localStorage.getItem('3fters_wishlist') || '[]');

    grid.innerHTML = data.map(item => `
      <div class="product-card animate">
        <div class="pc-media" onclick="window.location.href='/client/listing.html?id=${item.id}'">
          <img
            src="${item.images?.[0] || '/eimages/placeholder.png'}"
            alt="${item.title}"
            loading="lazy"
          >
          <span class="card-badge">${item.condition}</span>
          <span
            class="heart"
            role="button"
            aria-label="Add to wishlist"
            aria-pressed="${wishlist.includes(item.id)}"
            onclick="event.stopPropagation(); toggleWishlist(this, '${item.id}')"
          >${wishlist.includes(item.id) ? '❤️' : '♡'}</span>
        </div>
        <p class="pc-category">
          ${item.gender && item.gender !== 'unisex' ? (item.gender === 'men' ? 'Gents · ' : 'Ladies · ') : ''}${item.category || 'thrift'}
        </p>
        <h4 onclick="window.location.href='/client/listing.html?id=${item.id}'">${item.title}</h4>
        ${Number(item.review_count) > 0 ? `
          <p style="font-size:12px;color:#e8a33d;margin:2px 0">★ ${item.avg_rating} (${item.review_count})</p>
        ` : ''}
        <p class="price">
          ${item.original_price ? `<span class="price-old">${formatPrice(item.original_price)}</span> ` : ''}${formatPrice(item.price)}${item.original_price ? ' <span class="sale-badge">SALE</span>' : ''}
        </p>
        <p class="card-meta">${item.size ? 'Size ' + item.size : ''} · ${item.location || 'Kenya'}</p>
        <div class="pc-actions">
          <button
            class="btn-view"
            onclick="event.stopPropagation(); window.location.href='/client/listing.html?id=${item.id}'"
          >View</button>
          <button
            class="btn-add"
            onclick="event.stopPropagation(); addToCart('${item.id}')"
          >Add</button>
        </div>
      </div>
    `).join('');

    setTimeout(() => {
      document.querySelectorAll('.animate').forEach(el => el.classList.add('show'));
    }, 100);

  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Could not load listings. Is the server running?</div>';
  }
}

// ========================
// LOAD SINGLE LISTING
// ========================
export async function loadSingleListing() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = '/index.html'; return; }

  try {
    const res  = await fetch(`${API}/listings/${id}`);
    const item = await res.json();

    document.getElementById('mainImage').src = item.images?.[0] || '/eimages/placeholder.png';

    document.getElementById('thumbsContainer').innerHTML = (item.images || []).map((url, i) => `
      <img
        src="${url}"
        class="thumb ${i === 0 ? 'active' : ''}"
        onclick="document.getElementById('mainImage').src='${url}';
                 document.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));
                 this.classList.add('active')"
      >
    `).join('');

    document.getElementById('listingTitle').textContent     = item.title;
    document.getElementById('listingPrice').innerHTML =
      (item.original_price ? `<span class="price-old">${formatPrice(item.original_price)}</span> ` : '') +
      formatPrice(item.price) +
      (item.original_price ? ' <span class="sale-badge">SALE</span>' : '');
    document.getElementById('listingCondition').textContent = item.condition;
    document.getElementById('listingSize').textContent      = item.size || 'One size';
    document.getElementById('listingCategory').textContent  = item.category;
    document.getElementById('listingDesc').textContent      = item.description || 'No description.';
    document.getElementById('sellerLocation').textContent   = item.location || 'Kenya';

    window.__currentListing = item;

    if (item.status !== 'available') {
      const notice = document.getElementById('outOfStockNotice');
      if (notice) {
        notice.style.display = 'block';
        notice.innerHTML = renderOutOfStockNotice(item);
      }
      const actions = document.getElementById('listingActions');
      if (actions) actions.style.display = 'none';
    }

    loadReviews(id);

  } catch (err) {
    const detail = document.getElementById('listingDetail');
    if (detail) detail.innerHTML = '<p class="empty-state">Item not found.</p>';
  }
}

// ========================
// LOAD REVIEWS FOR A LISTING
// ========================
export async function loadReviews(listingId) {
  const summaryEl = document.getElementById('listingRatingSummary');
  const container = document.getElementById('reviewsContainer');
  if (!container) return;

  try {
    const res  = await fetch(`${API}/reviews/listing/${listingId}`);
    const data = await res.json();

    if (summaryEl) {
      summaryEl.textContent = data.total > 0
        ? `★ ${data.avg_rating} (${data.total} review${data.total === 1 ? '' : 's'})`
        : 'No reviews yet';
    }

    if (!data.reviews.length) {
      container.innerHTML = '<p style="font-size:13px;color:#777">No reviews yet for this item.</p>';
      return;
    }

    container.innerHTML = data.reviews.map(r => `
      <div style="border-bottom:1px solid #eee;padding:10px 0">
        <div style="display:flex;justify-content:space-between">
          <strong style="font-size:13px">${esc(r.buyer_name)}</strong>
          <span style="color:#e8a33d;font-size:13px">${'★'.repeat(Number(r.rating) || 0)}${'☆'.repeat(5 - (Number(r.rating) || 0))}</span>
        </div>
        ${r.comment ? `<p style="font-size:13px;color:#555;margin-top:4px">${esc(r.comment)}</p>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="font-size:13px;color:#777">Could not load reviews.</p>';
  }
}

// Escape user-supplied text before it goes into innerHTML.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ========================
// ADD TO CART
// ========================
export function addToCart(listingId) {
  const token = localStorage.getItem('3fters_token');
  if (!token) {
    window.location.href = '/client/login.html';
    return;
  }

  let cart = JSON.parse(localStorage.getItem('3fters_cart') || '[]');

  if (cart.find(i => i.id === listingId)) {
    showToast('Already in cart!');
    return;
  }

  cart.push({ id: listingId });
  localStorage.setItem('3fters_cart', JSON.stringify(cart));
  updateCartCount();
  showToast('Added to cart ✅');
}

// ========================
// CART COUNT BADGE
// ========================
export function updateCartCount() {
  const cart  = JSON.parse(localStorage.getItem('3fters_cart') || '[]');
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent   = cart.length;
    badge.style.display = cart.length > 0 ? 'inline' : 'none';
  }
}

// ========================
// WISHLIST TOGGLE
// ========================
export function toggleWishlist(heartEl, listingId) {
  const token = localStorage.getItem('3fters_token');
  if (!token) { window.location.href = '/client/login.html'; return; }

  let wishlist = JSON.parse(localStorage.getItem('3fters_wishlist') || '[]');
  const exists = wishlist.includes(listingId);

  if (exists) {
    wishlist = wishlist.filter(id => id !== listingId);
    heartEl.textContent = '♡';
    heartEl.setAttribute('aria-pressed', 'false');
  } else {
    wishlist.push(listingId);
    heartEl.textContent = '❤️';
    heartEl.setAttribute('aria-pressed', 'true');
  }

  localStorage.setItem('3fters_wishlist', JSON.stringify(wishlist));
  heartEl.style.transform = 'scale(1.4)';
  setTimeout(() => heartEl.style.transform = 'scale(1)', 200);
}

// ========================
// TOAST
// ========================
export function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

window.addToCart      = addToCart;
window.toggleWishlist = toggleWishlist;

window.addEventListener('3fters:currency-changed', () => {
  loadListings();
  if (window.__currentListing) loadSingleListing();
});