# LinkedIn Opportunity Dashboard

A personal dashboard that aggregates LinkedIn posts into a clean, searchable feed. It uses **Apify** to scrape LinkedIn, a **Supabase Edge Function** to automate the pipeline, and **Supabase** as the database — all configured through a built-in Settings panel.

---

## How It Works

```
Supabase Edge Function (linkedin-refresh)
  └── triggered by schedule (pg_cron) or "Refresh Feed" button
        └── reads scraper config from Supabase
              └── runs Apify LinkedIn Scraper Actor
                    └── upserts posts to Supabase
                          └── Dashboard updates in real-time
```

1. You click **Refresh Feed** (or the Edge Function runs on a schedule).
2. The Edge Function reads your scraper settings and search keywords from Supabase.
3. It calls the Apify LinkedIn Scraper Actor with those settings.
4. Apify scrapes LinkedIn and returns the results.
5. The Edge Function upserts the posts into Supabase.
6. The dashboard reflects the new posts instantly via Supabase Realtime.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Supabase](https://supabase.com/) project (free tier works)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`npm install -g supabase`)
- An [Apify](https://apify.com/) account with the LinkedIn Scraper Actor

---

## Step 1 — Supabase Setup

In your Supabase project, open the **SQL Editor** and run the following to create the required tables:

```sql
create table public.linkedin_posts_lexiecoon (
  id text not null,
  poster_name text null,
  poster_url text null,
  post_content text null,
  post_url text null,
  created_at timestamp with time zone null default now(),
  author_info text null,
  avatar text null,
  post_images jsonb null,
  engagement jsonb null,
  "postVideo" jsonb null,
  website text null,
  website_label text null,
  constraint linkedin_posts_pkey primary key (id),
  constraint linkedin_posts_post_url_key unique (post_url)
) TABLESPACE pg_default;

create index IF not exists idx_posts_content on public.linkedin_posts_lexiecoon using gin (
  to_tsvector(
    'english'::regconfig,
    COALESCE(post_content, ''::text)
  )
) TABLESPACE pg_default;

create index IF not exists idx_posts_created_at on public.linkedin_posts_lexiecoon using btree (created_at desc) TABLESPACE pg_default;

create table public.scraper_settings_lexiecoon (
  id uuid not null default gen_random_uuid (),
  max_posts integer null default 10,
  posted_limit text null default 'week'::text,
  sort_by text null default 'date'::text,
  content_type text null default 'all'::text,
  scrape_pages integer null default 1,
  author_keywords text null default ''::text,
  scrape_reactions boolean null default false,
  scrape_comments boolean null default false,
  apify_token text null default ''::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  posted_limit_date text null default ''::text,
  author_urls text null default ''::text,
  authors_companies text null default ''::text,
  mentioning_member text null default ''::text,
  mentioning_company text null default ''::text,
  authors_industry_id text null default ''::text,
  start_page integer null default 1,
  max_reactions integer null default 5,
  max_comments integer null default 10,
  configs_name text null,
  is_active boolean null,
  location_terms text null default '{}'::text[],
  exclude_terms text null default '{}'::text[],
  constraint scraper_settings_pkey primary key (id)
) TABLESPACE pg_default;

create table public.search_keywords_lexiecoon (
  id uuid not null default gen_random_uuid (),
  keyword text not null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  constraint search_keywords_pkey primary key (id),
  constraint search_keywords_keyword_key unique (keyword)
) TABLESPACE pg_default;

-- Enable Realtime on the posts table so the dashboard updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.linkedin_posts_lexiecoon;
```

### Row Level Security (RLS)

All three tables require RLS enabled with the following policies. Run this after creating the tables:

```sql
-- linkedin_posts_lexiecoon
ALTER TABLE public.linkedin_posts_lexiecoon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read posts"
ON public.linkedin_posts_lexiecoon
FOR SELECT TO anon, authenticated
USING (true);

-- scraper_settings_lexiecoon
ALTER TABLE public.scraper_settings_lexiecoon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access"
ON public.scraper_settings_lexiecoon
FOR ALL TO public
USING (true) WITH CHECK (true);

CREATE POLICY "anon read settings"
ON public.scraper_settings_lexiecoon
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "anon update settings"
ON public.scraper_settings_lexiecoon
FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "anon upsert settings"
ON public.scraper_settings_lexiecoon
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- search_keywords_lexiecoon
ALTER TABLE public.search_keywords_lexiecoon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access to keywords"
ON public.search_keywords_lexiecoon
FOR ALL TO public
USING (true) WITH CHECK (true);

CREATE POLICY "Allow public insert/update"
ON public.search_keywords_lexiecoon
FOR ALL TO public
USING (true);

CREATE POLICY "Allow public read access for keywords"
ON public.search_keywords_lexiecoon
FOR SELECT TO public
USING (true);
```

> **Tip — migrating to a new Supabase project?** The table schema and RLS policies are not exported by default in most migration tools. Always re-run both the `CREATE TABLE` and `CREATE POLICY` blocks above in the new project, then verify with:
> ```sql
> SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
> ```
> If the feed shows empty despite having rows, missing RLS policies are the most likely cause — Supabase returns 0 rows silently when no permissive policy exists.

After running the SQL:
1. Go to **Project Settings → API** in Supabase.
2. Copy your **Project URL** and **anon public** key — you'll need these in the dashboard.

---

## Step 2 — Install & Run

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

---

## Step 3 — Configure the Dashboard

Open the **Settings** tab in the app.

### Database (Supabase)
- Paste your Supabase **Project URL** and **Anon Public Key**.
- Click **Verify Schema Connection** to confirm it can reach your tables.

### Search Queries
- Add the LinkedIn search terms you want to scrape (e.g. `Freelance Video Editor`, `Hiring Producer`).
- These mirror what you'd type into the LinkedIn search bar.

### Scraper Settings (Apify)
| Field | Description |
|-------|-------------|
| Max Posts per Query | How many posts to fetch per keyword. `0` = unlimited. |
| Time Filter | Only fetch posts from the last hour / 24h / week / month. |
| Sort By | `Most Recent` or `Relevance`. |
| Content Type | All, Jobs, Images, Videos, Documents, etc. |
| Pagination | Start page + number of pages (each page ≈ 100 posts). |
| Author Keywords | Only include posts from authors whose headline contains these words (e.g. `Hiring`, `CTO`). |
| Profile / Company URLs | Scrape posts from specific LinkedIn profiles or companies. |
| Authors Industry IDs | Filter by LinkedIn industry codes ([full list](https://github.com/HarvestAPI/linkedin-industry-codes-v2/blob/main/linkedin_industry_code_v2_all_eng.csv)). |
| Mentioning Members / Companies | Only posts that mention specific people or companies. |
| Scrape Reactions / Comments | Optionally fetch who reacted or commented on each post. |
| Apify API Token | Your personal API token from [apify.com/account](https://console.apify.com/account/integrations). |

### Claude Prompt
- Optional text prepended when you click the **Copy** button on a post card.
- Customize it to match your background so Claude (or any AI) can draft a relevant outreach response.

Click **Save All Settings** to persist everything.

---

## Step 4 — Deploy the Edge Function

The scraping pipeline runs as a Supabase Edge Function (`linkedin-refresh`) — no n8n required.

### Deploy

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy linkedin-refresh --no-verify-jwt
```

`YOUR_PROJECT_REF` is the short alphanumeric ID found at **Supabase Dashboard → Project Settings → General → Reference ID**.

`--no-verify-jwt` is required so pg_cron can call the function without a user JWT.

### Schedule automatic runs (pg_cron)

Run this in the **Supabase SQL Editor** to trigger the function at 12pm and 4pm UTC daily:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 12:00 PM UTC
SELECT cron.schedule('linkedin-refresh-noon', '0 12 * * *', $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-refresh',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- 4:00 PM UTC
SELECT cron.schedule('linkedin-refresh-afternoon', '0 16 * * *', $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-refresh',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Verify:
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'linkedin%';
```

Replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY` (the anon public key from **Project Settings → API**).

### Test manually

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-refresh \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

Expected response: `{"status":"accepted","message":"Scrape started in background"}` (HTTP 202).
Posts will appear in the feed via Realtime within 1–5 minutes depending on keyword count.

### View logs

```bash
supabase functions logs linkedin-refresh --tail
```

---

## Using the Feed

| Control | What it does |
|---------|-------------|
| Search bar | Filters by post content or poster name (client-side, instant). |
| Date pills (Today / Week / Month / Year / All) | Limits results by `created_at`. |
| Filters button | Opens location include / exclude tag filters. Persisted to Supabase. |
| Refresh Feed | Triggers the Edge Function then reloads posts. New posts also arrive automatically via Realtime. |
| Copy (on post card) | Copies the post content prefixed with your Claude prompt. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime) |
| Automation | Supabase Edge Functions (Deno) + pg_cron |
| Scraping | Apify LinkedIn Scraper |

---

## Troubleshooting

**"linkedin_posts_lexiecoon table not found"** — Run the SQL setup in Step 1.

**Refresh Feed shows an error** — Check that your Supabase URL and Anon Key are saved in Settings, and that the Edge Function is deployed (`supabase functions list`).

**Posts not appearing after refresh** — The Edge Function responds immediately (202) and scrapes in the background. Check the logs with `supabase functions logs linkedin-refresh --tail`. Apify scrapes typically take 1–5 minutes per keyword.

**Posts not updating in real-time** — Make sure you added `linkedin_posts_lexiecoon` to the `supabase_realtime` publication (last line of the SQL setup).

**pg_cron jobs not running** — Confirm `pg_cron` and `pg_net` extensions are enabled in **Supabase Dashboard → Database → Extensions**. Verify jobs exist with `SELECT jobname, schedule FROM cron.job;`.
