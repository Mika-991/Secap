# Ledger

Security shift tracker with invoicing, worker payslips, and optional cloud sync.

## Features

- **Calendar** — tap shift templates onto days to schedule instantly
- **Shifts** — log hours, rates, and notes per shift; bulk-add via calendar
- **Workers & clients** — track who you send out and who pays you
- **Invoices** — generate printable invoices for clients; mark paid to settle shifts automatically
- **Payslips** — same flow for paying workers
- **Overview** — see what clients owe you, what you owe workers, and your current float
- **Backup & export** — JSON backup and CSV export for your accountant

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Cloud sync (optional)

Without Supabase the app saves to `localStorage` on each device. To sync across devices:

1. Create a free project at [supabase.com](https://supabase.com)
2. Run `supabase-setup.sql` in the Supabase SQL Editor
3. Copy `.env.example` → `.env` and fill in your project URL and anon key
4. Restart the dev server

## Deploy

### Netlify

Connect your GitHub repo in Netlify, then add the two environment variables under **Site configuration → Environment variables**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Build command: `npm run build` · Publish directory: `dist`

## Stack

React 18 · Vite · Tailwind CSS · Supabase · Lucide React · Geist
