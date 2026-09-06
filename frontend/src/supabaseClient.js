import { createClient } from "@supabase/supabase-js";

// Replace these with your actual values from Supabase → Settings → API Keys
const supabaseUrl = "https://gfephsdvnsxmzdxjjtnt.supabase.co";
const supabaseAnonKey = "sb_publishable_DHo0Av2XVs65Sx6jgUhUFQ_ocPTC49B";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);