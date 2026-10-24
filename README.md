# Colonder

A small desktop notes app built with Electron, Vite, React, Tailwind CSS, Formik,
Yup, and SQLite.

## Getting started

Use Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Notes are stored in a SQLite database in Electron's application data directory.

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