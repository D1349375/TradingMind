import { createClient } from "@supabase/supabase-js";

// 只能在伺服器端用(API route/Server Component),絕不能被瀏覽器打包進去——
// service role key 繞過 RLS,等同資料庫最高權限。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const TRADE_IMAGES_BUCKET = "trade-images";

// 確保 bucket 存在,私有(不能公開網址直接存取,只能簽名 URL)。
// 冪等:bucket 已存在時 Supabase 回 409,直接吞掉。
export async function ensureTradeImagesBucket() {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(TRADE_IMAGES_BUCKET, {
    public: false,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}
