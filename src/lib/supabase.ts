import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;
let lastUrl = '';
let lastKey = '';

export const getSupabase = (url: string, key: string) => {
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();
  if (!trimmedUrl || !trimmedKey) return null;

  if (supabaseInstance && trimmedUrl === lastUrl && trimmedKey === lastKey) {
    return supabaseInstance;
  }

  lastUrl = trimmedUrl;
  lastKey = trimmedKey;
  supabaseInstance = createClient(trimmedUrl, trimmedKey);
  return supabaseInstance;
};
