import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigError =
  !url || !anonKey ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env' : null

export const supabase: SupabaseClient | null = !supabaseConfigError ? createClient(url!, anonKey!) : null
