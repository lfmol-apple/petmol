import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

const isSupabaseUrlValid = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !supabaseUrl.includes('example.supabase.co');
const isSupabaseKeyValid = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && supabaseAnonKey !== 'public-anon-key';

export const isSupabaseConfigured = isSupabaseUrlValid && isSupabaseKeyValid;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
