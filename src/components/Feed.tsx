import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getSupabase } from '../lib/supabase';
import { PostCard } from './PostCard';
import { Search, AlertCircle, Filter, LayoutGrid, X, ChevronDown, ChevronUp, Zap, Eye } from 'lucide-react';
import { cn } from '../lib/utils';

type DateRange = 'today' | 'week' | 'month' | 'year' | 'all';

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: 'All', value: 'all' },
  { label: 'Last 24h', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
];

const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship'];
const SENIORITY_LEVEL_OPTIONS = ['Internship', 'Entry level', 'Associate', 'Mid-Senior level', 'Director', 'Executive'];

const FILTER_STORAGE_KEY = 'linkedin_feed_filters_v2';

// Parses LinkedIn's relative time strings (e.g. "3 weeks ago") to decide
// if a post falls within the selected filter bucket. Filters are inclusive:
// "Last 24h" ⊂ "Week" ⊂ "Month" ⊂ "Year" ⊂ "All".
const matchesTimePosted = (timePosted: string | null | undefined, range: DateRange): boolean => {
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

export const Feed: React.FC<{ refreshKey?: number; onJobsArrived?: () => void }> = ({ refreshKey = 0, onJobsArrived }) => {
  const { settings, isConfigured } = useSettings();
  const [jobs, setJobs] = useState<any[]>([]);
  const jobsArrivedFiredRef = useRef(false);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  // Structured filters
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<string[]>([]);
  const [easyApplyOnly, setEasyApplyOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [excludeTerms, setExcludeTerms] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState('');

  // Close filter panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filtersOpen && filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filtersOpen]);

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (p.dateRange) setDateRange(p.dateRange as DateRange);
        setEmploymentTypes(p.employmentTypes || []);
        setSeniorityLevels(p.seniorityLevels || []);
        setEasyApplyOnly(p.easyApplyOnly || false);
        setShowHidden(p.showHidden || false);
        setLocationFilter(p.locationFilter || '');
        setExcludeTerms(p.excludeTerms || []);
      }
    } catch {}
  }, []);

  const persistFilters = (patch: Partial<{
    dateRange: DateRange;
    employmentTypes: string[];
    seniorityLevels: string[];
    easyApplyOnly: boolean;
    showHidden: boolean;
    locationFilter: string;
    excludeTerms: string[];
  }>) => {
    const current = { dateRange, employmentTypes, seniorityLevels, easyApplyOnly, showHidden, locationFilter, excludeTerms, ...patch };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(current));
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

  const handleLocationChange = (val: string) => {
    setLocationFilter(val);
    persistFilters({ locationFilter: val });
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

  const handleApplied = (jobId: string, applied: boolean) =>
    setJobs(prev => prev.map(j => j.job_id === jobId ? { ...j, applied } : j));

  const handleHidden = (jobId: string, hidden: boolean) =>
    setJobs(prev => prev.map(j => j.job_id === jobId ? { ...j, hidden } : j));

  const addExcludeTerm = () => {
    const val = excludeInput.trim().toLowerCase();
    if (val && !excludeTerms.includes(val)) {
      const updated = [...excludeTerms, val];
      setExcludeTerms(updated);
      persistFilters({ excludeTerms: updated });
    }
    setExcludeInput('');
  };

  const removeExcludeTerm = (t: string) => {
    const updated = excludeTerms.filter(x => x !== t);
    setExcludeTerms(updated);
    persistFilters({ excludeTerms: updated });
  };

  const clearAllFilters = () => {
    setDateRange('all');
    setEmploymentTypes([]);
    setSeniorityLevels([]);
    setEasyApplyOnly(false);
    setShowHidden(false);
    setLocationFilter('');
    setExcludeTerms([]);
    localStorage.removeItem(FILTER_STORAGE_KEY);
  };

  const fetchJobs = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!supabase) throw new Error('Could not initialize Supabase');
      const { data, error } = await supabase
        .from('linkedin_jobs_lexiecoon')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setJobs(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  useEffect(() => {
    jobsArrivedFiredRef.current = false;
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const channel = supabase
      .channel('linkedin_jobs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'linkedin_jobs_lexiecoon' },
        (payload: { new: any }) => {
          setJobs(prev => [payload.new, ...prev]);
          if (!jobsArrivedFiredRef.current) {
            jobsArrivedFiredRef.current = true;
            onJobsArrived?.();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isConfigured, settings.supabaseUrl, settings.supabaseAnonKey]);

  // Client-side filtering
  const filteredJobs = jobs.filter(job => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hit = job.job_title?.toLowerCase().includes(q) ||
        job.company_name?.toLowerCase().includes(q) ||
        job.job_description?.toLowerCase().includes(q);
      if (!hit) return false;
    }

    if (!matchesTimePosted(job.time_posted, dateRange)) return false;

    if (easyApplyOnly && !job.easy_apply) return false;

    if (employmentTypes.length > 0) {
      const match = employmentTypes.some(t =>
        job.employment_type?.toLowerCase().includes(t.toLowerCase())
      );
      if (!match) return false;
    }

    if (seniorityLevels.length > 0) {
      const match = seniorityLevels.some(l =>
        job.seniority_level?.toLowerCase().includes(l.toLowerCase())
      );
      if (!match) return false;
    }

    if (locationFilter.trim() &&
      !job.location?.toLowerCase().includes(locationFilter.toLowerCase())) return false;

    if (excludeTerms.length > 0) {
      const combined = `${job.job_title || ''} ${job.job_description || ''} ${job.company_name || ''} ${job.location || ''}`.toLowerCase();
      if (excludeTerms.some(t => combined.includes(t))) return false;
    }

    if (!showHidden && job.hidden) return false;

    return true;
  });

  const hiddenCount = jobs.filter(j => j.hidden).length;

  const activeFilterCount =
    (easyApplyOnly ? 1 : 0) +
    (showHidden ? 1 : 0) +
    employmentTypes.length +
    seniorityLevels.length +
    (locationFilter.trim() ? 1 : 0) +
    excludeTerms.length;

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
              placeholder="Search by title, company, or keywords..."
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

            {/* Easy Apply + Show hidden + Clear row */}
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2 flex-wrap">
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

            {/* Employment Type */}
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

            {/* Seniority Level */}
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

            {/* Location */}
            <div className="space-y-2 pt-3 border-t border-zinc-100">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Location</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="e.g. New York, Remote, London..."
                  value={locationFilter}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                {locationFilter && (
                  <button
                    onClick={() => handleLocationChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Exclude keywords */}
            <div className="space-y-2 pt-3 border-t border-zinc-100">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Hide jobs containing</label>
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
            <p className="text-xs opacity-70 mt-0.5">Ensure your table 'linkedin_jobs_lexiecoon' is accessible.</p>
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
        ) : filteredJobs.length > 0 ? (
          <div className="grid gap-6">
            {filteredJobs.map((job) => (
              <PostCard
                key={job.job_id}
                post={job}
                onApplied={handleApplied}
                onHidden={handleHidden}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 space-y-4">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-zinc-900 font-medium">No jobs found</p>
              <p className="text-sm text-zinc-500">
                {searchQuery || activeFilterCount > 0 ? 'Try adjusting your filters.' : 'Your feed is currently empty.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-8 text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
        <div className="h-px bg-zinc-100 flex-1" />
        Displaying {filteredJobs.length} of {jobs.length} Results
        <div className="h-px bg-zinc-100 flex-1" />
      </div>
    </div>
  );
};
