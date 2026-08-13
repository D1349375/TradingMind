import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const existing = await prisma.setup.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "找不到這個 Setup" }, { status: 404 });
  }

  const data: {
    name?: string;
    entryLogic?: string | null;
    economicRationale?: string | null;
    registeredAt?: Date | null;
  } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Setup 名稱不能空白" }, { status: 400 });
    }
    data.name = name;
  }
  if ("entryLogic" in body) {
    data.entryLogic =
      typeof body.entryLogic === "string" && body.entryLogic.trim()
        ? body.entryLogic.trim()
        : null;
  }
  if ("economicRationale" in body) {
    const rationale =
      typeof body.economicRationale === "string" &&
      body.economicRationale.trim()
        ? body.economicRationale.trim()
        : null;
    data.economicRationale = rationale;
    // 有填才算已登記;第一次填入時記錄時間,清空則取消登記狀態
    if (rationale && !existing.registeredAt) {
      data.registeredAt = new Date();
    } else if (!rationale) {
      data.registeredAt = null;
    }
  }

  const setup = await prisma.setup.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ setup });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // Trade.setupId 是選填關聯,刪除 Setup 會讓引用它的交易自動變回未標記(SetNull)
  const result = await prisma.setup.deleteMany({
    where: { id: params.id, userId: user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "找不到這個 Setup" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
