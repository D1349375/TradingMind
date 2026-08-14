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

// Storage 的 list() 只列出當層,資料夾用 id === null 判斷(見上傳路由的
// `${userId}/${tradeId}/${uuid}.ext` 路徑慣例,要往下兩層才會列到檔案)。
// 帳號刪除時要清這個,因為 Postgres cascade 刪不到 Storage 裡的檔案。
export async function listAllStorageFiles(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const { data, error } = await admin.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const files: string[] = [];
  for (const entry of data) {
    const fullPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      files.push(...(await listAllStorageFiles(admin, bucket, fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

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
