# DramaDL Frontend

Modern Next.js app for searching and downloading drama episodes.

## Local Development

```bash
npm install
npm run dev
```

Set your backend URL in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo on [vercel.com](https://vercel.com).
3. Add the environment variable:
   - `NEXT_PUBLIC_API_URL` → your Render backend URL (e.g. `https://dramadl-api.onrender.com`)
4. Deploy.

## Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- TypeScript
