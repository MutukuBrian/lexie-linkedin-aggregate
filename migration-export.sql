-- ============================================================
-- LinkedIn Opportunity Dashboard — Full Migration Export
-- Paste this entire file into the new Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS public.search_keywords_lexiecoon (
  id          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  keyword     text                     NOT NULL,
  is_active   boolean                  DEFAULT true,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT search_keywords_lexiecoon_pkey   PRIMARY KEY (id),
  CONSTRAINT search_keywords_lexiecoon_keyword_key UNIQUE (keyword)
);


-- ─────────────────────────────────────────────
-- 2. ENABLE ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE public.linkedin_jobs_lexiecoon    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_settings_lexiecoon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_keywords_lexiecoon  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────
-- 3. RLS POLICIES — linkedin_jobs_lexiecoon
-- ─────────────────────────────────────────────

CREATE POLICY "Public read"
  ON public.linkedin_jobs_lexiecoon
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon update"
  ON public.linkedin_jobs_lexiecoon
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service write"
  ON public.linkedin_jobs_lexiecoon
  FOR ALL
  TO public
  USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────
-- 4. RLS POLICIES — scraper_settings_lexiecoon
-- ─────────────────────────────────────────────

CREATE POLICY "anon read settings"
  ON public.scraper_settings_lexiecoon
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon update settings"
  ON public.scraper_settings_lexiecoon
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon upsert settings"
  ON public.scraper_settings_lexiecoon
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ─────────────────────────────────────────────
-- 5. RLS POLICIES — search_keywords_lexiecoon
-- ─────────────────────────────────────────────

CREATE POLICY "anon read keywords"
  ON public.search_keywords_lexiecoon
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon insert keywords"
  ON public.search_keywords_lexiecoon
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon update keywords"
  ON public.search_keywords_lexiecoon
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete keywords"
  ON public.search_keywords_lexiecoon
  FOR DELETE
  TO anon, authenticated
  USING (true);


-- ─────────────────────────────────────────────
-- 6. SEED DATA
-- ─────────────────────────────────────────────

-- Scraper settings (1 row — contains Apify token, update if needed)
INSERT INTO public.scraper_settings_lexiecoon (
  id, apify_token, configs_name, is_active,
  location_terms, exclude_terms,
  schedule_hour_1, schedule_hour_2,
  location, jobs_entries, company_names,
  experience_level, job_type, work_schedule, job_post_time, start_jobs
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'YOUR_APIFY_TOKEN_HERE',  -- paste your actual Apify token here
  'default',
  true,
  '[]', '[]',
  23, 13,
  'New York', 100, '',
  '', '', '', 'r2592000', 0
) ON CONFLICT (id) DO NOTHING;

-- Search keywords
INSERT INTO public.search_keywords_lexiecoon (id, keyword, is_active)
VALUES (
  'e81a499c-44ea-41dd-bcfd-086bcb2f4119',
  'project manager',
  true
) ON CONFLICT (keyword) DO NOTHING;
