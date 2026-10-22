# OnlyTryHards

A mobile-first, unmistakably fictional creator-profile parody hosted at [tryhardernexttime.com](https://tryhardernexttime.com). It has no login, payments, forms, analytics, external ads, or tracking.

The site is intentionally **disabled by default**. The switch hides the experience; it does not make committed files private. The repository, Git history, original uploads, generated images, and cached files are public.

## Phone shortcuts

Bookmark these in your phone browser. GitHub Mobile is useful for checking commits and Actions, but GitHub.com in Safari or Chrome is the dependable upload/edit interface.

- [Upload photos to `content/photos/`](https://github.com/hdboyer/tryhardernexttime.com/upload/main/content/photos)
- [Enable or disable the site](https://github.com/hdboyer/tryhardernexttime.com/edit/main/site-state.json)
- [Watch the Pages deployment](https://github.com/hdboyer/tryhardernexttime.com/actions/workflows/pages.yml)

Commit phone updates directly to `main`. A photo upload starts a deployment; a switch-only update does not need one.

## Add a photo

1. Confirm every depicted person is an adult and has agreed to the photo being public.
2. Remove location and other sensitive metadata before upload. On a phone, using a cropped screenshot is a simple way to create a location-safe copy.
3. Upload a JPEG, PNG, or WebP under 25 MiB to `content/photos/`.
4. Name it with this exact format:

   ```text
   YYYY-MM-DD--caption-written-like-this.jpg
   ```

   Example: `2026-10-21--he-thought-this-was-a-fit.jpg`

5. Commit to `main`, then watch the Pages workflow. The date controls newest-first ordering and the filename becomes the caption.

The build auto-rotates every photo, removes metadata from the served copies, and creates responsive WebP and JPEG variants. Invalid filenames and unsupported files fail the deployment instead of silently disappearing.

## Switch the site

Edit `site-state.json` and commit one of these exact values:

```json
{
  "enabled": false
}
```

```json
{
  "enabled": true
}
```

The browser checks the latest value through GitHub’s public Contents API on initial load and when a tab returns to the foreground. Any network, API, or validation failure defaults to the neutral maintenance page.

Turning the site off does **not** revoke public image URLs or purge caches. Remove unwanted files from the repository and seek cache/history cleanup separately when true removal is needed.

## Customize copy

Edit `content/site.json` for the fictional profile, statistics, inline joke ads, and modal ad. The build validates every required field. Keep the branding clearly parodic and never add credential, payment, or personal-data collection.

## Local development

```bash
npm install
npm run check
npm run preview
```

The production build is written to `dist/`. GitHub Actions runs tests and the same build before deploying Pages. On `localhost` only, the browser reads `dist/site-state.json`, so you can flip that generated copy to `true` to preview the full experience without changing production.
