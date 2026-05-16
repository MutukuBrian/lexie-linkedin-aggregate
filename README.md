# LinkedIn Opportunity Dashboard

A personal dashboard that aggregates LinkedIn **job listings** and **people's posts sharing opportunities** into a single, searchable feed. Two independent Apify scrapers run on a schedule (or on demand), writing to Supabase — the dashboard surfaces everything in real time.

---

## How It Works

```
Two Supabase Edge Functions (run in parallel, each gated by its own is_active toggle)

linkedin-refresh                          linkedin-posts-refresh
  └── worldunboxer~rapid-linkedin-scraper   └── harvestapi~linkedin-post-search
        └── upserts → linkedin_jobs_lexiecoon     └── upserts → linkedin_posts_lexiecoon
                                                                    │
                        Dashboard (Feed tab) ◄── Supabase Realtime ─┘
```

1. **Refresh Feed** button (or pg_cron schedule) fires one or both edge functions depending on the current feed view (All → both; Jobs → jobs only; Posts → posts only).
2. Each function reads its config row and active keywords from Supabase, calls Apify, and upserts results (deduplicated by `job_id` / post `id`).
3. New rows appear in the dashboard instantly via Supabase Realtime — no page reload needed.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Supabase](https://supabase.com/) project (free tier works)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- An [Apify](https://apify.com/) account with access to both actors:
  - [`worldunboxer/rapid-linkedin-scraper`](https://console.apify.com/actors/JkfTWxtpgfvcRQn3p) — jobs
  - [`harvestapi/linkedin-post-search`](https://console.apify.com/actors/harvestapi~linkedin-post-search) — posts

---

## Step 1 — Supabase Schema

> **Quickest path:** paste [`migration-export.sql`](migration-export.sql) into the Supabase **SQL Editor** and run it. It creates all six tables, enables RLS, applies every policy, seeds the config rows, and enables Realtime in one shot.

The schema includes:

| Table | Purpose |
|-------|---------|
| `linkedin_jobs_lexiecoon` | Scraped job listings (PK: `job_id`) |
| `scraper_settings_lexiecoon` | Jobs-scraper config + feed filters (`location_terms`, `exclude_terms`) |
| `search_keywords_lexiecoon` | Job-title search keywords |
| `linkedin_posts_lexiecoon` | Scraped LinkedIn posts (PK: `id`) |
| `posts_scraper_settings_lexiecoon` | Posts-scraper config |
| `posts_search_keywords_lexiecoon` | Post search query keywords |

After running the SQL:
1. Go to **Project Settings → API** in Supabase.
2. Copy your **Project URL** and **anon public** key — you'll need these in the dashboard Settings.

---

## Step 2 — Install & Run

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

---

## Step 3 — Configure the Dashboard

Open the **Settings** tab in the app. The **Save All Settings** button appears only when you have unsaved changes.

### Database (Supabase)
Paste your **Project URL** and **Anon Public Key**, then click **Verify Schema Connection**.

### Scraper Toggles
Two toggle buttons independently enable/disable each scraper. When a scraper is off, the edge function exits immediately (no Apify credits used). Useful for days when you only want one feed type.

### Job Title Searches
Add the job titles you want to scrape (e.g. `Creative Project Manager`, `Digital Producer`). Each title triggers one search against the Location and filters in the Jobs Scraper Settings section.

### Post Searches
Add LinkedIn search queries for the posts feed (e.g. `Digital Producer NYC hiring`, `Video Editor remote opportunity`). These are the same phrases you'd type into LinkedIn's search bar — the scraper finds posts people share about openings.

### Jobs Scraper Settings (Apify — `worldunboxer/rapid-linkedin-scraper`)

| Field | Description |
|-------|-------------|
| Location | City / region applied to every job-title search. |
| Number of jobs per query | Max jobs per title. Default 100. |
| Experience level | Entry level, Mid-Senior, Director, etc. |
| Job type | Full-time, Part-time, Contract, etc. |
| Work schedule | On-site, Remote, Hybrid. |
| Job posting time | Past 24h, Past week, Past month, Any. |
| Company names | Only return jobs from these companies (leave empty for all). |
| Apify API Token | Your token from [apify.com/account](https://console.apify.com/account/integrations). |

### Posts Scraper Settings (Apify — `harvestapi/linkedin-post-search`)

| Field | Description |
|-------|-------------|
| Max posts per query | How many posts to collect per keyword per run. |
| Posted limit | Only return posts no older than this window (24h, week, month, etc.). |
| Sort by | Date (newest first) or Relevance. |
| Content type | All, Videos, Images, Documents, etc. |
| Author URLs | Restrict to specific LinkedIn profiles / company pages. |
| Authors' companies | Only posts from people at these companies. |
| Author keywords | Only posts from people whose headline contains these words. |
| Apify API Token (posts) | Can be the same token as the jobs scraper. |

### Auto-Refresh Schedule
Two daily run times (in your local timezone). The dashboard converts them to UTC automatically.

### Claude Prompt
Text prepended when you click **Copy** on any card — used to generate a cover letter or outreach message via Claude or ChatGPT.

---

## Step 4 — Deploy the Edge Functions

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy linkedin-refresh --no-verify-jwt
supabase functions deploy linkedin-posts-refresh --no-verify-jwt
```

`YOUR_PROJECT_REF` is under **Supabase Dashboard → Project Settings → General → Reference ID**.

`--no-verify-jwt` is required so pg_cron can invoke the functions without a user JWT.

### Schedule automatic runs (pg_cron)

Run this in the Supabase **SQL Editor** to trigger both functions at 12:00 and 16:00 UTC daily:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Jobs scraper — 12:00 PM UTC
SELECT cron.schedule('linkedin-refresh-noon', '0 12 * * *', $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-refresh',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Posts scraper — 12:05 PM UTC (offset slightly to avoid concurrent DB load)
SELECT cron.schedule('linkedin-posts-refresh-noon', '5 12 * * *', $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-posts-refresh',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Jobs scraper — 4:00 PM UTC
SELECT cron.schedule('linkedin-refresh-afternoon', '0 16 * * *', $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-refresh',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Posts scraper — 4:05 PM UTC
SELECT cron.schedule('linkedin-posts-refresh-afternoon', '5 16 * * *', $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-posts-refresh',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Verify:
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'linkedin%';
```

Replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY`.

### Test manually

```bash
# Jobs
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-refresh \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'

# Posts
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-posts-refresh \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

Both return `{"status":"accepted","message":"..."}` (HTTP 202). Results appear in the feed within 1–5 minutes.

### View logs

```bash
supabase functions logs linkedin-refresh --tail
supabase functions logs linkedin-posts-refresh --tail
```

---

## Using the Feed

### View modes
The feed has three tabs — **All** (jobs + posts merged, newest first), **Posts**, **Jobs**. The **Refresh Feed** button fires only the scraper(s) relevant to the current view.

### Job cards
Show job title, company, location, employment type, seniority, salary, description, and engagement controls:
- **Copy** — copies the full posting + your Claude prompt to clipboard
- **Mark as Applied** — green tick, saved to DB across devices
- **Hide** — 3-second undo bar, then hidden permanently (reveal via Filters → Show hidden)
- **Apply / Easy Apply** — opens the LinkedIn application page

### Post cards
Show the poster's avatar, name, author info, post content (expandable), images, and engagement counts:
- **Copy** — copies post text + your Claude prompt (useful for outreach messages)
- **Save (star)** — amber bookmark, saved to DB
- **Hide** — same 3-second undo bar as job cards
- **View on LinkedIn** — opens the original post

### Filters (DB-backed, persist across sessions)
| Filter | Applies to | Logic |
|--------|-----------|-------|
| Date pills (Last 24h / Week / Month / Year / All) | Both | Filters by `time_posted` (jobs) or `posted_at` (posts) |
| Easy Apply only | Jobs | Shows only one-click apply listings |
| Employment Type | Jobs | Full-time, Part-time, Contract, etc. |
| Seniority Level | Jobs | Entry level, Mid-Senior, Director, etc. |
| Show hidden | Both | Reveals hidden items as faded cards |
| **Show only — mentioning any of** | Both | OR logic — item must mention at least one term (location, content, author info) |
| **Hide items containing** | Both | Item is removed if it mentions any term |

Both the "mentioning" and "hide" filters are chip lists backed by `scraper_settings_lexiecoon` — adding or removing a chip saves to Supabase immediately.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime) |
| Automation | Supabase Edge Functions (Deno) + pg_cron |
| Jobs scraper | Apify — `worldunboxer/rapid-linkedin-scraper` |
| Posts scraper | Apify — `harvestapi/linkedin-post-search` |

---

## Troubleshooting

**Table not found** — Run [`migration-export.sql`](migration-export.sql) in the SQL Editor. It's idempotent (`CREATE TABLE IF NOT EXISTS`).

**Posts feed empty after refresh** — Make sure the posts scraper toggle is on, at least one post keyword is added, and the Apify token is entered in Posts Scraper Settings.

**Refresh Feed shows an error banner** — Check both edge functions are deployed (`supabase functions list`). A "partial failure" means one scraper worked and the other didn't — check that function's logs.

**Items not appearing after refresh** — Both edge functions respond 202 immediately and scrape in the background (1–5 min). Check logs with `supabase functions logs <name> --tail`.

**Items not updating in real-time** — Confirm `linkedin_jobs_lexiecoon` and `linkedin_posts_lexiecoon` are both in the `supabase_realtime` publication (both are added by the migration SQL).

**pg_cron jobs not running** — Confirm `pg_cron` and `pg_net` extensions are enabled in **Database → Extensions**. Verify jobs exist with `SELECT jobname, schedule FROM cron.job;`.

**Save All Settings button doesn't appear** — The button only shows when there are unsaved changes. Edit any field to trigger it.
