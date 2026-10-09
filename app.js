import { setupExperience } from './experience.js';
import { setupScenes } from './scenes.js';
import { setupPlatform } from './platform.js';
import { createStore } from './store.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// The launch film plays in a dialog from the footer and the hero caption.
let previousFocus;
$$('dialog').forEach(dialog => {
  $('[data-close]', dialog)?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('locked');
    $('video', dialog)?.pause();
    previousFocus?.focus({ preventScroll: true });
  });
});
document.addEventListener('click', event => {
  const trigger = event.target.closest('.film-trigger');
  if (!trigger) return;
  const dialog = $('#film-dialog');
  previousFocus = trigger;
  dialog.showModal(); document.body.classList.add('locked');
  const video = $('video', dialog); video.currentTime = 0;
  video.play().catch(() => { /* Native controls remain available. */ });
});

const smooth = setupScenes();
// The platform renders the home blocks synchronously, before the interaction layer looks for them.
setupPlatform({ storePromise: createStore(), smooth });
setupExperience({ smooth });
