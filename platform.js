// The booking platform: routing, home blocks and every screen after the story.
// Business flow follows https://www.hiddenstories.in/ — explore, stay details, booking,
// sign-in (email, Google, OTP), wishlist, trips, inbox and profile — backed by store.js.
import { stays } from './catalogue.js';
import { formatPrice, localDate, dateAfter, validateDates, nightsBetween } from './logic.js';
import {
  CLEANING_FEE, SERVICE_RATE, PRICE_CEILING, propertyTypes, amenityFilters, bookingSteps, sortOptions,
  hostFor, featuredReviewsFor, testimonials, houseRulesFor, cancellationPolicy, categories, typesForKeyword,
  collections, promises
} from './site-data.js';
import { friendly, nightsOf } from './store.js';
import { createStayMap, embedUrl, hasMapsKey, neighbourhoodOf, onMapsAuthFailure, CITY_QUERY } from './maps.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const photo = (id, width = 1600) => `./assets/${id}-${width}.webp`;
const photoSet = id => `${photo(id, 800)} 800w, ${photo(id, 1600)} 1600w`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const prettyDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const shortDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const stayById = id => stays.find(stay => stay.id === id);
const priceFor = (stay, checkIn, checkOut) => {
  const nights = checkIn && checkOut && !validateDates(checkIn, checkOut) ? nightsBetween(checkIn, checkOut) : 0;
  const subtotal = stay.price * nights, serviceFee = Math.round(subtotal * SERVICE_RATE);
  return { nights, subtotal, cleaningFee: nights ? CLEANING_FEE : 0, serviceFee, total: nights ? subtotal + CLEANING_FEE + serviceFee : 0 };
};
const read = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const keepLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

const GUEST_WISHLIST = 'hidden-stories:saved';
const today = localDate();
const state = {
  store: null,
  smooth: null,
  wishlist: new Set(readLocal(GUEST_WISHLIST, [])),
  search: read('hidden-stories:search', { checkIn: dateAfter(today, 7), checkOut: dateAfter(today, 10), guests: 2 }),
  booking: read('hidden-stories:booking', null),
  stopWatching: null,
  lastRoute: '#/',
  tripCount: 0
};
if (state.search.checkIn < today) Object.assign(state.search, { checkIn: dateAfter(today, 7), checkOut: dateAfter(today, 10) });
const saveSearch = () => keep('hidden-stories:search', state.search);
const view = () => $('#app-view');

function toast(message) {
  const element = $('#toast');
  element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 2800);
}
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
const requireUser = next => {
  if (state.store?.user) return true;
  go(`#/login?next=${encodeURIComponent(next)}`);
  return false;
};

/* ------------------------------------------------------------------ Shared pieces */
function card(stay) {
  const saved = state.wishlist.has(stay.id);
  return `<article class="pf-card">
    <a class="pf-card-media" href="#/stay/${stay.id}" aria-label="${esc(stay.name)}">
      <img src="${photo(stay.gallery[0], 800)}" srcset="${photoSet(stay.gallery[0])}" sizes="(max-width:700px) 90vw, 30vw" alt="" loading="lazy" width="800" height="600">
      ${stay.instantBook ? '<span class="pf-badge">Instant book</span>' : ''}
      <span class="pf-rating">★ ${stay.rating} · ${stay.reviews} reviews</span>
    </a>
    <button class="pf-heart" type="button" data-wish="${stay.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from' : 'Save to'} wishlist: ${esc(stay.name)}">${saved ? '♥' : '♡'}</button>
    <div class="pf-card-body">
      <p class="pf-card-cat">${esc(stay.category)}</p>
      <h3><a href="#/stay/${stay.id}">${esc(stay.name)}</a></h3>
      <p class="pf-card-loc">${esc(stay.location)}</p>
      <p class="pf-card-facts">${plural(stay.guests, 'guest')} · ${plural(stay.bedrooms, 'bedroom')} · ${plural(stay.bathrooms, 'bath')}</p>
      <div class="pf-card-foot"><p><strong>${formatPrice(stay.price)}</strong> / night</p><a class="pf-card-go" href="#/stay/${stay.id}" aria-label="View ${esc(stay.name)}">→</a></div>
    </div>
  </article>`;
}
const stepper = (name, value, min, max) => `<div class="pf-stepper" data-stepper="${name}"><button type="button" data-step="-1" aria-label="Fewer guests" ${value <= min ? 'disabled' : ''}>−</button><output aria-live="polite">${value}</output><button type="button" data-step="1" aria-label="More guests" ${value >= max ? 'disabled' : ''}>+</button></div>`;
const emptyState = (title, line, cta, href) => `<div class="pf-empty"><h2 class="display">${title}</h2><p>${line}</p><a class="pf-button" href="${href}">${cta}</a></div>`;
const signInPrompt = (title, next) => `<div class="pf-empty"><h2 class="display">${title}</h2><p>Sign in to see this. It only takes a moment.</p><a class="pf-button" href="#/login?next=${encodeURIComponent(next)}">Sign in</a></div>`;
const screenHead = (kicker, title, line = '') => `<header class="pf-head"><p class="hs-kicker">${kicker}</p><h1 class="display">${title}</h1>${line ? `<p class="pf-lead">${line}</p>` : ''}</header>`;

async function toggleWish(id) {
  const saved = !state.wishlist.has(id);
  saved ? state.wishlist.add(id) : state.wishlist.delete(id);
  $$(`[data-wish="${id}"]`).forEach(button => {
    button.setAttribute('aria-pressed', String(saved));
    button.textContent = button.classList.contains('pf-save') ? (saved ? '♥ Saved' : '♡ Save') : (saved ? '♥' : '♡');
  });
  updateBadges();
  toast(saved ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
  if (state.store?.user) {
    try { await state.store.setWish(id, saved); } catch (error) { toast(friendly(error)); }
  } else keepLocal(GUEST_WISHLIST, [...state.wishlist]);
  if (location.hash.startsWith('#/wishlist')) renderWishlist();
}

function syncHearts() {
  $$('[data-wish]').forEach(button => {
    const saved = state.wishlist.has(button.dataset.wish);
    button.setAttribute('aria-pressed', String(saved));
    button.textContent = button.classList.contains('pf-save') ? (saved ? '♥ Saved' : '♡ Save') : (saved ? '♥' : '♡');
  });
}

function updateBadges() {
  const wish = $('[data-count="wishlist"]'), trips = $('[data-count="trips"]'), account = $('[data-account]');
  if (wish) wish.textContent = state.wishlist.size ? state.wishlist.size : '';
  if (trips) trips.textContent = state.tripCount ? state.tripCount : '';
  if (account) {
    const user = state.store?.user;
    account.href = user ? '#/profile' : '#/login';
    account.innerHTML = user ? `<span class="hs-avatar" aria-hidden="true">${esc((user.name || user.email || 'Guest').charAt(0).toUpperCase())}</span><span class="visually-hidden">Your profile</span>` : 'Sign in';
  }
}

/* ------------------------------------------------------------------ Home blocks (below the story) */
function renderHome() {
  const root = $('#home-platform');
  if (!root) return;
  const { checkIn, checkOut, guests } = state.search;
  root.innerHTML = `
    <section class="hp-search" id="home-search" aria-labelledby="home-search-title">
      <p class="hs-kicker">Curated · verified · unforgettable</p>
      <h2 class="display display-xl" id="home-search-title">Select your stay</h2>
      <form class="pf-searchbar hp-searchbar" data-search-form>
        <div class="pf-field"><span>Destination</span><strong>Hyderabad, India</strong></div>
        <label class="pf-field"><span>Check in</span><input type="date" name="checkIn" value="${checkIn}" min="${today}" required></label>
        <label class="pf-field"><span>Check out</span><input type="date" name="checkOut" value="${checkOut}" min="${dateAfter(checkIn)}" required></label>
        <div class="pf-field"><span>Guests</span>${stepper('guests', guests, 1, 20)}</div>
        <button class="pf-button pf-button-gold" type="submit">Search</button>
      </form>
    </section>
    <section class="hp-block" aria-labelledby="cat-title">
      <div class="hp-head"><p class="hs-kicker">By category</p><h2 class="display" id="cat-title">Featured categories</h2><p>A handful of curated stay formats, each personally verified for comfort and character.</p></div>
      <div class="hp-mosaic">${categories.map(item => `<a class="hp-tile" href="#/stays?${typesForKeyword(item.keyword).map(type => `type=${encodeURIComponent(type)}`).join('&')}"><img src="${photo(item.image, 800)}" alt="" loading="lazy"><span>${item.name}<small>${plural(stays.filter(stay => stay.category.includes(item.keyword)).length, 'stay')}</small></span></a>`).join('')}</div>
    </section>
    <section class="hp-block" aria-labelledby="featured-title">
      <div class="hp-head hp-head-row"><div><p class="hs-kicker">Handpicked</p><h2 class="display" id="featured-title">Featured properties</h2><p>Handpicked homes, verified in person before they ever reach this page.</p></div><a class="hs-link" href="#/stays">View all stays</a></div>
      <div class="pf-grid">${stays.map(card).join('')}</div>
    </section>
    <section class="hp-block" aria-labelledby="coll-title">
      <div class="hp-head"><p class="hs-kicker">By mood</p><h2 class="display" id="coll-title">Premium collections</h2><p>Stays grouped by mood and moment, so the right one finds you faster.</p></div>
      <div class="hp-collections">${collections.map(item => `<a class="hp-tile hp-tile-wide" href="#/stays?collection=${item.id}"><img src="${photo(item.image, 800)}" alt="" loading="lazy"><span><small>Collection</small>${item.name}<small>${plural(stays.filter(item.match).length, 'stay')}</small></span></a>`).join('')}</div>
    </section>
    <section class="hp-block hp-promises" aria-labelledby="why-title">
      <div class="hp-head"><p class="hs-kicker">The difference</p><h2 class="display" id="why-title">Why Hidden Stories</h2></div>
      <ul>${promises.map(([letter, title, line]) => `<li class="hp-promise"><span aria-hidden="true">${letter}</span><h3>${title}</h3><p>${line}</p></li>`).join('')}</ul>
    </section>
    <section class="hp-block hp-quotes" aria-labelledby="quotes-title">
      <div class="hp-head"><p class="hs-kicker">In their words</p><h2 class="display" id="quotes-title">What our guests say</h2></div>
      <div class="hp-quote-row">${testimonials.map(item => `<figure class="hp-quote"><blockquote>“${esc(item.text)}”</blockquote><figcaption><strong>${esc(item.name)}</strong>${esc(item.location)}</figcaption></figure>`).join('')}</div>
    </section>`;
}

/* ------------------------------------------------------------------ Explore (search results) */
const filtersFrom = query => {
  const params = new URLSearchParams(query || '');
  return {
    types: params.getAll('type').filter(type => propertyTypes.includes(type)),
    amenities: params.getAll('amenity').filter(item => amenityFilters.includes(item)),
    price: Math.min(PRICE_CEILING, Number(params.get('price')) || PRICE_CEILING),
    beds: Number(params.get('beds')) || 0,
    sort: sortOptions.some(([value]) => value === params.get('sort')) ? params.get('sort') : 'recommended',
    view: params.get('view') === 'map' ? 'map' : 'grid',
    collection: collections.some(item => item.id === params.get('collection')) ? params.get('collection') : ''
  };
};
const queryFrom = filters => {
  const params = new URLSearchParams();
  filters.types.forEach(type => params.append('type', type));
  filters.amenities.forEach(item => params.append('amenity', item));
  if (filters.price < PRICE_CEILING) params.set('price', filters.price);
  if (filters.beds) params.set('beds', filters.beds);
  if (filters.sort !== 'recommended') params.set('sort', filters.sort);
  if (filters.view === 'map') params.set('view', 'map');
  if (filters.collection) params.set('collection', filters.collection);
  const text = params.toString();
  return `#/stays${text ? `?${text}` : ''}`;
};
const availability = new Map();
async function unavailableFor(checkIn, checkOut) {
  if (!state.store || validateDates(checkIn, checkOut)) return new Set();
  const key = `${checkIn}_${checkOut}`;
  if (!availability.has(key)) availability.set(key, state.store.unavailableStays(nightsOf(checkIn, checkOut)).catch(() => new Set()));
  return availability.get(key);
}
function applyFilters(filters, unavailable) {
  const blocked = unavailable || new Set();
  const collection = collections.find(item => item.id === filters.collection);
  const list = stays.filter(stay =>
    (!filters.types.length || filters.types.includes(stay.category)) &&
    filters.amenities.every(item => item === 'Instant Booking' ? stay.instantBook : stay.amenities.includes(item)) &&
    stay.price <= filters.price && stay.bedrooms >= filters.beds && stay.guests >= state.search.guests &&
    (!collection || collection.match(stay)) && !blocked.has(stay.id));
  const sorters = { priceAsc: (a, b) => a.price - b.price, priceDesc: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews };
  return sorters[filters.sort] ? [...list].sort(sorters[filters.sort]) : list;
}
/* Google Maps: interactive price pins with an API key, otherwise Google's embed by neighbourhood. */
let stayMap = null, mapsFailed = false;
const mapCard = stay => `<div class="pf-gmap-card"><img src="${photo(stay.gallery[0], 800)}" alt=""><div><p>${esc(stay.category)}</p><strong>${esc(stay.name)}</strong><span>★ ${stay.rating} · ${esc(neighbourhoodOf(stay))}</span><span><b>${formatPrice(stay.price)}</b> / night</span><a href="#/stay/${stay.id}">View stay →</a></div></div>`;
const mapItem = stay => `<li class="pf-map-row" data-row="${stay.id}"><button type="button" class="pf-map-item" data-map-stay="${stay.id}"><img src="${photo(stay.gallery[0], 800)}" alt="" loading="lazy"><span><strong>${esc(stay.name)}</strong><small>${esc(neighbourhoodOf(stay))} · ★ ${stay.rating}</small></span><b>${formatPrice(stay.price)}</b></button><a class="pf-map-view" href="#/stay/${stay.id}">View stay</a></li>`;
const useEmbed = () => !hasMapsKey() || mapsFailed;
const embedFrame = (query = CITY_QUERY) => `<iframe class="pf-gmap-embed" id="pf-gmap-embed" title="Google Maps — ${esc(query)}" src="${embedUrl(query)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
const mapShell = () => `<div class="pf-gmap-layout"><ol class="pf-map-list" id="pf-map-list" aria-label="Stays on the map"></ol>
  <div class="pf-gmap-frame" id="pf-gmap-frame">${useEmbed() ? embedFrame() : '<div class="pf-gmap" id="pf-gmap" role="region" aria-label="Map of matching stays"></div>'}</div></div>
  <p class="pf-map-note">${useEmbed() ? 'Choose a stay to see its neighbourhood on Google Maps.' : 'Pins show each neighbourhood.'} Exact addresses are shared once your booking is confirmed.</p>`;
function switchToEmbed() {
  mapsFailed = true; stayMap = null;
  const frame = $('#pf-gmap-frame');
  if (frame) frame.innerHTML = embedFrame();
  console.warn('Google Maps JavaScript API is unavailable for this key or address; showing the Google Maps embed instead.');
}
onMapsAuthFailure(switchToEmbed);
function drawMap(list) {
  if (!$('#pf-gmap-frame')) { $('#pf-list').innerHTML = mapShell(); stayMap = null; }
  $('#pf-map-list').innerHTML = list.map(mapItem).join('');
  if (useEmbed()) return;
  stayMap ||= createStayMap($('#pf-gmap'), { card: mapCard, price: stay => formatPrice(stay.price) }).catch(() => { switchToEmbed(); return null; });
  stayMap.then(map => map?.update(list));
}
function chooseOnMap(id) {
  const stay = stayById(id);
  if (!stay) return;
  $$('.pf-map-row').forEach(row => row.classList.toggle('active', row.dataset.row === id));
  if (useEmbed()) {
    const frame = $('#pf-gmap-embed'), query = `${neighbourhoodOf(stay)}, Hyderabad, Telangana`;
    if (frame) { frame.src = embedUrl(query); frame.title = `Google Maps — ${query}`; }
  } else stayMap?.then(map => map?.select(id));
}

async function renderSearch(query) {
  const filters = filtersFrom(query);
  const { checkIn, checkOut, guests } = state.search;
  const root = view();
  root.innerHTML = `<section class="pf-screen pf-search" aria-labelledby="search-title">
    <h1 class="visually-hidden" id="search-title">Explore stays</h1>
    <form class="pf-searchbar" data-search-form>
      <div class="pf-field"><span>Destination</span><strong>Hyderabad, India</strong></div>
      <label class="pf-field"><span>Check in</span><input type="date" name="checkIn" value="${checkIn}" min="${today}"></label>
      <label class="pf-field"><span>Check out</span><input type="date" name="checkOut" value="${checkOut}" min="${dateAfter(checkIn)}"></label>
      <div class="pf-field"><span>Guests</span>${stepper('guests', guests, 1, 20)}</div>
      <div class="pf-tools">
        <label class="visually-hidden" for="sort-by">Sort by</label>
        <select id="sort-by" name="sort">${sortOptions.map(([value, label]) => `<option value="${value}" ${filters.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <div class="pf-toggle" role="group" aria-label="View"><button type="button" data-view="grid" aria-pressed="${filters.view === 'grid'}">Grid</button><button type="button" data-view="map" aria-pressed="${filters.view === 'map'}">Map</button></div>
      </div>
    </form>
    <div class="pf-search-body">
      <aside class="pf-filters" id="pf-filters" aria-label="Filters">
        <div class="pf-filters-head"><h2>Filters</h2><button type="button" class="pf-text-button" data-clear>Clear</button><button type="button" class="pf-text-button pf-filters-close" data-close-filters>Done</button></div>
        <label class="pf-filter-label" for="price-max">Price — up to <output id="price-out">${formatPrice(filters.price)}</output></label>
        <input id="price-max" type="range" min="5000" max="${PRICE_CEILING}" step="500" value="${filters.price}" data-filter="price">
        <fieldset><legend class="pf-filter-label">Property type</legend>${propertyTypes.map(type => `<label class="pf-check"><input type="checkbox" data-filter="type" value="${esc(type)}" ${filters.types.includes(type) ? 'checked' : ''}><span>${esc(type)}</span></label>`).join('')}</fieldset>
        <fieldset><legend class="pf-filter-label">Bedrooms</legend><div class="pf-chips">${[0, 1, 2, 3, 4].map(count => `<button type="button" class="pf-chip" data-beds="${count}" aria-pressed="${filters.beds === count}">${count ? `${count}+` : 'Any'}</button>`).join('')}</div></fieldset>
        <fieldset><legend class="pf-filter-label">Amenities</legend>${amenityFilters.map(item => `<label class="pf-check"><input type="checkbox" data-filter="amenity" value="${esc(item)}" ${filters.amenities.includes(item) ? 'checked' : ''}><span>${esc(item)}</span></label>`).join('')}</fieldset>
      </aside>
      <div class="pf-results">
        <div class="pf-results-head"><p class="pf-count" id="pf-count" role="status"></p><button type="button" class="pf-button pf-button-ghost pf-filters-open" data-open-filters>Filters</button></div>
        <div class="pf-active" id="pf-active"></div>
        <div id="pf-list"></div>
      </div>
    </div>
  </section>`;
  const paint = async () => {
    const current = filtersFrom(location.hash.split('?')[1]);
    const draw = unavailable => {
      const list = applyFilters(current, unavailable);
      const collection = collections.find(item => item.id === current.collection);
      $('#pf-count').textContent = `${list.length} handpicked ${list.length === 1 ? 'stay' : 'stays'} in Hyderabad${unavailable ? ` · ${shortDate(state.search.checkIn)} – ${shortDate(state.search.checkOut)} · ${plural(state.search.guests, 'guest')}` : ''}`;
      $('#pf-active').innerHTML = [
        collection ? `<button type="button" class="pf-chip pf-chip-on" data-drop="collection">${collection.name} ✕</button>` : '',
        ...current.types.map(type => `<button type="button" class="pf-chip pf-chip-on" data-drop-type="${esc(type)}">${esc(type)} ✕</button>`),
        ...current.amenities.map(item => `<button type="button" class="pf-chip pf-chip-on" data-drop-amenity="${esc(item)}">${esc(item)} ✕</button>`)
      ].join('');
      if (list.length && current.view === 'map') drawMap(list);
      else $('#pf-list').innerHTML = list.length ? `<div class="pf-grid">${list.map(card).join('')}</div>` : emptyState('Nothing matches yet', 'Try different dates, fewer filters or a smaller group.', 'Clear filters', '#/stays');
    };
    draw(null);
    draw(await unavailableFor(state.search.checkIn, state.search.checkOut));
  };
  const update = change => {
    const next = { ...filtersFrom(location.hash.split('?')[1]), ...change };
    history.replaceState(null, '', queryFrom(next));
    paint();
  };
  root.onmouseover = event => {
    const item = event.target.closest('[data-map-stay]');
    if (item && !useEmbed()) stayMap?.then(map => map?.highlight(item.dataset.mapStay));
  };
  root.oninput = event => {
    const target = event.target;
    if (target.dataset.filter === 'price') { $('#price-out').textContent = formatPrice(Number(target.value)); update({ price: Number(target.value) }); }
  };
  root.onchange = event => {
    const target = event.target;
    if (target.dataset.filter === 'type') update({ types: $$('[data-filter="type"]:checked', root).map(input => input.value) });
    if (target.dataset.filter === 'amenity') update({ amenities: $$('[data-filter="amenity"]:checked', root).map(input => input.value) });
    if (target.name === 'sort') update({ sort: target.value });
    if (target.name === 'checkIn' || target.name === 'checkOut') {
      const checkInValue = $('[name=checkIn]', root).value, outInput = $('[name=checkOut]', root);
      if (target.name === 'checkIn') { outInput.min = dateAfter(checkInValue); if (outInput.value <= checkInValue) outInput.value = dateAfter(checkInValue); }
      Object.assign(state.search, { checkIn: checkInValue, checkOut: outInput.value }); saveSearch(); paint();
    }
  };
  root.onclick = event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.view) update({ view: target.dataset.view });
    if (target.dataset.beds !== undefined) update({ beds: Number(target.dataset.beds) });
    if (target.hasAttribute('data-clear')) { history.replaceState(null, '', '#/stays'); renderSearch(''); }
    if (target.dataset.drop === 'collection') update({ collection: '' });
    if (target.dataset.dropType) update({ types: filtersFrom(location.hash.split('?')[1]).types.filter(type => type !== target.dataset.dropType) });
    if (target.dataset.dropAmenity) update({ amenities: filtersFrom(location.hash.split('?')[1]).amenities.filter(item => item !== target.dataset.dropAmenity) });
    if (target.dataset.mapStay) chooseOnMap(target.dataset.mapStay);
    if (target.hasAttribute('data-open-filters')) $('#pf-filters').classList.add('open');
    if (target.hasAttribute('data-close-filters')) $('#pf-filters').classList.remove('open');
    $$('[data-view]', root).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === filtersFrom(location.hash.split('?')[1]).view)));
    $$('[data-beds]', root).forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.beds) === filtersFrom(location.hash.split('?')[1]).beds)));
  };
  paint();
}

/* ------------------------------------------------------------------ Property details */
function calendarHTML(month, booked) {
  const [year, monthIndex] = month.split('-').map(Number);
  const first = new Date(year, monthIndex - 1, 1), days = new Date(year, monthIndex, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const { checkIn, checkOut } = state.search;
  const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const cells = Array.from({ length: offset }, () => '<span class="pf-day pf-day-blank"></span>');
  for (let day = 1; day <= days; day++) {
    const date = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const past = date < today, taken = booked.has(date), chosen = date >= checkIn && date < checkOut;
    const classes = ['pf-day', past && 'pf-day-past', taken && 'pf-day-booked', chosen && 'pf-day-chosen', date === checkIn && 'pf-day-start'].filter(Boolean).join(' ');
    cells.push(`<button type="button" class="${classes}" data-day="${date}" ${past || taken ? 'disabled' : ''} aria-label="${prettyDate(date)}${taken ? ', booked' : ''}${chosen ? ', your dates' : ''}">${day}</button>`);
  }
  return `<div class="pf-cal-head"><button type="button" class="pf-cal-nav" data-month="-1" aria-label="Previous month" ${month <= today.slice(0, 7) ? 'disabled' : ''}>←</button><h3>Availability — ${label}</h3><button type="button" class="pf-cal-nav" data-month="1" aria-label="Next month">→</button></div>
    <div class="pf-cal-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(name => `<span class="pf-cal-dow">${name}</span>`).join('')}${cells.join('')}</div>
    <p class="pf-cal-legend"><span><i class="pf-key"></i>Available</span><span><i class="pf-key pf-key-booked"></i>Booked</span><span><i class="pf-key pf-key-chosen"></i>Your dates</span></p>`;
}
const stars = rating => '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
const reviewHTML = review => `<figure class="pf-review"><p class="pf-review-stars" aria-label="${review.rating || 5} out of 5">${stars(review.rating || 5)}</p><blockquote>“${esc(review.text)}”</blockquote><figcaption><strong>${esc(review.name)}</strong>${esc(review.location || (review.createdAt ? new Date(review.createdAt.seconds * 1000).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ''))}</figcaption></figure>`;

async function renderDetails(id) {
  const stay = stayById(id);
  if (!stay) return renderMissing();
  const host = hostFor(stay);
  let booked = new Set(), month = (state.search.checkIn || today).slice(0, 7), picking = 'in', rating = 0;
  state.search.guests = Math.min(state.search.guests, stay.guests);
  const root = view();
  root.innerHTML = `<section class="pf-screen pf-details" aria-labelledby="stay-title">
    <a class="pf-back" href="#/stays">← Back to search</a>
    <div class="pf-gallery"><img class="pf-gallery-main" id="gallery-main" src="${photo(stay.gallery[0], 2400)}" srcset="${photo(stay.gallery[0], 1600)} 1600w, ${photo(stay.gallery[0], 2400)} 2400w" sizes="(max-width:900px) 100vw, 64vw" alt="${esc(stay.name)} — photo 1 of ${stay.gallery.length}">
      <div class="pf-thumbs">${stay.gallery.map((image, index) => `<button type="button" data-photo="${index}" aria-label="Show photo ${index + 1}" aria-pressed="${index === 0}"><img src="${photo(image, 800)}" alt="" loading="lazy"></button>`).join('')}</div></div>
    <div class="pf-details-grid">
      <div class="pf-details-main">
        <p class="hs-kicker">${esc(stay.category)}</p>
        <h1 class="display" id="stay-title">${esc(stay.name)}</h1>
        <p class="pf-meta">★ ${stay.rating} · ${stay.reviews} reviews · ${esc(stay.location)}</p>
        <div class="pf-actions"><button type="button" class="pf-button pf-button-ghost pf-save" data-wish="${stay.id}" aria-pressed="${state.wishlist.has(stay.id)}">${state.wishlist.has(stay.id) ? '♥ Saved' : '♡ Save'}</button><button type="button" class="pf-button pf-button-ghost" data-message-host>✉ Message host</button></div>
        <ul class="pf-facts"><li>${plural(stay.guests, 'guest')}</li><li>${plural(stay.bedrooms, 'bedroom')}</li><li>${plural(stay.bathrooms, 'bath')}</li></ul>
        <p class="pf-description">${esc(stay.description)}</p>
        <div class="pf-host"><span class="pf-host-badge" aria-hidden="true">${esc(host.name.charAt(0))}</span><div><h2>Hosted by ${esc(host.name)} ${host.superhost ? '<span class="pf-superhost">Superhost</span>' : ''}</h2><p>Hosting since ${host.since} · ${host.rate}% response rate</p></div><button type="button" class="pf-button pf-button-ghost" data-message-host>Message host</button></div>
        <section class="pf-section"><h2 class="pf-section-title">Amenities</h2><ul class="pf-amenities">${stay.amenities.map(item => `<li>${esc(item)}</li>`).join('')}${stay.instantBook ? '<li>Instant booking</li>' : ''}</ul></section>
        <section class="pf-section pf-calendar" id="pf-calendar" aria-live="polite"></section>
        <section class="pf-section"><h2 class="pf-section-title">House rules</h2><ul class="pf-rules">${houseRulesFor(stay).map(rule => `<li>${rule}</li>`).join('')}</ul></section>
        <section class="pf-section"><h2 class="pf-section-title">Cancellation policy</h2><p>${cancellationPolicy}</p></section>
        <section class="pf-section"><h2 class="pf-section-title">Nearby attractions</h2><ul class="pf-nearby">${stay.nearby.map(place => `<li><span>${esc(place.name)}</span><span>${esc(place.distance)}</span></li>`).join('')}</ul></section>
        <section class="pf-section" aria-labelledby="reviews-title"><h2 class="pf-section-title" id="reviews-title">Reviews</h2>
          <div class="pf-reviews" id="pf-reviews">${featuredReviewsFor(stay).map(reviewHTML).join('')}</div>
          <form class="pf-review-form" id="review-form">
            <h3>Share your story</h3>
            ${state.store?.user ? `<div class="pf-star-pick" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(value => `<button type="button" role="radio" aria-checked="false" data-rate="${value}" aria-label="${value} star${value > 1 ? 's' : ''}">☆</button>`).join('')}</div>
            <label class="visually-hidden" for="review-text">Your review</label><textarea id="review-text" maxlength="1000" rows="4" placeholder="What made your stay memorable?"></textarea>
            <p class="pf-error" role="alert"></p><button type="submit" class="pf-button">Post review</button>` : `<p>You'll need to be signed in to post a review.</p><a class="pf-button pf-button-ghost" href="#/login?next=${encodeURIComponent(`#/stay/${stay.id}`)}">Sign in to review</a>`}
          </form>
        </section>
      </div>
      <aside class="pf-book-card" id="pf-book-card" aria-label="Reserve ${esc(stay.name)}"></aside>
    </div>
    <div class="pf-mobile-reserve"><p><strong>${formatPrice(stay.price)}</strong> / night<span>★ ${stay.rating}</span></p><button type="button" class="pf-button" data-jump-book>Check dates</button></div>
  </section>`;

  const bookCard = () => {
    const { checkIn, checkOut, guests } = state.search;
    const error = validateDates(checkIn, checkOut);
    const clash = !error && nightsOf(checkIn, checkOut).some(date => booked.has(date));
    const price = priceFor(stay, checkIn, checkOut);
    $('#pf-book-card').innerHTML = `<p class="pf-book-price"><strong>${formatPrice(stay.price)}</strong> / night <span>★ ${stay.rating}</span></p>
      <div class="pf-book-dates"><label class="pf-field"><span>Check in</span><input type="date" name="checkIn" value="${checkIn}" min="${today}"></label><label class="pf-field"><span>Check out</span><input type="date" name="checkOut" value="${checkOut}" min="${dateAfter(checkIn || today)}"></label></div>
      <div class="pf-field pf-book-guests"><span>Guests <small>(up to ${stay.guests})</small></span>${stepper('guests', guests, 1, stay.guests)}</div>
      ${error || clash ? `<p class="pf-error" role="alert">${error || 'Some of these nights are already booked. Pick different dates on the calendar.'}</p>` : `
      <dl class="pf-breakdown"><div><dt>${formatPrice(stay.price)} × ${plural(price.nights, 'night')}</dt><dd>${formatPrice(price.subtotal)}</dd></div><div><dt>Cleaning fee</dt><dd>${formatPrice(price.cleaningFee)}</dd></div><div><dt>Service fee</dt><dd>${formatPrice(price.serviceFee)}</dd></div><div class="pf-total"><dt>Total</dt><dd>${formatPrice(price.total)}</dd></div></dl>`}
      <button type="button" class="pf-button pf-button-wide" data-reserve ${error || clash ? 'disabled' : ''}>${stay.instantBook ? 'Reserve now' : 'Request to book'}</button>
      <p class="pf-book-note">You won't be charged yet — payment is arranged after confirmation.</p>`;
  };
  const calendar = () => { $('#pf-calendar').innerHTML = calendarHTML(month, booked); };
  const reviews = async () => {
    try {
      const mine = await state.store.listReviews(stay.id);
      $('#pf-reviews').innerHTML = [...mine.map(reviewHTML), ...featuredReviewsFor(stay).map(reviewHTML)].join('');
    } catch { /* featured reviews stay visible */ }
  };
  const setDates = (checkIn, checkOut) => { Object.assign(state.search, { checkIn, checkOut }); saveSearch(); bookCard(); calendar(); };
  bookCard(); calendar();

  root.onclick = async event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.photo !== undefined) {
      const index = Number(target.dataset.photo), main = $('#gallery-main');
      main.src = photo(stay.gallery[index], 2400); main.srcset = `${photo(stay.gallery[index], 1600)} 1600w, ${photo(stay.gallery[index], 2400)} 2400w`; main.alt = `${stay.name} — photo ${index + 1} of ${stay.gallery.length}`;
      $$('[data-photo]', root).forEach(button => button.setAttribute('aria-pressed', String(button === target)));
    }
    if (target.dataset.month) { const [y, m] = month.split('-').map(Number); const next = new Date(y, m - 1 + Number(target.dataset.month), 1); month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; calendar(); }
    if (target.dataset.day) {
      const day = target.dataset.day;
      if (picking === 'in' || day <= state.search.checkIn) { setDates(day, dateAfter(day)); picking = 'out'; toast('Now choose your check-out date.'); }
      else if (nightsOf(state.search.checkIn, day).some(date => booked.has(date))) toast('Those dates include booked nights. Choose a shorter stay.');
      else { setDates(state.search.checkIn, day); picking = 'in'; }
    }
    if (target.dataset.step && target.closest('[data-stepper]')) {
      state.search.guests = Math.max(1, Math.min(stay.guests, state.search.guests + Number(target.dataset.step))); saveSearch(); bookCard();
    }
    if (target.hasAttribute('data-reserve')) {
      state.booking = { stayId: stay.id, step: 1, ...state.search, name: state.store?.user?.name || '', email: state.store?.user?.email || '', phone: state.store?.user?.phone || '', notes: '', payment: 'upi', agree: false };
      keep('hidden-stories:booking', state.booking);
      if (requireUser(`#/book/${stay.id}`)) go(`#/book/${stay.id}`);
    }
    if (target.hasAttribute('data-jump-book')) { const box = $('#pf-book-card'); window.scrollTo({ top: box.getBoundingClientRect().top + scrollY - 110, behavior: 'smooth' }); }
    if (target.hasAttribute('data-message-host')) {
      if (!requireUser(`#/stay/${stay.id}`)) return;
      try { await state.store.openThread(stay, host.name); go(`#/inbox/${stay.id}`); } catch (error) { toast(friendly(error)); }
    }
    if (target.dataset.rate) {
      rating = Number(target.dataset.rate);
      $$('[data-rate]', root).forEach(button => { const on = Number(button.dataset.rate) <= rating; button.textContent = on ? '★' : '☆'; button.setAttribute('aria-checked', String(Number(button.dataset.rate) === rating)); });
    }
  };
  root.onchange = event => {
    const target = event.target;
    if (target.name === 'checkIn') { const checkOut = state.search.checkOut > target.value ? state.search.checkOut : dateAfter(target.value); setDates(target.value, checkOut); month = target.value.slice(0, 7); calendar(); }
    if (target.name === 'checkOut') setDates(state.search.checkIn, target.value);
  };
  root.onsubmit = async event => {
    if (event.target.id !== 'review-form') return;
    event.preventDefault();
    const text = $('#review-text').value.trim(), error = $('#review-form .pf-error');
    if (!rating) { error.textContent = 'Please choose a star rating.'; return; }
    if (text.length < 10) { error.textContent = 'Please write a few words about your stay.'; return; }
    try { await state.store.addReview(stay.id, rating, text); $('#review-text').value = ''; error.textContent = ''; toast('Thank you — your review is live.'); reviews(); }
    catch (failure) { error.textContent = friendly(failure); }
  };
  if (state.store) {
    try { booked = await state.store.bookedNights(stay.id); bookCard(); calendar(); } catch { /* calendar shows no bookings */ }
    reviews();
  }
}

/* ------------------------------------------------------------------ Booking flow */
async function renderBooking(id) {
  const stay = stayById(id);
  if (!stay) return renderMissing();
  if (!requireUser(`#/book/${id}`)) return;
  const user = state.store.user;
  if (!state.booking || state.booking.stayId !== id) state.booking = { stayId: id, step: 1, ...state.search, name: user.name || '', email: user.email || '', phone: user.phone || '', notes: '', payment: 'upi', agree: false };
  const draft = state.booking;
  draft.name ||= user.name || ''; draft.email ||= user.email || ''; draft.phone ||= user.phone || '';
  draft.guests = Math.min(draft.guests, stay.guests);
  let booked = new Set(), busy = false;
  try { booked = await state.store.bookedNights(stay.id); } catch { /* checked again on submit */ }
  const save = () => keep('hidden-stories:booking', draft);
  const root = view();
  const summary = () => {
    const price = priceFor(stay, draft.checkIn, draft.checkOut);
    return `<aside class="pf-summary"><img src="${photo(stay.gallery[0], 800)}" alt=""><div class="pf-summary-body"><p class="hs-kicker">${esc(stay.category)}</p><h2>${esc(stay.name)}</h2><p class="pf-meta">${esc(stay.location)}</p>
      <dl class="pf-breakdown"><div><dt>Dates</dt><dd>${shortDate(draft.checkIn)} – ${shortDate(draft.checkOut)}</dd></div><div><dt>Guests</dt><dd>${draft.guests}</dd></div><div><dt>${formatPrice(stay.price)} × ${plural(price.nights, 'night')}</dt><dd>${formatPrice(price.subtotal)}</dd></div><div><dt>Cleaning fee</dt><dd>${formatPrice(price.cleaningFee)}</dd></div><div><dt>Service fee</dt><dd>${formatPrice(price.serviceFee)}</dd></div><div class="pf-total"><dt>Total</dt><dd>${formatPrice(price.total)}</dd></div></dl>
      <p class="pf-book-note">${cancellationPolicy}</p></div></aside>`;
  };
  const steps = () => `<ol class="pf-steps">${bookingSteps.map((name, index) => `<li class="${index + 1 < draft.step ? 'done' : index + 1 === draft.step ? 'current' : ''}" ${index + 1 === draft.step ? 'aria-current="step"' : ''}><span>${index + 1 < draft.step ? '✓' : index + 1}</span>${name}</li>`).join('')}</ol>`;
  const body = () => {
    if (draft.step === 1) return `<h2 class="display display-s">Select dates &amp; guests</h2>
      <div class="pf-book-dates"><label class="pf-field"><span>Check in</span><input type="date" name="checkIn" value="${draft.checkIn}" min="${today}"></label><label class="pf-field"><span>Check out</span><input type="date" name="checkOut" value="${draft.checkOut}" min="${dateAfter(draft.checkIn)}"></label></div>
      <div class="pf-field pf-book-guests"><span>Guests <small>(up to ${stay.guests})</small></span>${stepper('guests', draft.guests, 1, stay.guests)}</div>
      <p class="pf-error" role="alert"></p><div class="pf-step-actions"><a class="pf-button pf-button-ghost" href="#/stay/${stay.id}">Back</a><button type="button" class="pf-button" data-next>Continue</button></div>`;
    if (draft.step === 2) return `<h2 class="display display-s">Guest details</h2>
      <div class="pf-form-grid"><label class="pf-input"><span>Full name</span><input name="name" autocomplete="name" value="${esc(draft.name)}" required></label>
      <label class="pf-input"><span>Email</span><input name="email" type="email" autocomplete="email" value="${esc(draft.email)}" required></label>
      <label class="pf-input"><span>Mobile number</span><input name="phone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" value="${esc(draft.phone)}" required></label>
      <label class="pf-input pf-input-wide"><span>Anything we should know? <small>(optional)</small></span><textarea name="notes" rows="3" maxlength="600" placeholder="Arrival time, celebrations, dietary needs…">${esc(draft.notes)}</textarea></label></div>
      <p class="pf-error" role="alert"></p><div class="pf-step-actions"><button type="button" class="pf-button pf-button-ghost" data-back>Back</button><button type="button" class="pf-button" data-next>Continue</button></div>`;
    if (draft.step === 3) return `<h2 class="display display-s">Payment</h2>
      <div class="pf-paylater"><h3>Reserve now, pay later</h3><p>No payment is taken on this website. ${stay.instantBook ? 'Your nights are held as soon as you reserve.' : 'Your request goes to the host, who confirms within 24 hours.'} Hidden Stories then sends you a secure way to pay before check-in.</p></div>
      <fieldset class="pf-pay-options"><legend>How would you like to pay?</legend>
        ${[['upi', 'UPI', 'A UPI request to your phone'], ['card', 'Card', 'A secure payment link for any card'], ['bank', 'Bank transfer', 'Account details by email']].map(([value, label, line]) => `<label class="pf-radio"><input type="radio" name="payment" value="${value}" ${draft.payment === value ? 'checked' : ''}><span><strong>${label}</strong>${line}</span></label>`).join('')}
      </fieldset>
      <label class="pf-check pf-agree"><input type="checkbox" name="agree" ${draft.agree ? 'checked' : ''}><span>I agree to the house rules and the cancellation policy.</span></label>
      <p class="pf-error" role="alert"></p><div class="pf-step-actions"><button type="button" class="pf-button pf-button-ghost" data-back>Back</button><button type="button" class="pf-button" data-confirm>${stay.instantBook ? 'Reserve now' : 'Request to book'}</button></div>`;
    const done = draft.result;
    return `<div class="pf-confirmed"><span class="pf-confirmed-mark" aria-hidden="true">✓</span><h2 class="display display-s">${done.status === 'reserved' ? 'Booking reserved' : 'Booking requested'}</h2>
      <p>${done.status === 'reserved' ? 'Your nights are held.' : 'We have sent your request to the host.'} A confirmation is on its way to ${esc(done.guest.email)}.</p>
      <dl class="pf-breakdown"><div><dt>Booking reference</dt><dd><strong>${esc(done.ref)}</strong></dd></div><div><dt>Dates</dt><dd>${prettyDate(done.checkIn)} – ${prettyDate(done.checkOut)}</dd></div><div><dt>Guests</dt><dd>${done.guests}</dd></div><div class="pf-total"><dt>Total due</dt><dd>${formatPrice(done.total)}</dd></div></dl>
      <div class="pf-step-actions"><a class="pf-button" href="#/trips">View my trips</a><a class="pf-button pf-button-ghost" href="#/">Back to home</a></div></div>`;
  };
  const paint = () => {
    root.innerHTML = `<section class="pf-screen pf-booking" aria-labelledby="booking-title"><h1 class="visually-hidden" id="booking-title">Book ${esc(stay.name)}</h1>${steps()}<div class="pf-booking-grid"><div class="pf-booking-main">${body()}</div>${draft.step < 4 ? summary() : ''}</div></section>`;
  };
  const fail = message => { const element = $('.pf-error', root); if (element) element.textContent = message; };
  const collect = () => { $$('input[name], textarea[name]', root).forEach(input => { if (input.type === 'radio') { if (input.checked) draft[input.name] = input.value; } else if (input.type === 'checkbox') draft[input.name] = input.checked; else draft[input.name] = input.value.trim(); }); save(); };
  const validate = () => {
    if (draft.step === 1) {
      const error = validateDates(draft.checkIn, draft.checkOut);
      if (error) return error;
      if (nightsOf(draft.checkIn, draft.checkOut).some(date => booked.has(date))) return 'Some of these nights are already booked. Please choose different dates.';
    }
    if (draft.step === 2) {
      if (draft.name.length < 2) return 'Please enter your full name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return 'Please enter a valid email address.';
      if (draft.phone.replace(/\D/g, '').length < 10) return 'Please enter a valid mobile number.';
    }
    if (draft.step === 3 && !draft.agree) return 'Please agree to the house rules and cancellation policy.';
    return '';
  };
  root.onchange = event => {
    collect();
    if (event.target.name === 'checkIn' && draft.checkOut <= draft.checkIn) { draft.checkOut = dateAfter(draft.checkIn); save(); paint(); }
    else if (['checkIn', 'checkOut'].includes(event.target.name)) paint();
  };
  root.onclick = async event => {
    const target = event.target.closest('button');
    if (!target || busy) return;
    if (target.dataset.step && target.closest('[data-stepper]')) { collect(); draft.guests = Math.max(1, Math.min(stay.guests, draft.guests + Number(target.dataset.step))); save(); paint(); }
    if (target.hasAttribute('data-back')) { collect(); draft.step -= 1; save(); paint(); window.scrollTo(0, 0); }
    if (target.hasAttribute('data-next')) { collect(); const error = validate(); if (error) return fail(error); draft.step += 1; save(); paint(); window.scrollTo(0, 0); }
    if (target.hasAttribute('data-confirm')) {
      collect(); const error = validate(); if (error) return fail(error);
      busy = true; target.disabled = true; target.textContent = 'Confirming…';
      const price = priceFor(stay, draft.checkIn, draft.checkOut);
      try {
        draft.result = await state.store.createBooking({
          stayId: stay.id, stayName: stay.name, checkIn: draft.checkIn, checkOut: draft.checkOut, guests: draft.guests,
          guest: { name: draft.name, email: draft.email, phone: draft.phone }, notes: draft.notes, paymentPreference: draft.payment,
          subtotal: price.subtotal, cleaningFee: price.cleaningFee, serviceFee: price.serviceFee, total: price.total,
          status: stay.instantBook ? 'reserved' : 'requested'
        });
        draft.step = 4; availability.clear(); refreshTrips(); paint(); window.scrollTo(0, 0);
        state.booking = null; sessionStorage.removeItem('hidden-stories:booking');
      } catch (failure) { fail(friendly(failure)); target.disabled = false; target.textContent = stay.instantBook ? 'Reserve now' : 'Request to book'; }
      busy = false;
    }
  };
  paint();
}

/* ------------------------------------------------------------------ Sign in */
function renderLogin(query) {
  const params = new URLSearchParams(query || '');
  const next = params.get('next') && params.get('next').startsWith('#') ? params.get('next') : state.lastRoute;
  if (state.store?.user) { go(next || '#/'); return; }
  let tab = params.get('tab') || 'email', mode = 'login', otpSent = false, cooldown = 0, timer;
  const root = view();
  const demo = state.store?.mode === 'demo';
  const paint = (message = '', kind = 'error') => {
    root.innerHTML = `<section class="pf-screen pf-login" aria-labelledby="login-title"><div class="pf-login-card">
      <h1 class="display display-s" id="login-title">${mode === 'signup' ? 'Create your account' : 'Sign in to Hidden Stories'}</h1>
      <p class="pf-lead">Welcome to Hidden Stories.</p>
      ${demo ? '<p class="pf-demo-note">Demo mode: accounts are kept in this browser only until Firebase is connected.</p>' : ''}
      <div class="pf-tabs" role="tablist">${[['email', 'Email'], ['google', 'Google'], ['otp', 'OTP']].map(([value, label]) => `<button type="button" role="tab" data-tab="${value}" aria-selected="${tab === value}">${label}</button>`).join('')}</div>
      <div class="pf-tab-panel" role="tabpanel">
      ${tab === 'email' ? `<form data-form="email" novalidate>
          ${mode === 'signup' ? '<label class="pf-input"><span>Full name</span><input name="name" autocomplete="name" required></label>' : ''}
          <label class="pf-input"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="pf-input"><span>Password${mode === 'signup' ? ' <small>(at least 8 characters)</small>' : ''}</span><input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8" required></label>
          ${mode === 'login' ? '<button type="button" class="pf-text-button" data-forgot>Forgot password?</button>' : ''}
          <button type="submit" class="pf-button pf-button-wide">${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <p class="pf-switch">${mode === 'signup' ? 'Already have an account? <button type="button" class="pf-text-button" data-mode="login">Sign in</button>' : 'New to Hidden Stories? <button type="button" class="pf-text-button" data-mode="signup">Create an account</button>'}</p>
        </form>` : ''}
      ${tab === 'google' ? `<div class="pf-google"><button type="button" class="pf-button pf-button-wide pf-button-google" data-google><span aria-hidden="true">G</span> Continue with Google</button><p>Fast, secure sign-in with your Google account.</p></div>` : ''}
      ${tab === 'otp' ? `<form data-form="otp" novalidate>
          ${!otpSent ? `<label class="pf-input"><span>Mobile number</span><input name="phone" type="tel" autocomplete="tel" value="+91 " required></label><button type="submit" class="pf-button pf-button-wide" id="send-otp">Send OTP</button>`
          : `<p class="pf-lead">Enter the 6-digit code we sent to your phone.</p><label class="pf-input"><span>Verification code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
            <button type="submit" class="pf-button pf-button-wide">Verify &amp; continue</button>
            <p class="pf-switch"><button type="button" class="pf-text-button" data-resend ${cooldown ? 'disabled' : ''}>${cooldown ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}</button> · <button type="button" class="pf-text-button" data-change-phone>Change number</button></p>`}
        </form>` : ''}
      <p class="pf-message ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${message}</p>
      </div>
      <p class="pf-fine">By continuing you agree to Hidden Stories' terms and privacy policy.</p>
    </div><div id="recaptcha-box"></div></section>`;
  };
  const busy = (button, label) => { if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = label; } };
  // Errors update the message line only, so nothing the person typed is lost.
  const notice = (message, kind = 'error') => {
    const element = $('.pf-message', root);
    element.className = `pf-message ${kind}`; element.setAttribute('role', kind === 'error' ? 'alert' : 'status'); element.textContent = message;
    $$('button[data-label]', root).forEach(button => { button.disabled = false; button.textContent = button.dataset.label; delete button.dataset.label; });
  };
  const startCooldown = () => {
    cooldown = 30; clearInterval(timer);
    timer = setInterval(() => { cooldown -= 1; const resend = $('[data-resend]', root); if (resend) { resend.disabled = cooldown > 0; resend.textContent = cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'; } if (cooldown <= 0) clearInterval(timer); }, 1000);
  };
  let phoneNumber = '';
  const sendCode = async button => {
    busy(button, 'Sending…');
    try {
      const result = await state.store.sendOtp(phoneNumber, $('#recaptcha-box'));
      otpSent = true; startCooldown();
      paint(result.demoCode ? `Demo mode — your code is ${result.demoCode}.` : 'Code sent. It may take a few seconds to arrive.', 'info');
    } catch (error) { notice(friendly(error)); }
  };
  root.onclick = async event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.tab) { tab = target.dataset.tab; otpSent = false; paint(); }
    if (target.dataset.mode) { mode = target.dataset.mode; paint(); }
    if (target.hasAttribute('data-change-phone')) { otpSent = false; paint(); }
    if (target.hasAttribute('data-resend')) sendCode(target);
    if (target.hasAttribute('data-google')) { busy(target, 'Opening Google…'); try { await state.store.signInGoogle(); } catch (error) { notice(friendly(error)); } }
    if (target.hasAttribute('data-forgot')) {
      const email = $('[name=email]', root).value.trim();
      if (!email) return notice('Enter your email above, then choose "Forgot password?" again.');
      try { await state.store.resetPassword(email); notice('If an account exists for that email, a reset link is on its way.', 'info'); } catch (error) { notice(friendly(error)); }
    }
  };
  root.onsubmit = async event => {
    event.preventDefault();
    const form = event.target, button = $('button[type=submit]', form);
    if (form.dataset.form === 'email') {
      const data = Object.fromEntries(new FormData(form));
      if (mode === 'signup' && (data.name || '').trim().length < 2) return notice('Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return notice('Please enter a valid email address.');
      if (!data.password || (mode === 'signup' && data.password.length < 8)) return notice(mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.');
      busy(button, mode === 'signup' ? 'Creating account…' : 'Signing in…');
      try { mode === 'signup' ? await state.store.signUpEmail({ name: data.name.trim(), email: data.email.trim(), password: data.password }) : await state.store.signInEmail({ email: data.email.trim(), password: data.password }); }
      catch (error) { notice(friendly(error)); }
    }
    if (form.dataset.form === 'otp') {
      if (!otpSent) {
        phoneNumber = $('[name=phone]', form).value.replace(/[^\d+]/g, '');
        if (!phoneNumber.startsWith('+')) phoneNumber = `+91${phoneNumber}`;
        if (phoneNumber.replace(/\D/g, '').length < 11) return notice('Please enter your mobile number with country code, for example +91 98765 43210.');
        sendCode(button);
      } else {
        const code = $('[name=code]', form).value.trim();
        if (!/^\d{6}$/.test(code)) return notice('Enter the 6-digit code.');
        busy(button, 'Verifying…');
        try { await state.store.verifyOtp(code); } catch (error) { notice(friendly(error)); }
      }
    }
  };
  paint();
  // Leaving after a successful sign-in is handled by the auth listener (see onSignedIn).
  root.dataset.next = next || '#/';
}

/* ------------------------------------------------------------------ Wishlist, trips, inbox, profile */
function renderWishlist() {
  const saved = stays.filter(stay => state.wishlist.has(stay.id));
  view().innerHTML = `<section class="pf-screen pf-list-screen">${screenHead('Saved', 'Your wishlist', 'Stays you have saved for later.')}
    ${saved.length ? `<div class="pf-grid">${saved.map(card).join('')}</div>${state.store?.user ? '' : '<p class="pf-fine">Saved on this device. <a href="#/login?next=%23%2Fwishlist">Sign in</a> to keep your wishlist everywhere.</p>'}` : emptyState('Nothing saved yet', 'Tap the heart on any stay to keep it here.', 'Explore stays', '#/stays')}</section>`;
}

const tripStatus = trip => trip.status === 'cancelled' ? 'cancelled' : trip.checkOut < today ? 'completed' : trip.status;
const statusLabel = { reserved: 'Reserved', requested: 'Requested', completed: 'Completed', cancelled: 'Cancelled' };
const refundNote = trip => {
  const days = Math.round((new Date(`${trip.checkIn}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
  return days >= 7 ? 'Cancelling now is free.' : days >= 2 ? 'The first night is non-refundable if you cancel now.' : 'This booking is non-refundable if you cancel now.';
};
async function refreshTrips() {
  if (!state.store?.user) { state.tripCount = 0; updateBadges(); return []; }
  try {
    const trips = await state.store.listBookings();
    state.tripCount = trips.filter(trip => ['reserved', 'requested'].includes(tripStatus(trip))).length;
    updateBadges();
    return trips;
  } catch { return []; }
}
async function renderTrips() {
  const root = view();
  if (!state.store?.user) { root.innerHTML = `<section class="pf-screen pf-list-screen">${screenHead('Bookings', 'Your trips')}${signInPrompt('Your trips live here', '#/trips')}</section>`; return; }
  root.innerHTML = `<section class="pf-screen pf-list-screen">${screenHead('Bookings', 'Your trips', 'Upcoming and past reservations.')}<p class="pf-loading">Loading your trips…</p></section>`;
  const trips = await refreshTrips();
  const groups = [['Upcoming', trips.filter(trip => ['reserved', 'requested'].includes(tripStatus(trip)))], ['Past', trips.filter(trip => tripStatus(trip) === 'completed')], ['Cancelled', trips.filter(trip => tripStatus(trip) === 'cancelled')]];
  const tripHTML = trip => {
    const stay = stayById(trip.stayId) || { name: trip.stayName, gallery: [stays[0].gallery[0]], location: '' };
    const status = tripStatus(trip);
    return `<article class="pf-trip" data-trip="${esc(trip.id)}"><img src="${photo(stay.gallery[0], 800)}" alt="" loading="lazy"><div class="pf-trip-body">
      <p class="pf-trip-status pf-status-${status}">${statusLabel[status] || status}</p><h3>${esc(stay.name)}</h3><p class="pf-meta">${esc(stay.location)}</p>
      <dl class="pf-trip-facts"><div><dt>Dates</dt><dd>${prettyDate(trip.checkIn)} – ${prettyDate(trip.checkOut)}</dd></div><div><dt>Guests</dt><dd>${trip.guests}</dd></div><div><dt>Total</dt><dd>${formatPrice(trip.total)}</dd></div><div><dt>Reference</dt><dd>${esc(trip.ref)}</dd></div></dl>
      <div class="pf-trip-actions"><a class="pf-button pf-button-ghost" href="#/stay/${esc(trip.stayId)}">View stay</a>${['reserved', 'requested'].includes(status) ? `<button type="button" class="pf-button pf-button-ghost" data-cancel="${esc(trip.id)}">Cancel</button>` : ''}</div>
      <div class="pf-cancel-confirm" hidden><p>${refundNote(trip)} Cancel this booking?</p><button type="button" class="pf-button" data-cancel-yes="${esc(trip.id)}">Yes, cancel</button><button type="button" class="pf-button pf-button-ghost" data-cancel-no>Keep booking</button></div>
    </div></article>`;
  };
  root.innerHTML = `<section class="pf-screen pf-list-screen">${screenHead('Bookings', 'Your trips', 'Upcoming and past reservations.')}
    ${trips.length ? groups.filter(([, list]) => list.length).map(([title, list]) => `<h2 class="pf-group-title">${title}</h2><div class="pf-trips">${list.map(tripHTML).join('')}</div>`).join('') : emptyState('No trips booked yet', 'When you reserve a stay, it will appear here.', 'Start exploring', '#/stays')}</section>`;
  root.onclick = async event => {
    const target = event.target.closest('button');
    if (!target) return;
    const tripCard = target.closest('.pf-trip');
    if (target.dataset.cancel) { $('.pf-cancel-confirm', tripCard).hidden = false; target.hidden = true; }
    if (target.hasAttribute('data-cancel-no')) { $('.pf-cancel-confirm', tripCard).hidden = true; $('[data-cancel]', tripCard).hidden = false; }
    if (target.dataset.cancelYes) {
      target.disabled = true; target.textContent = 'Cancelling…';
      try { await state.store.cancelBooking(target.dataset.cancelYes); availability.clear(); toast('Your booking has been cancelled.'); renderTrips(); }
      catch (error) { toast(friendly(error)); target.disabled = false; target.textContent = 'Yes, cancel'; }
    }
  };
}

async function renderInbox(stayId) {
  const root = view();
  state.stopWatching?.(); state.stopWatching = null;
  if (!state.store?.user) { root.innerHTML = `<section class="pf-screen pf-list-screen">${screenHead('Messages', 'Inbox')}${signInPrompt('Your conversations live here', '#/inbox')}</section>`; return; }
  let threads = [];
  try { threads = await state.store.listThreads(); } catch (error) { toast(friendly(error)); }
  const uid = state.store.user.uid;
  const active = stayId ? threads.find(thread => thread.stayId === stayId) : null;
  root.innerHTML = `<section class="pf-screen pf-inbox-screen">${screenHead('Messages', 'Inbox')}
    ${threads.length ? `<div class="pf-inbox">
      <nav class="pf-threads" aria-label="Conversations">${threads.map(thread => `<a class="pf-thread ${thread.stayId === stayId ? 'active' : ''}" href="#/inbox/${esc(thread.stayId)}"><strong>${esc(thread.stayName)}</strong><span>${esc(thread.hostName)}</span><small>${esc((thread.lastText || '').slice(0, 70))}</small></a>`).join('')}</nav>
      <div class="pf-chat">${active ? `<header class="pf-chat-head"><strong>${esc(active.hostName)}</strong><span>${esc(active.stayName)}</span></header><div class="pf-messages" id="pf-messages" aria-live="polite"></div>
        <form class="pf-composer" id="pf-composer"><label class="visually-hidden" for="chat-draft">Message</label><textarea id="chat-draft" rows="2" maxlength="2000" placeholder="Write a message…"></textarea><button type="submit" class="pf-button">Send</button></form>` : '<p class="pf-chat-empty">Select a conversation to start chatting.</p>'}</div>
    </div>` : emptyState('No messages yet', 'Message a host from any property page and the conversation will live here.', 'Browse stays', '#/stays')}</section>`;
  if (!active) return;
  const box = $('#pf-messages');
  const time = message => message.createdAt ? new Date(message.createdAt.seconds * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
  state.stopWatching = state.store.watchMessages(`${uid}_${active.stayId}`, messages => {
    const hostReplied = messages.some(message => message.from === 'host');
    box.innerHTML = `<p class="pf-bubble pf-bubble-host">${esc(active.greeting)}</p>${messages.map(message => `<p class="pf-bubble pf-bubble-${message.from === 'guest' ? 'guest' : 'host'}">${esc(message.text)}<small>${time(message)}</small></p>`).join('')}
      ${messages.length && !hostReplied ? '<p class="pf-chat-note">Hosts usually reply within a few hours. You will see the reply right here.</p>' : ''}`;
    box.scrollTop = box.scrollHeight;
  });
  const composer = $('#pf-composer'), draft = $('#chat-draft');
  draft.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); composer.requestSubmit(); } };
  composer.onsubmit = async event => {
    event.preventDefault();
    const text = draft.value.trim();
    if (!text) return;
    draft.value = '';
    try { await state.store.sendMessage(`${uid}_${active.stayId}`, text); } catch (error) { toast(friendly(error)); draft.value = text; }
  };
}

async function renderProfile() {
  const root = view();
  const user = state.store?.user;
  if (!user) { go('#/login?next=%23%2Fprofile'); return; }
  let profile = {}, reviews = 0;
  try { [profile, reviews] = await Promise.all([state.store.profile(), state.store.countMyReviews()]); } catch { /* show what we have */ }
  const trips = await refreshTrips();
  const name = profile.name || user.name || 'Guest traveller';
  const since = profile.createdAt?.seconds ? new Date(profile.createdAt.seconds * 1000).getFullYear() : new Date().getFullYear();
  root.innerHTML = `<section class="pf-screen pf-profile"><div class="pf-profile-card">
    <span class="pf-profile-avatar" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>
    <h1 class="display display-s">${esc(name)}</h1>
    <p class="pf-meta">${esc(user.email || user.phone || '')} · Member since ${since}</p>
    ${user.provider === 'password' && user.email && !user.verified && state.store.mode === 'firebase' ? '<p class="pf-demo-note">Please verify your email — we sent a link when you signed up.</p>' : ''}
    <dl class="pf-stats"><div><dd>${trips.filter(trip => trip.status !== 'cancelled').length}</dd><dt>Trips</dt></div><div><dd>${state.wishlist.size}</dd><dt>Saved</dt></div><div><dd>${reviews}</dd><dt>Reviews</dt></div></dl>
    <form class="pf-form-grid" id="profile-form"><label class="pf-input"><span>Full name</span><input name="name" autocomplete="name" value="${esc(profile.name || user.name || '')}"></label><label class="pf-input"><span>Mobile number</span><input name="phone" type="tel" autocomplete="tel" value="${esc(profile.phone || user.phone || '')}"></label>
      <p class="pf-message info" role="status"></p><button type="submit" class="pf-button">Save details</button></form>
    <nav class="pf-profile-links"><a href="#/trips">My trips</a><a href="#/wishlist">My wishlist</a><a href="#/inbox">Messages</a></nav>
    <button type="button" class="pf-text-button pf-signout" data-signout>Sign out</button>
  </div></section>`;
  root.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target)), message = $('.pf-message', root);
    try { await state.store.saveProfile({ name: data.name.trim(), phone: data.phone.trim() }); message.textContent = 'Saved.'; updateBadges(); }
    catch (error) { message.textContent = friendly(error); }
  };
  root.onclick = async event => {
    if (!event.target.closest('[data-signout]')) return;
    await state.store.signOut();
    state.wishlist = new Set(readLocal(GUEST_WISHLIST, [])); state.tripCount = 0; updateBadges();
    toast('You have signed out.'); go('#/');
  };
}

function renderMissing() {
  view().innerHTML = `<section class="pf-screen pf-list-screen">${emptyState('This page has moved', 'The stay or page you were looking for is not here.', 'Explore stays', '#/stays')}</section>`;
}

/* ------------------------------------------------------------------ Router */
const routes = [
  [/^#\/stays(?:\?(.*))?$/, match => renderSearch(match[1])],
  [/^#\/stay\/([\w-]+)$/, match => renderDetails(match[1])],
  [/^#\/book\/([\w-]+)$/, match => renderBooking(match[1])],
  [/^#\/login(?:\?(.*))?$/, match => renderLogin(match[1])],
  [/^#\/wishlist$/, () => renderWishlist()],
  [/^#\/trips$/, () => renderTrips()],
  [/^#\/inbox(?:\/([\w-]+))?$/, match => renderInbox(match[1])],
  [/^#\/profile$/, () => renderProfile()]
];
let previousHash = '';
function route() {
  const hash = location.hash;
  const app = hash.startsWith('#/') && hash !== '#/';
  document.body.classList.toggle('app-mode', app);
  $('main').hidden = app;
  view().hidden = !app;
  state.stopWatching?.(); state.stopWatching = null;
  if (!app) {
    if (previousHash.startsWith('#/') && previousHash !== '#/') { window.scrollTo(0, 0); }
    previousHash = hash;
    dispatchEvent(new Event('story:layout'));
    return;
  }
  const samePage = previousHash.split('?')[0] === hash.split('?')[0] && hash.startsWith('#/stays');
  if (!hash.startsWith('#/login')) state.lastRoute = hash;
  previousHash = hash;
  const match = routes.find(([pattern]) => pattern.test(hash));
  // Screens tied to an account wait until we know who is signed in.
  if (!state.store && /^#\/(book|trips|inbox|profile|login)/.test(hash)) view().innerHTML = '<section class="pf-screen pf-list-screen"><p class="pf-loading">Loading…</p></section>';
  else match ? match[1](hash.match(match[0])) : renderMissing();
  if (!samePage) window.scrollTo(0, 0);
  $('#site-header').dataset.theme = 'dark';
  dispatchEvent(new Event('story:layout'));
}

/* ------------------------------------------------------------------ Start */
async function onAuthChange(user) {
  if (user) {
    const guestSaved = readLocal(GUEST_WISHLIST, []);
    try {
      if (guestSaved.length) { await state.store.mergeWishlist(guestSaved); keepLocal(GUEST_WISHLIST, []); }
      state.wishlist = new Set(await state.store.getWishlist());
    } catch { /* keep the local list */ }
    refreshTrips();
    syncHearts();
    if (location.hash.startsWith('#/login')) {
      const next = view().dataset.next || '#/';
      delete view().dataset.next;
      toast(`Welcome${user.name ? `, ${user.name.split(' ')[0]}` : ''} — you are signed in.`);
      go(next);
    }
  }
  updateBadges();
}

export async function setupPlatform({ storePromise, smooth }) {
  state.smooth = smooth;
  renderHome();
  // Home search, card hearts and steppers work everywhere through delegation.
  document.addEventListener('click', event => {
    const heart = event.target.closest('[data-wish]');
    if (heart) { event.preventDefault(); toggleWish(heart.dataset.wish); return; }
    const step = event.target.closest('[data-search-form] [data-step]');
    if (step) {
      state.search.guests = Math.max(1, Math.min(20, state.search.guests + Number(step.dataset.step))); saveSearch();
      const holder = step.closest('[data-stepper]');
      holder.outerHTML = stepper('guests', state.search.guests, 1, 20);
      if (location.hash.startsWith('#/stays')) renderSearch(location.hash.split('?')[1]);
    }
  });
  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-search-form]');
    if (!form) return;
    event.preventDefault();
    const checkIn = $('[name=checkIn]', form).value, checkOut = $('[name=checkOut]', form).value;
    const error = validateDates(checkIn, checkOut);
    if (error) { toast(error); return; }
    Object.assign(state.search, { checkIn, checkOut }); saveSearch();
    go('#/stays');
  });
  $('#home-platform')?.addEventListener('change', event => {
    if (event.target.name !== 'checkIn') return;
    const out = $('[name=checkOut]', event.target.form);
    out.min = dateAfter(event.target.value);
    if (out.value <= event.target.value) out.value = dateAfter(event.target.value);
  });
  // Mobile header menu.
  const menu = $('.hs-menu-toggle');
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); $('#site-header').classList.toggle('nav-open', open); });
  $('.hs-nav')?.addEventListener('click', event => { if (event.target.closest('a')) { menu?.setAttribute('aria-expanded', 'false'); $('#site-header').classList.remove('nav-open'); } });

  addEventListener('hashchange', route);
  updateBadges();
  route();
  state.store = await storePromise;
  state.store.onAuth(onAuthChange);
  await onAuthChange(state.store.user);
  // Re-render the current screen now that we know who is signed in.
  if (location.hash.startsWith('#/') && location.hash !== '#/') route();
}
