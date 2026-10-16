// Shared helpers for the admin dashboard pages (Home, Analytics, Reports, Settings).
export const BASE = '/client';

export const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : 'https://threefters.onrender.com/api';

const token = localStorage.getItem('3fters_token');
export const user = JSON.parse(localStorage.getItem('3fters_user') || '{}');

// UI guard only. The real protection is server-side: every /admin/stats route checks the role.
export function requireAdmin() {
  if (!token || user.role !== 'admin') {
    location.replace(`${BASE}/login.html`);
    throw new Error('Admin only');
  }
}

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
export const kes = n => 'KSh ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
export const initials = name => String(name || 'A').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'A';

export async function api(path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) { location.replace(`${BASE}/login.html`); throw new Error('Not authorised'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res;
}
export const apiJson = async path => (await api(path)).json();

// POST / PATCH / DELETE with a JSON body. Throws with the server's error message.
export async function apiSend(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401) { location.replace(`${BASE}/login.html`); throw new Error('Not authorised'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Image upload (multipart) — used by Add Listing
export async function apiUpload(path, formData) {
  const res = await fetch(API + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Kenyan number -> WhatsApp link (07xx / 01xx / 7xx / +254 / 254)
export function waLink(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(d)) d = '254' + d.slice(1);
  else if (/^[17]\d{8}$/.test(d)) d = '254' + d;
  return /^254[17]\d{8}$/.test(d) ? `https://wa.me/${d}` : null;
}

// Only allow https images from the database into <img src>
export const safeImg = u => (typeof u === 'string' && /^https:\/\//.test(u)) ? u : '';

export function growth(change, suffix = '%') {
  if (change === null || change === undefined) return '<span class="flat">new</span>';
  if (change === 0) return '<span class="flat">– 0' + suffix + '</span>';
  return change > 0 ? `<span class="up">↑ ${change}${suffix}</span>` : `<span class="down">↓ ${Math.abs(change)}${suffix}</span>`;
}

export function showError(msg) {
  const el = document.getElementById('err');
  if (!el) return;
  el.textContent = msg; el.style.display = msg ? 'block' : 'none';
}

export function logout() {
  localStorage.removeItem('3fters_token');
  localStorage.removeItem('3fters_user');
  location.href = '/';
}

export function statusPill(s) { return `<span class="status s-${esc(s)}">${esc(s)}</span>`; }

const ICONS = {
  home:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  file:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  box:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  shop:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16l-1.5 12h-13z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  trip:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
};
export const icon = n => ICONS[n] || '';

export function mountShell(active) {
  requireAdmin();
  document.body.classList.add('dash-body');
  const link = (key, href, label, ic) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${ICONS[ic]}<span>${label}</span></a>`;
  document.getElementById('sidebar').innerHTML = `
    <a class="brand" href="${BASE}/admin-home.html">
      <img src="/eimages/logo-v2.png" alt="3FTERS" onerror="this.outerHTML='<b style=&quot;font-size:22px&quot;>3FTERS</b>'">
      <span>Admin</span>
    </a>
    <nav class="nav">
      ${link('home', `${BASE}/admin-home.html`, 'Home', 'home')}
      <div class="sep">Store</div>
      ${link('orders', `${BASE}/admin-orders.html`, 'Orders', 'file')}
      ${link('listings', `${BASE}/admin-listings.html`, 'Listings', 'box')}
      ${link('users', `${BASE}/admin-users.html`, 'Users', 'users')}
      ${link('trips', `${BASE}/admin-trips.html`, 'Thrifting trips', 'trip')}
      <div class="sep">Insights</div>
      ${link('analytics', `${BASE}/admin-analytics.html`, 'Analytics', 'chart')}
      ${link('reports', `${BASE}/admin-reports.html`, 'Reports', 'report')}
      <div class="sep">Account</div>
      ${link('settings', `${BASE}/admin-settings.html`, 'Settings', 'gear')}
      ${link('shop', '/', 'View shop', 'shop')}
    </nav>
    <div class="me">
      <div class="avatar">${esc(initials(user.full_name))}</div>
      <div><b>${esc(user.full_name || 'Admin')}</b><small>Admin</small></div>
    </div>`;
  const close = () => document.body.classList.remove('nav-open');
  document.getElementById('menuBtn')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('overlay')?.addEventListener('click', close);
}

export function dayLabel(iso, short) {
  const d = new Date(iso + 'T00:00:00');
  return short ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}