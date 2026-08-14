import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminClient, TRADE_IMAGES_BUCKET } from "@/lib/supabase/admin";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// bucket 私有,連結要能長期嵌在筆記裡不失效,用長天期簽名 URL(1 年)換取簡單——
// 不做每次讀取重新簽名的代理路由,那是之後真的需要才加的複雜度。
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const trade = await prisma.trade.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!trade) {
    return NextResponse.json({ error: "找不到這筆交易" }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "沒有收到圖片檔案" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "只接受 PNG/JPEG/WebP/GIF 圖片" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "圖片超過 5MB 上限" }, { status: 400 });
  }

  const ext = file.type.split("/")[1] ?? "png";
  const path = `${user.id}/${trade.id}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(TRADE_IMAGES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: `上傳失敗:${uploadError.message}` }, { status: 502 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(TRADE_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !signed) {
    return NextResponse.json({ error: "圖片已上傳但取得連結失敗" }, { status: 502 });
  }

  return NextResponse.json({ url: signed.signedUrl, path });
}
