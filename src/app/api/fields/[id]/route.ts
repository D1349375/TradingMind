import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 停用欄位。CustomFieldValue 設了 onDelete: Cascade,所以既有的欄位值會一併刪除——
// 這是破壞性的,UI 端必須先跟使用者確認。
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const result = await prisma.customFieldDefinition.deleteMany({
    where: { id: params.id, userId: user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "找不到這個欄位" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// 目前只用於調整順序與改顯示名稱
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: { sortOrder?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const data: { sortOrder?: number; label?: string } = {};
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (typeof body.label === "string" && body.label.trim()) {
    data.label = body.label.trim();
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  const result = await prisma.customFieldDefinition.updateMany({
    where: { id: params.id, userId: user.id },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "找不到這個欄位" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
