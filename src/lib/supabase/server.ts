import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / Route Handler 用的 client。
// Server Component 不能寫 cookie,所以 setAll 的例外要吞掉——
// session 更新由 middleware 負責(見 src/middleware.ts)。
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 從 Server Component 呼叫時會落到這裡,可安全忽略
          }
        },
      },
    },
  );
}
