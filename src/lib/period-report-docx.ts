import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from "docx";
import type { PeriodReportResult } from "@/lib/period-report";
import type { PeriodStatsSnapshot } from "@/lib/period-stats";

// 週期回顧報告匯出成 Word。刻意不用 Puppeteer 之類的無頭瀏覽器把頁面轉成
// PDF/docx——那類套件在 Netlify serverless function 上常踩大小/冷啟動
// 限制,`docx` 是純 JS 套件、無原生依賴,直接在 API route 產生二進位檔案
// 回傳給使用者下載,风险小很多。PDF 匯出改用瀏覽器原生列印(見
// globals.css 的 @media print 區塊),不是這個檔案的責任。
//
// 2026-08-17 視覺升級:使用者反饋純數字表格不夠「精美」。docx 沒有簡單的
// 點陣圖表 API,真的要嵌真圖需要 canvas/Puppeteer 之類的重依賴,違背前面
// 選 docx 套件時刻意避開 serverless 風險的理由——改用色塊(loss/profit
// 上色)+ Unicode 方塊字元畫的「文字長條圖」,零新依賴,Word/LibreOffice/
// Google Docs 開啟都能正常顯示,不需要任何圖片渲染引擎。

const TREND_LABEL: Record<string, string> = {
  IMPROVING: "進步中",
  STABLE: "持平",
  DECLINING: "下滑",
  NO_PRIOR_DATA: "尚無對照期間",
};

// 跟 globals.css 的淺色主題色票一致(Word 文件本身沒有深色模式概念,
// 固定用淺色配色)。
const COLOR = {
  accent: "2F6FED",
  accentSoft: "EAF0FE",
  profit: "0F7A56",
  loss: "B83C30",
  ink: "37352F",
  inkSecondary: "5C5A54",
  border: "D9D6CE",
  headerFill: "F4F2ED",
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;
const pctOrDash = (n: number | null, d = 1) => (n === null ? "—" : `${fmt(n, d)}%`);
const rOrDash = (n: number | null, d = 2) => (n === null ? "—" : `${fmt(n, d)}R`);

// Unicode 方塊字元畫的文字長條圖,value 是原始數字(可正可負,取絕對值畫
// 長度),maxAbs 是這組數列裡的最大絕對值(當作滿格基準)。
function barText(value: number, maxAbs: number, width = 14): string {
  if (maxAbs <= 0) return "░".repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((Math.abs(value) / maxAbs) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function h2(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } });
}

function body(text: string) {
  return new Paragraph({ children: [new TextRun({ text })], spacing: { after: 120 } });
}

function bullet(text: string) {
  return new Paragraph({ text: `• ${text}`, spacing: { after: 60 } });
}

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 2, color: COLOR.border },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: COLOR.border },
  left: { style: BorderStyle.SINGLE, size: 2, color: COLOR.border },
  right: { style: BorderStyle.SINGLE, size: 2, color: COLOR.border },
};

function cell(
  text: string,
  opts: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    color?: string;
    headerFill?: boolean;
  } = {},
) {
  return new TableCell({
    borders: CELL_BORDER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: opts.headerFill ? { fill: COLOR.headerFill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, bold: opts.bold, color: opts.color })],
      }),
    ],
  });
}

// 表格資料儲存格可以是純文字,也可以是「連色帶文字」(用在損益數字上,
// 賺紅字虧綠字?——不,這個app用profit=綠/loss=紅,跟design.md的P&L慣例
// 一致,不是股市紅漲綠跌那套)。
type CellValue = string | { text: string; color?: string };

function cellFromValue(v: CellValue) {
  return typeof v === "string" ? cell(v) : cell(v.text, { color: v.color });
}

// 損益數字轉成帶色的儲存格值,正值用profit色、負值用loss色。
function pnlValue(n: number, unit = "U", decimals = 2): CellValue {
  return { text: `${signed(n, decimals)}${unit}`, color: n >= 0 ? COLOR.profit : COLOR.loss };
}

function dataTable(headers: string[], rows: CellValue[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((h) => cell(h, { bold: true, headerFill: true })) }),
      ...rows.map((r) => new TableRow({ children: r.map(cellFromValue) })),
    ],
  });
}

export function buildPeriodReportDocx(opts: {
  periodType: "WEEK" | "MONTH";
  periodStartLabel: string;
  periodEndLabel: string;
  personaLabel: string;
  result: PeriodReportResult;
  stats: PeriodStatsSnapshot;
}): Promise<Buffer> {
  const { result, stats } = opts;
  const c = stats.current;
  const trendColor =
    result.trend === "IMPROVING" ? COLOR.profit : result.trend === "DECLINING" ? COLOR.loss : undefined;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      shading: { fill: COLOR.accentSoft, type: ShadingType.CLEAR, color: "auto" },
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `${opts.personaLabel} · ${opts.periodType === "WEEK" ? "週報" : "月報"}`,
          bold: true,
          color: COLOR.accent,
        }),
      ],
    }),
    new Paragraph({
      text: `${opts.periodStartLabel} – ${opts.periodEndLabel}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `「${result.signatureLine}」`, italics: true, size: 24 }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `— ${opts.personaLabel}`, color: COLOR.inkSecondary })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `趨勢:${TREND_LABEL[result.trend] ?? result.trend}`, bold: true, color: trendColor }),
      ],
      spacing: { after: 200 },
    }),
  ];

  if (stats.traderScore.overall !== null) {
    children.push(h2("綜合評分"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${stats.traderScore.overall} `, bold: true, size: 32, color: COLOR.accent }),
          new TextRun({ text: "/ 100", color: COLOR.inkSecondary }),
        ],
        spacing: { after: 100 },
      }),
    );
    const scoreRows: [string, number | null][] = [
      ["獲利能力", stats.traderScore.profitability.score],
      ["風險控管", stats.traderScore.riskControl.score],
      ["一致性", stats.traderScore.consistency.score],
      ["紀律", stats.traderScore.discipline.score],
    ];
    for (const [label, score] of scoreRows) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${label.padEnd(4, "　")} `, color: COLOR.inkSecondary }),
            new TextRun({
              text: score === null ? "無資料" : barText(score, 100),
              color: score === null ? COLOR.inkSecondary : COLOR.accent,
            }),
            new TextRun({ text: score === null ? "" : `  ${score}`, bold: true }),
          ],
          spacing: { after: 40 },
        }),
      );
    }
    if (stats.traderScore.sampleCaveat) {
      children.push(body(stats.traderScore.sampleCaveat));
    }
  }

  children.push(
    h2("期間摘要"),
    body(result.periodSummary),

    h2("教練筆記"),
    ...result.narrative.split("\n").filter(Boolean).map((p) => body(p)),

    h2("下一步"),
    body(result.nextAction),
  );

  if (result.dataGaps.length > 0) {
    children.push(h2("這次判斷缺少的資訊"));
    children.push(...result.dataGaps.map((g) => bullet(g)));
  }

  children.push(h2("數據總覽"));
  children.push(
    dataTable(
      ["總損益", "勝率", "獲利因子", "平均 R", "最大回撤", "總交易數"],
      [
        [
          pnlValue(c.totalPnl),
          pctOrDash(c.winRate),
          c.profitFactor === null ? "—" : fmt(c.profitFactor),
          rOrDash(c.avgR),
          pnlValue(c.maxDrawdown),
          String(c.tradeCount),
        ],
      ],
    ),
  );
  if (stats.prior) {
    children.push(
      body(
        `對照上一期:總損益 ${signed(stats.prior.totalPnl)}U${
          stats.prior.winRate !== null ? `,勝率 ${fmt(stats.prior.winRate, 1)}%` : ""
        } · 趨勢判定:${TREND_LABEL[stats.trend] ?? stats.trend}`,
      ),
    );
  } else {
    children.push(body("這是第一次追蹤到的期間,沒有上一期資料可以比較。"));
  }

  children.push(h2("紀律遵守率"));
  children.push(
    body(
      c.disciplineMarked === 0
        ? "這期沒有交易標記過紀律規則。"
        : `${fmt(c.disciplineRate ?? 0, 1)}%(已標記 ${c.disciplineMarked} 筆)`,
    ),
  );

  if (stats.dailySeries.length > 0) {
    children.push(h2("每日損益"));
    const maxAbs = Math.max(...stats.dailySeries.map((d) => Math.abs(d.pnl)), 0.01);
    children.push(
      dataTable(
        ["日期", "長條圖", "損益"],
        stats.dailySeries.map((d) => [
          d.date,
          { text: barText(d.pnl, maxAbs), color: d.pnl >= 0 ? COLOR.profit : COLOR.loss },
          pnlValue(d.pnl),
        ]),
      ),
    );
  }

  children.push(h2("Setup 排行"));
  if (stats.topSetups.length === 0) {
    children.push(body("這期沒有已標記 Setup 的交易。"));
  } else {
    children.push(
      dataTable(
        ["Setup", "損益", "筆數", "勝率"],
        stats.topSetups.map((s) => [s.name, pnlValue(s.pnl), String(s.n), pctOrDash(s.winRate, 0)]),
      ),
    );
  }

  children.push(h2("行為偵測"));
  children.push(
    dataTable(
      ["項目", "結果"],
      stats.behaviorAlerts.map((a) => [
        a.label,
        !a.enabled
          ? "未啟用"
          : !a.available
            ? (a.unavailableReason ?? "無法計算")
            : a.count === 0
              ? "沒有偵測到異常"
              : { text: `${a.count} 次${a.sample.length > 0 ? `(${a.sample.join("、")})` : ""}`, color: COLOR.loss },
      ]),
    ),
  );

  if (!stats.assetClassMixed) {
    children.push(h2("Wins vs Losses 對照"));
    if (stats.winLoss.win.n === 0 && stats.winLoss.loss.n === 0) {
      children.push(body("還沒有已平倉交易。"));
    } else {
      children.push(
        dataTable(
          ["", "贏的交易", "輸的交易"],
          [
            ["筆數", String(stats.winLoss.win.n), String(stats.winLoss.loss.n)],
            [
              "平均部位大小",
              stats.winLoss.win.avgPositionSize === null ? "—" : fmt(stats.winLoss.win.avgPositionSize),
              stats.winLoss.loss.avgPositionSize === null ? "—" : fmt(stats.winLoss.loss.avgPositionSize),
            ],
            [
              "平均槓桿",
              stats.winLoss.win.avgLeverage === null ? "—" : `${fmt(stats.winLoss.win.avgLeverage, 1)}x`,
              stats.winLoss.loss.avgLeverage === null ? "—" : `${fmt(stats.winLoss.loss.avgLeverage, 1)}x`,
            ],
            ["平均 R", rOrDash(stats.winLoss.win.avgR), rOrDash(stats.winLoss.loss.avgR)],
          ],
        ),
      );
    }
  }

  children.push(h2("依平倉小時分布"));
  if (stats.hourBreakdown.length === 0) {
    children.push(body("還沒有已平倉交易。"));
  } else {
    children.push(
      dataTable(
        ["時段", "筆數", "勝率", "損益"],
        stats.hourBreakdown.map((b) => [`${b.hour}時`, String(b.n), pctOrDash(b.winRate, 0), pnlValue(b.pnl)]),
      ),
    );
  }

  children.push(h2("風險調整報酬指標"));
  if (!stats.riskAdjusted.available) {
    children.push(body(stats.riskAdjusted.unavailableReason ?? "樣本不足,暫不顯示。"));
  } else {
    children.push(
      dataTable(
        ["Sharpe(年化)", "Sortino(年化)", "Calmar(年化)"],
        [
          [
            stats.riskAdjusted.sharpeAnnualized === null ? "—" : fmt(stats.riskAdjusted.sharpeAnnualized),
            stats.riskAdjusted.sortinoAnnualized === null ? "—" : fmt(stats.riskAdjusted.sortinoAnnualized),
            stats.riskAdjusted.calmarAnnualized === null ? "—" : fmt(stats.riskAdjusted.calmarAnnualized),
          ],
        ],
      ),
    );
    children.push(
      body(
        stats.riskAdjusted.usingCapitalReturns
          ? `以 ${stats.riskAdjusted.sampleDays} 個交易日、換算成帳戶總資金報酬率計算。`
          : `以 ${stats.riskAdjusted.sampleDays} 個交易日、金額本身(未設定帳戶總資金)計算——比率仍有效,但無法讀成年化百分比。`,
      ),
    );
  }

  if (!stats.assetClassMixed) {
    if (stats.positionSizeBuckets.length > 0) {
      children.push(h2("依部位大小分組"));
      children.push(
        dataTable(
          ["部位大小", "筆數", "勝率", "損益"],
          stats.positionSizeBuckets.map((b) => [b.rangeLabel, String(b.n), pctOrDash(b.winRate, 1), pnlValue(b.pnl)]),
        ),
      );
    }
    if (stats.leverageBuckets.length > 0) {
      children.push(h2("依槓桿分組"));
      children.push(
        dataTable(
          ["槓桿", "筆數", "勝率", "損益"],
          stats.leverageBuckets.map((b) => [b.rangeLabel, String(b.n), pctOrDash(b.winRate, 1), pnlValue(b.pnl)]),
        ),
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
