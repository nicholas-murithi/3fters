// ========================
// SHARED MOBILE HAMBURGER MENU
// Wires up the ☰ button + slide-out panel that every
// client page includes. Also fills in the user's name
// and the Refer/Wishlist links inside it.
// ========================
import { getUser } from './auth.js';

export function initMobileNav() {
  const menuToggle = document.getElementById('menuToggle');
  const navGroup   = document.getElementById('navGroup');
  const closeMenu  = document.getElementById('closeMenu');

  function openNav() {
    navGroup?.classList.add('active');
    menuToggle?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeNav() {
    navGroup?.classList.remove('active');
    menuToggle?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  menuToggle?.addEventListener('click', openNav);
  closeMenu?.addEventListener('click', closeNav);
  document.querySelectorAll('.mobile-nav a').forEach(l => l.addEventListener('click', closeNav));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

  // Fill in "Hi, name" + Refer a friend + Wishlist inside the panel
  const mobileNavAuth = document.getElementById('mobileNavAuth');
  const user = getUser();

  if (mobileNavAuth) {
    if (user) {
      mobileNavAuth.innerHTML = `
        <span style="display:block;padding:12px 0;color:#777">👤 ${String(user.full_name?.split(' ')[0] || 'Account').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span>
        <a href="/client/referrals.html"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>Refer a friend</a>
        <a href="/client/wishlist.html">♡ Wishlist</a>
      `;
    } else {
      mobileNavAuth.innerHTML = `
        <a href="/client/login.html">Log In</a>
        <a href="/client/register.html">Sign Up</a>
      `;
    }
  }
}