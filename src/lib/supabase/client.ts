import { createBrowserClient } from "@supabase/ssr";

// 瀏覽器端 Supabase client(只用 publishable/anon key,絕不放 secret key)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
