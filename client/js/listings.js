const API = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : 'https://threefters.onrender.com/api';

// ========================
// LOAD ALL LISTINGS
// ========================
export async function loadListings() {
  const search    = document.getElementById('searchInput')?.value.trim() || '';
  const category  = document.getElementById('filterCategory')?.value || '';
  const size      = document.getElementById('filterSize')?.value || '';
  const condition = document.getElementById('filterCondition')?.value || '';

  const params = new URLSearchParams();
  if (search)    params.append('search', search);
  if (category)  params.append('category', category);
  if (size)      params.append('size', size);
  if (condition) params.append('condition', condition);

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

    grid.innerHTML = data.map(item => `
      <div class="product-card animate"
        onclick="window.location.href='/client/listing.html?id=${item.id}'">
        <img
          src="${item.images?.[0] || '/eimages/placeholder.png'}"
          alt="${item.title}"
          loading="lazy"
        >
        <span
          class="heart"
          role="button"
          aria-label="Add to wishlist"
          aria-pressed="false"
          onclick="event.stopPropagation(); toggleWishlist(this, '${item.id}')"
        >♡</span>
        <div class="card-badge">${item.condition}</div>
        <h4>${item.title}</h4>
        <p class="price">KSh ${Number(item.price).toLocaleString()}</p>
        <p class="card-meta">${item.size ? 'Size ' + item.size : ''} · ${item.location || 'Kenya'}</p>
        <button
          class="add-to-cart-btn"
          onclick="event.stopPropagation(); addToCart('${item.id}')"
        >Add to Cart</button>
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
    document.getElementById('listingPrice').textContent     = `KSh ${Number(item.price).toLocaleString()}`;
    document.getElementById('listingCondition').textContent = item.condition;
    document.getElementById('listingSize').textContent      = item.size || 'One size';
    document.getElementById('listingCategory').textContent  = item.category;
    document.getElementById('listingDesc').textContent      = item.description || 'No description.';
    document.getElementById('sellerName').textContent       = item.full_name || 'Seller';
    document.getElementById('sellerLocation').textContent   = item.location || 'Kenya';

    window.__currentListing = item;

  } catch (err) {
    const detail = document.getElementById('listingDetail');
    if (detail) detail.innerHTML = '<p class="empty-state">Item not found.</p>';
  }
}

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