// Fill in with your Supabase project values.
// The anon key is meant to be public — RLS policies do the real protection.
window.SUPABASE_URL      = 'https://YOUR-PROJECT-REF.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-PUBLIC-ANON-KEY';

// Internal: every account is stored in Supabase Auth with this fake email
// domain so users only deal with a username. Don't change after launch
// unless you migrate existing rows.
window.WC26_EMAIL_DOMAIN = 'wc26.local';
