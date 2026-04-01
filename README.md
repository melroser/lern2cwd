# lern2cwd

Interview practice app with:

- coding interview sessions
- AI proctor chat
- review mode with feedback and ideal solutions
- local problem banks

## Requirements

- Node.js 20+ recommended
- `npm`

## Install

```bash
npm install
```

## Run Locally

For auth-enabled local development, run through Netlify so Identity and Functions are available:

```bash
netlify dev
```

Open:

```text
http://localhost:8888
```

If you only need the raw Vite app without Netlify auth/functions:

```bash
npm run dev
```

That serves on:

```text
http://localhost:45173
```

## Environment Setup

The app uses a single server-side AI key:

- `OPENAI_API_KEY`

Local example:

```bash
cp .env.example .env.local
```

Then set:

```bash
OPENAI_API_KEY=your_key_here
```

Restart `npm run dev` after changing env vars.

## Netlify

Set this in Netlify:

- `OPENAI_API_KEY`

Path:

```text
Site settings -> Environment variables
```

Then redeploy.

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

Default preview URL:

```text
http://localhost:46173
```

## Tests

Unit tests:

```bash
npm test
```

End-to-end tests:

```bash
npm run test:e2e
```

Playwright UI mode:

```bash
npm run test:e2e:ui
```

## Current Dev Ports

- dev: `45173`
- preview: `46173`
