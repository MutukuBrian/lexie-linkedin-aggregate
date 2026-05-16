import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { Save, Info, Database, Tag, Plus, X, Cpu, Key, Layers, Filter as FilterIcon, Bot, Clock, BookOpen, MessageSquare, ToggleLeft, ToggleRight, Briefcase } from 'lucide-react';
import { cn } from '../lib/utils';
import { getSupabase } from '../lib/supabase';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(!visible)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-900 text-white text-[10px] leading-tight rounded shadow-xl animate-in fade-in zoom-in-95 duration-200 z-50 pointer-events-none">
          <div className="relative">
            {content}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
          </div>
        </div>
      )}
    </div>
  );
};

interface TagInputProps {
  label: string;
  description: string;
  value: string[];
  onChange: (newValue: string[]) => void;
  onRemove?: (removed: string) => void;
  placeholder?: string;
}

const TagInput: React.FC<TagInputProps> = ({ label, description, value, onChange, onRemove, placeholder }) => {
  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    const val = inputValue.trim();
    if (val && !value.includes(val)) {
      onChange([...value, val]);
      setInputValue('');
    }
  };

  const handleRemove = (v: string) => {
    onChange(value.filter(item => item !== v));
    onRemove?.(v);
  };

  const startEditing = (v: string) => {
    setEditingId(v);
    setEditValue(v);
  };

  const saveEdit = (oldV: string) => {
    const newV = editValue.trim();
    if (newV && newV !== oldV) {
      onChange(value.map(item => item === oldV ? newV : item));
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold text-zinc-400">{label}</label>
        <Tooltip content={description}>
          <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
        </Tooltip>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder || "Type and press Enter..."}
          className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all font-sans"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button 
          onClick={handleAdd}
          className="p-2 bg-zinc-900 text-white hover:bg-zinc-800 rounded-md transition-all active:scale-90"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((v) => (
          <div key={v} onContextMenu={(e) => { e.preventDefault(); startEditing(v); }} className="group relative">
            {editingId === v ? (
              <input
                autoFocus
                className="inline-flex items-center px-2.5 py-1 bg-white border-2 border-zinc-900 rounded-full text-xs font-medium text-zinc-900 focus:outline-none shadow-lg"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveEdit(v)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit(v)}
              />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-full text-[11px] font-semibold text-zinc-700 group-hover:bg-white group-hover:border-zinc-300 transition-all cursor-context-menu shadow-sm">
                {v}
                <button onClick={() => handleRemove(v)} className="text-zinc-300 hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const formatHour = (h: number) => {
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:00 ${period}`;
};

// getTimezoneOffset() returns minutes to ADD to local to get UTC (positive = west of UTC)
const TZ_OFFSET_HOURS = new Date().getTimezoneOffset() / 60;
const LOCAL_TZ_NAME   = Intl.DateTimeFormat().resolvedOptions().timeZone;
const localToUtc = (h: number) => (h + TZ_OFFSET_HOURS + 24) % 24;
const utcToLocal = (h: number) => (h - TZ_OFFSET_HOURS + 24) % 24;

export const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, isConfigured } = useSettings();
  const [formData, setFormData] = useState(settings);
  
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [saved, setSaved] = useState(false);

  // True whenever formData diverges from what was last persisted (settings = source of truth after save/fetch).
  const isDirty = JSON.stringify(formData) !== JSON.stringify(settings);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      if (!isConfigured) return;
      try {
        const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
        if (!supabase) return;

        const splitCsv = (raw: unknown): string[] =>
          raw ? String(raw).split(',').map(s => s.trim()).filter(Boolean) : [];

        // Fetch jobs keywords + settings in parallel with posts keywords + settings
        const [kwResponse, scraperResponse, postKwResponse, postsScraperResponse] = await Promise.all([
          supabase.from('search_keywords_lexiecoon').select('keyword').eq('is_active', true),
          supabase.from('scraper_settings_lexiecoon').select('*').limit(1).single(),
          supabase.from('posts_search_keywords_lexiecoon').select('keyword').eq('is_active', true),
          supabase.from('posts_scraper_settings_lexiecoon').select('*').limit(1).single(),
        ]);

        const updates: Partial<typeof settings> = {};

        if (kwResponse.data) {
          updates.keywords = kwResponse.data.map((d: { keyword: string }) => d.keyword);
        }

        if (scraperResponse.data) {
          const parseTerms = (v: unknown): string[] => {
            if (!v) return [];
            if (Array.isArray(v)) return v as string[];
            try { const p = JSON.parse(v as string); return Array.isArray(p) ? p : []; } catch { return []; }
          };
          updates.locationTerms = parseTerms(scraperResponse.data.location_terms);
          updates.excludeTerms  = parseTerms(scraperResponse.data.exclude_terms);
          updates.jobsScraperEnabled = scraperResponse.data.is_active !== false;
          updates.scraper = {
            location: scraperResponse.data.location || '',
            jobsEntries: scraperResponse.data.jobs_entries ?? 100,
            companyNames: scraperResponse.data.company_names ? scraperResponse.data.company_names.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            experienceLevel: scraperResponse.data.experience_level || '',
            jobType: scraperResponse.data.job_type || '',
            workSchedule: scraperResponse.data.work_schedule || '',
            jobPostTime: scraperResponse.data.job_post_time || '',
            startJobs: scraperResponse.data.start_jobs ?? 0,
            apifyToken: scraperResponse.data.apify_token || '',
            scheduleHour1: utcToLocal(scraperResponse.data.schedule_hour_1 ?? 12),
            scheduleHour2: utcToLocal(scraperResponse.data.schedule_hour_2 ?? 16),
          };
        }

        if (postKwResponse.data) {
          updates.postKeywords = postKwResponse.data.map((d: { keyword: string }) => d.keyword);
        } else if (postKwResponse.error && (postKwResponse.error as any).code === '42P01') {
          console.warn('posts_search_keywords_lexiecoon missing — run the posts migration.');
        }

        if (postsScraperResponse.data) {
          const r = postsScraperResponse.data;
          updates.postsScraperEnabled = r.is_active !== false;
          updates.postsScraper = {
            apifyToken: r.apify_token || '',
            maxPosts: r.max_posts ?? 10,
            postedLimit: r.posted_limit || '24h',
            postedLimitDate: r.posted_limit_date || '',
            sortBy: r.sort_by || 'date',
            contentType: r.content_type || 'all',
            authorUrls: splitCsv(r.author_urls),
            authorsCompanies: splitCsv(r.authors_companies),
            mentioningMember: splitCsv(r.mentioning_member),
            mentioningCompany: splitCsv(r.mentioning_company),
            authorsIndustryId: splitCsv(r.authors_industry_id),
            authorKeywords: r.author_keywords || '',
            startPage: r.start_page ?? 1,
            scrapePages: r.scrape_pages ?? 1,
            scrapeReactions: Boolean(r.scrape_reactions),
            maxReactions: r.max_reactions ?? 5,
            scrapeComments: Boolean(r.scrape_comments),
            maxComments: r.max_comments ?? 10,
          };
        } else if (postsScraperResponse.error && (postsScraperResponse.error as any).code === '42P01') {
          console.warn('posts_scraper_settings_lexiecoon missing — run the posts migration.');
        }

        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({
            ...prev,
            ...updates,
            // Preserve keyword arrays the user has already edited during the async fetch
            keywords:     prev.keywords.length     > 0 ? prev.keywords     : (updates.keywords     ?? prev.keywords),
            postKeywords: prev.postKeywords.length > 0 ? prev.postKeywords : (updates.postKeywords ?? prev.postKeywords),
          }));
          updateSettings(updates);
        }
      } catch (e) {
        console.error('Failed to fetch settings from Supabase:', e);
      }
    }
    fetchData();
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const supabase = getSupabase(formData.supabaseUrl, formData.supabaseAnonKey);
      if (!supabase) throw new Error('Invalid credentials');
      
      const { error } = await supabase.from('linkedin_jobs_lexiecoon').select('job_id').limit(1);

      if (error) {
        if (error.code === '42P01') {
           throw new Error('Connected to Supabase, but "linkedin_jobs_lexiecoon" table not found. Please run the SQL setup.');
        }
        throw error;
      }
      
      setTestResult('success');
    } catch (err: any) {
      console.error('Connection test failed:', err);
      const message = err.message || 'Connection failed. Please check your URL and Key.';
      setTestResult('error');
      (window as any).lastAuthError = message;
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    updateSettings(formData);
    setSaved(true);

    if (isConfigured) {
      try {
        const supabase = getSupabase(formData.supabaseUrl, formData.supabaseAnonKey);
        if (supabase) {
          // Sync Jobs Scraper Settings
          await supabase.from('scraper_settings_lexiecoon').upsert({
            id: '00000000-0000-0000-0000-000000000000',
            configs_name: 'default',
            is_active: formData.jobsScraperEnabled,
            location_terms: JSON.stringify(formData.locationTerms),
            exclude_terms: JSON.stringify(formData.excludeTerms),
            location: formData.scraper.location,
            jobs_entries: formData.scraper.jobsEntries,
            company_names: formData.scraper.companyNames.join(','),
            experience_level: formData.scraper.experienceLevel,
            job_type: formData.scraper.jobType,
            work_schedule: formData.scraper.workSchedule,
            job_post_time: formData.scraper.jobPostTime,
            start_jobs: formData.scraper.startJobs,
            apify_token: formData.scraper.apifyToken,
            schedule_hour_1: localToUtc(formData.scraper.scheduleHour1),
            schedule_hour_2: localToUtc(formData.scraper.scheduleHour2),
            updated_at: new Date().toISOString()
          });

          // Sync Posts Scraper Settings
          const { error: postsCfgErr } = await supabase.from('posts_scraper_settings_lexiecoon').upsert({
            id: '00000000-0000-0000-0000-000000000001',
            configs_name: 'default',
            is_active: formData.postsScraperEnabled,
            apify_token: formData.postsScraper.apifyToken,
            max_posts: formData.postsScraper.maxPosts,
            posted_limit: formData.postsScraper.postedLimit,
            posted_limit_date: formData.postsScraper.postedLimitDate,
            sort_by: formData.postsScraper.sortBy,
            content_type: formData.postsScraper.contentType,
            author_urls: formData.postsScraper.authorUrls.join(','),
            authors_companies: formData.postsScraper.authorsCompanies.join(','),
            mentioning_member: formData.postsScraper.mentioningMember.join(','),
            mentioning_company: formData.postsScraper.mentioningCompany.join(','),
            authors_industry_id: formData.postsScraper.authorsIndustryId.join(','),
            author_keywords: formData.postsScraper.authorKeywords,
            start_page: formData.postsScraper.startPage,
            scrape_pages: formData.postsScraper.scrapePages,
            scrape_reactions: formData.postsScraper.scrapeReactions,
            max_reactions: formData.postsScraper.maxReactions,
            scrape_comments: formData.postsScraper.scrapeComments,
            max_comments: formData.postsScraper.maxComments,
            updated_at: new Date().toISOString()
          });
          if (postsCfgErr) console.warn('[Posts settings sync] error:', postsCfgErr.message);

          // Update pg_cron schedule (requires SQL function — fails gracefully if not yet created)
          try {
            const { error: rpcErr } = await supabase.rpc('update_linkedin_schedule', {
              hour1: localToUtc(formData.scraper.scheduleHour1),
              hour2: localToUtc(formData.scraper.scheduleHour2),
              project_url: formData.supabaseUrl,
              anon_key: formData.supabaseAnonKey,
            });
            if (rpcErr) console.warn('[Schedule] RPC error (run the SQL setup):', rpcErr.message);
          } catch (rpcEx) {
            console.warn('[Schedule] RPC not available yet:', rpcEx);
          }

          // Sync job keywords
          if (formData.keywords.length > 0) {
            const keywordData = formData.keywords.map(kw => ({ keyword: kw, is_active: true }));
            await supabase.from('search_keywords_lexiecoon').upsert(keywordData, { onConflict: 'keyword' });
          }

          // Sync post keywords
          if (formData.postKeywords.length > 0) {
            const postKeywordData = formData.postKeywords.map(kw => ({ keyword: kw, is_active: true }));
            const { error: pkErr } = await supabase.from('posts_search_keywords_lexiecoon').upsert(postKeywordData, { onConflict: 'keyword' });
            if (pkErr) console.warn('[Post keywords sync] error:', pkErr.message);
          }
        }
      } catch (e) {
        console.error('Failed to sync settings to DB:', e);
      }
    }

    setTimeout(() => setSaved(false), 2000);
  };

  const updateScraper = (updates: Partial<typeof settings['scraper']>) => {
    setFormData(prev => ({
      ...prev,
      scraper: { ...prev.scraper, ...updates }
    }));
  };

  const updatePostsScraper = (updates: Partial<typeof settings['postsScraper']>) => {
    setFormData(prev => ({
      ...prev,
      postsScraper: { ...prev.postsScraper, ...updates }
    }));
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-12 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-900">Dashboard Settings</h1>
          <p className="text-sm text-zinc-500">Configure your data sources, search criteria, and scraper behavior.</p>
        </div>
        <button
          onClick={() => window.open('/user-guide.html', '_blank')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 bg-white border border-zinc-200 hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm transition-all duration-200 shrink-0"
        >
          <BookOpen className="w-4 h-4" />
          User Guide
        </button>
      </div>

      <div className="space-y-8">
        {/* Supabase Config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Database className="w-4 h-4" />
            Database (Supabase)
          </div>
          <div className="grid gap-4 p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm">
            <div className="space-y-1.5">
              <label htmlFor="supabaseUrl" className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                Project URL
                <Tooltip content="The base URL of your Supabase project (e.g., https://xyz.supabase.co)">
                  <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                </Tooltip>
              </label>
              <input
                id="supabaseUrl"
                type="text"
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all"
                value={formData.supabaseUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, supabaseUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="supabaseAnonKey" className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                Anon public key
                <Tooltip content="Your Supabase project's anonymous public key.">
                  <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                </Tooltip>
              </label>
              <input
                id="supabaseAnonKey"
                type="password"
                placeholder="your-anon-key"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all font-mono"
                value={formData.supabaseAnonKey}
                onChange={(e) => setFormData(prev => ({ ...prev, supabaseAnonKey: e.target.value }))}
              />
            </div>

            <button
              onClick={testConnection}
              disabled={testing || !formData.supabaseUrl || !formData.supabaseAnonKey}
              className="mt-2 w-full py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-zinc-200 transition-all disabled:opacity-50 active:scale-[0.98]"
            >
              {testing ? 'Verifying...' : 'Verify Schema Connection'}
            </button>

            {testResult === 'success' && (
              <div className="flex items-center justify-between p-3 bg-[#064e3b] text-[#ecfdf5] border border-[#065f46] rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-[11px] font-semibold">Schema connected successfully</span>
                </div>
                <button onClick={testConnection} className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[9px] font-bold uppercase">Retry</button>
              </div>
            )}

            {testResult === 'error' && (
              <div className="p-3 bg-red-950 text-red-100 border border-red-900 rounded-xl text-[11px] space-y-1">
                <p className="font-bold">Schema sync failed</p>
                <p className="opacity-80">{(window as any).lastAuthError || 'Check credentials.'}</p>
              </div>
            )}
          </div>
        </section>

        {/* Scraper Toggles */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <ToggleRight className="w-4 h-4" />
            Scraper toggles
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-3">
            <p className="text-[11px] text-zinc-500">
              Toggle either scraper off to skip it on refresh and save Apify credits. Toggles apply both server-side (the edge function exits early) and to the Refresh button.
            </p>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, jobsScraperEnabled: !prev.jobsScraperEnabled }))}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all text-left',
                formData.jobsScraperEnabled
                  ? 'bg-zinc-50 border-zinc-200 hover:bg-white hover:shadow-sm'
                  : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-50'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Briefcase className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-semibold text-zinc-800">Jobs scraper</span>
              </span>
              {formData.jobsScraperEnabled
                ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                : <ToggleLeft className="w-7 h-7 text-zinc-400" />}
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, postsScraperEnabled: !prev.postsScraperEnabled }))}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all text-left',
                formData.postsScraperEnabled
                  ? 'bg-zinc-50 border-zinc-200 hover:bg-white hover:shadow-sm'
                  : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-50'
              )}
            >
              <span className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-semibold text-zinc-800">Posts scraper</span>
              </span>
              {formData.postsScraperEnabled
                ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                : <ToggleLeft className="w-7 h-7 text-zinc-400" />}
            </button>
          </div>
        </section>

        {/* Job Keywords Config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Tag className="w-4 h-4" />
            Job title searches
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-4">
            <TagInput
              label="Job titles"
              description="Job titles to search LinkedIn jobs for. Each title triggers one scrape run against the global Location and filters configured below."
              value={formData.keywords}
              onChange={(kw) => setFormData(prev => ({ ...prev, keywords: kw }))}
              onRemove={async (kw) => {
                if (!isConfigured) return;
                const supabase = getSupabase(formData.supabaseUrl, formData.supabaseAnonKey);
                if (supabase) await supabase.from('search_keywords_lexiecoon').delete().eq('keyword', kw);
              }}
              placeholder="e.g. Creative Project Manager (Press Enter)"
            />
            <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
              <Info className="w-3 h-3" />
              Tip: Right-click a tag to edit it. Changes are synced instantly.
            </p>
          </div>
        </section>

        {/* Post Keywords Config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <MessageSquare className="w-4 h-4" />
            Post searches
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-4">
            <TagInput
              label="Post search queries"
              description="LinkedIn post search queries (same as you would type into LinkedIn's search bar). Each query triggers one posts scrape run."
              value={formData.postKeywords}
              onChange={(kw) => setFormData(prev => ({ ...prev, postKeywords: kw }))}
              onRemove={async (kw) => {
                if (!isConfigured) return;
                const supabase = getSupabase(formData.supabaseUrl, formData.supabaseAnonKey);
                if (supabase) await supabase.from('posts_search_keywords_lexiecoon').delete().eq('keyword', kw);
              }}
              placeholder="e.g. Digital Producer NYC hiring (Press Enter)"
            />
            <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
              <Info className="w-3 h-3" />
              These run against the LinkedIn posts feed (people sharing opportunities), not the official jobs board.
            </p>
          </div>
        </section>

        {/* Scraper Configuration */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Cpu className="w-4 h-4" />
            Scraper Settings (Apify Engine)
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-8">
            {/* Core Search Settings */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold text-zinc-900 border-b border-zinc-100 pb-2 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                Core Parameters
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Location
                    <Tooltip content="Location to search jobs in. Applied to every job title above. Example: 'Brooklyn, NY' or 'Remote, United States'.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Brooklyn, NY"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.location}
                    onChange={(e) => updateScraper({ location: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Number of jobs per query
                    <Tooltip content="Maximum number of jobs to scrape per job title. Minimum 1, maximum 10000. Default is 100.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.jobsEntries}
                    onChange={(e) => updateScraper({ jobsEntries: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Search after how many jobs
                    <Tooltip content="Skip this many jobs before starting the scrape. Useful for paginating past results already in the database.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.startJobs}
                    onChange={(e) => updateScraper({ startJobs: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Experience level
                    <Tooltip content="Filter jobs by experience level required.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.scraper.experienceLevel}
                    onChange={(e) => updateScraper({ experienceLevel: e.target.value })}
                  >
                    <option value="">Any</option>
                    <option value="1">Internship</option>
                    <option value="2">Entry level</option>
                    <option value="3">Associate</option>
                    <option value="4">Mid-Senior level</option>
                    <option value="5">Director</option>
                    <option value="6">Executive</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Job type
                    <Tooltip content="Filter jobs by employment type.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.scraper.jobType}
                    onChange={(e) => updateScraper({ jobType: e.target.value })}
                  >
                    <option value="">Any</option>
                    <option value="F">Full-time</option>
                    <option value="P">Part-time</option>
                    <option value="C">Contract</option>
                    <option value="T">Temporary</option>
                    <option value="V">Volunteer</option>
                    <option value="I">Internship</option>
                    <option value="O">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Work schedule
                    <Tooltip content="Filter jobs by on-site / remote / hybrid arrangement.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.scraper.workSchedule}
                    onChange={(e) => updateScraper({ workSchedule: e.target.value })}
                  >
                    <option value="">Any</option>
                    <option value="1">On-site</option>
                    <option value="2">Remote</option>
                    <option value="3">Hybrid</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Job posting time
                    <Tooltip content="Only return jobs posted within this window.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.scraper.jobPostTime}
                    onChange={(e) => updateScraper({ jobPostTime: e.target.value })}
                  >
                    <option value="">Any time</option>
                    <option value="r86400">Past 24 hours</option>
                    <option value="r604800">Past week</option>
                    <option value="r2592000">Past month</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Targeting Filters */}
            <div className="space-y-6 pt-4 border-t border-zinc-100">
              <h3 className="text-[11px] font-bold text-zinc-900 flex items-center gap-2 mb-2">
                <FilterIcon className="w-3.5 h-3.5" />
                Targeting & Filters
              </h3>

              <TagInput
                label="Company names"
                description="Only return jobs from these companies. Leave empty to search across all companies."
                value={formData.scraper.companyNames}
                onChange={(val) => updateScraper({ companyNames: val })}
                placeholder="e.g. Solomon Page"
              />
            </div>

            <div className="pt-4 space-y-1.5 border-t border-zinc-100">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400">
                <Key className="w-3 h-3" />
                Apify API token
                <Tooltip content="Your Apify platform personal API token, used to run the LinkedIn Jobs Scraper Actor.">
                  <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                </Tooltip>
              </div>
              <input
                type="password"
                placeholder="apify_api_..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 font-mono shadow-inner bg-zinc-50"
                value={formData.scraper.apifyToken}
                onChange={(e) => updateScraper({ apifyToken: e.target.value })}
              />
            </div>
          </div>
        </section>


        {/* Posts Scraper Configuration */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <MessageSquare className="w-4 h-4" />
            Posts Scraper Settings (harvestapi)
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-8">
            {/* Core Posts Search Settings */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold text-zinc-900 border-b border-zinc-100 pb-2 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                Core Parameters
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Max posts per query
                    <Tooltip content="Maximum number of posts to scrape per search query. Set 0 to scrape all available.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.postsScraper.maxPosts}
                    onChange={(e) => updatePostsScraper({ maxPosts: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Posted limit
                    <Tooltip content="Only return posts no older than this window.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.postsScraper.postedLimit}
                    onChange={(e) => updatePostsScraper({ postedLimit: e.target.value })}
                  >
                    <option value="any">Any time</option>
                    <option value="1h">Past hour</option>
                    <option value="24h">Past 24 hours</option>
                    <option value="week">Past week</option>
                    <option value="month">Past month</option>
                    <option value="3months">Past 3 months</option>
                    <option value="6months">Past 6 months</option>
                    <option value="year">Past year</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Posted limit (specific date)
                    <Tooltip content="Optional cutoff date (YYYY-MM-DD). Posts older than this are excluded. Overrides 'Posted limit' if both set.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.postsScraper.postedLimitDate}
                    onChange={(e) => updatePostsScraper({ postedLimitDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Sort by
                    <Tooltip content="Sort posts by 'date' (newest first) or 'relevance' to the query.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.postsScraper.sortBy}
                    onChange={(e) => updatePostsScraper({ sortBy: e.target.value })}
                  >
                    <option value="date">Date</option>
                    <option value="relevance">Relevance</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Content type
                    <Tooltip content="Filter posts by their primary media type.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    value={formData.postsScraper.contentType}
                    onChange={(e) => updatePostsScraper({ contentType: e.target.value })}
                  >
                    <option value="all">All</option>
                    <option value="videos">Videos</option>
                    <option value="images">Images</option>
                    <option value="jobs">Jobs</option>
                    <option value="live_videos">Live videos</option>
                    <option value="documents">Documents</option>
                    <option value="collaborative_articles">Collaborative articles</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Start page
                    <Tooltip content="Pagination offset — start scraping from page N (each page = ~100 posts).">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.postsScraper.startPage}
                    onChange={(e) => updatePostsScraper({ startPage: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                    Scrape pages
                    <Tooltip content="Number of search pages to scrape per query.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.postsScraper.scrapePages}
                    onChange={(e) => updatePostsScraper({ scrapePages: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            {/* Posts Targeting */}
            <div className="space-y-6 pt-4 border-t border-zinc-100">
              <h3 className="text-[11px] font-bold text-zinc-900 flex items-center gap-2 mb-2">
                <FilterIcon className="w-3.5 h-3.5" />
                Targeting & Filters
              </h3>

              <TagInput
                label="Author URLs"
                description="LinkedIn profile or company URLs of post authors to target. Example: https://www.linkedin.com/in/williamhgates"
                value={formData.postsScraper.authorUrls}
                onChange={(val) => updatePostsScraper({ authorUrls: val })}
                placeholder="https://www.linkedin.com/in/..."
              />
              <TagInput
                label="Authors' companies"
                description="Scrape posts of profile-authors who currently work (or worked) at these LinkedIn company names."
                value={formData.postsScraper.authorsCompanies}
                onChange={(val) => updatePostsScraper({ authorsCompanies: val })}
                placeholder="e.g. Google"
              />
              <TagInput
                label="Mentioning member"
                description="Return posts that mention these LinkedIn profile URLs."
                value={formData.postsScraper.mentioningMember}
                onChange={(val) => updatePostsScraper({ mentioningMember: val })}
                placeholder="https://www.linkedin.com/in/..."
              />
              <TagInput
                label="Mentioning company"
                description="Return posts that mention these LinkedIn company names or company URLs."
                value={formData.postsScraper.mentioningCompany}
                onChange={(val) => updatePostsScraper({ mentioningCompany: val })}
                placeholder="e.g. Google"
              />
              <TagInput
                label="Authors industry IDs"
                description="LinkedIn industry IDs (e.g. 4 for Computer Software). See HarvestAPI's CSV for the full list."
                value={formData.postsScraper.authorsIndustryId}
                onChange={(val) => updatePostsScraper({ authorsIndustryId: val })}
                placeholder="e.g. 4"
              />
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
                  Author keywords
                  <Tooltip content="Free-text keywords matched against the author's profile headline / job title.">
                    <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                  </Tooltip>
                </label>
                <input
                  type="text"
                  placeholder="e.g. recruiter, talent acquisition"
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  value={formData.postsScraper.authorKeywords}
                  onChange={(e) => updatePostsScraper({ authorKeywords: e.target.value })}
                />
              </div>
            </div>

            {/* Reactions & Comments */}
            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <h3 className="text-[11px] font-bold text-zinc-900 flex items-center gap-2 mb-2">
                <Cpu className="w-3.5 h-3.5" />
                Reactions & Comments
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-zinc-300"
                    checked={formData.postsScraper.scrapeReactions}
                    onChange={(e) => updatePostsScraper({ scrapeReactions: e.target.checked })}
                  />
                  Scrape reactions
                </label>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400">Max reactions per post</label>
                  <input
                    type="number"
                    min={0}
                    disabled={!formData.postsScraper.scrapeReactions}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400"
                    value={formData.postsScraper.maxReactions}
                    onChange={(e) => updatePostsScraper({ maxReactions: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-zinc-300"
                    checked={formData.postsScraper.scrapeComments}
                    onChange={(e) => updatePostsScraper({ scrapeComments: e.target.checked })}
                  />
                  Scrape comments
                </label>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400">Max comments per post</label>
                  <input
                    type="number"
                    min={0}
                    disabled={!formData.postsScraper.scrapeComments}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400"
                    value={formData.postsScraper.maxComments}
                    onChange={(e) => updatePostsScraper({ maxComments: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-1.5 border-t border-zinc-100">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400">
                <Key className="w-3 h-3" />
                Apify API token (posts)
                <Tooltip content="Your Apify token used to run the harvestapi~linkedin-post-search Actor. Can be the same token as the jobs scraper.">
                  <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                </Tooltip>
              </div>
              <input
                type="password"
                placeholder="apify_api_..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 font-mono shadow-inner bg-zinc-50"
                value={formData.postsScraper.apifyToken}
                onChange={(e) => updatePostsScraper({ apifyToken: e.target.value })}
              />
            </div>
          </div>
        </section>


        {/* Auto-Refresh Schedule */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Clock className="w-4 h-4" />
            Auto-Refresh Schedule
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-4">
            <p className="text-xs text-zinc-500">
              The scraper runs automatically at these two times each day in your local timezone (<span className="font-medium text-zinc-600">{LOCAL_TZ_NAME}</span>). Changes take effect when you click <strong>Save All Settings</strong>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400">First run</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  value={formData.scraper.scheduleHour1}
                  onChange={(e) => updateScraper({ scheduleHour1: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-400">Second run</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  value={formData.scraper.scheduleHour2}
                  onChange={(e) => updateScraper({ scheduleHour2: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Claude Prompt */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Bot className="w-4 h-4" />
            Claude Prompt
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-2">
            <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-2">
              Copy-for-Claude prompt
              <Tooltip content="This text is added before the post text when you click the Copy button on any post card.">
                <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
              </Tooltip>
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all resize-y font-sans"
              value={formData.claudePrompt}
              onChange={(e) => setFormData(prev => ({ ...prev, claudePrompt: e.target.value }))}
            />
          </div>
        </section>

        {(isDirty || saved) && (
          <button
            onClick={handleSave}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold tracking-tight transition-all duration-300 shadow-xl",
              saved
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-zinc-900 text-white hover:bg-zinc-800 border border-transparent hover:shadow-2xl active:scale-[0.98]"
            )}
          >
            {saved ? "All Configurations Synced" : <><Save className="w-4 h-4" /> Save All Settings</>}
          </button>
        )}
      </div>
    </div>
  );
};
