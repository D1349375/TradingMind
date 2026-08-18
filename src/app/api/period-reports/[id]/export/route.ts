import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import { normalizePeriodReportResult, type PeriodReportResult } from "@/lib/period-report";
import { normalizePeriodStatsSnapshot, type PeriodStatsSnapshot } from "@/lib/period-stats";
import { buildPeriodReportDocx } from "@/lib/period-report-docx";

function fmtDate(d: Date) {
  return d.toLocaleDateString("zh-TW", { timeZone: "UTC" });
}

// 檔名專用日期格式——fmtDate 的 "2026/7/31" 帶斜線,Windows/macOS/Linux
// 都會把斜線當路徑分隔符,直接塞進檔名會被瀏覽器截斷或存成奇怪的路徑。
function fmtDateForFilename(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "UTC" }); // "2026-07-31"
}

// 下載週報/月報的 Word 版本。不扣 Credit——報告本身已經產生過並付費,
// 匯出只是換個檔案格式,不是重新生成內容。
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const report = await prisma.periodReport.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!report) return NextResponse.json({ error: "找不到這份報告" }, { status: 404 });

  const stats = normalizePeriodStatsSnapshot(
    report.statsSnapshot as unknown as Partial<PeriodStatsSnapshot>,
  );
  const result = normalizePeriodReportResult(
    report.result as unknown as Partial<PeriodReportResult>,
  );
  const personaLabel = PERSONAS[report.persona as PersonaKey]?.name ?? report.persona;

  const buffer = await buildPeriodReportDocx({
    periodType: report.periodType as "WEEK" | "MONTH",
    periodStartLabel: fmtDate(report.periodStart),
    periodEndLabel: fmtDate(report.periodEnd),
    personaLabel,
    result,
    stats,
  });

  const filename = `TradeMind_${report.periodType === "WEEK" ? "週報" : "月報"}_${fmtDateForFilename(report.periodStart)}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
