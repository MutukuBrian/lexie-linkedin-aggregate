import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APIFY_URL =
  'https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items'

const splitCsv = (val: unknown): string[] => {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean)
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildApifyBody(keyword: string, config: Record<string, any>) {
  const body: Record<string, unknown> = {
    searchQueries: [keyword],
  }

  if (config.max_posts > 0)  body.maxPosts    = config.max_posts
  if (config.posted_limit)   body.postedLimit = config.posted_limit
  if (config.posted_limit_date) body.postedLimitDate = config.posted_limit_date
  if (config.sort_by)        body.sortBy      = config.sort_by
  if (config.content_type)   body.contentType = config.content_type
  if (config.start_page > 0) body.startPage   = config.start_page
  if (config.scrape_pages > 0) body.scrapePages = config.scrape_pages
  if (config.author_keywords) body.authorKeywords = config.author_keywords

  const authorUrls         = splitCsv(config.author_urls)
  const authorsCompanies   = splitCsv(config.authors_companies)
  const mentioningMember   = splitCsv(config.mentioning_member)
  const mentioningCompany  = splitCsv(config.mentioning_company)
  const authorsIndustryId  = splitCsv(config.authors_industry_id)

  if (authorUrls.length)        body.authorUrls        = authorUrls
  if (authorsCompanies.length)  body.authorsCompanies  = authorsCompanies
  if (mentioningMember.length)  body.mentioningMember  = mentioningMember
  if (mentioningCompany.length) body.mentioningCompany = mentioningCompany
  if (authorsIndustryId.length) body.authorsIndustryId = authorsIndustryId

  body.scrapeReactions     = Boolean(config.scrape_reactions)
  body.maxReactions        = config.max_reactions ?? 5
  body.scrapeComments      = Boolean(config.scrape_comments)
  body.maxComments         = config.max_comments ?? 10
  body.postNestedReactions = false
  body.postNestedComments  = false

  return body
}

async function scrapeKeyword(
  keyword: string,
  config: Record<string, any>,
  supabase: ReturnType<typeof createClient>
) {
  const body = buildApifyBody(keyword, config)
  console.log(`[linkedin-posts-refresh] → Apify body for "${keyword}":`, JSON.stringify(body))

  const res = await fetch(`${APIFY_URL}?token=${config.apify_token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })

  console.log(`[linkedin-posts-refresh] Apify status ${res.status} for "${keyword}"`)

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[linkedin-posts-refresh] Apify error body:`, errText)
    return
  }

  const rawJson = await res.text()
  console.log(`[linkedin-posts-refresh] Apify raw response (first 300 chars):`, rawJson.slice(0, 300))

  let posts: any[]
  try {
    const parsed = JSON.parse(rawJson)
    posts = Array.isArray(parsed) ? parsed : (parsed?.items ?? parsed?.data ?? [])
  } catch (e) {
    console.error(`[linkedin-posts-refresh] Failed to parse Apify response:`, e)
    return
  }

  console.log(`[linkedin-posts-refresh] Parsed ${posts.length} posts for "${keyword}"`)
  if (posts.length === 0) return

  const rows = posts
    .filter((p: any) => p?.id)
    .map((p: any) => ({
      id:              String(p.id),
      post_url:        p.linkedinUrl              ?? null,
      content:         p.content                  ?? null,
      poster_name:     p.author?.name             ?? null,
      poster_url:      p.author?.linkedinUrl      ?? null,
      poster_type:     p.author?.type             ?? null,
      author_info:     p.author?.info             ?? null,
      avatar_url:      p.author?.avatar?.url      ?? null,
      post_images:     Array.isArray(p.postImages) ? p.postImages : [],
      engagement:      p.engagement              ?? {},
      posted_at:       p.postedAt?.timestamp
                         ? new Date(p.postedAt.timestamp).toISOString()
                         : (p.postedAt?.date ?? null),
      posted_ago_text: null,
      query_keyword:   p.query?.search           ?? keyword,
      updated_at:      new Date().toISOString(),
    }))

  if (rows.length === 0) return

  const { error: upsertErr } = await supabase
    .from('linkedin_posts_lexiecoon')
    .upsert(rows, { onConflict: 'id' })

  if (upsertErr) {
    console.error(`[linkedin-posts-refresh] Upsert error for "${keyword}":`, upsertErr.message)
  } else {
    console.log(`[linkedin-posts-refresh] Upserted ${rows.length} posts for "${keyword}"`)
  }
}

async function runScrape(supabaseUrl: string, serviceKey: string) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: config, error: cfgErr } = await supabase
    .from('posts_scraper_settings_lexiecoon')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (cfgErr || !config) {
    console.warn('[linkedin-posts-refresh] No active posts config — scraper toggled off or row missing:', cfgErr?.message ?? 'no row')
    return
  }
  if (!config.apify_token) {
    console.warn('[linkedin-posts-refresh] Apify token missing on posts config row — skip')
    return
  }
  console.log('[linkedin-posts-refresh] Config loaded. has_token:', Boolean(config.apify_token))

  const { data: kwRows, error: kwErr } = await supabase
    .from('posts_search_keywords_lexiecoon')
    .select('keyword')
    .eq('is_active', true)

  if (kwErr) {
    console.error('[linkedin-posts-refresh] Keywords fetch error:', kwErr.message)
    return
  }
  if (!kwRows?.length) {
    console.warn('[linkedin-posts-refresh] No active keywords — nothing to scrape')
    return
  }
  console.log(`[linkedin-posts-refresh] ${kwRows.length} active keywords:`, kwRows.map((r: { keyword: string }) => r.keyword))

  for (const { keyword } of kwRows) {
    try {
      await scrapeKeyword(keyword, config, supabase)
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        console.error(`[linkedin-posts-refresh] Timeout waiting for Apify response for "${keyword}"`)
      } else {
        console.error(`[linkedin-posts-refresh] Unexpected error for "${keyword}":`, err?.message ?? err)
      }
    }
  }

  console.log('[linkedin-posts-refresh] Done')
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
    JSON.stringify({ status: 'accepted', message: 'Posts scrape started in background' }),
    { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
