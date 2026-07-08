import { protectSeller } from './auth.js';
import { showToast } from './listings.js';

protectSeller();

const API     = 'http://localhost:5000/api';
const token   = () => localStorage.getItem('3fters_token');
const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token()}`
});

// ========================
// LOAD STATS
// ========================
async function loadStats() {
  try {
    const [listRes, ordRes] = await Promise.all([
      fetch(`${API}/listings/seller/my-listings`, { headers: headers() }),
      fetch(`${API}/orders/seller-orders`,         { headers: headers() })
    ]);

    const listings = await listRes.json();
    const orders   = await ordRes.json();

    const active  = Array.isArray(listings) ? listings.filter(l => l.status === 'available').length : 0;
    const sold    = Array.isArray(listings) ? listings.filter(l => l.status === 'sold').length : 0;
    const pending = Array.isArray(orders)   ? orders.filter(o => o.status === 'pending').length : 0;
    const earned  = Array.isArray(orders)
      ? orders.filter(o => o.status === 'delivered')
              .reduce((sum, o) => sum + Number(o.amount), 0)
      : 0;

    document.getElementById('totalListings').textContent = active;
    document.getElementById('totalSold').textContent     = sold;
    document.getElementById('pendingOrders').textContent = pending;
    document.getElementById('totalEarnings').textContent = `KSh ${earned.toLocaleString()}`;
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ========================
// IMAGE UPLOAD PREVIEW
// ========================
const uploadBox  = document.getElementById('uploadBox');
const imageInput = document.getElementById('imageInput');
const previews   = document.getElementById('imagePreviews');
let selectedFiles = [];

uploadBox?.addEventListener('click', () => imageInput.click());

imageInput?.addEventListener('change', () => {
  selectedFiles = Array.from(imageInput.files).slice(0, 5);
  previews.innerHTML = '';

  selectedFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;margin:4px';
      previews.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

// ========================
// UPLOAD IMAGES TO CLOUDINARY via server
// ========================
async function uploadImages(files) {
  if (!files.length) return [];

  const formData = new FormData();
  files.forEach(file => formData.append('images', file));

  try {
    const res = await fetch(`${API}/upload`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token()}` },
      body:    formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.urls;

  } catch (err) {
    console.error('Upload error:', err);
    showToast('Image upload failed: ' + err.message);
    return [];
  }
}

// ========================
// SUBMIT LISTING
// ========================
document.getElementById('submitListing')?.addEventListener('click', async () => {
  const btn = document.getElementById('submitListing');
  btn.textContent = 'Uploading...';
  btn.disabled    = true;

  try {
    // Upload images first
    const imageUrls = await uploadImages(selectedFiles);

    const body = {
      title:       document.getElementById('listingTitle').value.trim(),
      description: document.getElementById('listingDesc').value.trim(),
      price:       document.getElementById('listingPrice').value,
      category:    document.getElementById('listingCategory').value,
      size:        document.getElementById('listingSize').value,
      condition:   document.getElementById('listingCondition').value,
      images:      imageUrls
    };

    if (!body.title || !body.price) {
      showToast('Title and price are required');
      btn.textContent = 'Post Listing';
      btn.disabled    = false;
      return;
    }

    const res = await fetch(`${API}/listings`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify(body)
    });

    const data = await res.json();

    if (res.ok) {
      btn.textContent = '✅ Posted!';
      showToast('Listing posted successfully!');

      // Reset form
      document.getElementById('listingTitle').value    = '';
      document.getElementById('listingDesc').value     = '';
      document.getElementById('listingPrice').value    = '';
      document.getElementById('listingCategory').value = '';
      document.getElementById('listingSize').value     = '';
      if (previews) previews.innerHTML = '';
      selectedFiles = [];

      setTimeout(() => {
        btn.textContent = 'Post Listing';
        btn.disabled    = false;
        loadSellerListings();
        loadStats();
      }, 2000);

    } else {
      throw new Error(data.error || 'Failed to post listing');
    }

  } catch (err) {
    showToast('Error: ' + err.message);
    btn.textContent = 'Post Listing';
    btn.disabled    = false;
  }
});

// ========================
// LOAD SELLER'S OWN LISTINGS
// ========================
async function loadSellerListings() {
  try {
    const res       = await fetch(`${API}/listings/seller/my-listings`, { headers: headers() });
    const data      = await res.json();
    const container = document.getElementById('sellerListings');

    if (!Array.isArray(data) || !data.length) {
      container.innerHTML = '<p class="empty-state">No listings yet. Add your first item above.</p>';
      return;
    }

    container.innerHTML = data.map(item => `
      <div style="background:white;border-radius:16px;padding:15px">
        <img
          src="${item.images?.[0] || '../eimages/placeholder.png'}"
          alt="${item.title}"
          style="width:100%;height:160px;object-fit:cover;border-radius:12px;margin-bottom:10px"
        >
        <h4 style="margin-bottom:5px">${item.title}</h4>
        <p class="price" style="margin-bottom:8px">KSh ${Number(item.price).toLocaleString()}</p>
        <span class="badge ${item.status}">${item.status}</span>
        <button
          onclick="deleteListing('${item.id}')"
          style="width:100%;padding:8px;background:#fee2e2;border:1px solid #fca5a5;
            border-radius:8px;cursor:pointer;margin-top:10px;font-size:13px"
        >🗑 Delete</button>
      </div>
    `).join('');

  } catch (err) {
    console.error('Load listings error:', err);
  }
}

// ========================
// DELETE LISTING
// ========================
window.deleteListing = async function(id) {
  if (!confirm('Delete this listing?')) return;

  await fetch(`${API}/listings/${id}`, {
    method:  'DELETE',
    headers: headers()
  });

  showToast('Listing deleted');
  loadSellerListings();
  loadStats();
};

// ========================
// LOAD SELLER ORDERS
// ========================
async function loadSellerOrders() {
  try {
    const res       = await fetch(`${API}/orders/seller-orders`, { headers: headers() });
    const orders    = await res.json();
    const container = document.getElementById('sellerOrders');

    if (!Array.isArray(orders) || !orders.length) {
      container.innerHTML = '<p class="empty-state">No orders yet.</p>';
      return;
    }

    container.innerHTML = orders.map(order => `
      <div style="background:white;border-radius:16px;padding:20px;
        margin-bottom:15px;display:flex;gap:15px;align-items:center">
        <img
          src="${order.images?.[0] || '../eimages/placeholder.png'}"
          style="width:70px;height:70px;border-radius:10px;object-fit:cover;flex-shrink:0"
        >
        <div style="flex:1">
          <h4 style="margin-bottom:4px">${order.title || 'Item'}</h4>
          <p style="font-size:13px;color:#777;margin-bottom:2px">
            Buyer: ${order.buyer_name || '—'}
          </p>
          <p style="font-size:13px;color:#777;margin-bottom:6px">
            Phone: ${order.buyer_phone || '—'}
          </p>
          <p class="price">KSh ${Number(order.amount).toLocaleString()}</p>
          <span class="badge ${order.status}">${order.status}</span>
        </div>
        <div style="flex-shrink:0">
          ${order.status === 'paid' ? `
            <button onclick="updateOrder('${order.id}','shipped')"
              style="padding:8px 14px;background:black;color:white;
                border:none;border-radius:8px;cursor:pointer;font-size:13px">
              Mark Shipped
            </button>` : ''}
          ${order.status === 'shipped' ? `
            <button onclick="updateOrder('${order.id}','delivered')"
              style="padding:8px 14px;background:#16a34a;color:white;
                border:none;border-radius:8px;cursor:pointer;font-size:13px">
              Mark Delivered
            </button>` : ''}
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Load orders error:', err);
  }
}

// ========================
// UPDATE ORDER STATUS
// ========================
window.updateOrder = async function(id, status) {
  await fetch(`${API}/orders/${id}/status`, {
    method:  'PATCH',
    headers: headers(),
    body:    JSON.stringify({ status })
  });
  showToast(`Order marked as ${status}`);
  loadSellerOrders();
  loadStats();
};

// ========================
// LOGOUT
// ========================
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('3fters_token');
  localStorage.removeItem('3fters_user');
  window.location.href = '/index.html';
});

// ========================
// INIT
// ========================
loadStats();
loadSellerListings();
loadSellerOrders();