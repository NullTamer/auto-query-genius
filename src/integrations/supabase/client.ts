
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/custom/supabase-types';

const SUPABASE_URL = "https://lkevpnotoqmyeiasbeqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZXZwbm90b3FteWVpYXNiZXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxMTcwODAsImV4cCI6MjA1NTY5MzA4MH0.lq7GzdVJEA1LbVasQRDyz80CHjFuqXtrfpRWmaEGMu8";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
