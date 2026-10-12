# A little universe for Asechka

A responsive, buildless personal website in powder blue and lavender. Includes an animated original cat illustration, a live countdown, an openable letter, revealable notes, three mysterious hints, and optional heart bursts. Keyboard accessible, with a motion pause button and support for reduced motion.

Run `npm run dev`, then open http://127.0.0.1:4173/. Deploy the contents of `dist/` as a static website.

The countdown target is **Friday, October 16, 2026 at 3:00 PM America/New_York (UTC−04:00)**. Edit `dist/countdown.js` and the visible dates in `dist/index.html` together if the date changes. On expiry the timer stops at zero and invites Asechka to find you; it keeps the surprise private.

The letter text and small messages are in `dist/index.html`. The hints are in `dist/app.js`.

Original artwork was made with the built-in image generation tool, then saved to `dist/assets/our-little-universe.png`. Its final prompt is preserved in `ARTWORK-PROMPT.md`.

Font loading uses Google Fonts; system fonts and cursive fallbacks remain available offline. All artwork and application code are served locally from the site.
