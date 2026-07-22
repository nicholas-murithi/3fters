// Approximate display-only conversion rate. Checkout/payment always happens in KES via M-Pesa —
// this only affects how prices are *shown* to browsing users.
const USD_RATE = 129; // 1 USD ≈ 129 KES (update periodically)

// Minimal dictionary for key static UI strings. Extend as needed.
const DICT = {
  en: {
    trackOrder: 'Track Order',
    about:      'About 3FTERS',
    login:      'Log In',
    signup:     'Sign Up',
    searchPlaceholder: '🔍 Search thrift finds...',
  },
  sw: {
    trackOrder: 'Fuatilia Oda',
    about:      'Kuhusu 3FTERS',
    login:      'Ingia',
    signup:     'Jisajili',
    searchPlaceholder: '🔍 Tafuta bidhaa...',
  }
};

export function getLanguage() {
  return localStorage.getItem('3fters_lang') || 'en';
}

export function getCurrency() {
  return localStorage.getItem('3fters_currency') || 'KES';
}

export function setLanguage(lang) {
  localStorage.setItem('3fters_lang', lang);
  applyLanguage();
}

export function setCurrency(currency) {
  localStorage.setItem('3fters_currency', currency);
  window.dispatchEvent(new Event('3fters:currency-changed'));
}

// Format a KES amount according to the current currency preference.
// Always pass the raw KES number from the database.
export function formatPrice(amountKES) {
  const currency = getCurrency();
  const amount   = Number(amountKES) || 0;

  if (currency === 'USD') {
    const usd = amount / USD_RATE;
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `KSh ${amount.toLocaleString()}`;
}

// Apply translations to any element with a data-i18n attribute,
// e.g. <a data-i18n="trackOrder">Track Order</a>
export function applyLanguage() {
  const lang = getLanguage();
  const dict = DICT[lang] || DICT.en;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) el.placeholder = dict[key];
  });

  document.documentElement.lang = lang;
}

// Wire up the dropdowns if present on the page
export function initPreferenceSelectors() {
  const langSelect = document.getElementById('langSelect');
  const currSelect = document.getElementById('currencySelect');

  if (langSelect) {
    langSelect.value = getLanguage();
    langSelect.addEventListener('change', () => setLanguage(langSelect.value));
  }
  if (currSelect) {
    currSelect.value = getCurrency();
    currSelect.addEventListener('change', () => setCurrency(currSelect.value));
  }

  applyLanguage();
}