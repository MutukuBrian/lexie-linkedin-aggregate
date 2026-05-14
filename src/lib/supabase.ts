import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;
let lastUrl = '';
let lastKey = '';

export const getSupabase = (url: string, key: string) => {
  if (!url || !key) return null;
  
  if (supabaseInstance && url === lastUrl && key === lastKey) {
    return supabaseInstance;
  }

  lastUrl = url;
  lastKey = key;
  supabaseInstance = createClient(url, key);
  return supabaseInstance;
};
