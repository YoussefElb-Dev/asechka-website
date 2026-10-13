export function createQuoteCarousel() {
  const carousel = document.getElementById('quote-carousel');
  const viewport = document.getElementById('quote-viewport');
  const list = document.getElementById('quote-list');
  const controls = document.getElementById('quote-controls');
  const pauseButton = document.getElementById('pause-quotes');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const speed = 16; // Pixels per second, so every quote drifts at the same gentle pace.
  let cycleWidth = 0;
  let position = 0;
  let lastWritten = 0;
  let lastFrame = 0;
  let frame = 0;
  let inView = false;
  let hovering = false;
  let touching = false;
  let paused = false;
  let manualUntil = 0;

  function motionDisabled() {
    return reducedMotion.matches || document.body.classList.contains('motion-paused');
  }

  function updateMotion() {
    const disabled = motionDisabled();
    pauseButton.disabled = disabled;
    pauseButton.textContent = paused || disabled ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(paused || disabled));
    pauseButton.title = disabled ? 'Animations are paused in your motion settings.' : '';
    const canRun = cycleWidth > 0 && inView && !document.hidden && !paused && !disabled;
    if (canRun && !frame) { lastFrame = 0; frame = requestAnimationFrame(drift); }
    else if (!canRun && frame) { cancelAnimationFrame(frame); frame = 0; }
  }

  function drift(now) {
    const elapsed = lastFrame ? Math.min(now - lastFrame, 64) : 0;
    lastFrame = now;
    const focused = viewport.contains(document.activeElement);
    if (!hovering && !touching && !focused && now >= manualUntil) {
      // Keep a fractional position: native scrollLeft can round subpixel steps.
      if (viewport.scrollLeft !== lastWritten) position = viewport.scrollLeft;
      position = (position + elapsed * speed / 1000) % cycleWidth;
      viewport.scrollLeft = position;
      lastWritten = viewport.scrollLeft;
    } else {
      position = lastWritten = viewport.scrollLeft;
    }
    frame = requestAnimationFrame(drift);
  }

  function measure() {
    list.querySelectorAll('[data-quote-copy]').forEach(copy => copy.remove());
    const originals = [...list.children];
    cycleWidth = 0;
    if (originals.length > 1 && viewport.clientWidth) {
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const first = originals[0].getBoundingClientRect();
      const last = originals.at(-1).getBoundingClientRect();
      cycleWidth = last.right - first.left + gap;
      // Include enough copies to fill the viewport even with only two short quotes.
      const repeats = Math.ceil((viewport.clientWidth + gap) / cycleWidth);
      const copies = document.createDocumentFragment();
      for (let repeat = 0; repeat < repeats; repeat++) {
        for (const original of originals) {
          const copy = original.cloneNode(true);
          copy.dataset.quoteCopy = '';
          copy.setAttribute('aria-hidden', 'true');
          copy.inert = true;
          copies.append(copy);
        }
      }
      list.append(copies);
    }
    position = lastWritten = 0;
    viewport.scrollLeft = 0;
    updateMotion();
  }

  function refresh() {
    const count = list.children.length;
    carousel.hidden = count === 0;
    controls.hidden = count < 2;
    measure();
  }

  function browse(direction) {
    if (!cycleWidth) return;
    manualUntil = performance.now() + 4000;
    const target = viewport.scrollLeft + direction * viewport.clientWidth * 0.8;
    const wrapped = target < 0 || target >= cycleWidth;
    viewport.scrollTo({
      left: (target % cycleWidth + cycleWidth) % cycleWidth,
      behavior: wrapped || motionDisabled() ? 'instant' : 'smooth',
    });
  }

  document.getElementById('previous-quote').addEventListener('click', () => browse(-1));
  document.getElementById('next-quote').addEventListener('click', () => browse(1));
  pauseButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
  viewport.addEventListener('mouseenter', () => { hovering = true; });
  viewport.addEventListener('mouseleave', () => { hovering = false; });
  viewport.addEventListener('pointerdown', () => { touching = true; });
  const release = () => {
    if (!touching) return;
    touching = false;
    manualUntil = performance.now() + 4000;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  viewport.addEventListener('wheel', () => { manualUntil = performance.now() + 4000; }, { passive: true });
  viewport.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      browse(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      manualUntil = performance.now() + 4000;
      const originals = [...list.children].filter(item => !item.hasAttribute('data-quote-copy'));
      const last = originals.at(-1);
      if (!last) return;
      viewport.scrollTo({ left: event.key === 'Home' ? 0 : last.offsetLeft, behavior: 'instant' });
    }
  });
  new ResizeObserver(measure).observe(viewport);
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    updateMotion();
  }).observe(viewport);
  new MutationObserver(updateMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reducedMotion.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  document.fonts.ready.then(measure);
  return { refresh };
}
