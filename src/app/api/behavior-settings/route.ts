import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DETECTION_DEFS, type DetectionKind } from "@/lib/behavior-presets";

const VALID_KINDS = DETECTION_DEFS.map((d) => d.kind);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const rows = await prisma.behaviorDetectionSetting.findMany({
    where: { userId: user.id },
  });
  const byKind = new Map(rows.map((r) => [r.kind, r]));

  // 沒存過的偵測種類回傳預設值,不預先寫進 DB——使用者真的動過才落地
  const settings = DETECTION_DEFS.map((def) => {
    const row = byKind.get(def.kind);
    return {
      kind: def.kind,
      enabled: row?.enabled ?? def.defaultEnabled,
      threshold: (row?.threshold as Record<string, number> | null) ?? def.defaultThreshold,
    };
  });

  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const kind = body.kind as DetectionKind;
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "偵測種類不正確" }, { status: 400 });
  }
  const enabled = Boolean(body.enabled);
  const threshold =
    body.threshold && typeof body.threshold === "object"
      ? (body.threshold as Record<string, unknown>)
      : {};

  const cleanThreshold: Record<string, number> = {};
  for (const [k, v] of Object.entries(threshold)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) cleanThreshold[k] = n;
  }

  await prisma.behaviorDetectionSetting.upsert({
    where: { userId_kind: { userId: user.id, kind } },
    update: { enabled, threshold: cleanThreshold },
    create: { userId: user.id, kind, enabled, threshold: cleanThreshold },
  });

  return NextResponse.json({ ok: true });
}
