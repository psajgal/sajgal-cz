# Big-video uploads (Cloudflare R2 + Worker)

Why: Cloudflare Pages allows 25 MB per file and GitHub's API 100 MB, so 50 to 150 MB videos live in an R2 bucket.

## The hard stop
- Only this Worker can write to the bucket. Do NOT create R2 API tokens (S3 keys) and keep the bucket's `r2.dev` public URL OFF. Reading is public only through the custom domain `media.sajgal.cz`.
- Before an upload the Worker adds up everything in the bucket plus uploads in progress. If the new file would take the total past `HARD_CAP_GB` (default 9, the free tier is 10) it answers 507 and nothing is uploaded.
- Every piece is capped (16 MB) and the piece count is limited by the announced size. When the upload finishes the real size is checked again; a file larger than announced is deleted.
- Abandoned uploads are cleaned up after 24 hours.
- Reads (visitors watching) bypass the Worker and cost nothing in egress. Class A/B operations are far below the free tier for a portfolio.

## Testing first, domain later
- For testing, on the bucket turn ON Settings > Public Development URL (`https://pub-….r2.dev`). It is read-only, so the hard stop is unaffected, but it is rate limited and meant for testing only. Use that address as `PUBLIC_BASE`.
- Later: add the custom domain `media.sajgal.cz`, change `PUBLIC_BASE` in the Worker, turn the r2.dev URL off, and press "Save and test" in the admin's Cloudflare login. The videos keep working: the site stores only paths (`/r2/video/…`) and the address lives in `data/media.json`.

## Setup (once, about 20 minutes)
1. R2 > Create bucket `sajgal-media` (Standard storage).
2. Bucket > Settings > Custom Domains > add `media.sajgal.cz`. Leave "Public Development URL" disabled.
3. Workers & Pages > Create > Worker `sajgal-uploads`. Paste `index.js`, deploy.
4. Worker > Settings > Bindings: R2 bucket, variable name `BUCKET`, bucket `sajgal-media`.
5. Worker > Settings > Variables and Secrets: text variables from `wrangler.toml` (`ALLOW_ORIGINS`, `PUBLIC_BASE`, `HARD_CAP_GB`, `MAX_FILE_MB`) and a SECRET named `UPLOAD_SECRET` (a long random password).
6. Notifications > add a billing/usage alert as a second safety net.
7. In the admin, Video page > "Big videos": paste the Worker address and the password, Save and test.
