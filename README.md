# LinkedIn Opportunity Dashboard

A personal dashboard that aggregates LinkedIn job listings into a clean, searchable feed. It uses **Apify** to scrape LinkedIn jobs, a **Supabase Edge Function** to automate the pipeline, and **Supabase** as the database — all configured through a built-in Settings panel.

---

## How It Works

```
Supabase Edge Function (linkedin-refresh)
  └── triggered by schedule (pg_cron) or "Refresh Feed" button
        └── reads scraper config from Supabase
              └── runs Apify LinkedIn Jobs Scraper Actor
                    └── upserts jobs to Supabase
                          └── Dashboard updates in real-time
```

1. You click **Refresh Feed** (or the Edge Function runs on a schedule).
2. The Edge Function reads your scraper settings and job-title queries from Supabase.
3. It calls the Apify `worldunboxer~rapid-linkedin-scraper` actor once per job title.
4. Apify scrapes LinkedIn Jobs and returns structured job records.
5. The Edge Function upserts the jobs into Supabase (deduplicated by `job_id`).
6. The dashboard reflects the new jobs instantly via Supabase Realtime.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Supabase](https://supabase.com/) project (free tier works)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`npm install -g supabase`)
- An [Apify](https://apify.com/) account with access to the [worldunboxer/rapid-linkedin-scraper](https://console.apify.com/actors/JkfTWxtpgfvcRQn3p/input) actor

---

## Step 1 — Supabase Setup

> **Migrating to a new Supabase project?** Use the ready-made export at [`migration-export.sql`](migration-export.sql) — paste it directly in the SQL Editor to create all tables, enable RLS, apply all policies, and seed the initial config row in one shot. Skip the manual SQL below.

In your Supabase project, open the **SQL Editor** and run the following to create the required tables:

```sql
-- ── Jobs table ──
CREATE TABLE IF NOT EXISTS public.linkedin_jobs_lexiecoon (
  job_id            text                     NOT NULL,
  job_url           text,
  job_title         text,
  company_name      text,
  company_url       text,
  location          text,
  time_posted       text,
  num_applicants    text,
  salary_range      text,
  job_description   text,
  seniority_level   text,
  employment_type   text,
  job_function      text,
  industries        text,
  easy_apply        boolean                  DEFAULT false,
  apply_url         text,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  company_logo_url  text,
  applied           boolean                  DEFAULT false,
  hidden            boolean                  DEFAULT false,
  CONSTRAINT linkedin_jobs_lexiecoon_pkey PRIMARY KEY (job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON public.linkedin_jobs_lexiecoon USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_search_fts
  ON public.linkedin_jobs_lexiecoon USING gin (
    to_tsvector('english', coalesce(job_title,'') || ' ' || coalesce(job_description,'') || ' ' || coalesce(company_name,''))
  );

-- ── Scraper settings table ──
CREATE TABLE IF NOT EXISTS public.scraper_settings_lexiecoon (
  id                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  apify_token       text                     DEFAULT ''::text,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  configs_name      text,
  is_active         boolean,
  location_terms    text                     DEFAULT '{}'::text[],
  exclude_terms     text                     DEFAULT '{}'::text[],
  schedule_hour_1   integer                  DEFAULT 12,
  schedule_hour_2   integer                  DEFAULT 16,
  location          text                     DEFAULT ''::text,
  jobs_entries      integer                  DEFAULT 100,
  company_names     text                     DEFAULT ''::text,
  experience_level  text                     DEFAULT ''::text,
  job_type          text                     DEFAULT ''::text,
  work_schedule     text                     DEFAULT ''::text,
  job_post_time     text                     DEFAULT ''::text,
  start_jobs        integer                  DEFAULT 0,
  CONSTRAINT scraper_settings_lexiecoon_pkey PRIMARY KEY (id)
);

-- ── Search keywords table ──
CREATE TABLE IF NOT EXISTS public.search_keywords_lexiecoon (
  id          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  keyword     text                     NOT NULL,
  is_active   boolean                  DEFAULT true,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT search_keywords_lexiecoon_pkey        PRIMARY KEY (id),
  CONSTRAINT search_keywords_lexiecoon_keyword_key UNIQUE (keyword)
);

-- Enable Realtime on the jobs table so the dashboard updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.linkedin_jobs_lexiecoon;
```

### Row Level Security (RLS)

All three tables require RLS enabled with the following policies. Run this after creating the tables:

```sql
-- ── linkedin_jobs_lexiecoon ──
ALTER TABLE public.linkedin_jobs_lexiecoon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"
  ON public.linkedin_jobs_lexiecoon FOR SELECT TO public USING (true);

CREATE POLICY "Allow anon update"
  ON public.linkedin_jobs_lexiecoon FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Service write"
  ON public.linkedin_jobs_lexiecoon FOR ALL TO public
  USING (auth.role() = 'service_role');

-- ── scraper_settings_lexiecoon ──
ALTER TABLE public.scraper_settings_lexiecoon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read settings"
  ON public.scraper_settings_lexiecoon FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon update settings"
  ON public.scraper_settings_lexiecoon FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon upsert settings"
  ON public.scraper_settings_lexiecoon FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ── search_keywords_lexiecoon ──
ALTER TABLE public.search_keywords_lexiecoon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read keywords"
  ON public.search_keywords_lexiecoon FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon insert keywords"
  ON public.search_keywords_lexiecoon FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon update keywords"
  ON public.search_keywords_lexiecoon FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon delete keywords"
  ON public.search_keywords_lexiecoon FOR DELETE TO anon, authenticated USING (true);
```

> **Verify policies are applied:**
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

### Job Title Searches
- Add the job titles you want to scrape (e.g. `Creative Project Manager`, `Digital Producer`).
- Each title triggers one scrape call against the global Location and filters configured below.

### Scraper Settings (Apify)
| Field | Description |
|-------|-------------|
| Location | Location applied to every job-title search (e.g. `Brooklyn, NY`, `Remote, United States`). |
| Number of jobs per query | Max jobs to fetch per job title. 1–10000. Default 100. |
| Search after how many jobs | Skip this many results before starting. Useful for paginating past already-collected jobs. |
| Experience level | Internship, Entry level, Associate, Mid-Senior level, Director, Executive, or Any. |
| Job type | Full-time, Part-time, Contract, Temporary, Volunteer, Internship, Other, or Any. |
| Work schedule | On-site, Remote, Hybrid, or Any. |
| Job posting time | Past 24 hours, Past week, Past month, or Any time. |
| Company names | Tag list. Only return jobs from these companies. Leave empty for all. |
| Apify API Token | Your personal API token from [apify.com/account](https://console.apify.com/account/integrations). |

### Claude Prompt
- Optional text prepended when you click the **Copy** button on a job card.
- Customize it to match your background so Claude (or any AI) can draft a tailored cover letter.

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
Jobs will appear in the feed via Realtime within 1–5 minutes depending on the number of job titles configured.

### View logs

```bash
supabase functions logs linkedin-refresh --tail
```

---

## Using the Feed

| Control | What it does |
|---------|-------------|
| Search bar | Filters by job title, company, or description (client-side, instant). |
| Date pills (Today / Week / Month / Year / All) | Limits results by `created_at`. |
| Filters button | Opens include / exclude tag filters. Persisted to Supabase. |
| Refresh Feed | Triggers the Edge Function then reloads jobs. New jobs also arrive automatically via Realtime. |
| Apply (on job card) | Opens the LinkedIn apply URL in a new tab. Shows "Easy Apply" badge if applicable. |
| Copy (on job card) | Copies the job posting details prefixed with your Claude prompt. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime) |
| Automation | Supabase Edge Functions (Deno) + pg_cron |
| Scraping | Apify — `worldunboxer/rapid-linkedin-scraper` |

---

## Troubleshooting

**"linkedin_jobs_lexiecoon table not found"** — Run the SQL setup in Step 1.

**Refresh Feed shows an error** — Check that your Supabase URL and Anon Key are saved in Settings, and that the Edge Function is deployed (`supabase functions list`).

**Jobs not appearing after refresh** — The Edge Function responds immediately (202) and scrapes in the background. Check the logs with `supabase functions logs linkedin-refresh --tail`. Apify scrapes typically take 1–5 minutes per job title.

**Jobs not updating in real-time** — Make sure you added `linkedin_jobs_lexiecoon` to the `supabase_realtime` publication (last line of the SQL setup).

**pg_cron jobs not running** — Confirm `pg_cron` and `pg_net` extensions are enabled in **Supabase Dashboard → Database → Extensions**. Verify jobs exist with `SELECT jobname, schedule FROM cron.job;`.
