import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://yxqjzyvlvwzzwdvljnrd.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_eD_GG4K8x6-srUAdDpiqdw_3eJ86Zr8'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
