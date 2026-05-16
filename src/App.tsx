import { useState, useRef, useCallback } from 'react';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import { Feed, type ViewMode } from './components/Feed';
import { SettingsPanel } from './components/Settings';
import { Settings, Briefcase, RefreshCw, AlertCircle } from 'lucide-react';
import logo from './LOGO.png';
import { cn } from './lib/utils';
import { getSupabase } from './lib/supabase';

type Tab = 'feed' | 'settings';

function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const { settings } = useSettings();
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Called by Feed when the first realtime INSERT fires after a refresh.
  const onItemsArrived = useCallback(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    setRefreshing(false);
    setRefreshKey(k => k + 1);
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setWebhookError(null);

    try {
      const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!supabase) {
        setWebhookError('Supabase not configured — go to Settings first');
        setRefreshing(false);
        return;
      }

      const fireJobs  = viewMode === 'jobs'  || viewMode === 'all';
      const firePosts = viewMode === 'posts' || viewMode === 'all';

      const invocations: Promise<{ name: string; error: any }>[] = [];
      if (fireJobs) {
        invocations.push(
          supabase.functions.invoke('linkedin-refresh').then((res: { error: any }) => ({ name: 'jobs', error: res.error }))
        );
      }
      if (firePosts) {
        invocations.push(
          supabase.functions.invoke('linkedin-posts-refresh').then((res: { error: any }) => ({ name: 'posts', error: res.error }))
        );
      }

      const results = await Promise.allSettled(invocations);
      const failures: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.error) {
          failures.push(`${r.value.name}: ${r.value.error.message}`);
        } else if (r.status === 'rejected') {
          failures.push(String(r.reason));
        }
      }
      if (failures.length === results.length) {
        setWebhookError(`Refresh failed — ${failures.join(' | ')}`);
        setRefreshing(false);
        return;
      }
      if (failures.length > 0) {
        setWebhookError(`Partial failure — ${failures.join(' | ')}`);
      }
      // 202s received — scraping is running in background.
      // Keep the spinner going until Feed reports a realtime INSERT,
      // or until the 3-minute safety timeout fires.
      safetyTimerRef.current = setTimeout(() => {
        setRefreshing(false);
        setRefreshKey(k => k + 1);
      }, 180_000);
    } catch (e: any) {
      setWebhookError('Could not reach Edge Function — check Supabase project status');
      setRefreshing(false);
    }
  };

  const refreshLabel = refreshing
    ? viewMode === 'jobs' ? 'Scraping jobs...' : viewMode === 'posts' ? 'Scraping posts...' : 'Scraping...'
    : 'Refresh Feed';

  return (
    <div className="min-h-screen font-sans selection:bg-zinc-200" style={{ backgroundColor: '#F4F2EE' }}>
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-zinc-200 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-14 h-14 rounded-lg overflow-hidden">
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-5xl text-zinc-900 hidden sm:block" style={{ fontFamily: "'Petemoss', cursive" }}>
              Lexie
            </span>
          </div>

          <div className="flex items-center p-1 bg-zinc-100 rounded-xl">
            <button
              onClick={() => setActiveTab('feed')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300",
                activeTab === 'feed'
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5"
                  : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Feed
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300",
                activeTab === 'settings'
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5"
                  : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-all active:scale-[0.98] shadow-md"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)' }}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:block">{refreshLabel}</span>
          </button>
        </div>
      </nav>

      {/* Webhook error banner */}
      {webhookError && (
        <div className="max-w-4xl mx-auto mt-4 px-4">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {webhookError}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto min-h-[calc(100vh-73px)]">
        {activeTab === 'feed'
          ? <Feed refreshKey={refreshKey} onItemsArrived={onItemsArrived} viewMode={viewMode} onViewModeChange={setViewMode} />
          : <SettingsPanel />}
      </main>

    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <Dashboard />
      </ToastProvider>
    </SettingsProvider>
  );
}
