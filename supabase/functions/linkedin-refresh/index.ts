import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APIFY_URL =
  'https://api.apify.com/v2/acts/worldunboxer~rapid-linkedin-scraper/run-sync-get-dataset-items'

function buildApifyBody(jobTitle: string, config: Record<string, any>) {
  const body: Record<string, unknown> = {
    job_title: jobTitle,
  }

  // Only include optional fields when they have a non-empty value
  if (config.location)         body.location         = config.location
  if (config.jobs_entries > 0) body.jobs_entries      = config.jobs_entries
  if (config.start_jobs > 0)   body.start_jobs        = config.start_jobs
  if (config.experience_level) body.experience_level  = config.experience_level
  if (config.job_type)         body.job_type          = config.job_type
  if (config.work_schedule)    body.work_schedule     = config.work_schedule
  if (config.job_post_time)    body.job_post_time     = config.job_post_time

  const companies = config.company_names
    ? config.company_names.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  if (companies.length) body.company_names = companies

  return body
}

async function scrapeKeyword(
  keyword: string,
  config: Record<string, any>,
  supabase: ReturnType<typeof createClient>
) {
  const body = buildApifyBody(keyword, config)
  console.log(`[linkedin-refresh] → Apify body for "${keyword}":`, JSON.stringify(body))

  // 90 s per keyword — keeps us safely under the 300 s EdgeRuntime.waitUntil ceiling
  // even with 3 keywords running sequentially (3 × 90 = 270 s max)
  const res = await fetch(`${APIFY_URL}?token=${config.apify_token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })

  console.log(`[linkedin-refresh] Apify status ${res.status} for "${keyword}"`)

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[linkedin-refresh] Apify error body:`, errText)
    return
  }

  const rawJson = await res.text()
  console.log(`[linkedin-refresh] Apify raw response (first 300 chars):`, rawJson.slice(0, 300))

  let jobs: any[]
  try {
    const parsed = JSON.parse(rawJson)
    // The endpoint returns an array directly, but guard against unexpected shape
    jobs = Array.isArray(parsed) ? parsed : (parsed?.items ?? parsed?.data ?? [])
  } catch (e) {
    console.error(`[linkedin-refresh] Failed to parse Apify response:`, e)
    return
  }

  console.log(`[linkedin-refresh] Parsed ${jobs.length} jobs for "${keyword}"`)
  if (jobs.length === 0) return

  const rows = jobs.map((j: any) => ({
    job_id:            String(j.job_id),
    job_url:           j.job_url           ?? null,
    job_title:         j.job_title         ?? null,
    company_name:      j.company_name      ?? null,
    company_url:       j.company_url       ?? null,
    company_logo_url:  j.company_logo_url  ?? null,
    location:          j.location          ?? null,
    time_posted:       j.time_posted       ?? null,
    num_applicants:    j.num_applicants    ?? null,
    salary_range:      j.salary_range      ?? null,
    job_description:   j.job_description   ?? null,
    seniority_level:   j.seniority_level   ?? null,
    employment_type:   j.employment_type   ?? null,
    job_function:      j.job_function      ?? null,
    industries:        j.industries        ?? null,
    easy_apply:        Boolean(j.easy_apply),
    apply_url:         j.apply_url         ?? null,
    updated_at:        new Date().toISOString(),
  }))

  const { error: upsertErr } = await supabase
    .from('linkedin_jobs_lexiecoon')
    .upsert(rows, { onConflict: 'job_id' })

  if (upsertErr) {
    console.error(`[linkedin-refresh] Upsert error for "${keyword}":`, upsertErr.message)
  } else {
    console.log(`[linkedin-refresh] Upserted ${rows.length} jobs for "${keyword}"`)
  }
}

async function runScrape(supabaseUrl: string, serviceKey: string) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: config, error: cfgErr } = await supabase
    .from('scraper_settings_lexiecoon')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (cfgErr || !config) {
    console.error('[linkedin-refresh] Config fetch error:', cfgErr?.message ?? 'no row returned')
    return
  }
  console.log('[linkedin-refresh] Config loaded. has_token:', Boolean(config.apify_token))

  const { data: kwRows, error: kwErr } = await supabase
    .from('search_keywords_lexiecoon')
    .select('keyword')
    .eq('is_active', true)

  if (kwErr) {
    console.error('[linkedin-refresh] Keywords fetch error:', kwErr.message)
    return
  }
  if (!kwRows?.length) {
    console.warn('[linkedin-refresh] No active keywords — nothing to scrape')
    return
  }
  console.log(`[linkedin-refresh] ${kwRows.length} active keywords:`, kwRows.map((r: { keyword: string }) => r.keyword))

  for (const { keyword } of kwRows) {
    try {
      await scrapeKeyword(keyword, config, supabase)
    } catch (err: any) {
      // Catch AbortError (timeout) separately so we can log clearly
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        console.error(`[linkedin-refresh] Timeout waiting for Apify response for "${keyword}"`)
      } else {
        console.error(`[linkedin-refresh] Unexpected error for "${keyword}":`, err?.message ?? err)
      }
    }
  }

  console.log('[linkedin-refresh] Done')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey)
    return new Response(JSON.stringify({ error: 'Missing runtime env vars' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  EdgeRuntime.waitUntil(runScrape(supabaseUrl, serviceRoleKey))

  return new Response(
    JSON.stringify({ status: 'accepted', message: 'Scrape started in background' }),
    { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
