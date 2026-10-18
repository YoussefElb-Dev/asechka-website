# For Asechka

The original powder-blue and lavender website for Asnat: a letter, a mysterious Friday countdown, a growing quote collection, and our photo album. Real cat photographs, gentle animations, keyboard controls, and reduced-motion support.

Live site: https://asechka-website.vercel.app

## Keep quotes and pictures from the website

After unlocking the site, use **Add a quote** or **Add a picture** on the home page or in the full Quotes and Pictures collections. Quotes support multiple lines, a date, and an optional note. Pictures support a caption and a date; choose a JPG, PNG, or WebP up to 25 MB and the browser prepares a smaller JPEG without EXIF metadata before uploading.

In either full collection, choose **Edit** below a memory to change its words, note, caption, or date. A picture can also be replaced. **Remove this memory** asks for confirmation before changing the shared collection. Both people use the existing password and save to the same private GitHub collection as the Android app and Studio; no new account or paid service is needed. Existing free-plan quotas and repository storage limits still apply.

Saving updates the current page immediately, including new pictures, without waiting for a deployment. Other open pages check every 15 seconds and when you return to them. The server retains unrelated files, saves metadata and image changes in one commit, retries simultaneous changes, and rejects stale edits to the same memory. Repeating a save after a lost response keeps one copy. A failed save leaves the form open with its draft; keep that window open while retrying. Closing the editor or reloading discards an unsaved website draft.

The protected `/api/memories` endpoint retains `addQuote` and `addPhoto` for existing clients and also accepts `updateQuote`, `updatePhoto`, `removeQuote`, and `removePhoto`. Read responses provide an `editKey` and `editVersion` for each item; changes to existing items require that key and expected version plus a stable operation UUID. These response-only editing fields are not written into the collection. The existing server-only `MUSIC_GITHUB_TOKEN` supplies repository access. Photo downloads remain behind the signed login.

## Our shared top ten songs

Open **Music** on the website. Search by song, artist, or album, choose a recording, and pick a spot from 1 to 10. Either person who has unlocked the website can add or replace a song, leave a personal note, or remove a song after confirming. Each card shows its real catalog artwork, title, artist, album, duration, and listening links. The list starts empty so you can choose it together.

The free [iTunes Search API](https://performance-partners.apple.com/search-api) supplies metadata; no music-service login or paid API is required for search. Full playback follows the linked music service's availability and subscription rules. Search is submitted explicitly, cached for five minutes, and limited per running server instance. Album art is linked to its catalog page with Apple's unmodified official iTunes Store badge, sourced from the [iTunes identity guidelines](https://marketing.services.apple/itunes-identity-guidelines). No audio is downloaded or stored.

Shared choices are saved to **dist/music.json** in this private GitHub repository. Set **MUSIC_GITHUB_TOKEN** as a secret in the Vercel project's Production environment, then redeploy. Use a fine-grained GitHub token restricted to **YoussefElb-Dev/asechka-website**, with **Contents: read and write**; no account-wide or workflow permissions are needed. This token grants repository content access, while the application's API is restricted to this one music file. Never place the token in browser code, a committed file, or a chat message. Revoke or renew it in GitHub if necessary. Missing configuration keeps saving disabled and leaves catalog search available.

The existing signed login is required for both music APIs. Writes require the site's own origin and a protected JSON request. The server looks up the chosen track itself; it does not trust client-supplied artwork or external URLs. Saves read the current GitHub file, retry simultaneous edits to different spots, and reject a stale edit of the same spot. Repeating a received save does not duplicate the song. Quotes and photos stay in their separate existing file and are preserved. Open music pages check for changes every 20 seconds and when you return; a successful save is visible immediately on that screen, without waiting for a new deployment. The existing GitHub and Vercel free-plan limits still apply.

## Asechka Studio: a desktop window for your memories

Double-click **Asechka Studio** on your Windows desktop. It opens a blue and lavender window with buttons and forms; you do not need to type terminal commands.

1. **A quote**: write your quote in the large text box, keep today's date or change it, and optionally add a note. Click **Save & publish quote**. Multiple lines work normally.
2. **Pictures**: click **Choose pictures**, choose up to 20 JPG, PNG, WebP or BMP photos, add individual captions, and click **Save & publish pictures**. Export HEIC photos as JPG first. Small copies are made automatically; originals are untouched.
3. **Publish pending**: retry memories saved while offline. The sidebar shows how many are waiting.
4. **All the little things**: browse your saved quotes and photo previews below the forms. **Refresh from GitHub** retrieves the latest album if you also edited it elsewhere.
5. **Open our website**: view the live site.

Your existing GitHub connection and drafts are reused. An unfinished quote also stays in this browser's local draft until you save it. If the old terminal is still open, the window asks you to close it before editing; it becomes ready automatically. The original terminal remains available with `publisher/Start Asechka Studio.cmd` or `pnpm studio:terminal`.

Each addition saves locally first, then pushes to the private GitHub repository. Vercel automatically deploys the commit. An open website checks for new memories every **15 seconds** while visible and also checks when you return to the tab. Updates appear after Vercel finishes deploying; this is automatic but not instantaneous. A photo you're currently viewing stays steady until you close it.

Photos become JPEG copies with a longest side of at most 1,800 pixels and a size of at most 1 MB. Originals stay untouched. The copies have no EXIF location metadata. UUID filenames avoid collisions, and folders are organized by year and month.

Drafts, prepared photos, the publishing key, and a dedicated Git clone live in `%LOCALAPPDATA%\AsechkaStudio`, outside the project and outside OneDrive. Drafts survive closing the terminal, restarting Windows, or losing internet. The app clears a pending entry only after it is confirmed saved on GitHub. Stable IDs prevent duplicates if a push succeeds but its response is lost. Concurrent GitHub edits are fetched and preserved before retrying. It never force-pushes.

The website source and the Studio source are saved in the private repository. **The private key and local drafts are never committed.** Do not upload the `credentials` directory, `.env`, or runtime configuration. The Studio-owned clone is disposable; the app never resets your development checkout.

### One-time GitHub connection

Studio creates a separate SSH deploy key for this repository. To connect or reconnect, open the original terminal with `publisher/Start Asechka Studio.cmd`, select option 5, add its **public** key in the repository's **Settings → Deploy keys**, and select **Allow write access**. The private key stays on this computer with access limited to your Windows account. This is persistent repository access; revoke it on that same settings page if you no longer want automatic publishing. GitHub host identity is checked against its published Ed25519 host key. Studio uses GitHub's supported SSH port 443.

The desktop shortcut uses the existing Node.js and Git installations and opens the interface in an Edge or Chrome app window. If neither browser is installed, it opens in the default browser. The local interface binds only to `127.0.0.1`, uses a random session and checks request origins; it is not hosted on Vercel. The local helper shuts down a few minutes after its windows close, and reopening the shortcut starts it again. If you move the project or uninstall those runtimes, recreate the shortcut with `publisher/Install Desktop Shortcut.cmd` using their new paths. The installer does not change PowerShell's execution policy. No installed background service, browser extension, cloud database, paid storage or paid publishing tool is required.

### Free-plan limits

This uses your existing GitHub private repository and Vercel Hobby project. Hobby is free for personal, noncommercial use and currently permits **100 deployments per day**. GitHub storage is **not unlimited**: its repository recommendations and file limits still apply. Keeping photos small and publishing a batch together helps keep this personal album within the free plans. Git history retains old photo versions even when files are deleted; repository size grows over time.

References: [GitHub repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), [Vercel Hobby limits](https://vercel.com/docs/plans/hobby), [GitHub deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

## Edit one content file manually

The shared content file is **`dist/memories.json`**. It replaces `dist/memories.js` and is used by the Studio window, the terminal, and the website. You can still edit just this one file on GitHub. Keep the old entries and append new ones; newest entries appear first.

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

Install dependencies with `pnpm install`, then run `pnpm dev` (or `node serve.mjs`) and open http://127.0.0.1:4173/. Run `pnpm test` for authentication, GUI access, publishing, retry, concurrency, queue persistence, launcher, and Windows photo preparation checks. The local server uses the same authentication code as Vercel. Start the Studio window with `pnpm studio` and the original terminal with `pnpm studio:terminal` or `publisher/Start Asechka Studio.cmd`.

## The little password door

Vercel's root `middleware.js` checks every request before serving the files in `dist/`. The login form submits the code to the server; the password is never included in browser JavaScript. Successful sign-in shows “Welcome back, моя радость” (“my joy”) and “С возвращением, Асечка ♡”. A signed HttpOnly cookie remembers this browser for seven days. The footer's “Lock our little door” button signs out. Expired or altered cookies cannot unlock the site.

Set `SITE_PASSWORD` and a random `SESSION_SECRET` (at least 32 characters) in Vercel's environment variables for Production and Preview, and redeploy. Missing settings keep the site locked. To change the code, update `SITE_PASSWORD` in Vercel and redeploy; existing sessions then become invalid. Keep these values outside the source files. For local use, put the same variable names in an ignored `.env` file. Never upload `.env` or paste the secret into GitHub.

The gate adds no-store headers to prevent shared caching of private content. Failed guesses have a delay and a small per-instance throttle; this is a personal shared-code gate, not individual accounts. Older deployments and any separate hosting copy have their own access settings; protecting the current Vercel deployment does not change historical deployments or copies.

The countdown ends **Friday, October 16, 2026 at 3:00 PM America/New_York (UTC−04:00)**. Edit `dist/countdown.js` and the visible dates in `dist/index.html` together if the date changes. At zero it invites Asechka to find you in person without revealing the surprise.

The letter is in `dist/index.html`, the hints in `dist/app.js`, and the styling in `dist/styles.css`. Real cat photographs are `dist/assets/cats-cuddle.jpg` and `dist/assets/cats-cozy.jpg`; photographer credits and source links are in `PHOTO-CREDITS.md`. Fonts use Google Fonts with system fallbacks. No database is needed.

## Our little days

Open `/together.html`, or use the new home-page cards. Both visitors can add, edit, complete, and remove bucket-list wishes. Completing a wish opens an editor with an optional photo; reopening it preserves the photo. Images are resized in the browser, converted to JPEG without the original file metadata, and capped at 320 KB. A wish and its photo are committed together, preserving concurrent changes to the rest of the repo. Removed or replaced photos leave the current checkout; Git history retains earlier versions.

The requested shared features reuse the existing repo-scoped `MUSIC_GITHUB_TOKEN` in Vercel. Only fixed paths `dist/together.json` and `dist/assets/bucket/<UUID>.jpg` are written by this feature. Password-authenticated API routes serve images directly from the private repo, so a saved picture is available immediately without waiting for a deployment. The site checks for shared updates every 20 seconds while visible. No browser gets the GitHub key. Without the server connection, the page is read-only.

Choose a side under “I’m here as” to send a thinking-of-you heart. That choice stays in this browser; the latest timestamp for each sender is shared. Hearts are visible on the website, without push notifications. Rapid taps are throttled for five seconds. The common password grants access to both sides; this is a personal shared space rather than separate authenticated identities.

The memory of the day draws from the actual quotes, pictures, and favorite songs, using the date in America/New_York. Both screens see the same pick, independently of the order in which records are loaded. The source content is read from GitHub and never edited by the daily-memory feature. Tests cover day boundaries, real album metadata, private uploads, stale edits, atomic commits, and concurrent saves.

## Our love translation

Open `/translation.html` or “Our words”. Choose any combination of Egyptian Arabic, Russian, Hebrew, French, and Spanish. Arabic is always colloquial Egyptian, with an explicit dialect instruction. The source can be detected or selected, and tone, speaker, and recipient settings guide idioms, register, and grammatical gender. Results have native scripts, correct reading direction, copy buttons, pronunciation guides for Arabic/Russian/Hebrew, and English back-translations to help check meaning. AI translation may still need human correction for ambiguity.

The password-protected `/api/translation` route verifies its key against Google's model catalog, then selects an available free Flash model, preferring 3.6 Flash for translation, then available free 3.5 Flash-Lite, 3.8 Flash or 2.5 Flash. A model-specific service, timeout, or quota error can fall back once to another available free model, within the same 45-second generation budget with a structured response schema. A second Gemini request independently proofreads native text, gender agreement, pronunciation, and English meaning; both passes share the 45-second budget. Only the reviewed results are displayed. Set `GEMINI_API_KEY` as a sensitive Production environment variable in Vercel and deploy again to activate it. Use a dedicated Gemini-only key from an unbilled, free-tier Google AI Studio project. Never put the key in website files, local publishing settings, or GitHub. Missing or rejected keys show an honest connection message and disable translation; provider failures preserve the original input.

Only submitted text and the translation settings are sent to Google. This feature does not write messages to GitHub, logs, or browser storage. A small in-memory cache expires after five minutes, and each function instance limits uncached requests to six per minute. This is not a distributed quota limiter. Google's free tier has its own shared project quotas and may use submitted content to improve products; that notice is shown beside the form. No billing account is required or enabled by this setup.

References: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [API key security](https://ai.google.dev/gemini-api/docs/api-key), [Gemini REST generation](https://ai.google.dev/api/generate-content).


## Native Android shared collection

The native Android app reads `/api/memories`, and its quote/photo forms save into the same `dist/memories.json` and `dist/assets/photos/YYYY/MM/UUID.jpg` collection used by Studio and the website. The existing `MUSIC_GITHUB_TOKEN` with repository Contents read/write also supplies this connection; it stays on the server. Signed login, same-origin JSON, and `X-Asechka-Memories: 1` protect writes. The API accepts a dated quote (up to 10,000 characters plus an optional 1,000-character note), or a prepared JPEG of at most 320,000 bytes and a caption. The app strips metadata and prepares the copy before saving.

Stable operation IDs prevent duplicates after retries. Each save creates one atomic Git commit for the data and any photo, retaining the current repository tree and retrying simultaneous additions. Existing entries are preserved. The website reads the live API and serves gallery photos through its authenticated photo endpoint, so a new phone upload is available before the next static deployment finishes. Studio continues to fetch and merge the shared collection before publishing.

The phone encrypts pending additions and original downloaded images in private storage. Quotes and photos saved without internet appear locally and synchronize when connectivity and a valid sign-in return. The collection currently has a 900 KB JSON metadata limit; a full collection is reported without replacing existing content or dropping the phone's queued addition.
