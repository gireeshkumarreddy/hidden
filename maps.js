// Google Maps for the stays: an interactive map with price pins when an API key is configured,
// otherwise Google's keyless embed, centred on a neighbourhood.
import { googleMaps } from './maps-config.js';
import { stays } from './catalogue.js';
import { coordinates } from './site-data.js';

const HYDERABAD = { lat: 17.4065, lng: 78.4291 };
export const CITY_QUERY = 'Hyderabad, Telangana';
export const neighbourhoodOf = stay => stay.location.split(',')[0];
export const hasMapsKey = () => Boolean(googleMaps.apiKey);
export const embedUrl = (query = CITY_QUERY) => `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${query === CITY_QUERY ? 11 : 14}&hl=en&output=embed`;

// Pins sit near the neighbourhood centre, spread a little so neighbours never overlap.
// Locations are approximate on purpose: the exact address is shared after booking.
export function positionFor(stay) {
  const [lat, lng] = coordinates[neighbourhoodOf(stay)] || [HYDERABAD.lat, HYDERABAD.lng];
  const angle = Math.max(0, stays.indexOf(stay)) * 2.4;
  return { lat: lat + Math.sin(angle) * 0.003, lng: lng + Math.cos(angle) * 0.003 };
}

let loader = null;
const authListeners = new Set();
// Google calls this when the key is missing, invalid or not allowed for this address.
window.gm_authFailure = () => authListeners.forEach(listener => listener());
export const onMapsAuthFailure = listener => { authListeners.add(listener); return () => authListeners.delete(listener); };

function loadMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  loader ||= new Promise((resolve, reject) => {
    const callback = '__hiddenStoriesMapsReady';
    window[callback] = () => resolve(window.google.maps);
    const params = new URLSearchParams({ key: googleMaps.apiKey, v: 'weekly', loading: 'async', libraries: 'marker', language: 'en', region: 'IN', callback });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => { loader = null; reject(new Error('Google Maps could not load.')); };
    document.head.append(script);
  });
  return loader;
}

// Creates the interactive map. `card(stay)` returns the HTML shown when a pin is chosen.
export async function createStayMap(element, { card, price }) {
  const maps = await loadMaps();
  const [{ Map: GoogleMap, InfoWindow }, { AdvancedMarkerElement }, { LatLngBounds }] = await Promise.all([
    maps.importLibrary('maps'), maps.importLibrary('marker'), maps.importLibrary('core')
  ]);
  const map = new GoogleMap(element, {
    center: HYDERABAD, zoom: 11, mapId: googleMaps.mapId || 'DEMO_MAP_ID',
    gestureHandling: 'cooperative', clickableIcons: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: true
  });
  const info = new InfoWindow({ maxWidth: 300 });
  const pins = new globalThis.Map();
  let activeId = null;

  const setActive = id => {
    pins.forEach((pin, key) => { pin.content.classList.toggle('active', key === id); pin.zIndex = key === id ? 10 : 1; });
    activeId = id;
  };
  const open = id => {
    const pin = pins.get(id);
    if (!pin) return;
    const stay = stays.find(item => item.id === id);
    info.setContent(card(stay));
    info.open({ anchor: pin, map });
    setActive(id);
  };
  info.addListener('closeclick', () => setActive(null));

  return {
    update(list) {
      const wanted = new Set(list.map(stay => stay.id));
      pins.forEach((pin, id) => { if (!wanted.has(id)) { pin.map = null; pins.delete(id); } });
      for (const stay of list) {
        if (pins.has(stay.id)) continue;
        const content = document.createElement('div');
        content.className = 'pf-gmap-pin';
        content.textContent = price(stay);
        const pin = new AdvancedMarkerElement({ map, position: positionFor(stay), content, title: `${stay.name}, ${price(stay)} a night`, gmpClickable: true });
        pin.addListener('click', () => open(stay.id));
        pins.set(stay.id, pin);
      }
      if (activeId && !wanted.has(activeId)) { info.close(); activeId = null; }
      if (list.length === 1) { map.setCenter(positionFor(list[0])); map.setZoom(14); }
      else if (list.length) {
        const bounds = new LatLngBounds();
        list.forEach(stay => bounds.extend(positionFor(stay)));
        map.fitBounds(bounds, 70);
      }
    },
    select(id) { const pin = pins.get(id); if (pin) { map.panTo(pin.position); open(id); } },
    highlight(id) { if (!activeId) pins.forEach((pin, key) => pin.content.classList.toggle('hover', key === id)); }
  };
}
