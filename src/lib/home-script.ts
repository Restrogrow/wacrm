// Home page only: hero product slider and the product-tour tabs.
// Both auto-advance, stop on user interaction, and stay still for
// visitors who prefer reduced motion.
export const HOME_SCRIPT = `
(function(){
  "use strict";
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Hero slider ----------
  var slides = Array.prototype.slice.call(document.querySelectorAll('.h-slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.h-slider-nav button'));
  var url = document.querySelector('.h-url');
  var hero = document.querySelector('.h-hero-visual');
  var current = 0, timer = null, paused = false;

  function show(i){
    current = (i + slides.length) % slides.length;
    slides.forEach(function(s, n){ s.classList.toggle('is-active', n === current); s.setAttribute('aria-hidden', n === current ? 'false' : 'true'); });
    dots.forEach(function(d, n){ d.setAttribute('aria-selected', n === current ? 'true' : 'false'); d.tabIndex = n === current ? 0 : -1; });
    if (url && slides[current]) url.textContent = slides[current].getAttribute('data-url') || url.textContent;
  }
  function start(){ if (reduce || slides.length < 2) return; stop(); timer = setInterval(function(){ if (!paused) show(current + 1); }, 4200); }
  function stop(){ if (timer) clearInterval(timer); timer = null; }

  if (slides.length) {
    show(0);
    start();
    dots.forEach(function(d, n){
      d.addEventListener('click', function(){ show(n); start(); });
      d.addEventListener('keydown', function(e){
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          show(current + (e.key === 'ArrowRight' ? 1 : -1));
          dots[current].focus();
          start();
        }
      });
    });
    if (hero) {
      hero.addEventListener('mouseenter', function(){ paused = true; });
      hero.addEventListener('mouseleave', function(){ paused = false; });
    }
    document.addEventListener('visibilitychange', function(){ paused = document.hidden; });
  }

  // ---------- Product tour tabs ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.h-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.h-panel'));
  var tourTimer = null, tourIndex = 0, userPicked = false;

  function select(i, focus){
    tourIndex = (i + tabs.length) % tabs.length;
    tabs.forEach(function(t, n){
      var on = n === tourIndex;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var bar = t.querySelector('.h-prog');
      if (bar) { bar.classList.remove('run'); if (on && !userPicked && !reduce) { void bar.offsetWidth; bar.classList.add('run'); } }
    });
    panels.forEach(function(p, n){ p.classList.toggle('is-active', n === tourIndex); p.hidden = false; p.setAttribute('aria-hidden', n === tourIndex ? 'false' : 'true'); });
    if (focus) tabs[tourIndex].focus();
  }
  function tourStart(){
    if (reduce || userPicked || tabs.length < 2) return;
    if (tourTimer) clearInterval(tourTimer);
    tourTimer = setInterval(function(){ select(tourIndex + 1); }, 7000);
  }
  function pick(i, focus){ userPicked = true; if (tourTimer) clearInterval(tourTimer); select(i, focus); }

  if (tabs.length) {
    select(0);
    tabs.forEach(function(t, n){
      t.addEventListener('click', function(){ pick(n); });
      t.addEventListener('keydown', function(e){
        var k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); pick(tourIndex + 1, true); }
        if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); pick(tourIndex - 1, true); }
      });
    });
    // Only start rotating once the tour is on screen.
    var tour = document.querySelector('.h-tour');
    if (tour && 'IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function(entries){
        entries.forEach(function(en){ if (en.isIntersecting) { select(tourIndex); tourStart(); seen.disconnect(); } });
      }, { threshold: 0.35 });
      seen.observe(tour);
    } else { tourStart(); }
  }
})();
`;
