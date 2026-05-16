import React, { createContext, useContext, useState, useEffect } from 'react';

interface PostsScraperConfig {
  apifyToken: string;
  maxPosts: number;
  postedLimit: string;        // 'any' | '1h' | '24h' | 'week' | 'month' | '3months' | '6months' | 'year'
  postedLimitDate: string;    // ISO date or ''
  sortBy: string;             // 'date' | 'relevance'
  contentType: string;        // 'all' | 'videos' | 'images' | 'jobs' | 'live_videos' | 'documents' | 'collaborative_articles'
  authorUrls: string[];
  authorsCompanies: string[];
  mentioningMember: string[];
  mentioningCompany: string[];
  authorsIndustryId: string[];
  authorKeywords: string;
  startPage: number;
  scrapePages: number;
  scrapeReactions: boolean;
  maxReactions: number;
  scrapeComments: boolean;
  maxComments: number;
}

interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  claudePrompt: string;
  keywords: string[];
  postKeywords: string[];
  locationTerms: string[];
  excludeTerms: string[];
  jobsScraperEnabled: boolean;
  postsScraperEnabled: boolean;
  scraper: {
    location: string;
    jobsEntries: number;
    companyNames: string[];
    experienceLevel: string;   // '' | '1'..'6'
    jobType: string;           // '' | 'F' | 'P' | 'C' | 'T' | 'V' | 'I' | 'O'
    workSchedule: string;      // '' | '1' | '2' | '3'
    jobPostTime: string;       // '' | 'r86400' | 'r604800' | 'r2592000'
    startJobs: number;
    apifyToken: string;
    scheduleHour1: number;
    scheduleHour2: number;
  };
  postsScraper: PostsScraperConfig;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isConfigured: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const defaultPostsScraper: PostsScraperConfig = {
  apifyToken: '',
  maxPosts: 10,
  postedLimit: '24h',
  postedLimitDate: '',
  sortBy: 'date',
  contentType: 'all',
  authorUrls: [],
  authorsCompanies: [],
  mentioningMember: [],
  mentioningCompany: [],
  authorsIndustryId: [],
  authorKeywords: '',
  startPage: 1,
  scrapePages: 1,
  scrapeReactions: false,
  maxReactions: 5,
  scrapeComments: false,
  maxComments: 10,
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    claudePrompt: "Please analyze this LinkedIn opportunity and create a tailored cover letter / outreach message for me based on my CV.",
    keywords: [],
    postKeywords: [],
    locationTerms: [],
    excludeTerms: [],
    jobsScraperEnabled: true,
    postsScraperEnabled: true,
    scraper: {
      location: '',
      jobsEntries: 100,
      companyNames: [],
      experienceLevel: '',
      jobType: '',
      workSchedule: '',
      jobPostTime: '',
      startJobs: 0,
      apifyToken: '',
      scheduleHour1: 12,
      scheduleHour2: 16,
    },
    postsScraper: defaultPostsScraper,
  });

  useEffect(() => {
    const saved = localStorage.getItem('linkedin_dashboard_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        setSettings(prev => ({
          ...prev,
          ...parsed,
          scraper: {
            ...prev.scraper,
            ...(parsed.scraper || {})
          },
          postsScraper: {
            ...prev.postsScraper,
            ...(parsed.postsScraper || {})
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
