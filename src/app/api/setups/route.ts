import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const setups = await prisma.setup.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ setups });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Setup 名稱不能空白" }, { status: 400 });
  }
  const entryLogic =
    typeof body.entryLogic === "string" && body.entryLogic.trim()
      ? body.entryLogic.trim()
      : null;
  const economicRationale =
    typeof body.economicRationale === "string" &&
    body.economicRationale.trim()
      ? body.economicRationale.trim()
      : null;

  const setup = await prisma.setup.create({
    data: {
      userId: user.id,
      name,
      entryLogic,
      economicRationale,
      // 有填假設登記(經濟機制)才算「已登記」,才能進 Playbook 排行比較
      registeredAt: economicRationale ? new Date() : null,
    },
  });

  return NextResponse.json({ setup });
}
