# Local Business Lead Finder

Finds local businesses on Google Maps (any niche, any radius), scores each one as an
AI-automation prospect, and appends **only new** leads to a Google Sheet — automatically
every other day, via Trigger.dev.

## How it works

| Task | What it does |
|---|---|
| `lead-finder-check-searches` | Scheduled daily 9:00 IST; on alternate days it starts one run per search in `config/searches.json` |
| `lead-finder-process-search` | Finds businesses with Google Places, filters to the exact radius, scores them, writes new ones to the sheet |

If an area has more than Google's 60-results-per-query cap, the circle is split into smaller
tiles and each is searched (capped by `maxRequests` per search to control cost).

## Configure searches — `config/searches.json`

```json
{
  "runEveryDays": 2,
  "searches": [
    { "label": "Dentists - Koramangala", "niche": "dentist", "location": "Koramangala, Bengaluru, India", "radiusKm": 5 }
  ]
}
```

- `niche`: anything you'd type into Google Maps — `dentist`, `cafe`, `gym`, `salon`, `physiotherapist`…
- `location`: a place name Google Maps understands
- `radiusKm`: 0.1–50
- `maxRequests` (optional, default 30): cost cap per search per run
- `runEveryDays`: 2 = alternate days, 1 = daily, 7 = weekly

Redeploy after editing.

## Google Sheet output

- **Leads** tab: Date Found, Search, Business Name, Category, Phone, Website, Address, Rating,
  Reviews, Distance (km), Lead Score, Signals, Google Maps Link, Place ID
- **Runs** tab: one row per search per run (found / new / Google requests used)

Lead Score (0–100) rises for: no website (+35), social-only website (+25), fewer than 20
reviews (+15), rating below 4.0 (+15), phone available (+15), 100+ reviews (+10).

## Setup

1. `npm install`
2. Put `GOOGLE_PLACES_API_KEY` in `.env` (Places API (New) enabled) and your Google OAuth
   desktop client file in the project root as `credentials.json` (Google Sheets API enabled)
3. `npm run google:sign-in` — approves Sheets access once, saves the refresh token to `.env`,
   and creates the "Local Business Leads" spreadsheet if `GOOGLE_SHEET_ID` is empty
4. Put your project ref in `trigger.config.ts`
5. `npm run dev` and trigger `lead-finder-process-search` from the dashboard with
   `{ "niche": "dentist", "location": "Koramangala, Bengaluru", "radiusKm": 2 }`
6. Add the same env vars in the Trigger.dev dashboard, then `npm run deploy`

> If the Google OAuth consent screen is in **Testing** mode, Google expires refresh tokens after
> 7 days. Set it to **In production** (Google Cloud → APIs & Services → OAuth consent screen)
> so the schedule keeps working.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local Trigger.dev dev server |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run deploy` | Deploy to Trigger.dev |
| `npm run google:sign-in` | One-time Google Sheets sign-in |
