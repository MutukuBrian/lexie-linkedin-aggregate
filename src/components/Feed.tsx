import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getSupabase } from '../lib/supabase';
import { PostCard } from './PostCard';
import { Search, AlertCircle, Filter, LayoutGrid, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

type DateRange = 'today' | 'week' | 'month' | 'year' | 'all';

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: 'Last 24h', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'All', value: 'all' },
];

const getDateCutoff = (range: DateRange): Date | null => {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  if (range === 'year') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return null;
};

export const Feed: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const { settings, isConfigured, updateSettings } = useSettings();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('today');

  const [locationTerms, setLocationTerms] = useState<string[]>([]);
  const [excludeTerms, setExcludeTerms] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  const parseTerms = (val: unknown): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val as string[];
    try { const p = JSON.parse(val as string); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  // Load filters from Supabase on mount
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
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  const saveFilters = async (newLocation: string[], newExclude: string[]) => {
    updateSettings({ locationTerms: newLocation, excludeTerms: newExclude });
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    try {
      await supabase.from('scraper_settings_lexiecoon').upsert({
        id: '00000000-0000-0000-0000-000000000000',
        configs_name: 'default',
        is_active: true,
        location_terms: JSON.stringify(newLocation),
        exclude_terms: JSON.stringify(newExclude),
      });
    } catch (e) {
      console.error('Failed to save filters:', e);
    }
  };

  const fetchPosts = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!supabase) throw new Error('Could not initialize Supabase');
      const { data, error } = await supabase
        .from('linkedin_posts_lexiecoon')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPosts(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  useEffect(() => { fetchPosts(); }, [fetchPosts, refreshKey]);

  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const channel = supabase
      .channel('linkedin_posts_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'linkedin_posts_lexiecoon' },
        (payload) => setPosts(prev => [payload.new as any, ...prev])
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  // Client-side filtering
  const dateCutoff = getDateCutoff(dateRange);
  const filteredPosts = posts.filter(post => {
    const matchesSearch = !searchQuery ||
      post.post_content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.poster_name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (dateCutoff && post.created_at) {
      if (new Date(post.created_at) < dateCutoff) return false;
    }

    const combined = ((post.post_content || '') + ' ' + (post.author_info || '')).toLowerCase();
    const hasLocation = locationTerms.length === 0 || locationTerms.some(t => combined.includes(t.toLowerCase()));
    const isExcluded = excludeTerms.length > 0 && excludeTerms.some(t => combined.includes(t.toLowerCase()));
    return hasLocation && !isExcluded;
  });

  const activeFilterCount = locationTerms.length + excludeTerms.length;

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
      <div className="sticky top-4 z-10 bg-white/80 backdrop-blur-xl border border-zinc-200 rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter posts by keywords, role, or names..."
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

        {/* Date range pills */}
        <div className="flex items-center gap-1.5 px-4 pb-3">
          {DATE_RANGE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setDateRange(value)}
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
          <div className="border-t border-zinc-100 p-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
            {/* Show posts mentioning */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Show posts mentioning</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. new york, remote, hybrid..."
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLocationTerm()}
                  className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <button onClick={addLocationTerm} className="p-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-90 transition-all">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {locationTerms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {locationTerms.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full text-[11px] font-semibold text-blue-700">
                      {t}
                      <button onClick={() => removeLocationTerm(t)} className="hover:text-red-500 transition-colors ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Hide posts mentioning */}
            <div className="space-y-2 pt-3 border-t border-zinc-100">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Hide posts mentioning</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. software engineer, devops..."
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExcludeTerm()}
                  className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <button onClick={addExcludeTerm} className="p-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-90 transition-all">
                  <Plus className="w-4 h-4" />
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
            <p className="text-xs opacity-70 mt-0.5">Ensure your table name 'linkedin_posts_lexiecoon' is correct and accessible.</p>
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
        ) : filteredPosts.length > 0 ? (
          <div className="grid gap-6">
            {filteredPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 space-y-4">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-zinc-900 font-medium">No posts found</p>
              <p className="text-sm text-zinc-500">
                {searchQuery || activeFilterCount > 0 ? 'Try adjusting your filters.' : 'Your feed is currently empty.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-8 text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
        <div className="h-px bg-zinc-100 flex-1" />
        Displaying {filteredPosts.length} of {posts.length} Results
        <div className="h-px bg-zinc-100 flex-1" />
      </div>
    </div>
  );
};
