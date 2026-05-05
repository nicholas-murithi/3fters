// ==========================
// SCROLL ANIMATIONS
// ==========================
const animatedItems = document.querySelectorAll('.animate');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('show');
    }
  });
}, { threshold: 0.2 });

animatedItems.forEach(item => observer.observe(item));

// ==========================
// CARD HOVER EFFECT
// ==========================
document.querySelectorAll('.card, .gallery-card').forEach(card => {
  card.addEventListener('mouseenter', () => {
    card.style.transform = 'scale(1.03)';
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'scale(1)';
  });
});

// ==========================
// WISHLIST TOGGLE
// ==========================
document.querySelectorAll('.heart').forEach(heart => {
  heart.addEventListener('click', () => {
    heart.textContent = heart.textContent === '♡' ? '❤️' : '♡';
  });
});

// ==========================
// FILTER BUTTON ACTIVE STATE
// ==========================
document.querySelectorAll('.filters button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.filters .active')?.classList.remove('active');
    btn.classList.add('active');
  });
});

const menuToggle = document.getElementById("menuToggle");
const navGroup = document.getElementById("navGroup");
const closeMenu = document.getElementById("closeMenu");

// Open menu
menuToggle.addEventListener("click", () => {
  navGroup.classList.add("active");
});

// Close menu
closeMenu.addEventListener("click", () => {
  navGroup.classList.remove("active");
});



document.querySelectorAll('.mobile-nav a').forEach(link => {
  link.addEventListener('click', () => {
    navGroup.classList.remove('active');
  });
});