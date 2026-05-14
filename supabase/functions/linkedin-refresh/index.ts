import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APIFY_URL =
  'https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items'

function buildApifyBody(keyword: string, config: Record<string, any>) {
  const body: Record<string, unknown> = {
    searchQueries: [keyword],
    maxPosts: config.max_posts || 20,
    postedLimit: config.posted_limit || 'any',
    sortBy: config.sort_by || 'date',
    contentType: config.content_type || 'all',
    scrapeReactions: Boolean(config.scrape_reactions),
    postNestedReactions: false,
    scrapeComments: Boolean(config.scrape_comments),
    postNestedComments: false,
  }

  if (config.scrape_reactions) body.maxReactions = config.max_reactions || 5
  if (config.scrape_comments)  body.maxComments  = config.max_comments  || 10
  if (config.posted_limit_date) body.postedLimitDate = config.posted_limit_date

  const csv = (val: string | null) =>
    val ? val.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined

  const authorUrls        = csv(config.author_urls)
  const authorCompanies   = csv(config.authors_companies)
  const mentioningMember  = csv(config.mentioning_member)
  const mentioningCompany = csv(config.mentioning_company)
  const industryId        = csv(config.authors_industry_id)
  const authorKeywords    = csv(config.author_keywords)

  if (authorUrls?.length)        body.authorUrls        = authorUrls
  if (authorCompanies?.length)   body.authorCompanies   = authorCompanies
  if (mentioningMember?.length)  body.mentioningMember  = mentioningMember
  if (mentioningCompany?.length) body.mentioningCompany = mentioningCompany
  if (industryId?.length)        body.authorsIndustryId = industryId
  if (authorKeywords?.length)    body.authorKeywords    = authorKeywords

  return body
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
    console.error('[linkedin-refresh] Config error:', cfgErr)
    return
  }

  const { data: kwRows, error: kwErr } = await supabase
    .from('search_keywords_lexiecoon')
    .select('keyword')
    .eq('is_active', true)

  if (kwErr || !kwRows?.length) {
    console.error('[linkedin-refresh] Keywords error:', kwErr)
    return
  }

  for (const { keyword } of kwRows) {
    console.log(`[linkedin-refresh] Keyword: "${keyword}"`)
    try {
      const res = await fetch(`${APIFY_URL}?token=${config.apify_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildApifyBody(keyword, config)),
        signal: AbortSignal.timeout(310_000),
      })

      if (!res.ok) {
        console.error(`[linkedin-refresh] Apify ${res.status} for "${keyword}"`)
        continue
      }

      const posts: any[] = await res.json()
      if (!posts.length) continue

      const rows = posts.map((p) => ({
        id:           p.id,
        poster_name:  p.author?.name         ?? null,
        poster_url:   p.author?.linkedinUrl  ?? null,
        post_content: p.content              ?? null,
        post_url:     p.linkedinUrl          ?? null,
        created_at:   p.postedAt?.date       ?? null,
        author_info:  p.author?.info         ?? null,
        avatar:       p.author?.avatar       ?? null,
        post_images:  p.postImages           ?? null,
        engagement:   p.engagement           ?? null,
        website:      p.author?.website      ?? null,
        website_label:p.author?.websiteLabel ?? null,
      }))

      // Atomic upsert — replaces n8n's manual check-then-insert/update pattern
      const { error: upsertErr } = await supabase
        .from('linkedin_posts_lexiecoon')
        .upsert(rows, { onConflict: 'id' })

      if (upsertErr) console.error(`[linkedin-refresh] Upsert error:`, upsertErr.message)
      else           console.log(`[linkedin-refresh] Upserted ${rows.length} posts for "${keyword}"`)
    } catch (err) {
      console.error(`[linkedin-refresh] Error for "${keyword}":`, err)
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

  // Returns 202 immediately; scraping runs in background via EdgeRuntime.waitUntil.
  // The app's existing Realtime subscription on linkedin_posts_lexiecoon delivers
  // new posts to the feed automatically as they are upserted.
  EdgeRuntime.waitUntil(runScrape(supabaseUrl, serviceRoleKey))

  return new Response(
    JSON.stringify({ status: 'accepted', message: 'Scrape started in background' }),
    { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
