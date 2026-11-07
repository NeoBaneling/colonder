# Colonder

Standalone staff scheduling desktop app for GI unit. Built with Electron, Vite, React, Tailwind CSS, Formik,
Yup, and SQLite.

## Getting started

Use Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Staff and settings are stored in a SQLite database in Electron's application data directory. Settings are loaded when the Settings page opens and are saved when you select Save.

## Build and preview

```sh
npm run build
npm run preview
```

`preview` launches the built Electron app.

## Package desktop apps

```sh
npm run dist
npm run dist:dir
```

`dist` builds installers for the current operating system; `dist:dir` creates
an unpacked application. Both write to `release/`. The macOS targets are DMG
and ZIP, Windows uses NSIS, and Linux uses AppImage and DEB. To select a target
explicitly, pass an electron-builder platform flag, for example
`npm run dist -- --mac` or `npm run dist -- --win`. The app icon assets are
generated from `build/colonder-app-icon.png` as part of the packaging command.

On each push to `main`, GitHub Actions builds installers on macOS, Windows, and
Linux runners. Download them from the run's **Artifacts** section on the
repository's Actions page. Artifacts are kept for 30 days; each run has its own
artifacts, so new builds do not replace artifacts from previous runs. The
workflow can also be started manually from the Actions page.

## Tests

```sh
npm test
npm run test:e2e
```

The end-to-end command builds the app and runs the Electron Playwright test with
its window and macOS Dock icon hidden. Playwright's `use.headless` setting
controls browser launches, not Electron windows, so the E2E launch explicitly
enables the app's hidden-window mode.
