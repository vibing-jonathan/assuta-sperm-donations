import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(projectUrl && publishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null
