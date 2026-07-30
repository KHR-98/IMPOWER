# JY:ON PWA icon integration

Copy these four PNG files from this package into the app's public icon directory, preserving these exact filenames:

- `apple-touch-icon.png`
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`

Use this Apple touch icon tag in the document `<head>`:

```html
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
```

Merge the `icons` member from `manifest-icons.json` into the existing web manifest. Preserve every unrelated manifest field; replace only the manifest's `icons` member with this package's three supplied entries.

When replacing deployed icon files, use cache-busted asset URLs or revise the service-worker/precache revision so devices fetch the new icons instead of stale cached versions.

Validation checklist:

- [ ] Confirm the four PNG files are available at `/icons/` in the deployed app.
- [ ] Confirm the Apple touch icon link is present in the rendered document head.
- [ ] Confirm the deployed web manifest retains unrelated fields and contains all three supplied icon entries.
- [ ] Uninstall the PWA from an iPhone, reinstall it, and verify the home-screen icon.
- [ ] Uninstall the PWA from a Samsung device, reinstall it, and verify the home-screen icon and maskable presentation.
