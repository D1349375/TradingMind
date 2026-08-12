import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 首頁目前不做行銷落地頁,直接依登入狀態分流。
// 之後要做對外的產品介紹頁時,再把這裡換成實際內容。
export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
