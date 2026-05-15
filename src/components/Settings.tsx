import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { Settings as SettingsIcon, Save, Info, Database, Tag, Plus, X, Cpu, Key, Layers, Filter as FilterIcon, ChevronDown, ChevronUp, Bot, Clock, BookOpen } from 'lucide-react';
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
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</label>
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

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      if (!isConfigured) return;
      try {
        const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
        if (!supabase) return;
        
        // Fetch keywords
        const kwResponse = await supabase
          .from('search_keywords_lexiecoon')
          .select('keyword')
          .eq('is_active', true);
        
        // Fetch scraper settings
        const scraperResponse = await supabase
          .from('scraper_settings_lexiecoon')
          .select('*')
          .limit(1)
          .single();
        
        const updates: Partial<typeof settings> = {};
        
        if (kwResponse.data) {
          updates.keywords = kwResponse.data.map(d => d.keyword);
        }

        if (scraperResponse.data) {
          const parseTerms = (v: unknown): string[] => {
            if (!v) return [];
            if (Array.isArray(v)) return v as string[];
            try { const p = JSON.parse(v as string); return Array.isArray(p) ? p : []; } catch { return []; }
          };
          updates.locationTerms = parseTerms(scraperResponse.data.location_terms);
          updates.excludeTerms  = parseTerms(scraperResponse.data.exclude_terms);
          updates.scraper = {
            maxPosts: scraperResponse.data.max_posts,
            postedLimit: scraperResponse.data.posted_limit,
            postedLimitDate: scraperResponse.data.posted_limit_date || '',
            sortBy: scraperResponse.data.sort_by,
            contentType: scraperResponse.data.content_type,
            authorUrls: scraperResponse.data.author_urls ? scraperResponse.data.author_urls.split(',').filter(Boolean) : [],
            authorsCompanies: scraperResponse.data.authors_companies ? scraperResponse.data.authors_companies.split(',').filter(Boolean) : [],
            mentioningMember: scraperResponse.data.mentioning_member ? scraperResponse.data.mentioning_member.split(',').filter(Boolean) : [],
            mentioningCompany: scraperResponse.data.mentioning_company ? scraperResponse.data.mentioning_company.split(',').filter(Boolean) : [],
            authorsIndustryId: scraperResponse.data.authors_industry_id ? scraperResponse.data.authors_industry_id.split(',').filter(Boolean) : [],
            startPage: scraperResponse.data.start_page ?? 1,
            scrapePages: scraperResponse.data.scrape_pages,
            authorKeywords: scraperResponse.data.author_keywords ? (scraperResponse.data.author_keywords as string).split(',').map(k => k.trim()).filter(Boolean) : [],
            scrapeReactions: scraperResponse.data.scrape_reactions,
            maxReactions: scraperResponse.data.max_reactions ?? 5,
            scrapeComments: scraperResponse.data.scrape_comments,
            maxComments: scraperResponse.data.max_comments ?? 10,
            apifyToken: scraperResponse.data.apify_token,
            scheduleHour1: utcToLocal(scraperResponse.data.schedule_hour_1 ?? 12),
            scheduleHour2: utcToLocal(scraperResponse.data.schedule_hour_2 ?? 16),
          };
        }

        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
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
      
      const { error } = await supabase.from('linkedin_posts_lexiecoon').select('id').limit(1);
      
      if (error) {
        if (error.code === '42P01') {
           throw new Error('Connected to Supabase, but "linkedin_posts_lexiecoon" table not found. Please run the SQL setup.');
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
          // Sync Scraper Settings
          await supabase.from('scraper_settings_lexiecoon').upsert({
            id: '00000000-0000-0000-0000-000000000000',
            configs_name: 'default',
            is_active: true,
            location_terms: JSON.stringify(formData.locationTerms),
            exclude_terms: JSON.stringify(formData.excludeTerms),
            max_posts: formData.scraper.maxPosts,
            posted_limit: formData.scraper.postedLimit,
            posted_limit_date: formData.scraper.postedLimitDate,
            sort_by: formData.scraper.sortBy,
            content_type: formData.scraper.contentType,
            author_urls: formData.scraper.authorUrls.join(','),
            authors_companies: formData.scraper.authorsCompanies.join(','),
            mentioning_member: formData.scraper.mentioningMember.join(','),
            mentioning_company: formData.scraper.mentioningCompany.join(','),
            authors_industry_id: formData.scraper.authorsIndustryId.join(','),
            start_page: formData.scraper.startPage,
            scrape_pages: formData.scraper.scrapePages,
            author_keywords: formData.scraper.authorKeywords.join(','),
            scrape_reactions: formData.scraper.scrapeReactions,
            max_reactions: formData.scraper.maxReactions,
            scrape_comments: formData.scraper.scrapeComments,
            max_comments: formData.scraper.maxComments,
            apify_token: formData.scraper.apifyToken,
            schedule_hour_1: localToUtc(formData.scraper.scheduleHour1),
            schedule_hour_2: localToUtc(formData.scraper.scheduleHour2),
            updated_at: new Date().toISOString()
          });

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

          // Sync keywords
          if (formData.keywords.length > 0) {
            const keywordData = formData.keywords.map(kw => ({ keyword: kw, is_active: true }));
            await supabase.from('search_keywords_lexiecoon').upsert(keywordData, { onConflict: 'keyword' });
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

  const syncScraperToDB = async (updatedScraper: typeof formData.scraper) => {
    if (!isConfigured) return;
    try {
      const supabase = getSupabase(formData.supabaseUrl, formData.supabaseAnonKey);
      if (supabase) {
        await supabase.from('scraper_settings_lexiecoon').upsert({
          id: '00000000-0000-0000-0000-000000000000',
          configs_name: 'default',
          is_active: true,
          location_terms: JSON.stringify(formData.locationTerms),
          exclude_terms: JSON.stringify(formData.excludeTerms),
          max_posts: updatedScraper.maxPosts,
          posted_limit: updatedScraper.postedLimit,
          posted_limit_date: updatedScraper.postedLimitDate,
          sort_by: updatedScraper.sortBy,
          content_type: updatedScraper.contentType,
          author_urls: updatedScraper.authorUrls.join(','),
          authors_companies: updatedScraper.authorsCompanies.join(','),
          mentioning_member: updatedScraper.mentioningMember.join(','),
          mentioning_company: updatedScraper.mentioningCompany.join(','),
          authors_industry_id: updatedScraper.authorsIndustryId.join(','),
          start_page: updatedScraper.startPage,
          scrape_pages: updatedScraper.scrapePages,
          author_keywords: updatedScraper.authorKeywords.join(','),
          scrape_reactions: updatedScraper.scrapeReactions,
          max_reactions: updatedScraper.maxReactions,
          scrape_comments: updatedScraper.scrapeComments,
          max_comments: updatedScraper.maxComments,
          apify_token: updatedScraper.apifyToken,
          schedule_hour_1: localToUtc(updatedScraper.scheduleHour1),
          schedule_hour_2: localToUtc(updatedScraper.scheduleHour2),
          updated_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error('Failed to sync scraper settings:', e);
    }
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
              <label htmlFor="supabaseUrl" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
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
                onChange={(e) => setFormData({ ...formData, supabaseUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="supabaseAnonKey" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                Anon Public Key
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
                onChange={(e) => setFormData({ ...formData, supabaseAnonKey: e.target.value })}
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

        {/* Keywords Config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Tag className="w-4 h-4" />
            Search queries
          </div>
          <div className="p-6 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-4">
            <TagInput
              label="Queries"
              description="Queries to search LinkedIn posts. The same query as you would use in the LinkedIn search bar."
              value={formData.keywords}
              onChange={(kw) => setFormData({ ...formData, keywords: kw })}
              onRemove={async (kw) => {
                if (!isConfigured) return;
                const supabase = getSupabase(formData.supabaseUrl, formData.supabaseAnonKey);
                if (supabase) await supabase.from('search_keywords_lexiecoon').delete().eq('keyword', kw);
              }}
              placeholder="e.g. Freelance Producer (Press Enter)"
            />
            <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
              <Info className="w-3 h-3" />
              Tip: Right-click a tag to edit it. Changes are synced instantly.
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
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    Max Posts per Query
                    <Tooltip content="Maximum number of posts to scrape per each search query. If you set this to 0, it will scrape all posts.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.maxPosts}
                    onChange={(e) => updateScraper({ maxPosts: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    Time Filter
                    <Tooltip content="Fetch posts no older than X time. Options: '1h', '24h', 'week', 'month'.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.postedLimit}
                    onChange={(e) => updateScraper({ postedLimit: e.target.value })}
                  >
                    <option value="any">Any Time</option>
                    <option value="1h">Last Hour</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="week">Past Week</option>
                    <option value="month">Past Month</option>
                    <option value="3months">Past 3 Months</option>
                    <option value="6months">Past 6 Months</option>
                    <option value="year">Past Year</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    Custom Date Limit (Optional)
                    <Tooltip content="Scrape posts from now up to and including this date. It supports the Date time string format (e.g., 2024-01-01).">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.postedLimitDate}
                    onChange={(e) => updateScraper({ postedLimitDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    Sort By
                    <Tooltip content="Sort by 'relevance' or 'date'.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.sortBy}
                    onChange={(e) => updateScraper({ sortBy: e.target.value })}
                  >
                    <option value="date">Most Recent</option>
                    <option value="relevance">Relevance</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    Content Type
                    <Tooltip content="Filter posts by content type. For example, if you choose 'Videos', it will scrape only posts containing videos.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={formData.scraper.contentType}
                    onChange={(e) => updateScraper({ contentType: e.target.value })}
                  >
                    <option value="all">All Content</option>
                    <option value="jobs">Jobs</option>
                    <option value="images">Images</option>
                    <option value="videos">Videos</option>
                    <option value="live_videos">Live Videos</option>
                    <option value="documents">Documents</option>
                    <option value="collaborative_articles">Collaborative Articles</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    Pagination Strategy
                    <Tooltip content="Choose the page number to start from and the number of pages to scrape. Each page contains 100 posts.">
                      <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
                    </Tooltip>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Start"
                      className="w-1/2 px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      value={formData.scraper.startPage}
                      onChange={(e) => updateScraper({ startPage: parseInt(e.target.value) })}
                    />
                    <input
                      type="number"
                      placeholder="Pages"
                      className="w-1/2 px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      value={formData.scraper.scrapePages}
                      onChange={(e) => updateScraper({ scrapePages: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Targeting Filters */}
            <div className="space-y-6 pt-4 border-t border-zinc-100">
              <h3 className="text-[11px] font-bold text-zinc-900 flex items-center gap-2 mb-2">
                <FilterIcon className="w-3.5 h-3.5" />
                Targeting & Filters
              </h3>
              
              <div className="grid gap-6">
                <TagInput 
                  label="Author Keywords" 
                  description="Scrape posts of profile-authors whose profiles contain at least one of these keywords in the headline or job title sections."
                  value={formData.scraper.authorKeywords}
                  onChange={(val) => updateScraper({ authorKeywords: val })}
                  placeholder="e.g. Hiring, Recruiter, CTO"
                />

                <TagInput 
                  label="Profile or Company URLs" 
                  description="List of LinkedIn profile or company URLs to scrape. Example: https://www.linkedin.com/in/williamhgates will fetch posted or re-posted content by Bill Gates."
                  value={formData.scraper.authorUrls}
                  onChange={(val) => updateScraper({ authorUrls: val })}
                  placeholder="e.g. https://www.linkedin.com/in/..."
                />

                <TagInput 
                  label="Authors Industry IDs" 
                  description="Scrape posts of profile-authors who assigned to LinkedIn Industry IDs of these industries. Full list: https://github.com/HarvestAPI/linkedin-industry-codes-v2/blob/main/linkedin_industry_code_v2_all_eng.csv"
                  value={formData.scraper.authorsIndustryId}
                  onChange={(val) => updateScraper({ authorsIndustryId: val })}
                  placeholder="e.g. 96 (IT Services)"
                />

                <TagInput 
                  label="Mentioning Members" 
                  description="List of LinkedIn profile URLs of members mentioned in posts. Example: https://www.linkedin.com/in/williamhgates will fetch posts mentioning Bill Gates."
                  value={formData.scraper.mentioningMember}
                  onChange={(val) => updateScraper({ mentioningMember: val })}
                  placeholder="e.g. https://www.linkedin.com/in/member-name"
                />

                <TagInput 
                  label="Mentioning Companies" 
                  description="List of LinkedIn Company Names mentioned in posts. Example: https://www.linkedin.com/company/google will fetch posts mentioning Google."
                  value={formData.scraper.mentioningCompany}
                  onChange={(val) => updateScraper({ mentioningCompany: val })}
                  placeholder="e.g. https://www.linkedin.com/company/google"
                />
              </div>
            </div>

            {/* Detailed Scraping */}
            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <h3 className="text-[11px] font-bold text-zinc-900 flex items-center gap-2 mb-2">
                <SettingsIcon className="w-3.5 h-3.5" />
                Extended Data Collection
              </h3>
              
              <div className="grid gap-4">
                <div className="p-4 bg-zinc-50 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                        checked={formData.scraper.scrapeReactions}
                        onChange={(e) => updateScraper({ scrapeReactions: e.target.checked })}
                      />
                      <span className="text-xs font-semibold text-zinc-600 group-hover:text-zinc-900 transition-colors tracking-tight flex items-center gap-2">
                        Scrape Reactions
                        <Tooltip content="Enabling this will fetch authors and basic details of people who reacted to the posts.">
                          <Info className="w-3 h-3 text-zinc-300 cursor-help" />
                        </Tooltip>
                      </span>
                    </label>
                    {formData.scraper.scrapeReactions && (
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                          Max per post
                          <Tooltip content="Maximum number of reactions to scrape per post. Default is 5.">
                            <Info className="w-2.5 h-2.5 text-zinc-300 cursor-help" />
                          </Tooltip>
                        </label>
                        <input
                          type="number"
                          className="w-16 px-2 py-1 text-xs border border-zinc-200 rounded focus:outline-none"
                          value={formData.scraper.maxReactions}
                          onChange={(e) => updateScraper({ maxReactions: parseInt(e.target.value) })}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                        checked={formData.scraper.scrapeComments}
                        onChange={(e) => updateScraper({ scrapeComments: e.target.checked })}
                      />
                      <span className="text-xs font-semibold text-zinc-600 group-hover:text-zinc-900 transition-colors tracking-tight flex items-center gap-2">
                        Scrape Comments
                        <Tooltip content="Enabling this will fetch comment text and author details for each post.">
                          <Info className="w-3 h-3 text-zinc-300 cursor-help" />
                        </Tooltip>
                      </span>
                    </label>
                    {formData.scraper.scrapeComments && (
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                          Max per post
                          <Tooltip content="Maximum number of comments to scrape per post.">
                            <Info className="w-2.5 h-2.5 text-zinc-300 cursor-help" />
                          </Tooltip>
                        </label>
                        <input
                          type="number"
                          className="w-16 px-2 py-1 text-xs border border-zinc-200 rounded focus:outline-none"
                          value={formData.scraper.maxComments}
                          onChange={(e) => updateScraper({ maxComments: parseInt(e.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-1.5 border-t border-zinc-100">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                <Key className="w-3 h-3" />
                Apify API Token
                <Tooltip content="Your Apify platform personal API token, used to run the LinkedIn Scraper Actor.">
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
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">First Run</label>
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
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Second Run</label>
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
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              Copy-for-Claude Prompt
              <Tooltip content="This text is added before the post text when you click the Copy button on any post card. ">
                <Info className="w-3 h-3 text-zinc-300 cursor-help hover:text-zinc-500 transition-colors" />
              </Tooltip>
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all resize-y font-sans"
              value={formData.claudePrompt}
              onChange={(e) => setFormData({ ...formData, claudePrompt: e.target.value })}
            />
          </div>
        </section>

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
      </div>
    </div>
  );
};
