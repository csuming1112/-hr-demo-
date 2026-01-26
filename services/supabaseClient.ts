
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://appsiipugpaifyhgkyid.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HcllETgvJxKJ-XHe92JTsg_Q8RbPHVo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
