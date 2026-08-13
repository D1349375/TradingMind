import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FIELD_PRESETS, type PresetFieldType } from "@/lib/field-presets";

const VALID_TYPES: PresetFieldType[] = [
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "BOOLEAN",
  "NUMBER",
  "TEXT",
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const fields = await prisma.customFieldDefinition.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ fields });
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

  // 兩種來源:從欄位庫加入(帶 presetKey),或使用者自建
  let key: string;
  let label: string;
  let fieldType: PresetFieldType;
  let options: string[] | null = null;

  if (typeof body.presetKey === "string") {
    const preset = FIELD_PRESETS.find((p) => p.key === body.presetKey);
    if (!preset) {
      return NextResponse.json({ error: "找不到這個預設欄位" }, { status: 400 });
    }
    key = preset.key;
    label = preset.label;
    fieldType = preset.fieldType;
    options = preset.options ?? null;
  } else {
    label = typeof body.label === "string" ? body.label.trim() : "";
    const t = body.fieldType as PresetFieldType;
    if (!label) {
      return NextResponse.json({ error: "欄位名稱不能空白" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(t)) {
      return NextResponse.json({ error: "欄位型別不正確" }, { status: 400 });
    }
    fieldType = t;
    if (t === "SINGLE_SELECT" || t === "MULTI_SELECT") {
      const raw = Array.isArray(body.options) ? body.options : [];
      options = raw
        .map((o) => String(o).trim())
        .filter((o) => o.length > 0);
      if (options.length === 0) {
        return NextResponse.json(
          { error: "單選/多選欄位至少要有一個選項" },
          { status: 400 },
        );
      }
    }
    // 自建欄位用 custom_ 前綴,避免和未來新增的預設 key 撞名
    key = `custom_${Date.now().toString(36)}`;
  }

  const existing = await prisma.customFieldDefinition.findUnique({
    where: { userId_key: { userId: user.id, key } },
  });
  if (existing) {
    return NextResponse.json({ error: "這個欄位已經啟用了" }, { status: 409 });
  }

  const max = await prisma.customFieldDefinition.aggregate({
    where: { userId: user.id },
    _max: { sortOrder: true },
  });

  const field = await prisma.customFieldDefinition.create({
    data: {
      userId: user.id,
      key,
      label,
      fieldType,
      options: options ?? undefined,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json({ field });
}
