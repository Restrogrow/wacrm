// Shared vanilla-JS behavior for the marketing site: mobile nav
// toggle, monthly/yearly pricing toggle, and scroll-reveal animation.
export const LANDING_SCRIPT = `
(function(){
  "use strict";

  // Mobile nav toggle
  var navToggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function(){
      var isOpen = mobileNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    mobileNav.querySelectorAll('a').forEach(function(link){
      link.addEventListener('click', function(){
        mobileNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Pricing monthly/yearly toggle
  var cycleBtns = document.querySelectorAll('.cycle-btn');
  var cyclePanels = document.querySelectorAll('[data-cycle-panel]');
  cycleBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var cycle = btn.getAttribute('data-cycle');
      cycleBtns.forEach(function(b){
        var isActive = b === btn;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      cyclePanels.forEach(function(panel){
        panel.hidden = panel.getAttribute('data-cycle-panel') !== cycle;
      });
    });
  });

  // Scroll-reveal
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('is-visible'); });
  }
})();

`;
