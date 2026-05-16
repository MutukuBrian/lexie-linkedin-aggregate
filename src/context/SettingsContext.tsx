import React, { createContext, useContext, useState, useEffect } from 'react';

interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  claudePrompt: string;
  keywords: string[];
  locationTerms: string[];
  excludeTerms: string[];
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
    claudePrompt: "Please analyze this LinkedIn job posting and create a tailored cover letter for me based on my CV.",
    keywords: [],
    locationTerms: [],
    excludeTerms: [],
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
    }
  });

  useEffect(() => {
    const saved = localStorage.getItem('linkedin_dashboard_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

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
