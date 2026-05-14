# LinkedIn Opportunity Dashboard

A personal dashboard that aggregates LinkedIn posts into a clean, searchable feed. It uses **Apify** to scrape LinkedIn, **n8n** to automate the pipeline, and **Supabase** as the database — all configured through a built-in Settings panel.

---

## How It Works

```
n8n Workflow
  └── triggered by schedule or "Refresh Feed" button
        └── reads scraper config from Supabase
              └── runs Apify LinkedIn Scraper Actor
                    └── writes posts to Supabase
                          └── Dashboard updates in real-time
```

1. You click **Refresh Feed** (or n8n runs on a schedule).
2. n8n reads your scraper settings and search keywords from Supabase.
3. n8n triggers the Apify LinkedIn Scraper with those settings.
4. Apify scrapes LinkedIn and sends results back to n8n.
5. n8n writes the posts into Supabase.
6. The dashboard reflects the new posts instantly via Supabase Realtime.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Supabase](https://supabase.com/) project (free tier works)
- An [n8n](https://n8n.io/) instance (self-hosted or cloud)
- An [Apify](https://apify.com/) account with the LinkedIn Scraper Actor

---

## Step 1 — Supabase Setup

In your Supabase project, open the **SQL Editor** and run the following to create the required tables:

```sql
-- Stores scraped LinkedIn posts
CREATE TABLE linkedin_posts_lexiecoon (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_content text,
  poster_name  text,
  author_info  text,
  post_url     text,
  posted_at    timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- Stores your LinkedIn search queries
CREATE TABLE search_keywords_lexiecoon (
  keyword   text PRIMARY KEY,
  is_active boolean DEFAULT true
);

-- Stores all scraper configuration
CREATE TABLE scraper_settings_lexiecoon (
  id                   uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000',
  configs_name         text DEFAULT 'default',
  is_active            boolean DEFAULT true,
  location_terms       text,
  exclude_terms        text,
  max_posts            int DEFAULT 10,
  posted_limit         text DEFAULT '24h',
  posted_limit_date    text,
  sort_by              text DEFAULT 'date',
  content_type         text DEFAULT 'all',
  author_urls          text,
  authors_companies    text,
  mentioning_member    text,
  mentioning_company   text,
  authors_industry_id  text,
  start_page           int DEFAULT 1,
  scrape_pages         int DEFAULT 1,
  author_keywords      text,
  scrape_reactions     boolean DEFAULT false,
  max_reactions        int DEFAULT 5,
  scrape_comments      boolean DEFAULT false,
  max_comments         int DEFAULT 10,
  apify_token          text,
  updated_at           timestamptz DEFAULT now()
);

-- Enable Realtime on the posts table so the dashboard updates live
ALTER PUBLICATION supabase_realtime ADD TABLE linkedin_posts_lexiecoon;
```

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

### Automation Workflow (n8n)
- Paste your **n8n webhook trigger URL**.
- When you press **Refresh Feed**, the dashboard POSTs to this URL to trigger your n8n workflow.

### Claude Prompt
- Optional text prepended when you click the **Copy** button on a post card.
- Customize it to match your background so Claude (or any AI) can draft a relevant outreach response.

Click **Save All Settings** to persist everything.

---

## Step 4 — n8n Workflow

Your n8n workflow should:
1. Be triggered by a **Webhook** node (use the URL you entered in Settings).
2. Read the latest scraper config and keywords from Supabase.
3. Call the **Apify LinkedIn Scraper** Actor with those params.
4. Insert the returned posts into `linkedin_posts_lexiecoon` in Supabase.

The dashboard handles deduplication display-side; use Supabase's `ON CONFLICT` or a unique constraint on `post_url` if you want database-level deduplication.

---

## Using the Feed

| Control | What it does |
|---------|-------------|
| Search bar | Filters by post content or poster name (client-side, instant). |
| Date pills (Today / Week / Month / Year / All) | Limits results by `created_at`. |
| Filters button | Opens location include / exclude tag filters. Persisted to Supabase. |
| Refresh Feed | Triggers your n8n webhook then reloads posts. |
| Copy (on post card) | Copies the post content prefixed with your Claude prompt. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime) |
| Automation | n8n |
| Scraping | Apify LinkedIn Scraper |

---

## Troubleshooting

**"linkedin_posts_lexiecoon table not found"** — Run the SQL setup in Step 1.

**Webhook timed out** — Apify scrapes can take 1–2 minutes. The dashboard waits up to 2 minutes; if your n8n workflow takes longer, trigger it on a schedule instead of via the button.

**Posts not updating in real-time** — Make sure you added `linkedin_posts_lexiecoon` to the `supabase_realtime` publication (last line of the SQL setup).

**CORS error on webhook** — Make sure your n8n webhook node has **Response Mode** set to `Immediately` and that CORS is enabled in your n8n instance config.
