import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 排除靜態資源、圖片,以及不需要 auth 分流/session 更新的公開頁面
    // (terms/privacy 不在 PROTECTED_PREFIXES 或 AUTH_ROUTES 裡,原本每次
    // 造訪都白白多打一次 Supabase getUser() 網路往返)
    "/((?!_next/static|_next/image|favicon.ico|terms|privacy|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
