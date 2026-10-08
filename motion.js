const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, progress) => a.map((value, index) => Math.round(value + (b[index] - value) * progress));
const red = [75, 11, 27], cream = [247, 242, 232];

export function setupMotion() {
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const desktopQuery = matchMedia('(min-width: 701px)');
  const hero = document.querySelector('.hero-scroll');
  const photo = document.querySelector('.hero-photo');
  const header = document.querySelector('.site-header');
  const environments = [...document.querySelectorAll('[data-tone]')];
  const moments = document.querySelector('.moments');
  const track = document.querySelector('.moments-track');
  const destination = document.querySelector('.destination');
  const counter = document.querySelector('.moment-counter');
  let viewHeight = innerHeight, viewWidth = innerWidth, heroTop = 0, heroRange = 1;
  let momentTop = 0, momentRange = 1, travel = 0, destinationTop = 0, tones = [];
  let frame = 0, previousTime = 0, progress = 0, momentProgress = 0;
  let initialized = false;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: .07, rootMargin: '0px 0px -20px 0px' });
  document.body.classList.add('motion-ready');

  function observeReveals(root = document) {
    root.querySelectorAll('.reveal:not(.visible)').forEach(element => observer.observe(element));
  }
  observeReveals();

  function measure() {
    viewHeight = innerHeight; viewWidth = innerWidth;
    heroTop = hero.offsetTop;
    heroRange = Math.max(1, hero.offsetHeight - viewHeight);
    momentTop = moments.offsetTop;
    momentRange = Math.max(1, moments.offsetHeight - viewHeight);
    // Use resolved padding rather than the raw clamp() custom property.
    travel = Math.max(0, track.scrollWidth - viewWidth + parseFloat(getComputedStyle(document.querySelector('.moments-window')).paddingLeft) * 2);
    destinationTop = destination.offsetTop;
    tones = environments.map(element => ({ top: element.offsetTop, tone: element.dataset.tone }));
    requestFrame();
  }

  function paint(time) {
    frame = 0;
    const y = scrollY;
    const delta = previousTime ? Math.min(50, time - previousTime) : 16;
    previousTime = time;
    const damping = reducedQuery.matches ? 1 : 1 - Math.exp(-delta / 80);
    const target = reducedQuery.matches ? 0 : clamp((y - heroTop) / heroRange);
    const targetMoment = !reducedQuery.matches && desktopQuery.matches ? clamp((y - momentTop) / momentRange) : 0;
    if (!initialized) { progress = target; momentProgress = targetMoment; initialized = true; }
    progress += (target - progress) * damping;
    momentProgress += (targetMoment - momentProgress) * damping;
    const aperture = smooth(progress / .63);
    hero.style.setProperty('--hero-progress', aperture.toFixed(5));
    hero.style.setProperty('--hero-text', (1 - smooth(progress / .3)).toFixed(5));
    hero.style.setProperty('--hero-caption', (smooth((progress - .43) / .2) * (1 - smooth((progress - .8) / .09))).toFixed(5));
    hero.style.setProperty('--hero-exit', smooth((progress - .86) / .14).toFixed(5));
    hero.classList.toggle('hero-active', y < heroTop + hero.offsetHeight);
    const filmCaption = document.querySelector('.hero-film-caption');
    filmCaption.inert = progress < .45 || progress > .88;
    filmCaption.style.visibility = progress > .4 && progress < .9 ? 'visible' : 'hidden';
    document.querySelector('.hero-bottom').inert = progress > .3;
    document.querySelector('.room-caption').inert = progress > .3;

    let background = red;
    for (const section of tones) {
      const fraction = smooth((y + viewHeight * .94 - section.top) / (viewHeight * .52));
      if (fraction <= 0) break;
      const next = section.tone === 'cream' ? cream : red;
      background = mix(background, next, fraction);
    }
    // Keep typography contrasted while the environment changes; inverse colour
    // interpolation would make text and background identical at the midpoint.
    const luminance = background.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const foreground = luminance > .2 ? red : cream;
    document.body.style.setProperty('--bg', background.join(','));
    document.body.style.setProperty('--fg', foreground.join(','));

    if (desktopQuery.matches && !reducedQuery.matches) {
      track.style.transform = `translate3d(${-travel * momentProgress}px,0,0)`;
      moments.style.setProperty('--moment-progress', momentProgress.toFixed(5));
      counter.textContent = `${String(Math.min(4, 1 + Math.floor(momentProgress * 3.99))).padStart(2, '0')} / 04`;
    } else { track.style.transform = ''; }
    destination.style.setProperty('--parallax', clamp((y + viewHeight - destinationTop) / (destination.offsetHeight + viewHeight)).toFixed(4));
    const docked = y > heroTop + hero.offsetHeight - viewHeight * .6;
    header.classList.toggle('docked', docked);
    header.classList.toggle('visible', docked);
    if (Math.abs(target - progress) > .0001 || Math.abs(targetMoment - momentProgress) > .0001) requestFrame();
  }

  function requestFrame() { if (!frame) frame = requestAnimationFrame(paint); }
  addEventListener('scroll', requestFrame, { passive: true });
  addEventListener('resize', measure, { passive: true });
  addEventListener('load', measure, { once: true });
  reducedQuery.addEventListener('change', measure);
  desktopQuery.addEventListener('change', measure);
  document.fonts.ready.then(measure);
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(document.querySelector('main'));
  measure();
  if (!reducedQuery.matches && scrollY < 30) {
    photo.animate([{ clipPath: 'inset(48% 42% 48% 42%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }], { duration: 1450, delay: 180, easing: 'cubic-bezier(.22,.68,0,1)', fill: 'backwards' });
    document.querySelector('.hero-heading').animate([{ opacity: 0, translate: '0 22px' }, { opacity: 1, translate: '0 0' }], { duration: 1100, delay: 180, easing: 'cubic-bezier(.22,.68,0,1)' });
  }
  return { observeReveals, measure };
}
