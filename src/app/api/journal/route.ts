import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 日期一律用 YYYY-MM-DD 字串當 key,由前端依「使用者本地時區」算出——
// 跟日曆/Dashboard 同一個理由,伺服器不知道使用者在哪個時區。
function parseDateKey(v: string | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00.000Z`);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const date = parseDateKey(new URL(request.url).searchParams.get("date"));
  if (!date) return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });

  const entry = await prisma.journalEntry.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });

  return NextResponse.json({
    preMarketPlan: entry?.preMarketPlan ?? "",
    postSessionReview: entry?.postSessionReview ?? "",
  });
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

  const date = parseDateKey(typeof body.date === "string" ? body.date : null);
  if (!date) return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });

  const preMarketPlan =
    typeof body.preMarketPlan === "string" ? body.preMarketPlan || null : undefined;
  const postSessionReview =
    typeof body.postSessionReview === "string"
      ? body.postSessionReview || null
      : undefined;

  await prisma.journalEntry.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: { preMarketPlan, postSessionReview },
    create: {
      userId: user.id,
      date,
      preMarketPlan: preMarketPlan ?? null,
      postSessionReview: postSessionReview ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
