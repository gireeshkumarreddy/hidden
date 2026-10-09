// Google Maps for the Explore → Map view.
//
// Without a key, the map view embeds Google Maps for the neighbourhood of whichever stay is chosen.
// With a key (Google Cloud → APIs & Services → enable "Maps JavaScript API" → Credentials → API key),
// every matching stay appears on one interactive map as a price pin.
// Restrict the key to your website addresses (HTTP referrers) — it is visible to visitors by design.
//
// mapId is optional: create one under Google Maps Platform → Map management (type JavaScript, vector)
// for production. Without it, Google's DEMO_MAP_ID is used, which is fine for testing.
export const googleMaps = {
  apiKey: '',
  mapId: ''
};
