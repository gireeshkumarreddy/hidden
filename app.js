import { stays } from './catalogue.js';
import { filterStays, localDate, dateAfter, validateDates, nightsBetween, formatPrice } from './logic.js';
import { setupMotion } from './motion.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const asset = (id, width = 1600) => `./assets/${id}-${width}.webp`;
const srcset = id => [800, 1600, 2400, id === '1523217582562-09d0def993a6' ? 3024 : 3840].map(width => `${asset(id, width)} ${width}w`).join(', ');
const state = { category: 'all', destination: '', guests: 1, arrival: '', departure: '', saved: [], selected: null, gallery: 0 };
try {
  const stored = JSON.parse(localStorage.getItem('hidden-stories:saved') || '[]');
  if (Array.isArray(stored)) state.saved = stored.filter(id => stays.some(stay => stay.id === id));
} catch { /* Browsing and saving still work for this session if storage is unavailable. */ }
let motion;
let toastTimeout;
let previousFocus;

function notify(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderCollection() {
  const result = filterStays(stays, state);
  $('#stay-grid').innerHTML = result.map(stay => `
    <article class="stay-card">
      <div class="stay-card-media">
        <a href="#stay-${escapeHTML(stay.id)}" data-stay="${escapeHTML(stay.id)}" aria-label="Explore ${escapeHTML(stay.name)}">
          <img src="${asset(stay.gallery[0], 800)}" srcset="${srcset(stay.gallery[0])}" sizes="(max-width:700px) 44vw, 30vw" alt="${escapeHTML(stay.name)} — ${escapeHTML(stay.category)}" width="800" height="1067" loading="lazy">
        </a>
        <div class="card-meta"><span>${escapeHTML(stay.category.toUpperCase())}</span></div>
        <button class="wish-button" data-save="${escapeHTML(stay.id)}" aria-pressed="${state.saved.includes(stay.id)}" aria-label="${state.saved.includes(stay.id) ? 'Unsave' : 'Save'} ${escapeHTML(stay.name)}">${state.saved.includes(stay.id) ? '♥' : '♡'}</button>
        <div class="stay-card-overlay"><span>${stay.bedrooms} BEDROOM${stay.bedrooms === 1 ? '' : 'S'} &nbsp;·&nbsp; ${stay.guests} GUESTS</span><span class="card-arrow" aria-hidden="true">↗</span></div>
      </div>
      <div class="stay-card-text"><p class="card-location">${escapeHTML(stay.location)}</p><h3><a href="#stay-${escapeHTML(stay.id)}" data-stay="${escapeHTML(stay.id)}">${escapeHTML(stay.name)}</a></h3><p class="card-price">${formatPrice(stay.price)} <small>/ night</small></p><p class="card-description">${escapeHTML(stay.editorial)}</p></div>
    </article>`).join('');
  $('#collection-count').textContent = `${String(result.length).padStart(2, '0')} ${result.length === 1 ? 'place' : 'places'} to call your own`;
  $('#saved-count').textContent = state.saved.length;
  $('#empty-state').hidden = result.length > 0;
  $('#empty-state p').textContent = state.category === 'saved' && !state.saved.length ? 'Tap a heart on any stay to keep it here for later.' : 'Try another neighbourhood or a smaller group.';
  $$('.filters button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.category)));
  const summary = $('#search-summary');
  summary.hidden = !state.destination && state.guests <= 1 && !state.arrival;
  $('span', summary).textContent = `${state.destination || 'Hyderabad'} · ${state.guests} ${state.guests === 1 ? 'guest' : 'guests'}${state.arrival ? ` · ${dateLabel(state.arrival)} – ${dateLabel(state.departure)} · availability to be confirmed` : ''}`;
  motion?.measure();
}

function dateLabel(date) { return new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }

function openDialog(dialog, trigger) {
  previousFocus = trigger || document.activeElement;
  dialog.showModal(); document.body.classList.add('locked');
}

function closeDialog(dialog) { dialog.close(); }
$$('dialog').forEach(dialog => {
  $('[data-close]', dialog).addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(dialog); } });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('locked');
    if (dialog.id === 'film-dialog') $('video', dialog).pause();
    if (dialog.id === 'stay-dialog' && location.hash.startsWith('#stay-')) history.replaceState(null, '', '#collection');
    previousFocus?.focus({ preventScroll: true });
  });
});

function configureDates(form) {
  const arrival = $('[name=arrival]', form), departure = $('[name=departure]', form);
  arrival.min = localDate(); departure.min = dateAfter(localDate());
  arrival.addEventListener('change', () => {
    if (arrival.value) {
      departure.min = dateAfter(arrival.value);
      if (departure.value && departure.value <= arrival.value) departure.value = dateAfter(arrival.value);
    }
  });
}

function synchronizeForm(form) {
  if ($('[name=destination]', form)) $('[name=destination]', form).value = state.destination;
  $('[name=arrival]', form).value = state.arrival;
  $('[name=departure]', form).value = state.departure;
  const guestSelect = $('[name=guests]', form);
  guestSelect.value = String(state.guests > 1 ? state.guests : 2);
  if (state.arrival) $('[name=departure]', form).min = dateAfter(state.arrival);
}

function applySearch(form) {
  const formData = new FormData(form);
  const arrival = String(formData.get('arrival') || ''), departure = String(formData.get('departure') || '');
  const error = validateDates(arrival, departure);
  $('.form-error', form).textContent = error;
  if (error) return false;
  Object.assign(state, { destination: String(formData.get('destination') || ''), guests: Number(formData.get('guests') || 1), arrival, departure, category: 'all' });
  renderCollection(); synchronizeForm($('#stay-finder')); return true;
}

[$('#stay-finder'), $('#plan-form')].forEach(form => {
  configureDates(form);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (applySearch(form)) {
      if ($('#plan-dialog').open) closeDialog($('#plan-dialog'));
      $('#collection-results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  });
});

// The whole date field opens its native calendar where the browser supports it.
$$('#stay-finder input[type=date]').forEach(input => {
  input.addEventListener('click', () => {
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); } catch { /* Native date entry remains available. */ }
    }
  });
});

function resetFilters() {
  Object.assign(state, { category: 'all', destination: '', guests: 1, arrival: '', departure: '' });
  $('#stay-finder').reset(); $('#finder-error').textContent = ''; renderCollection();
}
$('#clear-search').addEventListener('click', resetFilters);
$('#reset-filters').addEventListener('click', resetFilters);
$('#explore-hyderabad').addEventListener('click', resetFilters);
$$('[data-filter]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.filter; renderCollection(); }));
$$('[data-category-link]').forEach(link => link.addEventListener('click', () => { Object.assign(state, { category: link.dataset.categoryLink, destination: '', guests: 1 }); renderCollection(); }));

function setGallery(index) {
  const stay = state.selected;
  state.gallery = (index + stay.gallery.length) % stay.gallery.length;
  const photo = $('.detail-image');
  photo.src = asset(stay.gallery[state.gallery]); photo.srcset = srcset(stay.gallery[state.gallery]);
  photo.alt = `${stay.name} — view ${state.gallery + 1} of ${stay.gallery.length}`;
  $('#gallery-count').textContent = `0${state.gallery + 1} / 0${stay.gallery.length}`;
}

function openStay(id, trigger) {
  const stay = stays.find(item => item.id === id);
  if (!stay) return;
  state.selected = stay; state.gallery = 0;
  $('#property-detail').innerHTML = `
    <div class="detail-layout"><div class="detail-gallery"><img class="detail-image" src="${asset(stay.gallery[0])}" srcset="${srcset(stay.gallery[0])}" sizes="(max-width:700px) 90vw, 600px" alt="${escapeHTML(stay.name)} — view 1 of 4" width="1600" height="2000"><div class="gallery-controls"><button type="button" id="gallery-prev" aria-label="Previous photo">←</button><span id="gallery-count" aria-live="polite">01 / 04</span><button type="button" id="gallery-next" aria-label="Next photo">→</button></div></div>
    <div class="detail-body"><p class="eyebrow">${escapeHTML(stay.category)}</p><h2 id="detail-title">${escapeHTML(stay.name)}</h2><p class="detail-location">${escapeHTML(stay.location)}</p><p class="body-copy">${escapeHTML(stay.editorial)}</p><div class="detail-facts"><span>${stay.guests} guests</span><span>${stay.bedrooms} bedroom${stay.bedrooms === 1 ? '' : 's'}</span><span>${stay.bathrooms} bathroom${stay.bathrooms === 1 ? '' : 's'}</span></div><ul class="amenities">${stay.amenities.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
    <p class="detail-rate">${formatPrice(stay.price)}<small>per night</small></p><form class="detail-form" id="detail-form"><div class="date-pair"><label>Arrival<input type="date" name="arrival" required></label><label>Departure<input type="date" name="departure" required></label></div><label class="guest-row">Guests<select name="guests">${Array.from({ length: stay.guests }, (_, index) => `<option value="${index + 1}">${index + 1} ${index ? 'guests' : 'guest'}</option>`).join('')}</select></label><p class="form-error" aria-live="polite"></p><div class="estimate" aria-live="polite"><span>Select dates for an estimate</span><strong></strong></div><button type="submit" class="solid-button">Continue with Hidden Stories <span>↗</span></button></form><p class="fine-print">Listed nightly rate. Taxes, fees and availability are confirmed by Hidden Stories. Continuing opens the original website; no reservation or payment is made here.</p></div></div>`;
  const form = $('#detail-form'); configureDates(form);
  $('[name=arrival]', form).value = state.arrival;
  $('[name=departure]', form).value = state.departure;
  $('[name=guests]', form).value = String(Math.min(stay.guests, Math.max(2, state.guests)));
  if (state.arrival) $('[name=departure]', form).min = dateAfter(state.arrival);
  const updateEstimate = () => {
    const arrival = $('[name=arrival]', form).value, departure = $('[name=departure]', form).value;
    const error = validateDates(arrival, departure);
    $('.form-error', form).textContent = error;
    const nights = !error && arrival && departure ? nightsBetween(arrival, departure) : 0;
    $('.estimate span', form).textContent = nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'} · before taxes & fees` : 'Select dates for an estimate';
    $('.estimate strong', form).textContent = nights > 0 ? formatPrice(nights * stay.price) : '';
  };
  form.addEventListener('input', updateEstimate); form.addEventListener('change', updateEstimate); updateEstimate();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const arrival = $('[name=arrival]', form).value, departure = $('[name=departure]', form).value;
    const error = validateDates(arrival, departure);
    $('.form-error', form).textContent = error;
    if (error || !arrival || !departure) return;
    Object.assign(state, { arrival, departure, guests: Number($('[name=guests]', form).value) });
    window.open('https://www.hiddenstories.in/', '_blank', 'noopener,noreferrer');
  });
  $('#gallery-prev').addEventListener('click', () => setGallery(state.gallery - 1));
  $('#gallery-next').addEventListener('click', () => setGallery(state.gallery + 1));
  history.replaceState(null, '', `#stay-${stay.id}`);
  openDialog($('#stay-dialog'), trigger);
}

$('#stay-grid').addEventListener('click', event => {
  const save = event.target.closest('[data-save]');
  if (save) {
    const id = save.dataset.save, exists = state.saved.includes(id);
    state.saved = exists ? state.saved.filter(item => item !== id) : [...state.saved, id];
    try { localStorage.setItem('hidden-stories:saved', JSON.stringify(state.saved)); } catch { /* session fallback */ }
    if (state.category === 'saved') { renderCollection(); $(`[data-filter="saved"]`).focus({ preventScroll: true }); }
    else { save.setAttribute('aria-pressed', String(!exists)); save.textContent = exists ? '♡' : '♥'; save.setAttribute('aria-label', `${exists ? 'Save' : 'Unsave'} ${stays.find(stay => stay.id === id).name}`); $('#saved-count').textContent = state.saved.length; }
    notify(exists ? 'Removed from your saved stays.' : 'A little something for later. Stay saved.'); return;
  }
  const card = event.target.closest('[data-stay]');
  if (card) { event.preventDefault(); openStay(card.dataset.stay, card); }
});

$('#stay-dialog').addEventListener('keydown', event => {
  if (['INPUT', 'SELECT'].includes(event.target.tagName)) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); setGallery(state.gallery - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); setGallery(state.gallery + 1); }
});

$$('.plan-trigger').forEach(button => button.addEventListener('click', () => { if (!$('#mobile-menu').hidden) setMenu(false); synchronizeForm($('#plan-form')); $('.form-error', $('#plan-form')).textContent = ''; openDialog($('#plan-dialog'), button); }));
$$('.film-trigger').forEach(button => button.addEventListener('click', () => {
  openDialog($('#film-dialog'), button);
  const video = $('#film-dialog video'); video.currentTime = 0; video.play().catch(() => { /* Native controls remain available. */ });
}));

const menuButton = $('.mobile-menu-trigger'), menu = $('#mobile-menu');
function setMenu(open) {
  menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open));
  $('span', menuButton).textContent = open ? '−' : '+';
  $('#site-header').classList.toggle('menu-open', open);
  document.body.classList.toggle('locked', open);
  $('main').inert = open; $('footer').inert = open;
  if (open) $('a', menu).focus();
}
menuButton.addEventListener('click', () => setMenu(menu.hidden));
$$('a', menu).forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', event => {
  if (menu.hidden) return;
  if (event.key === 'Escape') { setMenu(false); menuButton.focus(); }
  if (event.key === 'Tab') {
    const focusable = [menuButton, ...$$('.brand-link, .header-right button'), ...$$('a', menu)];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
matchMedia('(min-width:701px)').addEventListener('change', event => { if (event.matches && !menu.hidden) setMenu(false); });
$('.brand-link').addEventListener('click', () => { if (!menu.hidden) setMenu(false); });

const roomPhotos = [
  ['1616594039964-ae9021a400a0', 'A ROOM FOR YOUR OWN STORY'],
  ['1615874959474-d609969a20ed', 'MORNINGS, RECLAIMED'],
  ['1600210492486-724fe5c67fb0', 'SPACE TO SETTLE IN']
];
let roomIndex = 0;
function changeRoom(direction) {
  roomIndex = (roomIndex + direction + roomPhotos.length) % roomPhotos.length;
  const [id, label] = roomPhotos[roomIndex], photo = $('.hero-photo > img');
  photo.src = asset(id); photo.srcset = srcset(id); photo.alt = label.toLowerCase();
  $('#room-caption-text').textContent = `0${roomIndex + 1} · ${label}`;
}
$('#room-prev').addEventListener('click', () => changeRoom(-1));
$('#room-next').addEventListener('click', () => changeRoom(1));
const villaPhotos = ['villa-lake', 'villa-condo', 'villa-banner'];
const villaWidths = [1920, 1920, 1780];
let villaIndex = 0;
function changeVilla(direction) {
  villaIndex = (villaIndex + direction + villaPhotos.length) % villaPhotos.length;
  const photo = $('#villa-main-photo'); photo.src = `./assets/${villaPhotos[villaIndex]}-1600.webp`;
  photo.srcset = `./assets/${villaPhotos[villaIndex]}-800.webp 800w, ./assets/${villaPhotos[villaIndex]}-1600.webp 1600w, ./assets/${villaPhotos[villaIndex]}-${villaWidths[villaIndex]}.webp ${villaWidths[villaIndex]}w`;
  photo.alt = ['Toscana Valley villas beside a lake', 'Toscana Valley residences among trees', 'Villas beneath the Khao Yai hills'][villaIndex];
  $('#villa-count').textContent = `0${villaIndex + 1} / 03`;
  $('.villa-progress i').style.transform = `translateX(${villaIndex * 100}%)`;
}
$('#villa-prev').addEventListener('click', () => changeVilla(-1));
$('#villa-next').addEventListener('click', () => changeVilla(1));
const villaInformation = {
  villas: ['THE VILLAS', 'Setting', 'Khao Yai, Thailand', 'Architecture', 'Tuscan inspired'],
  landscape: ['THE LANDSCAPE', 'Surroundings', 'Wooded hills', 'Setting', 'Lakes & gardens'],
  condo: ['THE RESIDENCES', 'Collection', 'Condominiums', 'Destination', 'Toscana Valley']
};
$$('[data-hotspot]').forEach(button => button.addEventListener('click', () => {
  const info = villaInformation[button.dataset.hotspot];
  $('#villa-info strong').textContent = info[0];
  $('#villa-info dl').innerHTML = `<dt>${info[1]}</dt><dd>${info[2]}</dd><dt>${info[3]}</dt><dd>${info[4]}</dd>`;
  $$('[data-hotspot]').forEach(item => {const active = item === button; item.setAttribute('aria-expanded', String(active)); item.textContent = active ? '−' : '+';});
}));
renderCollection();
motion = setupMotion();
if (location.hash.startsWith('#stay-')) openStay(location.hash.slice(6));
