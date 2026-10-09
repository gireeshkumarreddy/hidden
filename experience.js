import { stays } from './catalogue.js';
import { formatPrice } from './logic.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const html = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// The intro plays for a fresh visit to the top of the page; deep links go straight in.
const intro = $('#intro');
const playIntro = Boolean(intro) && !reducedMotion.matches && ['', '#top', '#/'].includes(location.hash);
if (playIntro) {
  html.classList.add('intro-on');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);
} else intro?.remove();

/* Home tour — chapters match the rendered film: one room every 3.45 s. */
const CHAPTER = 3.45, LEAD = .575;
const chapters = [
  ['THE ARRIVAL', 'Tashreef laaiye', 'do come in'],
  ['THE POOL LAWN', 'Thoda aaram kijiye', 'rest a little'],
  ['LIGHTS ON AT DUSK', 'Shaam-e-Hyderabad', 'a Hyderabad evening'],
  ['THE LIVING ROOM', 'Baithiye, chai ho jaaye', 'sit, have some chai'],
  ['A TABLE FOR EVERYONE', 'Dastarkhwan bichh gaya', 'the table is laid'],
  ['THE MASTER SUITE', 'Hallu hallu uthiye', 'wake up slowly'],
  ['POOLSIDE, UNHURRIED', 'Kya baat hai', 'what a place']
];

function setupTour() {
  const video = $('.hero-video');
  if (!video) return { start() {} };
  const tall = innerHeight > innerWidth * 1.15;
  video.poster = tall ? './assets/home-tour-poster-portrait.webp' : './assets/home-tour-poster.webp';
  video.src = tall ? video.dataset.srcTall : video.dataset.srcWide;
  video.muted = true;
  const label = $('#room-caption-text'), local = $('#tour-local'), toggle = $('#tour-toggle');
  $('#tour-progress').innerHTML = chapters.map(() => '<i><b></b></i>').join('');
  const bars = $$('#tour-progress b');
  let current = -1, frame = 0, visible = true, covered = false, started = false;
  let userPaused = reducedMotion.matches; // Reduced motion: the tour waits for a press of play.
  const chapterAt = time => Math.floor((time + LEAD) / CHAPTER) % chapters.length;

  function show(index) {
    if (index === current) return;
    current = index;
    const [title, phrase, meaning] = chapters[index];
    label.textContent = `0${index + 1} · ${title}`;
    local.innerHTML = `${phrase} <small>— ${meaning}</small>`;
    for (const element of [label, local]) { element.classList.remove('swap'); void element.offsetWidth; element.classList.add('swap'); }
  }
  function tick() {
    frame = 0;
    const time = video.currentTime, index = chapterAt(time), into = ((time + LEAD) % CHAPTER) / CHAPTER;
    show(index);
    bars.forEach((bar, i) => { bar.style.transform = `scaleX(${i < index ? 1 : i === index ? into.toFixed(4) : 0})`; });
    if (!video.paused) frame = requestAnimationFrame(tick);
  }
  function syncToggle() {
    const paused = video.paused;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Play the home tour' : 'Pause the home tour');
    toggle.classList.toggle('is-paused', paused);
  }
  function play() {
    if (!started || userPaused || !visible || covered || document.hidden) return;
    video.play().catch(() => { userPaused = true; syncToggle(); });
  }
  function seek(index) {
    const target = (index + chapters.length) % chapters.length;
    video.currentTime = target * CHAPTER;
    show(target); tick();
  }
  video.addEventListener('play', () => { syncToggle(); if (!frame) frame = requestAnimationFrame(tick); });
  video.addEventListener('pause', syncToggle);
  video.addEventListener('seeked', tick);
  $('#room-prev').addEventListener('click', () => seek(current - 1));
  $('#room-next').addEventListener('click', () => seek(current + 1));
  toggle.addEventListener('click', () => {
    userPaused = !video.paused;
    if (userPaused) video.pause(); else { started = true; play(); }
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play(); else video.pause();
  }, { threshold: .05 }).observe(video);
  // The dome covering the film counts as off screen.
  addEventListener('hero-cover', event => { covered = event.detail; if (covered) video.pause(); else play(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else play(); });
  show(0); syncToggle();
  return { start() { started = true; play(); } };
}

/* Intro: greeting, then a Qutb Shahi arch opens onto the film. */
async function runIntro(tour) {
  if (!playIntro) { html.classList.add('hero-ready'); tour.start(); return; }
  const door = $('.intro-door', intro);
  let finished = false;
  // Size the arch from the screen height so the greeting always fits above it,
  // and grow it just far enough to clear every corner of the screen.
  const unit = innerHeight / 90, span = innerWidth / unit;
  door.setAttribute('viewBox', `${(-span / 2).toFixed(3)} -45 ${span.toFixed(3)} 90`);
  door.setAttribute('preserveAspectRatio', 'none');
  intro.style.setProperty('--arch-unit', `${unit}px`);
  const cover = 1.12 * Math.max(innerWidth / (8.4 * unit), 15);
  intro.hidden = false;
  document.body.classList.add('intro-lock');

  const end = fast => {
    if (finished) return;
    finished = true;
    removeEventListener('keydown', onKey);
    removeEventListener('wheel', skip);
    removeEventListener('touchmove', skip);
    tour.start();
    document.body.classList.remove('intro-lock');
    html.classList.remove('intro-on');
    html.classList.add('hero-ready');
    intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fast ? 420 : 300, fill: 'forwards' }).finished.then(() => intro.remove());
  };
  const skip = () => end(true);
  const onKey = event => { if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); skip(); } };
  $('.intro-skip', intro).addEventListener('click', skip);
  addEventListener('keydown', onKey);
  addEventListener('wheel', skip, { passive: true });
  addEventListener('touchmove', skip, { passive: true });
  $('.intro-skip', intro).focus({ preventScroll: true });

  requestAnimationFrame(() => intro.classList.add('play'));
  await wait(1550); if (finished) return;
  intro.classList.add('open');
  tour.start();
  await wait(800); if (finished) return;
  intro.classList.add('leave');
  await door.animate([{ transform: 'scale(1)' }, { transform: `scale(${cover.toFixed(2)})` }], { duration: 1200, easing: 'cubic-bezier(.66,0,.22,1)', fill: 'forwards' }).finished.catch(() => {});
  end(false);
}

/* Cards and collection furniture arrive in a staggered cascade. */
const revealGroups = [
  ['rise', '.hp-head, .hp-searchbar, .pf-head, .footer-top > *, .footer-bottom'],
  ['card', '.pf-card, .hp-tile, .hp-promise, .hp-quote, .pf-trip']
];
let revealObserver;
function tagReveals(root = document) {
  for (const [variant, selector] of revealGroups) {
    const counters = new Map();
    for (const element of $$(selector, root).filter(item => !item.dataset.reveal)) {
      const index = counters.get(element.parentElement) || 0;
      counters.set(element.parentElement, index + 1);
      element.dataset.reveal = variant;
      element.style.setProperty('--i', Math.min(index, 7));
      revealObserver ? revealObserver.observe(element) : element.classList.add('is-in');
    }
  }
}
function setupReveals() {
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in'); revealObserver.unobserve(entry.target);
    }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  }
  html.classList.add('reveals-on');
  tagReveals();
  for (const root of [$('#home-platform'), $('#app-view')].filter(Boolean)) {
    new MutationObserver(() => tagReveals(root)).observe(root, { childList: true, subtree: true });
  }
  // The footer's Charminar draws itself when the statement arrives.
  const statement = $('.footer-statement');
  if (!statement) return;
  if (!revealObserver) { statement.classList.add('is-in'); return; }
  new IntersectionObserver(([entry], observer) => {
    if (entry.isIntersecting) { statement.classList.add('is-in'); observer.disconnect(); }
  }, { threshold: .3 }).observe(statement);
}

/* Ruby fill: every button and call to action floods red from the touch point. */
const fxSelector = 'button:not(.intro-skip):not(.to-top):not(.city-point):not(.hs-link):not(.pf-text-button):not(.hs-menu-toggle):not(.pf-map-item), .pf-button, .book-bar-cta, .outline-button, .pill-button, .solid-button, .site-footer nav a';
function primeFx(element) {
  if (element.classList.contains('fx')) return;
  element.classList.add('fx');
  if (getComputedStyle(element).position === 'static') element.classList.add('fx-rel');
}
function placeFx(element, event) {
  const box = element.getBoundingClientRect();
  element.style.setProperty('--mx', `${(event.clientX ?? box.left + box.width / 2) - box.left}px`);
  element.style.setProperty('--my', `${(event.clientY ?? box.top + box.height / 2) - box.top}px`);
  element.style.setProperty('--fx-d', `${Math.hypot(box.width, box.height) * 2.2}px`);
}
function setupFx() {
  $$(fxSelector).forEach(primeFx);
  const handle = event => {
    const element = event.target.closest?.(fxSelector);
    if (!element) return;
    primeFx(element); placeFx(element, event);
  };
  document.addEventListener('pointerover', handle, { passive: true });
  document.addEventListener('pointerdown', handle, { passive: true });
  document.addEventListener('focusin', event => { const element = event.target.closest?.(fxSelector); if (element) { primeFx(element); placeFx(element, {}); } });
}

/* Pointer polish: magnetic buttons, tilting cards and a following ring. */
function setupPointer() {
  if (!finePointer.matches || reducedMotion.matches) return;
  const magnetic = '.book-bar-cta, .pf-button, .pf-heart, .dialog-close, #room-prev, #room-next, #tour-toggle, .to-top, .hs-cta';
  let magnet = null, tilted = null;
  document.addEventListener('pointermove', event => {
    const target = event.target.closest?.(magnetic);
    if (magnet && magnet !== target) { magnet.style.translate = ''; magnet = null; }
    if (target) {
      const box = target.getBoundingClientRect();
      const x = (event.clientX - box.left - box.width / 2) / box.width, y = (event.clientY - box.top - box.height / 2) / box.height;
      target.style.translate = `${(x * Math.min(14, box.width * .18)).toFixed(1)}px ${(y * Math.min(10, box.height * .3)).toFixed(1)}px`;
      magnet = target;
    }
    const card = event.target.closest?.('.pf-card-media');
    if (tilted && tilted !== card) { tilted.style.transform = ''; tilted.classList.remove('tilting'); tilted = null; }
    if (card) {
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5, y = (event.clientY - box.top) / box.height - .5;
      card.classList.add('tilting');
      card.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`;
      tilted = card;
    }
  }, { passive: true });

  const ring = $('.cursor-ring'), ringLabel = $('span', ring);
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, running = false;
  const follow = () => {
    rx += (x - rx) * .2; ry += (y - ry) * .2;
    ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
    running = Math.abs(x - rx) + Math.abs(y - ry) > .3;
    if (running) requestAnimationFrame(follow);
  };
  document.addEventListener('pointermove', event => {
    x = event.clientX; y = event.clientY;
    ring.classList.add('on');
    const target = event.target;
    const label = target.closest?.('.pf-card-media, .kind-photo') ? 'View' : target.closest?.('.hs-hero-media') ? 'Tour' : target.closest?.('button.city-point') ? 'Homes' : '';
    ring.classList.toggle('has-label', Boolean(label));
    if (label) ringLabel.textContent = label;
    ring.classList.toggle('hover', !label && Boolean(target.closest?.('a, button, select, input, label, [role=button]')));
    if (!running) { running = true; requestAnimationFrame(follow); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => ring.classList.remove('on'));
  document.addEventListener('pointerdown', () => ring.classList.add('press'));
  document.addEventListener('pointerup', () => ring.classList.remove('press'));
}

/* Scroll furniture: progress line, back-to-top ring and the booking bar. */
function setupScrollUi(smooth) {
  const bar = $('.scroll-progress i'), toTop = $('#to-top'), ring = $('.to-top-ring', toTop), book = $('#book-bar');
  const hero = $('.hs-hero'), finder = $('#home-search'), footer = $('.site-footer');
  let finderVisible = false, footerVisible = false, frame = 0;
  const watch = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.target === finder) finderVisible = entry.isIntersecting;
    if (entry.target === footer) footerVisible = entry.isIntersecting;
    update();
  }));
  [finder, footer].filter(Boolean).forEach(element => watch.observe(element));
  function update() {
    frame = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const progress = Math.min(1, scrollY / max);
    bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    ring.style.strokeDashoffset = (1 - progress).toFixed(4);
    const showTop = scrollY > innerHeight * .9;
    toTop.classList.toggle('show', showTop); toTop.inert = !showTop;
    const showBook = !document.body.classList.contains('app-mode') && scrollY > hero.offsetTop + hero.offsetHeight - innerHeight * .4 && !finderVisible && !footerVisible && !document.body.classList.contains('locked');
    book.classList.toggle('show', showBook); book.inert = !showBook;
    document.body.classList.toggle('book-bar-on', showBook);
  }
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', update, { passive: true });
  addEventListener('hashchange', () => requestAnimationFrame(update));
  toTop.addEventListener('click', () => (smooth ? smooth.to(0) : scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' })));
  const cheapest = Math.min(...stays.map(stay => stay.price));
  $('#book-bar-price').innerHTML = `${stays.length} homes, from <strong>${formatPrice(cheapest)}</strong> a night`;
  update();
}

/* Hyderabad local time in the header. */
function setupCityClock() {
  const clock = $('.ist-clock');
  if (!clock) return;
  const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const render = () => { clock.textContent = `Hyderabad ${timeFormat.format(new Date()).replace(/\s?(am|pm)/i, (_, half) => ` ${half.toLowerCase()}`)}`; };
  render();
  setInterval(render, 30000);
}

export function setupExperience({ smooth } = {}) {
  const tour = setupTour();
  setupReveals();
  setupFx();
  setupPointer();
  setupScrollUi(smooth);
  setupCityClock();
  runIntro(tour);
}
