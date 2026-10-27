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

## Tests

```sh
npm test
npm run test:e2e
```

The end-to-end command builds the app and runs the Electron Playwright test.
