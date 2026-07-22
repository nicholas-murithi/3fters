const API = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : 'https://threefters.onrender.com/api';


// REGISTER

export async function register(email, password, metadata) {
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email,
        password,
        full_name: metadata.full_name,
        phone:     metadata.phone,
        role:      metadata.role
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) return { error: { message: data.error } };

    // Auto login after register
    localStorage.setItem('3fters_token', data.token);
    localStorage.setItem('3fters_user',  JSON.stringify(data.user));

    return { data, error: null };

  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: { message: 'Request timed out. Is the server running?' } };
    }
    return { error: { message: 'Cannot connect to server. Run npm run dev first.' } };
  }
}


// LOGIN

export async function login(email, password) {
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
      signal:  controller.signal
    });

    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) return { error: { message: data.error } };

    localStorage.setItem('3fters_token', data.token);
    localStorage.setItem('3fters_user',  JSON.stringify(data.user));

    // Redirect based on role
    if (data.user.role === 'seller') {
      window.location.href = '/client/seller-dashboard.html';
    } else {
      window.location.href = '/index.html';
    }

    return { data, error: null };

  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: { message: 'Request timed out. Is the server running?' } };
    }
    return { error: { message: 'Cannot connect to server. Run npm run dev first.' } };
  }
}


// LOGOUT

export async function logout() {
  localStorage.removeItem('3fters_token');
  localStorage.removeItem('3fters_user');
  localStorage.removeItem('3fters_cart');
  window.location.href = '/index.html';
}


// GET CURRENT USER

export function getUser() {
  const user = localStorage.getItem('3fters_user');
  return user ? JSON.parse(user) : null;
}

export function getToken() {
  return localStorage.getItem('3fters_token');
}


// PROTECT PAGES

export function protectPage() {
  if (!getToken()) window.location.href = '/client/login.html';
}

export function protectSeller() {
  const user = getUser();
  if (!user) { window.location.href = '/client/login.html'; return; }
  if (user.role !== 'seller') window.location.href = '/index.html';
}

// UPDATE NAV

export function updateNav() {
  const user  = getUser();
  const navEl = document.getElementById('authNav');
  if (!navEl) return;

  if (user) {
    navEl.innerHTML = `
      ${user.role === 'admin' ? '<a href="/client/admin.html">Admin Panel</a>' : ''}
      ${user.role === 'seller'
        ? '<a href="/client/seller-dashboard.html">Dashboard</a>'
        : '<a href="/client/cart.html">🛒 Cart</a>'
      }
      <span class="nav-user">Hi, ${user.full_name?.split(' ')[0]}</span>
      <button class="logout-btn" id="logoutNavBtn">Log out</button>
    `;
    document.getElementById('logoutNavBtn')
      ?.addEventListener('click', logout);
  } else {
    navEl.innerHTML = `
      <a href="/client/login.html">Log in</a>
      <a href="/client/register.html" class="nav-register">Sign up</a>
    `;
  }
}


// UPDATE CART COUNT

export function updateCartCount() {
  const cart  = JSON.parse(localStorage.getItem('3fters_cart') || '[]');
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent   = cart.length;
    badge.style.display = cart.length > 0 ? 'inline' : 'none';
  }
}