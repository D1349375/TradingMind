import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DISCIPLINE_PRESETS, type DisciplinePresetKey } from "@/lib/discipline-presets";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const rules = await prisma.disciplineRule.findMany({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ rules });
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

  // 整包加入預設包:略過已存在同樣文字的規則,避免重複點擊造成重複項目
  if (typeof body.presetKey === "string") {
    const preset = DISCIPLINE_PRESETS[body.presetKey as DisciplinePresetKey];
    if (!preset) {
      return NextResponse.json({ error: "找不到這個規則包" }, { status: 400 });
    }
    const existing = await prisma.disciplineRule.findMany({
      where: { userId: user.id, active: true },
      select: { label: true },
    });
    const existingLabels = new Set(existing.map((r) => r.label));
    const toCreate = preset.rules.filter((r) => !existingLabels.has(r));

    if (toCreate.length > 0) {
      await prisma.disciplineRule.createMany({
        data: toCreate.map((label) => ({
          userId: user.id,
          label,
          presetPackId: body.presetKey as string,
        })),
      });
    }

    const rules = await prisma.disciplineRule.findMany({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ rules });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "規則內容不能空白" }, { status: 400 });
  }

  const rule = await prisma.disciplineRule.create({
    data: { userId: user.id, label },
  });
  return NextResponse.json({ rule });
}
