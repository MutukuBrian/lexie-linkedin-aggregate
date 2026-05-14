import React, { createContext, useContext, useState, useEffect } from 'react';

interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  claudePrompt: string;
  keywords: string[];
  locationTerms: string[];
  excludeTerms: string[];
  scraper: {
    maxPosts: number;
    postedLimit: string;
    postedLimitDate: string;
    sortBy: string;
    contentType: string;
    authorUrls: string[];
    authorsCompanies: string[];
    mentioningMember: string[];
    mentioningCompany: string[];
    authorsIndustryId: string[];
    startPage: number;
    scrapePages: number;
    authorKeywords: string[];
    scrapeReactions: boolean;
    maxReactions: number;
    scrapeComments: boolean;
    maxComments: number;
    apifyToken: string;
    scheduleHour1: number;
    scheduleHour2: number;
  };
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isConfigured: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    claudePrompt: "Please analyze this LinkedIn post and create a good cover letter for me based on my CV.",
    keywords: [],
    locationTerms: [],
    excludeTerms: [],
    scraper: {
      maxPosts: 10,
      postedLimit: 'week',
      postedLimitDate: '',
      sortBy: 'date',
      contentType: 'all',
      authorUrls: [],
      authorsCompanies: [],
      mentioningMember: [],
      mentioningCompany: [],
      authorsIndustryId: [],
      startPage: 1,
      scrapePages: 1,
      authorKeywords: [],
      scrapeReactions: false,
      maxReactions: 5,
      scrapeComments: false,
      maxComments: 10,
      apifyToken: '',
      scheduleHour1: 12,
      scheduleHour2: 16,
    }
  });

  useEffect(() => {
    const saved = localStorage.getItem('linkedin_dashboard_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Handle migration: if scraper.authorKeywords is a string, convert it to array
        if (parsed.scraper && typeof parsed.scraper.authorKeywords === 'string') {
          parsed.scraper.authorKeywords = parsed.scraper.authorKeywords
            .split(',')
            .map((k: string) => k.trim())
            .filter(Boolean);
        }

        setSettings(prev => ({
          ...prev,
          ...parsed,
          // Deep merge the scraper object if it exists in parsed
          scraper: {
            ...prev.scraper,
            ...(parsed.scraper || {})
          }
        }));
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('linkedin_dashboard_settings', JSON.stringify(updated));
  };

  const isConfigured = Boolean(settings.supabaseUrl && settings.supabaseAnonKey);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isConfigured }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
