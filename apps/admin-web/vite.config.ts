import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '')

  return {
    envDir: '../..',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_PROJECT_URL': JSON.stringify(
        env.VITE_SUPABASE_PROJECT_URL || env.SUPABASE_PROJECT_URL || '',
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '',
      ),
    },
  }
})
