# sajgal.cz

Static portfolio. A small build step (`build.mjs`, no packages needed) turns the data files into finished pages with titles, descriptions, share cards, structured data, a sitemap and redirects. Cloudflare Pages runs it on every change.

## Pages
- `/` home: up to 3 background videos (phones show the first) and the menu.
- `/fashion-shows` selected work. `/fashion` all shows, linked from the bottom of the selected-work page. `/fashion/<show>` one page per show.
- `/commercial` clusters of photos per brand with a short line under each; `/commercial/<brand>` one page per brand (kamera, kido-collective, converse keep their old addresses).
- `/editorial`, `/personal`, `/contact`.

## Edit the site (no code)
Open `/admin` on the site (not linked anywhere), connect once per device with a GitHub token (the page explains how), edit, press Save. The site updates in about a minute.
- Selected fashion, Editorial, Personal work: drag to reorder, add and remove photos, captions, alt text.
- All shows: add a show, fill in name, event, designer, location, date, description, add photos. Shows without photos stay hidden until they have some.
- Commercial: the same for brands (name, one-line summary, year, description, photos).
- Content imported from the old Google Sites pages: 13 shows (398 photos), 3 brands (28 photos), 31 personal photos. These are low resolution; sharp originals can replace them later keeping order, captions and alt text.
- Home videos: add, replace, reorder (portrait MP4, 5 to 10 seconds, under 20 MB).
- SEO: page titles and descriptions with a Google preview, bio, social links, share image, and a checklist.

## Step 1: put it on GitHub
Create a free GitHub account and a new public repository. Upload everything in this folder (the `.gitignore` file keeps build output out) and commit to `main`.

## Step 2: test it (no domain needed)
Cloudflare Pages (free; your DNS is already there):
1. Cloudflare dashboard > Workers & Pages > Create > Pages > connect to your GitHub repo.
2. Build command: `node build.mjs`. Build output directory: `dist`. (If asked, set the environment variable `NODE_VERSION` to `20`.)
3. Deploy. You get a `yourproject.pages.dev` address. Check the build log: it lists SEO notes.
4. Open `/admin` there, connect with a GitHub token, try a change.
Note that GitHub Pages cannot run the build step, so use Cloudflare Pages.

## Step 3: switch sajgal.cz (only when you are happy)
1. Cloudflare DNS: delete the old Google Sites records for the domain.
2. In the Pages project: Custom domains > add `sajgal.cz`.
3. Google Search Console: add sajgal.cz as a domain property, submit `https://sajgal.cz/sitemap.xml`, and watch Pages for old addresses.
Until you change DNS, sajgal.cz keeps showing the old site.

## SEO details
- Every page has its own title, description, canonical address, share card (Open Graph and Twitter) and structured data (Person, WebSite, ImageGallery, breadcrumbs).
- Photos have width and height, lazy loading, a smaller version for the grid, and alt text (yours, or written from the show or caption).
- `sitemap.xml` lists pages and photos; `robots.txt` hides `/admin`.
- `redirects.txt` sends old addresses to the new pages with permanent (301) redirects. The admin adds a line when you rename or delete a show. `/video` currently points home; remove that line when the Video page exists.
- The font is hosted on the site itself, so no data goes to Google Fonts.

## Limits
Cloudflare Pages free: 20,000 files, 25 MiB per file. Each photo is stored twice (full size and grid size). GitHub recommends repositories under 1 GB, and keeps history, so removed photos still use space.

## Where photos live
Photos and short clips are stored in Cloudflare R2 (`media.sajgal.cz`), not in this repository. `data/media.json` has `"photos": true`; the build then serves every `/images/…` and `/videos/…` path from there, and the admin uploads new files straight to R2 through the `sajgal-uploads` Worker. The old files remain in git history (before the commit "Move photos out of the repository") if they are ever needed.
