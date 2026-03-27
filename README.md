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

Start the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:45173
```

## API Key Setup

The app can use either:

1. a key saved in Settings inside the browser
2. an environment variable

Supported env vars:

- `VITE_OPENAI_API_KEY` - preferred
- `OPENAI_API_KEY` - fallback
- `NETLIFY_OPENAI_API_KEY` - fallback

Local example:

```bash
cp .env.example .env
```

Then set one of the values in `.env`, for example:

```bash
VITE_OPENAI_API_KEY=your_key_here
```

Restart `npm run dev` after changing env vars.

## Netlify

Set one of these in Netlify:

- `VITE_OPENAI_API_KEY`
- `OPENAI_API_KEY`
- `NETLIFY_OPENAI_API_KEY`

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
