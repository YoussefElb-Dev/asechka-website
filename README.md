# For Asechka

The original powder-blue and lavender website for Asnat: a letter, a mysterious Friday countdown, a growing quote collection, and our photo album. Real cat photographs, gentle animations, keyboard controls, and reduced-motion support.

Live site: https://asechka-website.vercel.app

## Add a quote

Edit **`dist/memories.js`**. Add a line at the end of the `quotes` list, before its closing `];`. Keep the old lines so the collection keeps growing. Newest entries appear first.

```js
export const quotes = [
  "Your first quote",
  "The next thing you told her",
  { text: "Another quote", date: "2026-10-16", note: "after our call" },
];
```

Dates and notes are optional. Use dates as `YYYY-MM-DD`. Put a comma after each entry. Double quotes let you write apostrophes normally. For quotation marks inside a quote, write `\"`, for example `"She said \"really?\""`. For multiple lines, use `\n` within the string. Text is displayed literally, so HTML in a quote will not run.

On GitHub: open `dist/memories.js`, click the pencil, add your line, and commit to `main`. Vercel automatically redeploys. Refresh the site after the deployment finishes. You never need to edit the page layout.

## Add pictures

1. Upload your JPG, PNG, WebP, AVIF, or GIF files into **`dist/assets/photos/`**. On GitHub, open that folder, choose **Add file → Upload files**, then commit to `main`.
2. In the same **`dist/memories.js`** file, append an entry to the `photos` list:

```js
export const photos = [
  {
    src: "assets/photos/us.jpg",
    caption: "My favorite day with you",
    date: "2026-10-16",
    alt: "Us smiling together",
  },
  { src: "assets/photos/another-photo.jpg", caption: "Still smiling" },
];
```

Match the filename exactly (including capital letters). `caption`, `date`, and `alt` are optional; `src` is required. Newest photos appear first. Click a photo to see it full size; use arrow keys to browse and Escape to close. Photos are stored in the private repository and deployed with the site. The password gate protects their direct file URLs as well as the page.

The quote and photo lists start empty, ready for your actual words and pictures.

## Run locally

Install dependencies with `pnpm install`, then run `pnpm dev` (or `node serve.mjs`) and open http://127.0.0.1:4173/. Run `pnpm test` for the authentication checks. The local server uses the same authentication code as Vercel.

## The little password door

Vercel's root `middleware.js` checks every request before serving the files in `dist/`. The login form submits the code to the server; the password is never included in browser JavaScript. Successful sign-in shows “Welcome back, моя радость” (“my joy”) and “С возвращением, Асечка ♡”. A signed HttpOnly cookie remembers this browser for seven days. The footer's “Lock our little door” button signs out. Expired or altered cookies cannot unlock the site.

Set `SITE_PASSWORD` and a random `SESSION_SECRET` (at least 32 characters) in Vercel's environment variables for Production and Preview, and redeploy. Missing settings keep the site locked. To change the code, update `SITE_PASSWORD` in Vercel and redeploy; existing sessions then become invalid. Keep these values outside the source files. For local use, put the same variable names in an ignored `.env` file. Never upload `.env` or paste the secret into GitHub.

The gate adds no-store headers to prevent shared caching of private content. Failed guesses have a delay and a small per-instance throttle; this is a personal shared-code gate, not individual accounts. Older deployments and any separate hosting copy have their own access settings; protecting the current Vercel deployment does not change historical deployments or copies.

The countdown ends **Friday, October 16, 2026 at 3:00 PM America/New_York (UTC−04:00)**. Edit `dist/countdown.js` and the visible dates in `dist/index.html` together if the date changes. At zero it invites Asechka to find you in person without revealing the surprise.

The letter is in `dist/index.html`, the hints in `dist/app.js`, and the styling in `dist/styles.css`. Real cat photographs are `dist/assets/cats-cuddle.jpg` and `dist/assets/cats-cozy.jpg`; photographer credits and source links are in `PHOTO-CREDITS.md`. Fonts use Google Fonts with system fallbacks. No database is needed.
