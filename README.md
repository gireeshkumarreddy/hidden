# Hidden Stories

A buildless, responsive hospitality experience. Serve the extracted folder with any static host. `index.html` and `assets/` are at the root. There are no runtime dependencies or third-party asset requests.

## Structure

- `index.html`: semantic page sections, navigation and dialog shells.
- `styles.css`: base layouts and accessibility overrides.
- `reference-layout.css`: detailed reference compositions and responsive overrides.
- `START-HERE.txt`: preview, deployment and image-quality notes.
- `motion.js`: measured scroll timelines, aperture expansion, palette transitions and the desktop horizontal gallery.
- `app.js`: property exploration, galleries, saved stays and date/guest planning.
- `logic.js`: filtering and date/price calculations.
- `catalogue.js`: eight property records sourced from the supplied website.
- `assets`: local photographs, fonts, supplied launch-film logo frame and optimized launch film.
- `source/catalogue.json`: the source catalogue as retrieved on 8 October 2026.

## Source and brand fidelity

The three supplied reference screenshots informed, in order: the framed hero and editorial navigation; the cream asymmetric body; and the stay collection. The revision restores the exact canoe illustration, two-tier navigation, framed room carousel, villa carousel with hotspots, ornamental editorial heading, mission grid, corner-framed experiences, and aligned six-card collection. The six coastal cards use the original recovered Atlanta Trevone photos and truthful names in a separate inspiration edit; they link to that owner and are not represented as Hidden Stories inventory. The eight Hyderabad property records remain unchanged in their own collection.

The supplied launch video carries the burgundy figurative Hidden Stories logo, which differs from the public site's green doorway emblem. This experience uses the original film logo as a CSS window onto an unretouched video frame. The entire emblem remains visible. The launch-kit archive/font files were not present in the available attachments or located by Library search. Playfair Display and Inter are self-hosted from the font families declared by the supplied public website. A standalone original logo and the full brand kit would enable final brand-level verification.

Property names, locations, capacities, amenities, nightly rates and photographic source IDs are taken from https://www.hiddenstories.in/ and its publicly served catalogue. Descriptions are rewritten without adding property claims. Reviews, host profiles, testimonial claims and simulated payments from that source have not been carried over.

The catalogue references Unsplash photos; this implementation retains those exact source photographs and creates responsive local WebP encodings. The reference revision also includes original public photography from Atlanta Trevone and Toscana Valley, and the original canoe artwork from Grand Adirondack. No AI redrawing or photo upscaling was used. Original source URLs and native dimensions are recorded in source/reference-image-audit.json and source/image-resolution-audit.json. The published page does not load third-party JavaScript bundles. Supplied screenshots and original film are included only in the downloadable ZIP references folder.

## Image-resolution limits

Fourteen catalogue photographs have native-source 3840px-wide WebP versions, with smaller responsive encodings. One catalogue photo is capped at 3024px. The six reference-three photographs are 1024–2286px wide, up to 3200px tall. The canoe is 830×344px and is displayed small. The first reference room-rendering URL returned access errors; the existing sharp native-source room photograph remains. Several exact second-reference photographs could not be located in high-resolution form, so related official Toscana Valley images are used. This is a closer structural recreation, not a claim of pixel-exact or all-4K fidelity.

## Booking scope

This is a complete discovery front end. Filtering uses location, category and guest capacity. Date selection calculates a nightly-rate subtotal before taxes and fees. It does not query real-time inventory. Continuing a stay opens the original Hidden Stories site, where the visitor can confirm pricing and availability. No reservation, payment, email or message is sent from this site. Saved stays persist in the current browser, with a session fallback when localStorage is unavailable.

## Motion and accessibility

Scrolling stays native. A damped requestAnimationFrame loop updates only when scrolling, resizing or settling. The hero changes its aperture and crop without distorting its photograph. Colour transitions evolve through the page. Horizontal storytelling is pinned on desktop and touch-scrollable on mobile. Reduced-motion mode removes pinned travel and entrance motion. Dialogs are native, keyboard accessible and labelled. Search controls have native labels and date constraints.

## Validation limit

Static assets, source links, JS syntax, filtering and date behaviour can be checked in the execution environment. The required managed browser-control skill was not available, so an actual browser visual/responsive QA pass could not be performed here.
