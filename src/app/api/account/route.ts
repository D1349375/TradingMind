import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  listAllStorageFiles,
  TRADE_IMAGES_BUCKET,
} from "@/lib/supabase/admin";

// 刪帳號要求打字輸入自己的 Email 再送出——比單純按確認鍵更難誤觸,
// 也不用另外設計一個要記住的確認詞。
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const confirmEmail = body?.confirmEmail as string | undefined;
  if (confirmEmail !== user.email) {
    return NextResponse.json({ error: "確認信箱不吻合" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 交易截圖存在 Storage,Postgres 的 cascade 刪不到,要先手動清掉
  const files = await listAllStorageFiles(admin, TRADE_IMAGES_BUCKET, user.id);
  if (files.length > 0) {
    await admin.storage.from(TRADE_IMAGES_BUCKET).remove(files);
  }

  // Trade/Goal/CustomFieldDefinition/DisciplineRule 等關聯表都設了
  // onDelete: Cascade,刪這筆 User 就會連帶清掉所有關聯資料
  await prisma.user.delete({ where: { id: user.id } });

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    // Postgres 端已經刪乾淨了,Auth 端刪除失敗不該讓使用者以為沒刪成功——
    // 記錄下來供之後手動清,仍回傳成功。
    console.error(
      "Failed to delete Supabase auth user after DB deletion",
      user.id,
      authDeleteError,
    );
  }

  const supabase = createClient();
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
