# For Asechka

The original powder-blue and lavender website for Asnat: a letter, a mysterious Friday countdown, a growing quote collection, and our photo album. Real cat photographs, gentle animations, keyboard controls, and reduced-motion support.

Live site: https://asechka-website.vercel.app

## Asechka Studio: add memories from your desktop

Double-click **Asechka Studio** on your Windows desktop.

1. **Add a quote**: write the quote, keep today's date or change it, and optionally add a note. For multiple lines, enter `/multi` and finish with a line containing only `.`.
2. **Add pictures**: choose one or several photos in the file picker and add captions. All selected photos publish together in one update. The picker supports JPG, PNG, BMP and TIFF; export HEIC photos as JPG first.
3. **Publish pending memories**: retry anything saved while offline.
4. **Status / saved drafts**: see pending entries and the last successful GitHub save.
5. **Connect GitHub**: one-time connection instructions, or reconnect after revoking the key.
6. **Open the website**.

Each addition saves locally first, then pushes to the private GitHub repository. Vercel automatically deploys the commit. An open website checks for new memories every **15 seconds** while visible and also checks when you return to the tab. Updates appear after Vercel finishes deploying; this is automatic but not instantaneous. A photo you're currently viewing stays steady until you close it.

Photos become JPEG copies with a longest side of at most 1,800 pixels and a size of at most 1 MB. Originals stay untouched. The copies have no EXIF location metadata. UUID filenames avoid collisions, and folders are organized by year and month.

Drafts, prepared photos, the publishing key, and a dedicated Git clone live in `%LOCALAPPDATA%\AsechkaStudio`, outside the project and outside OneDrive. Drafts survive closing the terminal, restarting Windows, or losing internet. The app clears a pending entry only after it is confirmed saved on GitHub. Stable IDs prevent duplicates if a push succeeds but its response is lost. Concurrent GitHub edits are fetched and preserved before retrying. It never force-pushes.

The website source and the Studio source are saved in the private repository. **The private key and local drafts are never committed.** Do not upload the `credentials` directory, `.env`, or runtime configuration. The Studio-owned clone is disposable; the app never resets your development checkout.

### One-time GitHub connection

Studio creates a separate SSH deploy key for this repository. Open option 5, add its **public** key in the repository's **Settings → Deploy keys**, and select **Allow write access**. The private key stays on this computer with access limited to your Windows account. This is persistent repository access; revoke it on that same settings page if you no longer want automatic publishing. GitHub host identity is checked against its published Ed25519 host key. Studio uses GitHub's supported SSH port 443.

The desktop shortcut uses the existing Node.js and Git installations. If you move the project or uninstall those runtimes, recreate the shortcut with `publisher/Install Desktop Shortcut.cmd` using their new paths (Node.js and Git must be installed). The installer does not change PowerShell's execution policy. No background service, browser extension, cloud database, paid storage or paid publishing tool is required.

### Free-plan limits

This uses your existing GitHub private repository and Vercel Hobby project. Hobby is free for personal, noncommercial use and currently permits **100 deployments per day**. GitHub storage is **not unlimited**: its repository recommendations and file limits still apply. Keeping photos small and publishing a batch together helps keep this personal album within the free plans. Git history retains old photo versions even when files are deleted; repository size grows over time.

References: [GitHub repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), [Vercel Hobby limits](https://vercel.com/docs/plans/hobby), [GitHub deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

## Edit one content file manually

The shared content file is now **`dist/memories.json`**. It replaces `dist/memories.js` and is used by both the terminal and the website. You can still edit just this one file on GitHub. Keep the old entries and append new ones; newest entries appear first.

```json
{
  "version": 1,
  "updatedAt": null,
  "quotes": [
    { "text": "Your exact words", "date": "2026-10-16", "note": "after our call" }
  ],
  "photos": [
    { "src": "assets/photos/us.jpg", "caption": "My favorite day with you", "date": "2026-10-16" }
  ]
}
```

For a manual photo addition, first upload its file into `dist/assets/photos/`, then add the entry above. Dates, notes, captions and photo `alt` text are optional. Use `YYYY-MM-DD` dates. Keep valid JSON: double quotes, commas between entries, no trailing comma. Studio creates IDs itself; leave those IDs intact if editing its entries. Changing `updatedAt` is optional because the page compares the complete content.

Quotes display literally, so HTML does not execute. Click photos to see them full size, use arrow keys to browse, and Escape to close. Direct image URLs and the JSON file have the same server-side password protection as the page. Collections start empty, ready for your actual words and pictures.

## Run locally

Install dependencies with `pnpm install`, then run `pnpm dev` (or `node serve.mjs`) and open http://127.0.0.1:4173/. Run `pnpm test` for authentication, publishing, retry, concurrency, queue persistence, and Windows photo preparation checks. The local server uses the same authentication code as Vercel. Start the terminal directly with `pnpm studio` or `publisher/Start Asechka Studio.cmd`.

## The little password door

Vercel's root `middleware.js` checks every request before serving the files in `dist/`. The login form submits the code to the server; the password is never included in browser JavaScript. Successful sign-in shows “Welcome back, моя радость” (“my joy”) and “С возвращением, Асечка ♡”. A signed HttpOnly cookie remembers this browser for seven days. The footer's “Lock our little door” button signs out. Expired or altered cookies cannot unlock the site.

Set `SITE_PASSWORD` and a random `SESSION_SECRET` (at least 32 characters) in Vercel's environment variables for Production and Preview, and redeploy. Missing settings keep the site locked. To change the code, update `SITE_PASSWORD` in Vercel and redeploy; existing sessions then become invalid. Keep these values outside the source files. For local use, put the same variable names in an ignored `.env` file. Never upload `.env` or paste the secret into GitHub.

The gate adds no-store headers to prevent shared caching of private content. Failed guesses have a delay and a small per-instance throttle; this is a personal shared-code gate, not individual accounts. Older deployments and any separate hosting copy have their own access settings; protecting the current Vercel deployment does not change historical deployments or copies.

The countdown ends **Friday, October 16, 2026 at 3:00 PM America/New_York (UTC−04:00)**. Edit `dist/countdown.js` and the visible dates in `dist/index.html` together if the date changes. At zero it invites Asechka to find you in person without revealing the surprise.

The letter is in `dist/index.html`, the hints in `dist/app.js`, and the styling in `dist/styles.css`. Real cat photographs are `dist/assets/cats-cuddle.jpg` and `dist/assets/cats-cozy.jpg`; photographer credits and source links are in `PHOTO-CREDITS.md`. Fonts use Google Fonts with system fallbacks. No database is needed.
