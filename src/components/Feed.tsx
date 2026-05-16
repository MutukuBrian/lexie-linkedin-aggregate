import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getSupabase } from '../lib/supabase';
import { JobCard } from './JobCard';
import { PostCard } from './PostCard';
import { Search, AlertCircle, Filter, LayoutGrid, X, ChevronDown, ChevronUp, Zap, Eye, Briefcase, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';

type DateRange = 'today' | 'week' | 'month' | 'year' | 'all';
export type ViewMode = 'all' | 'posts' | 'jobs';

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: 'All', value: 'all' },
  { label: 'Last 24h', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
];

const VIEW_MODE_OPTIONS: { label: string; value: ViewMode; Icon: React.FC<{ className?: string }> }[] = [
  { label: 'All',   value: 'all',   Icon: LayoutGrid },
  { label: 'Posts', value: 'posts', Icon: MessageSquare },
  { label: 'Jobs',  value: 'jobs',  Icon: Briefcase },
];

const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship'];
const SENIORITY_LEVEL_OPTIONS = ['Internship', 'Entry level', 'Associate', 'Mid-Senior level', 'Director', 'Executive'];

const FILTER_STORAGE_KEY = 'linkedin_feed_filters_v2';

// Parse a DB value (JSON string or array) into a string array.
const parseTerms = (v: unknown): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  try { const p = JSON.parse(v as string); return Array.isArray(p) ? p : []; } catch { return []; }
};

// Parses LinkedIn's relative time strings (e.g. "3 weeks ago") for jobs feed.
const matchesJobTimePosted = (timePosted: string | null | undefined, range: DateRange): boolean => {
  if (range === 'all') return true;
  if (!timePosted) return true;
  const t = timePosted.toLowerCase();
  const hasRecent = t.includes('minute') || t.includes('just now') || t.includes('moment') || t.includes('second');
  const hasHour   = t.includes('hour');
  const hasDay    = t.includes('day');
  const hasWeek   = t.includes('week');
  const hasMonth  = t.includes('month');
  if (range === 'today') return hasRecent || hasHour;
  if (range === 'week')  return hasRecent || hasHour || hasDay;
  if (range === 'month') return hasRecent || hasHour || hasDay || hasWeek;
  if (range === 'year')  return hasRecent || hasHour || hasDay || hasWeek || hasMonth;
  return true;
};

// Posts table stores posted_at as a timestamptz — proper date math.
const matchesPostPostedAt = (postedAt: string | null | undefined, range: DateRange): boolean => {
  if (range === 'all') return true;
  if (!postedAt) return true;
  const ts = new Date(postedAt).getTime();
  if (Number.isNaN(ts)) return true;
  const now = Date.now();
  const diffMs = now - ts;
  const day = 86_400_000;
  if (range === 'today') return diffMs <= 1 * day;
  if (range === 'week')  return diffMs <= 7 * day;
  if (range === 'month') return diffMs <= 31 * day;
  if (range === 'year')  return diffMs <= 366 * day;
  return true;
};

interface FeedProps {
  refreshKey?: number;
  onItemsArrived?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export const Feed: React.FC<FeedProps> = ({ refreshKey = 0, onItemsArrived, viewMode, onViewModeChange }) => {
  const { settings, isConfigured, updateSettings } = useSettings();
  const [jobs, setJobs] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const itemsArrivedFiredRef = useRef(false);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<string[]>([]);
  const [easyApplyOnly, setEasyApplyOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // DB-backed array filters (OR logic) — loaded from scraper_settings_lexiecoon on mount
  const [locationTerms, setLocationTerms] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [excludeTerms, setExcludeTerms] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filtersOpen && filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filtersOpen]);

  // Load localStorage-only filters on mount (dateRange, viewMode, employmentTypes, etc.)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (p.dateRange) setDateRange(p.dateRange as DateRange);
        if (p.viewMode && p.viewMode !== viewMode) onViewModeChange(p.viewMode as ViewMode);
        setEmploymentTypes(p.employmentTypes || []);
        setSeniorityLevels(p.seniorityLevels || []);
        setEasyApplyOnly(p.easyApplyOnly || false);
        setShowHidden(p.showHidden || false);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load DB-backed filters (locationTerms, excludeTerms) from Supabase on mount
  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    supabase
      .from('scraper_settings_lexiecoon')
      .select('location_terms, exclude_terms')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const lt = parseTerms(data.location_terms);
        const et = parseTerms(data.exclude_terms);
        setLocationTerms(lt);
        setExcludeTerms(et);
        updateSettings({ locationTerms: lt, excludeTerms: et });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  // Persist locationTerms + excludeTerms to DB and context
  const saveFilters = useCallback(async (newLocation: string[], newExclude: string[]) => {
    updateSettings({ locationTerms: newLocation, excludeTerms: newExclude });
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    await supabase.from('scraper_settings_lexiecoon').upsert({
      id: '00000000-0000-0000-0000-000000000000',
      location_terms: JSON.stringify(newLocation),
      exclude_terms:  JSON.stringify(newExclude),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  // Persist localStorage-only filter state
  const persistFilters = (patch: Partial<{
    dateRange: DateRange;
    viewMode: ViewMode;
    employmentTypes: string[];
    seniorityLevels: string[];
    easyApplyOnly: boolean;
    showHidden: boolean;
  }>) => {
    const current = { dateRange, viewMode, employmentTypes, seniorityLevels, easyApplyOnly, showHidden, ...patch };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(current));
  };

  const handleViewModeChange = (m: ViewMode) => {
    onViewModeChange(m);
    persistFilters({ viewMode: m });
  };

  const toggleEmploymentType = (type: string) => {
    const updated = employmentTypes.includes(type)
      ? employmentTypes.filter(t => t !== type)
      : [...employmentTypes, type];
    setEmploymentTypes(updated);
    persistFilters({ employmentTypes: updated });
  };

  const toggleSeniorityLevel = (level: string) => {
    const updated = seniorityLevels.includes(level)
      ? seniorityLevels.filter(l => l !== level)
      : [...seniorityLevels, level];
    setSeniorityLevels(updated);
    persistFilters({ seniorityLevels: updated });
  };

  const handleEasyApplyToggle = () => {
    const updated = !easyApplyOnly;
    setEasyApplyOnly(updated);
    persistFilters({ easyApplyOnly: updated });
  };

  const handleShowHiddenToggle = () => {
    const updated = !showHidden;
    setShowHidden(updated);
    persistFilters({ showHidden: updated });
  };

  const handleJobApplied = (jobId: string, applied: boolean) =>
    setJobs(prev => prev.map(j => j.job_id === jobId ? { ...j, applied } : j));

  const handleJobHidden = (jobId: string, hidden: boolean) =>
    setJobs(prev => prev.map(j => j.job_id === jobId ? { ...j, hidden } : j));

  const handlePostSaved = (postId: string, saved: boolean) =>
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, saved } : p));

  const handlePostHidden = (postId: string, hidden: boolean) =>
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, hidden } : p));

  // Location terms — DB-backed, OR logic
  const addLocationTerm = () => {
    const val = locationInput.trim().toLowerCase();
    if (val && !locationTerms.includes(val)) {
      const updated = [...locationTerms, val];
      setLocationTerms(updated);
      saveFilters(updated, excludeTerms);
    }
    setLocationInput('');
  };

  const removeLocationTerm = (t: string) => {
    const updated = locationTerms.filter(x => x !== t);
    setLocationTerms(updated);
    saveFilters(updated, excludeTerms);
  };

  // Exclude terms — DB-backed
  const addExcludeTerm = () => {
    const val = excludeInput.trim().toLowerCase();
    if (val && !excludeTerms.includes(val)) {
      const updated = [...excludeTerms, val];
      setExcludeTerms(updated);
      saveFilters(locationTerms, updated);
    }
    setExcludeInput('');
  };

  const removeExcludeTerm = (t: string) => {
    const updated = excludeTerms.filter(x => x !== t);
    setExcludeTerms(updated);
    saveFilters(locationTerms, updated);
  };

  const clearAllFilters = () => {
    setDateRange('all');
    setEmploymentTypes([]);
    setSeniorityLevels([]);
    setEasyApplyOnly(false);
    setShowHidden(false);
    setLocationTerms([]);
    setExcludeTerms([]);
    saveFilters([], []);
    localStorage.removeItem(FILTER_STORAGE_KEY);
  };

  const fetchData = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!supabase) throw new Error('Could not initialize Supabase');

      const needsJobs  = viewMode === 'jobs'  || viewMode === 'all';
      const needsPosts = viewMode === 'posts' || viewMode === 'all';

      const [jobsRes, postsRes] = await Promise.all([
        needsJobs
          ? supabase.from('linkedin_jobs_lexiecoon').select('*').order('created_at', { ascending: false })
          : Promise.resolve({ data: jobs, error: null } as any),
        needsPosts
          ? supabase.from('linkedin_posts_lexiecoon').select('*').order('created_at', { ascending: false })
          : Promise.resolve({ data: posts, error: null } as any),
      ]);

      if (needsJobs) {
        if (jobsRes.error) throw jobsRes.error;
        setJobs(jobsRes.data || []);
      }
      if (needsPosts) {
        if (postsRes.error) {
          if ((postsRes.error as any).code === '42P01') {
            setPosts([]);
            console.warn('linkedin_posts_lexiecoon table missing — run the posts migration.');
          } else {
            throw postsRes.error;
          }
        } else {
          setPosts(postsRes.data || []);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch feed');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey, viewMode]);

  useEffect(() => {
    itemsArrivedFiredRef.current = false;
    fetchData();
  }, [fetchData, refreshKey]);

  // Realtime: jobs
  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const channel = supabase
      .channel('linkedin_jobs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'linkedin_jobs_lexiecoon' },
        (payload: { new: any }) => {
          setJobs(prev => [payload.new, ...prev]);
          if (!itemsArrivedFiredRef.current) {
            itemsArrivedFiredRef.current = true;
            onItemsArrived?.();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  // Realtime: posts
  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const channel = supabase
      .channel('linkedin_posts_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'linkedin_posts_lexiecoon' },
        (payload: { new: any }) => {
          setPosts(prev => [payload.new, ...prev]);
          if (!itemsArrivedFiredRef.current) {
            itemsArrivedFiredRef.current = true;
            onItemsArrived?.();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  // ── Filtering ──
  const lowerQuery = searchQuery.toLowerCase();
  const lowerExclude = excludeTerms.map(t => t.toLowerCase());
  const lowerLocation = locationTerms.map(t => t.toLowerCase());

  const filteredJobs = jobs.filter(job => {
    if (searchQuery) {
      const hit = job.job_title?.toLowerCase().includes(lowerQuery) ||
        job.company_name?.toLowerCase().includes(lowerQuery) ||
        job.job_description?.toLowerCase().includes(lowerQuery);
      if (!hit) return false;
    }
    if (!matchesJobTimePosted(job.time_posted, dateRange)) return false;
    if (easyApplyOnly && !job.easy_apply) return false;
    if (employmentTypes.length > 0) {
      if (!employmentTypes.some(t => job.employment_type?.toLowerCase().includes(t.toLowerCase()))) return false;
    }
    if (seniorityLevels.length > 0) {
      if (!seniorityLevels.some(l => job.seniority_level?.toLowerCase().includes(l.toLowerCase()))) return false;
    }
    // Location terms: OR logic — job must mention at least one term across location/title/description/company
    if (lowerLocation.length > 0) {
      const combined = `${job.location || ''} ${job.job_title || ''} ${job.job_description || ''} ${job.company_name || ''}`.toLowerCase();
      if (!lowerLocation.some(t => combined.includes(t))) return false;
    }
    // Exclude terms: job is removed if it mentions any excluded term
    if (lowerExclude.length > 0) {
      const combined = `${job.job_title || ''} ${job.job_description || ''} ${job.company_name || ''} ${job.location || ''}`.toLowerCase();
      if (lowerExclude.some(t => combined.includes(t))) return false;
    }
    if (!showHidden && job.hidden) return false;
    return true;
  });

  const filteredPosts = posts.filter(post => {
    if (searchQuery) {
      const hit = post.content?.toLowerCase().includes(lowerQuery) ||
        post.poster_name?.toLowerCase().includes(lowerQuery) ||
        post.author_info?.toLowerCase().includes(lowerQuery);
      if (!hit) return false;
    }
    if (!matchesPostPostedAt(post.posted_at, dateRange)) return false;
    // Location terms: OR logic — post must mention at least one term in content or author info
    if (lowerLocation.length > 0) {
      const combined = `${post.content || ''} ${post.author_info || ''}`.toLowerCase();
      if (!lowerLocation.some(t => combined.includes(t))) return false;
    }
    // Exclude terms: post is removed if it mentions any excluded term
    if (lowerExclude.length > 0) {
      const combined = `${post.content || ''} ${post.poster_name || ''} ${post.author_info || ''}`.toLowerCase();
      if (lowerExclude.some(t => combined.includes(t))) return false;
    }
    if (!showHidden && post.hidden) return false;
    return true;
  });

  // ── Combined list per viewMode ──
  type FeedItem =
    | { kind: 'job';  ts: number; data: any }
    | { kind: 'post'; ts: number; data: any };

  const tsOf = (s: string | null | undefined) => {
    if (!s) return 0;
    const n = new Date(s).getTime();
    return Number.isNaN(n) ? 0 : n;
  };

  let items: FeedItem[] = [];
  if (viewMode === 'jobs') {
    items = filteredJobs.map(j => ({ kind: 'job' as const, ts: tsOf(j.created_at), data: j }));
  } else if (viewMode === 'posts') {
    items = filteredPosts.map(p => ({ kind: 'post' as const, ts: tsOf(p.created_at), data: p }));
  } else {
    items = [
      ...filteredJobs.map(j => ({ kind: 'job'  as const, ts: tsOf(j.created_at), data: j })),
      ...filteredPosts.map(p => ({ kind: 'post' as const, ts: tsOf(p.created_at), data: p })),
    ].sort((a, b) => b.ts - a.ts);
  }

  const totalRaw = viewMode === 'jobs' ? jobs.length : viewMode === 'posts' ? posts.length : jobs.length + posts.length;
  const hiddenCount = viewMode === 'jobs'
    ? jobs.filter(j => j.hidden).length
    : viewMode === 'posts'
    ? posts.filter(p => p.hidden).length
    : jobs.filter(j => j.hidden).length + posts.filter(p => p.hidden).length;

  const activeFilterCount =
    (easyApplyOnly ? 1 : 0) +
    (showHidden ? 1 : 0) +
    employmentTypes.length +
    seniorityLevels.length +
    locationTerms.length +
    excludeTerms.length;

  const showJobOnlyFilters = viewMode === 'jobs' || viewMode === 'all';

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
          <Filter className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-medium text-zinc-900 tracking-tight">Configuration Required</h2>
          <p className="text-sm text-zinc-500 max-w-xs mx-auto">
            Please head over to the settings tab to configure your Supabase credentials to view the feed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
      {/* Search + Filter bar */}
      <div ref={filterBarRef} className="sticky top-4 z-10 bg-white/80 backdrop-blur-xl border border-zinc-200 rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by title, content, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:bg-white transition-all shadow-inner"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all whitespace-nowrap",
              filtersOpen || activeFilterCount > 0
                ? "bg-zinc-900 text-white border-transparent"
                : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300"
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", filtersOpen ? "bg-white/20" : "bg-zinc-700 text-white")}>
                {activeFilterCount}
              </span>
            )}
            {filtersOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* View mode segmented control */}
        <div className="flex items-center gap-1.5 px-4 pb-2">
          <div className="flex items-center p-0.5 bg-zinc-100 rounded-lg">
            {VIEW_MODE_OPTIONS.map(({ label, value, Icon }) => (
              <button
                key={value}
                onClick={() => handleViewModeChange(value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all",
                  viewMode === value
                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5"
                    : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range pills */}
        <div className="flex items-center gap-1.5 px-4 pb-3">
          {DATE_RANGE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setDateRange(value); persistFilters({ dateRange: value }); }}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-semibold border transition-all",
                dateRange === value
                  ? "bg-zinc-900 text-white border-transparent"
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filtersOpen && (
          <div className="border-t border-zinc-100 p-4 space-y-5 animate-in slide-in-from-top-1 duration-200">

            {/* Easy Apply (jobs only) + Show hidden + Clear row */}
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {showJobOnlyFilters && (
                  <button
                    onClick={handleEasyApplyToggle}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all",
                      easyApplyOnly
                        ? "bg-green-600 text-white border-transparent"
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Easy Apply only
                  </button>
                )}
                <button
                  onClick={handleShowHiddenToggle}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all",
                    showHidden
                      ? "bg-amber-500 text-white border-transparent"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300"
                  )}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Show hidden{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
                </button>
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-[11px] font-semibold text-zinc-400 hover:text-red-500 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>

            {/* Employment Type (jobs only) */}
            {showJobOnlyFilters && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Employment Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMPLOYMENT_TYPE_OPTIONS.map(type => (
                    <button
                      key={type}
                      onClick={() => toggleEmploymentType(type)}
                      className={cn(
                        "px-3 py-1 rounded-full text-[11px] font-semibold border transition-all",
                        employmentTypes.includes(type)
                          ? "bg-blue-600 text-white border-transparent"
                          : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seniority Level (jobs only) */}
            {showJobOnlyFilters && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Seniority Level</label>
                <div className="flex flex-wrap gap-1.5">
                  {SENIORITY_LEVEL_OPTIONS.map(level => (
                    <button
                      key={level}
                      onClick={() => toggleSeniorityLevel(level)}
                      className={cn(
                        "px-3 py-1 rounded-full text-[11px] font-semibold border transition-all",
                        seniorityLevels.includes(level)
                          ? "bg-violet-600 text-white border-transparent"
                          : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700"
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Location terms — DB-backed chip list, OR logic */}
            <div className="space-y-2 pt-3 border-t border-zinc-100">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Show only — mentioning any of
              </label>
              <p className="text-[10px] text-zinc-400">
                Items must contain at least one of these terms. Works across jobs (location, title, description) and posts (content, author info).
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. New York, remote, hiring..."
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLocationTerm()}
                  className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <button
                  onClick={addLocationTerm}
                  className="px-3 py-1.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 active:scale-90 transition-all"
                >
                  Add
                </button>
              </div>
              {locationTerms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {locationTerms.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full text-[11px] font-semibold text-blue-700">
                      {t}
                      <button onClick={() => removeLocationTerm(t)} className="hover:text-blue-500 transition-colors ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Exclude keywords — DB-backed chip list */}
            <div className="space-y-2 pt-3 border-t border-zinc-100">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Hide items containing</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. unpaid, commission only, senior..."
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExcludeTerm()}
                  className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <button
                  onClick={addExcludeTerm}
                  className="px-3 py-1.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 active:scale-90 transition-all"
                >
                  Add
                </button>
              </div>
              {excludeTerms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {excludeTerms.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-100 rounded-full text-[11px] font-semibold text-red-700">
                      {t}
                      <button onClick={() => removeExcludeTerm(t)} className="hover:text-red-500 transition-colors ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center gap-3 animate-in shake duration-500">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            Error: {error}
            <p className="text-xs opacity-70 mt-0.5">Ensure your tables 'linkedin_jobs_lexiecoon' and 'linkedin_posts_lexiecoon' are accessible.</p>
          </div>
        </div>
      )}

      {/* Feed Content */}
      <div className="space-y-6">
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-zinc-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="grid gap-6">
            {items.map((item) => item.kind === 'job' ? (
              <JobCard
                key={`job-${item.data.job_id}`}
                job={item.data}
                onApplied={handleJobApplied}
                onHidden={handleJobHidden}
              />
            ) : (
              <PostCard
                key={`post-${item.data.id}`}
                post={item.data}
                onSaved={handlePostSaved}
                onHidden={handlePostHidden}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 space-y-4">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-zinc-900 font-medium">
                No {viewMode === 'posts' ? 'posts' : viewMode === 'jobs' ? 'jobs' : 'items'} found
              </p>
              <p className="text-sm text-zinc-500">
                {searchQuery || activeFilterCount > 0 ? 'Try adjusting your filters.' : 'Your feed is currently empty.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-8 text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
        <div className="h-px bg-zinc-100 flex-1" />
        Displaying {items.length} of {totalRaw} Results
        <div className="h-px bg-zinc-100 flex-1" />
      </div>
    </div>
  );
};
