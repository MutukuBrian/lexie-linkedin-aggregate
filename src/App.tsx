import { useState } from 'react';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import { Feed } from './components/Feed';
import { SettingsPanel } from './components/Settings';
import { Settings, Briefcase, RefreshCw, AlertCircle } from 'lucide-react';
import logo from './LOGO.png';
import { cn } from './lib/utils';

type Tab = 'feed' | 'settings';

const WEBHOOK_TIMEOUT_MS = 120_000; // 2 minutes

function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const { settings } = useSettings();

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setWebhookError(null);

    if (settings.n8nWebhookUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
        const res = await fetch(settings.n8nWebhookUrl, {
          method: 'POST',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          setWebhookError(`Webhook returned ${res.status} — feed not refreshed`);
          setRefreshing(false);
          return;
        }
      } catch (e: any) {
        const msg = e?.name === 'AbortError'
          ? 'Webhook timed out after 2 minutes'
          : 'Webhook unreachable — check your n8n URL or CORS settings';
        setWebhookError(msg);
        setRefreshing(false);
        return;
      }
    }

    setRefreshKey(k => k + 1);
    setRefreshing(false);
  };

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
            <span className="hidden sm:block">{refreshing ? 'Refreshing...' : 'Refresh Feed'}</span>
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
        {activeTab === 'feed' ? <Feed refreshKey={refreshKey} /> : <SettingsPanel />}
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
