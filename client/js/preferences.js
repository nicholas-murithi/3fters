// Approximate display-only conversion rates. Checkout/payment always happens in KES via M-Pesa —
// this only affects how prices are *shown* to browsing users.
const RATES = {
  KES: 1,
  USD: 1 / 129,   // 1 KES ≈ 0.00775 USD
  GBP: 1 / 165,   // 1 KES ≈ 0.00606 GBP
};
const SYMBOLS = { KES: 'KSh', USD: '$', GBP: '£' };

// Dictionary for static UI strings. Extend as needed — anything with
// a matching data-i18n attribute in the HTML gets swapped automatically.
const DICT = {
  en: {
    trackOrder: 'Track Order',
    about:      'About 3FTERS',
    login:      'Log In',
    signup:     'Sign Up',
    searchPlaceholder: '🔍 Search thrift finds...',

    allItems:      'All Thrift Items',
    shoes:         'Thrifted Shoes',
    tees:          'Vintage T-Shirts',
    jackets:       'Jackets',
    accessories:   'Accessories',
    myCart:        '🛒 My Cart',
    myOrders:      'My Orders',
    sellerDash:    'Seller Dashboard',
    adminPanel:    'Admin Panel',
    contactUs:     'Contact Us',
    faq:           'FAQ',

    heroTitle:    'Thrifted<br>Style Finds',
    heroSubtitle: 'Affordable, unique, and sustainable thrifted clothing and shoes curated just for you.',
    heroCta:      'Shop Thrift Finds',

    inspirationTitle:    'Thrifted<br>Inspirations',
    inspirationSubtitle: 'Curated thrift outfits to inspire your daily street and vintage looks.',
    inspirationCta:      'Explore Looks',

    trendingTitle: 'Trending Thrift Picks',
    filterAll:        'All',
    filterShoes:      'Shoes',
    filterTees:       'Vintage Tees',
    filterCaps:       'Caps',
    filterJackets:    'Jackets',
    filterStreetwear: 'Streetwear',
    anySize:      'All Sizes',
    anyCondition: 'Any Condition',

    featuresTitle: 'Why thrifters<br>love 3FTERS',
    feature1Title: 'Curated with Care',
    feature1Body:  'Every thrift item is cleaned, checked, and carefully selected.',
    feature2Title: 'Friendly Support',
    feature2Body:  "Need help choosing sizes or styles? We've got you.",
    feature3Title: 'Easy Returns',
    feature3Body:  'Simple and stress-free returns on thrift purchases.',

    newsletterPlaceholder: 'Enter your email for thrift drops',
    newsletterBtn:         'Submit',
    readStory:             'Read Story',
  },
  sw: {
    trackOrder: 'Fuatilia Oda',
    about:      'Kuhusu 3FTERS',
    login:      'Ingia',
    signup:     'Jisajili',
    searchPlaceholder: '🔍 Tafuta bidhaa...',

    allItems:      'Bidhaa Zote',
    shoes:         'Viatu vya Mitumba',
    tees:          'Fulana za Zamani',
    jackets:       'Jaketi',
    accessories:   'Vifaa',
    myCart:        '🛒 Kikapu Changu',
    myOrders:      'Oda Zangu',
    sellerDash:    'Dashibodi ya Muuzaji',
    adminPanel:    'Paneli ya Msimamizi',
    contactUs:     'Wasiliana Nasi',
    faq:           'Maswali',

    heroTitle:    'Mitindo ya<br>Mitumba',
    heroSubtitle: 'Nguo na viatu vya mitumba nafuu, vya kipekee, na endelevu — vilivyochaguliwa kwa ajili yako.',
    heroCta:      'Nunua Bidhaa za Mitumba',

    inspirationTitle:    'Mawazo ya<br>Mitumba',
    inspirationSubtitle: 'Mavazi yaliyochaguliwa kukuvutia kwa mtindo wa mtaani na wa zamani.',
    inspirationCta:      'Angalia Mitindo',

    trendingTitle: 'Bidhaa Maarufu za Mitumba',
    filterAll:        'Zote',
    filterShoes:      'Viatu',
    filterTees:       'Fulana za Zamani',
    filterCaps:       'Kofia',
    filterJackets:    'Jaketi',
    filterStreetwear: 'Mtindo wa Mtaani',
    anySize:      'Saizi Zote',
    anyCondition: 'Hali Yoyote',

    featuresTitle: 'Kwa nini wanunuzi<br>wanapenda 3FTERS',
    feature1Title: 'Zilizochaguliwa kwa Makini',
    feature1Body:  'Kila bidhaa ya mitumba husafishwa, hukaguliwa, na huchaguliwa kwa makini.',
    feature2Title: 'Msaada wa Kirafiki',
    feature2Body:  'Unahitaji msaada kuchagua saizi au mitindo? Tuko hapa kwa ajili yako.',
    feature3Title: 'Marejesho Rahisi',
    feature3Body:  'Marejesho rahisi na yasiyo na usumbufu kwa manunuzi ya mitumba.',

    newsletterPlaceholder: 'Weka barua pepe yako kwa matoleo mapya',
    newsletterBtn:         'Tuma',
    readStory:             'Soma Zaidi',
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
  window.dispatchEvent(new Event('3fters:language-changed'));
}

export function setCurrency(currency) {
  localStorage.setItem('3fters_currency', currency);
  // Re-render anything already on the page (e.g. product cards) that
  // shows a price, so the switch takes effect immediately without a reload.
  window.dispatchEvent(new Event('3fters:currency-changed'));
}

// Format a KES amount according to the current currency preference.
// Always pass the raw KES number from the database.
export function formatPrice(amountKES) {
  const currency = getCurrency();
  const amount   = Number(amountKES) || 0;
  const rate     = RATES[currency] ?? 1;
  const symbol   = SYMBOLS[currency] ?? 'KSh';

  if (currency === 'KES') {
    return `${symbol} ${amount.toLocaleString()}`;
  }
  const converted = amount * rate;
  return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Apply translations to any element with a data-i18n attribute,
// e.g. <a data-i18n="trackOrder">Track Order</a>
export function applyLanguage() {
  const lang = getLanguage();
  const dict = DICT[lang] || DICT.en;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.innerHTML = dict[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) el.placeholder = dict[key];
  });

  document.documentElement.lang = lang;
}

// Wire up the dropdowns if present on the page.
// Supports both plain <select> markup (langSelect/currencySelect)
// and the custom .dropdown / .dropdown-menu span markup used on the homepage.
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

  // Custom dropdown markup: <span data-lang="sw">...</span> / <span data-currency="USD">...</span>
  document.querySelectorAll('[data-lang]').forEach(option => {
    option.addEventListener('click', () => {
      const menu    = option.closest('.dropdown-menu');
      const trigger = option.closest('.dropdown')?.querySelector('.dropdown-trigger');
      menu?.querySelectorAll('span').forEach(s => s.classList.remove('active-option'));
      option.classList.add('active-option');
      if (trigger) trigger.textContent = option.textContent + ' ▾';
      if (menu) { menu.style.display = 'none'; setTimeout(() => menu.style.display = '', 300); }
      setLanguage(option.dataset.lang);
    });
  });

  document.querySelectorAll('[data-currency]').forEach(option => {
    option.addEventListener('click', () => {
      const menu    = option.closest('.dropdown-menu');
      const trigger = option.closest('.dropdown')?.querySelector('.dropdown-trigger');
      menu?.querySelectorAll('span').forEach(s => s.classList.remove('active-option'));
      option.classList.add('active-option');
      if (trigger) trigger.textContent = option.textContent + ' ▾';
      if (menu) { menu.style.display = 'none'; setTimeout(() => menu.style.display = '', 300); }
      setCurrency(option.dataset.currency);
    });
  });

  applyLanguage();
}