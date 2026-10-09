import { stays } from './catalogue.js';
import { categoryOf, formatPrice } from './logic.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 800px)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const segment = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = t => 1 - (1 - t) ** 3;
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const neighbourhoodOf = stay => stay.location.split(',')[0];

let vw = innerWidth, vh = innerHeight;
const scenes = [];
let smooth;

/* Smooth, inertial wheel scrolling (mouse and trackpad); touch keeps native momentum. */
function setupSmoothScroll() {
  const native = { to: y => scrollTo({ top: y, behavior: reducedMotion.matches ? 'instant' : 'smooth' }) };
  if (!finePointer.matches || reducedMotion.matches) return native;
  let target = scrollY, current = scrollY, last = scrollY, running = false;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  const canScroll = (element, delta) => {
    for (let node = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        if ((delta < 0 && node.scrollTop > 0) || (delta > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1)) return true;
      }
    }
    return false;
  };
  const step = () => {
    if (Math.abs(scrollY - last) > 2) target = current = scrollY; // someone else scrolled (keyboard, scrollbar)
    current = lerp(current, target, .095);
    if (Math.abs(target - current) < .4) current = target;
    scrollTo(0, current);
    last = scrollY;
    if (current !== target) requestAnimationFrame(step); else running = false;
  };
  const run = () => { if (!running) { running = true; last = scrollY; requestAnimationFrame(step); } };
  addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (document.body.classList.contains('locked') || document.body.classList.contains('intro-lock')) return;
    if (canScroll(event.target, event.deltaY)) return;
    event.preventDefault();
    if (!running) target = current = scrollY;
    const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaMode === 2 ? event.deltaY * innerHeight : event.deltaY;
    target = clamp(target + delta, 0, max());
    run();
  }, { passive: false });
  return { to(y) { if (!running) current = scrollY; target = clamp(y, 0, max()); run(); } };
}

/* Scenes: pinned scenes report progress across their sticky run; flow scenes across their pass through the screen. */
function addScene(element, update, { pinned = true, setup } = {}) {
  if (element) scenes.push({ element, update, pinned, setup, p: -1, start: 0, range: 1 });
}
function measure() {
  vw = innerWidth; vh = innerHeight;
  for (const scene of scenes) {
    scene.setup?.();
    const top = scene.element.getBoundingClientRect().top + scrollY;
    if (scene.pinned) { scene.start = top; scene.range = Math.max(1, scene.element.offsetHeight - vh); }
    else { scene.start = top - vh; scene.range = scene.element.offsetHeight + vh; }
    scene.p = -1;
  }
  headerZones = $$('[data-header]');
  render();
}
let frame = 0;
function render() {
  frame = 0;
  const y = scrollY;
  for (const scene of scenes) {
    const p = clamp((y - scene.start) / scene.range);
    if (p !== scene.p) { scene.p = p; scene.update(p); }
  }
  updateHeader(y);
}
const requestRender = () => { if (!frame) frame = requestAnimationFrame(render); };

/* The header turns light over photographs and dark over cream. */
let headerZones = [];
const header = $('#site-header'), rail = $('.hs-rail b'), ring = $('.hs-emblem-ring');
function updateHeader(y) {
  // Read positions live: fonts, images and the collection all change heights after load.
  const zone = headerZones.find(element => { const box = element.getBoundingClientRect(); return box.top <= 56 && box.bottom > 56; });
  if (zone) header.dataset.theme = zone.dataset.headerNow || zone.dataset.header;
  header.classList.toggle('is-scrolled', y > 24);
  const max = Math.max(1, document.documentElement.scrollHeight - vh);
  if (rail) rail.style.transform = `scaleY(${(y / max).toFixed(4)})`;
  if (ring) ring.style.transform = `rotate(${(y * .06).toFixed(2)}deg)`;
}

/* A dome rising from the bottom edge until its cream covers the screen. */
function domeMotion(dome, { peek = .3 } = {}) {
  let size = 0, cover = 1;
  return {
    setup() {
      size = vw > vh ? Math.min(vw * .62, vh * 1.05) : vw * .94;
      dome.style.width = dome.style.height = `${size}px`;
      cover = (Math.hypot(vw / 2, vh / 2) * 2.08) / size;
    },
    apply(t) {
      const start = vh - size * peek + size / 2;
      const centre = lerp(start, vh / 2, t);
      dome.style.transform = `translate3d(-50%, ${(centre - size / 2).toFixed(1)}px, 0) scale(${lerp(1, cover, t).toFixed(4)})`;
    }
  };
}

function heroScene() {
  const hero = $('.hs-hero'), dome = $('#hero-dome'), media = $('.hs-hero-media'), chrome = $$('.tour-mini, .hs-hero-link');
  const motion = domeMotion(dome);
  let covered = false;
  addScene(hero, p => {
    const t = ease(segment(p, 0, .82));
    motion.apply(t);
    media.style.transform = `scale(${(1 + t * .1).toFixed(4)})`;
    chrome.forEach(element => { element.style.opacity = (1 - segment(p, 0, .18)).toFixed(3); element.inert = p > .18; });
    hero.dataset.headerNow = t > .5 ? 'dark' : 'light';
    const nowCovered = t > .96;
    if (nowCovered !== covered) { covered = nowCovered; dispatchEvent(new CustomEvent('hero-cover', { detail: covered })); }
  }, { setup: motion.setup });
}

function growScene() {
  const section = $('.hs-grow'), pin = $('.grow-pin'), frameEl = $('.grow-frame'), image = $('img', frameEl), before = $('.grow-before'), over = $('.grow-over');
  const overLines = $$('[data-lines]', over);
  addScene(pin, p => {
    const g = ease(segment(p, .12, .62));
    const w0 = Math.min(vw * (vw > vh ? .3 : .7), 460), h0 = w0 * .64;
    const w = lerp(w0, vw, g), h = lerp(h0, vh, g);
    const cy = lerp(vh * .38, vh / 2, g);
    const top = cy - h / 2, left = (vw - w) / 2;
    frameEl.style.clipPath = `inset(${top.toFixed(1)}px ${left.toFixed(1)}px ${(vh - top - h).toFixed(1)}px ${left.toFixed(1)}px)`;
    image.style.transform = `scale(${lerp(1.22, 1, g).toFixed(4)})`;
    const fade = segment(p, .1, .3);
    before.style.opacity = (1 - fade).toFixed(3);
    before.style.transform = `translate3d(0, ${(-50 * fade).toFixed(1)}px, 0)`;
    before.style.top = `${(vh * .38 + h0 / 2 + 34).toFixed(0)}px`;
    over.style.opacity = segment(p, .6, .7).toFixed(3);
    overLines.forEach(element => element.classList.toggle('in', p > .62));
    section.dataset.headerNow = g > .55 ? 'light' : 'dark';
  });
}

function acrossScene() {
  const section = $('.hs-across'), track = $('.across-track'), line = $('#city-line');
  const drifting = $$('[data-drift]', section), floating = $$('.w1, .w2, .w3, .pearl-photo, .pearl-country', section);
  const pointsBox = $('#city-points');
  let travel = 0, mapStart = .7, positions = [], points = [];
  // Neighbourhoods along a stylised line through the city, west to east.
  const stops = [['Shamshabad', .05], ['Kokapet', .17], ['Gachibowli', .29], ['HITEC City', .4], ['Film Nagar', .51], ['Jubilee Hills', .6], ['Banjara Hills', .7], ['Hussain Sagar', .8, 'mark'], ['Begumpet', .92]];
  pointsBox.innerHTML = stops.map(([name, , kind]) => {
    const homes = stays.filter(stay => neighbourhoodOf(stay) === name);
    if (kind === 'mark') return `<span class="city-point city-mark" data-at="${name}"><svg viewBox="0 0 40 44" aria-hidden="true"><path d="M8 42V22C8 13 14 7 20 3c6 4 12 10 12 19v20M4 42h32"/></svg><b>${name}</b><small>The city centre</small></span>`;
    const from = Math.min(...homes.map(stay => stay.price));
    return `<button type="button" class="city-point" data-at="${name}" data-hood="${name}"><i aria-hidden="true"></i><b>${name}</b><small>From ${formatPrice(from)}</small></button>`;
  }).join('');
  points = $$('.city-point', pointsBox);
  const placePoints = () => {
    const length = line.getTotalLength();
    stops.forEach(([, at], index) => {
      // Find the point on the line whose x matches this stop.
      let lo = 0, hi = length;
      for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (line.getPointAtLength(mid).x < at * 1400) lo = mid; else hi = mid; }
      const point = line.getPointAtLength(lo);
      points[index].style.left = `${(point.x / 1400 * 100).toFixed(2)}%`;
      points[index].style.top = `${(point.y / 260 * 100).toFixed(2)}%`;
      points[index].dataset.t = at;
    });
  };
  placePoints();
  pointsBox.addEventListener('click', event => {
    const button = event.target.closest('[data-hood]');
    if (!button) return;
    const finder = $('#stay-finder');
    $('[name=destination]', finder).value = button.dataset.hood;
    finder.requestSubmit();
  });
  addScene(section, p => {
    track.style.transform = travel ? `translate3d(${(-travel * p).toFixed(1)}px, 0, 0)` : '';
    for (const item of positions) {
      const centre = item.left + item.width / 2 - travel * p;
      const offset = (centre - vw / 2) / vw;
      item.element.style.translate = `${(offset * item.speed).toFixed(1)}px 0`;
    }
    drifting.forEach(element => { element.style.translate = `0 ${((p - .5) * Number(element.dataset.drift)).toFixed(1)}px`; });
    const drawn = easeOut(segment(p, mapStart, 1));
    line.style.strokeDashoffset = (1 - drawn).toFixed(4);
    points.forEach(point => point.classList.toggle('on', drawn > Number(point.dataset.t) * .96));
  }, {
    setup() {
      track.style.transform = 'none';
      if (phone.matches) {
        // Stacked: no pinning or sideways travel; the map draws as it scrolls into view.
        travel = 0; positions = []; section.style.height = '';
        floating.forEach(element => { element.style.translate = ''; });
        const mapPanel = $('.panel-map', section);
        mapStart = clamp((mapPanel.offsetTop - vh * .6) / Math.max(1, section.offsetHeight - vh), 0, .95);
        return;
      }
      travel = Math.max(0, track.scrollWidth - vw);
      section.style.height = `${travel + vh}px`;
      const trackLeft = track.getBoundingClientRect().left;
      const speeds = { w1: -90, w2: 70, w3: -40, 'pearl-photo': 120, 'pearl-country': -140 };
      positions = floating.map(element => {
        element.style.translate = '';
        const box = element.getBoundingClientRect();
        return { element, left: box.left - trackLeft, width: box.width, speed: speeds[[...element.classList].find(name => name in speeds)] || 0 };
      });
      const mapPanel = $('.panel-map', section);
      mapStart = travel ? clamp((mapPanel.getBoundingClientRect().left - trackLeft - vw * .55) / travel, 0, .98) : 0;
    }
  });
}

function cloudsScene() {
  const section = $('.hs-clouds'), strip = $('.clouds-strip'), aerial = $('.clouds-aerial img'), back = $('.clouds-edge-back');
  let edge = 0, total = 0;
  addScene(section, p => {
    const start = -vh * .45, end = -total;
    const t = ease(segment(p, 0, .92));
    strip.style.transform = `translate3d(0, ${lerp(start, end, t).toFixed(1)}px, 0)`;
    back.style.transform = `translate3d(0, ${((1 - t) * 60).toFixed(1)}px, 0)`;
    aerial.style.transform = `scale(${lerp(1.28, 1.02, segment(p, .4, 1)).toFixed(4)})`;
    section.dataset.headerNow = p > .78 ? 'light' : 'dark';
  }, {
    setup() {
      edge = vw * 900 / 2400;
      strip.style.setProperty('--edge', `${edge}px`);
      total = vh + edge + vh + edge;
    }
  });
}

/* The kinds of home: a sliver of photograph opens, the word spells itself out. */
function kindsScene() {
  const list = $('#kinds-list');
  if (!list) return;
  const kinds = [
    ['villa', 'Villas', '1613977257363-707ba9348227', 'Pools, lawns and room for everyone'],
    ['heritage', 'Heritage', '1600121848594-d8644e57abab', 'Courtyards, teak and a sense of history'],
    ['city', 'City', '1600210492486-724fe5c67fb0', 'A considered base for work and the week']
  ];
  list.innerHTML = kinds.map(([kind, word, photo, line], index) => {
    const homes = stays.filter(stay => categoryOf(stay) === kind);
    const from = Math.min(...homes.map(stay => stay.price)), most = Math.max(...homes.map(stay => stay.guests));
    return `<article class="kind" data-kind="${kind}">
      <div class="kind-meta"><span class="kind-index">${index + 1}</span><p>${homes.length} ${homes.length === 1 ? 'home' : 'homes'}<br>Up to ${most} guests</p><p class="kind-price">From ${formatPrice(from)} a night</p></div>
      <h3 class="kind-word display" aria-label="${word}">${[...word].map(letter => `<span aria-hidden="true">${letter}</span>`).join('')}</h3>
      <figure class="kind-photo"><img src="./assets/${photo}-1600.webp" srcset="./assets/${photo}-800.webp 800w, ./assets/${photo}-1600.webp 1600w" sizes="(max-width:700px) 80vw, 34vw" alt="" loading="lazy"></figure>
      <div class="kind-copy"><p class="hs-body">${line}. ${homes.map(stay => escapeHTML(stay.name)).join(', ')}.</p><button type="button" class="hs-link" data-show-kind="${kind}">See the ${word.toLowerCase()} homes</button></div>
    </article>`;
  }).join('');
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-show-kind]');
    if (!button) return;
    $(`.filters [data-filter="${button.dataset.showKind}"]`)?.click();
    const results = $('#collection-results');
    smooth.to(results.getBoundingClientRect().top + scrollY - 90);
  });
  $$('.kind', list).forEach(item => {
    const photo = $('.kind-photo', item), letters = $$('.kind-word span', item), meta = $('.kind-meta', item);
    addScene(item, p => {
      const open = ease(segment(p, .12, .5));
      // From a slanted sliver to the full frame.
      const a = lerp(47, 0, open), b = lerp(53, 100, open), c = lerp(51, 100, open), d = lerp(45, 0, open);
      photo.style.clipPath = `polygon(${a}% 0, ${b}% 0, ${c}% 100%, ${d}% 100%)`;
      photo.style.transform = `translate3d(0, ${((.5 - p) * 80).toFixed(1)}px, 0)`;
      letters.forEach((letter, i) => {
        const shown = easeOut(segment(p, .2 + i * .035, .34 + i * .035));
        letter.style.opacity = (.12 + shown * .88).toFixed(3);
        letter.style.transform = `translate3d(0, ${((1 - shown) * 40).toFixed(1)}px, 0)`;
      });
      meta.style.transform = `translate3d(0, ${((.5 - p) * 140).toFixed(1)}px, 0)`;
    }, { pinned: false });
  });
}

function duskScene() {
  const section = $('.hs-dusk'), image = $('.dusk-media img'), items = $$('#dusk-list li'), note = $('.dusk-note');
  const dome = $('#dusk-dome'), inner = $('.dome-two-inner'), list = $('#dusk-list');
  const motion = domeMotion(dome, { peek: 0 });
  addScene(section, p => {
    image.style.transform = `scale(${lerp(1.14, 1, segment(p, 0, .5)).toFixed(4)})`;
    const step = segment(p, .04, .46) * items.length;
    items.forEach((item, i) => item.className = i < Math.floor(step) ? 'past' : i === Math.floor(step) ? 'on' : '');
    note.style.opacity = segment(p, .08, .18).toFixed(3);
    const t = ease(segment(p, .5, .9));
    motion.apply(t);
    list.style.opacity = note.style.opacity = (segment(p, .08, .18) * (1 - segment(p, .5, .62))).toFixed(3);
    inner.style.opacity = segment(p, .7, .86).toFixed(3);
    inner.style.transform = `translate3d(-50%, calc(-50% + ${((1 - segment(p, .7, .95)) * 70).toFixed(1)}px), 0)`;
    section.dataset.headerNow = t > .5 ? 'dark' : 'light';
  }, { setup: motion.setup });
}

function flowScenes() {
  for (const section of $$('.hs-statement, .hs-plum, .hs-gallery')) {
    const drifting = $$('[data-drift]', section);
    addScene(section, p => drifting.forEach(element => {
      element.style.translate = `0 ${((p - .5) * Number(element.dataset.drift)).toFixed(1)}px`;
    }), { pinned: false });
  }
  const card = $('.swing-card');
  addScene(card, p => {
    const t = easeOut(segment(p, .05, .5));
    card.style.transform = `translate3d(${((1 - t) * 34).toFixed(2)}vw, 0, 0) rotate(${((1 - t) * 9).toFixed(2)}deg)`;
    card.style.opacity = (.2 + t * .8).toFixed(3);
  }, { pinned: false });
}

/* Statements reveal line by line, each line sliding up from behind a mask. */
function setupLines() {
  const elements = $$('[data-lines]');
  const split = element => {
    if (!element.dataset.text) element.dataset.text = element.textContent.trim().replace(/\s+/g, ' ');
    const words = element.dataset.text.split(' ');
    element.innerHTML = words.map(word => `<span class="lw">${escapeHTML(word)}</span>`).join(' ');
    const lines = [];
    let top = null, current = [];
    for (const word of $$('.lw', element)) {
      if (top === null || Math.abs(word.offsetTop - top) > 3) { if (current.length) lines.push(current); current = []; top = word.offsetTop; }
      current.push(word.textContent);
    }
    if (current.length) lines.push(current);
    element.innerHTML = lines.map((line, i) => `<span class="ln" style="--l:${i}"><span class="ln-i">${escapeHTML(line.join(' '))}</span></span>`).join('');
  };
  const splitAll = () => elements.forEach(split);
  splitAll();
  let width = innerWidth, timer;
  addEventListener('resize', () => {
    if (innerWidth === width) return;
    width = innerWidth; clearTimeout(timer); timer = setTimeout(splitAll, 200);
  });
  const watched = elements.filter(element => !element.closest('.grow-over'));
  if (reducedMotion.matches || !('IntersectionObserver' in window)) { elements.forEach(element => element.classList.add('in')); return; }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('in'); observer.unobserve(entry.target); }
  }), { threshold: .25 });
  watched.forEach(element => observer.observe(element));
}

/* Same-page links glide rather than jump. */
function setupAnchors() {
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    // Platform screens (#/…) belong to the router; from a screen, any link back to the story navigates normally.
    if ((href.startsWith('#/') && href !== '#/') || document.body.classList.contains('app-mode')) return;
    if (href === '#/' || href === '#') { event.preventDefault(); smooth.to(0); return; }
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    const offset = target.id === 'top' ? 0 : 20;
    smooth.to(target.getBoundingClientRect().top + scrollY - offset);
  });
}

export function setupScenes() {
  smooth = setupSmoothScroll();
  setupAnchors();
  if (reducedMotion.matches) {
    document.documentElement.classList.add('static-story');
    kindsScene(); // still builds the list; scenes below are skipped
    scenes.length = 0;
    acrossPointsOnly();
    setupLines();
    addEventListener('scroll', () => updateHeader(scrollY), { passive: true });
    measure();
    return smooth;
  }
  heroScene();
  growScene();
  acrossScene();
  cloudsScene();
  kindsScene();
  duskScene();
  flowScenes();
  document.fonts.ready.then(() => { setupLines(); measure(); });
  addEventListener('scroll', requestRender, { passive: true });
  addEventListener('resize', measure, { passive: true });
  addEventListener('story:layout', () => requestAnimationFrame(measure));
  phone.addEventListener('change', measure);
  addEventListener('load', measure, { once: true });
  new ResizeObserver(() => measure()).observe($('main'));
  // Late images and fonts can nudge the layout; re-measure once things settle.
  let settle;
  $('main').addEventListener('load', () => { clearTimeout(settle); settle = setTimeout(measure, 150); }, true);
  [1000, 3000].forEach(delay => setTimeout(measure, delay));
  measure();
  return smooth;
}

// Reduced motion keeps the interactive map without any of the scroll choreography.
function acrossPointsOnly() {
  acrossScene();
  const across = scenes.pop();
  across?.update(1);
}
