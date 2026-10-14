import { getCountdown } from './countdown.js';

const timer = document.querySelector('[role="timer"]');
let finished = false;
function updateCountdown() {
  const parts = getCountdown();
  for (const key of ['days', 'hours', 'minutes', 'seconds']) {
    document.getElementById(key).textContent = String(parts[key]).padStart(2, '0');
  }
  timer.setAttribute('aria-label', parts.expired ? 'The wait is over. It is time for our little moment.' : `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, and ${parts.seconds} seconds until Friday's surprise.`);
  if (parts.expired && !finished) {
    finished = true;
    document.getElementById('countdown-title').textContent = 'Our little moment is here.';
    document.getElementById('countdown-subtitle').textContent = 'Some things are better said in person.';
    document.getElementById('surprise-title').innerHTML = 'The wait is over,<br><span class="handwritten">my Asechka.</span>';
    document.getElementById('surprise-description').textContent = 'If it all works out, I’ll be the happiest man alive for the rest of eternity.';
    document.getElementById('hint-button').hidden = true;
    document.getElementById('hint-text').textContent = 'The next little chapter starts with us.';
    document.getElementById('hint-progress').textContent = '';
  }
}
updateCountdown();
const countdownInterval = setInterval(() => { updateCountdown(); if (finished) clearInterval(countdownInterval); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateCountdown(); });

const dialog = document.getElementById('letter-dialog');
let letterOpener;
document.querySelectorAll('[data-open-letter]').forEach(button => button.addEventListener('click', () => {
  letterOpener = button;
  dialog.showModal();
  document.body.classList.add('letter-open');
}));
document.getElementById('close-letter').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('letter-open');
  letterOpener?.focus({ preventScroll: true });
});

document.querySelectorAll('.feeling-card').forEach(card => card.addEventListener('click', () => {
  const opened = card.getAttribute('aria-expanded') === 'true';
  card.setAttribute('aria-expanded', String(!opened));
  card.querySelector('.card-reveal').hidden = opened;
  card.querySelector('.card-teaser').hidden = !opened;
  card.querySelector('.card-prompt').innerHTML = opened ? 'tap for a little more <span>↗</span>' : 'keep this little feeling <span>♡</span>';
}));

const hints = ['It starts with you.', 'It has a little something to do with us.', "Maybe there's a question I've been saving…"];
let hintIndex = 0;
const hintButton = document.getElementById('hint-button');
hintButton.addEventListener('click', () => {
  if (hintIndex >= hints.length || finished) return;
  document.getElementById('hint-text').textContent = hints[hintIndex++];
  document.getElementById('hint-progress').textContent = `LITTLE HINT ${hintIndex} OF ${hints.length}`;
  hintButton.innerHTML = hintIndex < hints.length ? 'Just one more little hint? <span>↗</span>' : "That's all I'm telling you ♡";
  hintButton.disabled = hintIndex === hints.length;
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.getElementById('motion-toggle');
let motionPaused = reducedMotion.matches;
function applyMotion() {
  document.body.classList.toggle('motion-paused', motionPaused);
  motionButton.setAttribute('aria-pressed', String(motionPaused));
  motionButton.innerHTML = motionPaused ? 'Resume the magic <span>▷</span>' : 'Pause the magic <span>Ⅱ</span>';
}
applyMotion();
motionButton.addEventListener('click', () => { motionPaused = !motionPaused; applyMotion(); });
reducedMotion.addEventListener('change', event => { motionPaused = event.matches; applyMotion(); });

let hearts = 0;
document.getElementById('send-love').addEventListener('click', event => {
  hearts++;
  document.getElementById('love-status').textContent = hearts === 1 ? 'One little heart, just for you ♡' : `${hearts} little hearts. Still not enough to say it all ♡`;
  if (motionPaused || reducedMotion.matches) return;
  const rect = event.currentTarget.getBoundingClientRect();
  for (let i = 0; i < 9; i++) {
    const heart = document.createElement('span');
    heart.className = 'heart-particle';
    heart.textContent = i % 3 ? '♡' : '✦';
    heart.style.left = `${rect.left + rect.width / 2}px`;
    heart.style.top = `${rect.top + rect.height / 2}px`;
    heart.style.setProperty('--dx', `${(Math.random() - .5) * 260}px`);
    heart.style.setProperty('--dy', `${-60 - Math.random() * 180}px`);
    heart.style.setProperty('--rotation', `${(Math.random() - .5) * 90}deg`);
    heart.style.color = ['#9a82c5', '#83a0ce', '#afa6d4'][i % 3];
    heart.style.animationDelay = `${i * 35}ms`;
    document.getElementById('heart-particles').appendChild(heart);
    setTimeout(() => heart.remove(), 2100);
  }
});
