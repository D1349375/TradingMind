// Bybit「已實現盈虧」CSV 匯出檔解析。格式依真實匯出檔案逐欄核對過
// (2026-08-14,檔名 Bybit-AllPerp-ClosedPNL-*.csv):
//
//   Market,Order Quantity,Entry Price,Exit Price,Opening Fee,Closing Fee,
//   Funding Fee,cumClosedPzOpenFeeInfo,cumClosedPzTradeFeeInfo,Trade Type,
//   Realized P&L,Trade time
//
// 這份 CSV **沒有方向欄位**(不像 API 的 closed-pnl 有 side),也沒有唯一
// 訂單 ID。方向用「代入多/空公式哪個比較接近 Realized P&L」反推——
// 已經用真實資料手算驗證過(SHORT 案例誤差在浮點精度內完全吻合),
// 不是憑空猜的公式。沒有訂單 ID 的部分,匯入時改用「同商品+同平倉時間
// +同進出場價+同損益」四項一致才視為重複,見 import 那支 API route。

export type CsvRow = {
  symbol: string;
  direction: "LONG" | "SHORT";
  positionSize: number;
  entryPrice: number;
  exitPrice: number;
  fee: number; // 開倉+平倉手續費,不含資金費率(跟 API 同步的 fee 語意一致)
  realizedPnl: number;
  closedAt: Date;
};

export type CsvParseResult = {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
};

const REQUIRED_COLUMNS = [
  "Market",
  "Order Quantity",
  "Entry Price",
  "Exit Price",
  "Opening Fee",
  "Closing Fee",
  "Funding Fee",
  "Realized P&L",
  "Trade time",
];

// 陽春但正確的 CSV 單行解析:處理雙引號包欄位、欄位內逗號、`""` 轉義引號。
// 不外掛套件——欄位規則單純,自己刻可控又不用多一個依賴。
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// "Trade time" 格式是 "HH:MM YYYY-MM-DD",沒有時區資訊——是 Bybit 帳號
// 顯示時區(使用者自己在 Bybit 設定的),不是 UTC,所以要由使用者指定
// UTC 偏移量,不能瞎猜。
function parseTradeTime(raw: string, utcOffsetMinutes: number): Date | null {
  const m = raw.trim().match(/^(\d{2}):(\d{2})\s+(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, hh, mm, yyyy, mo, dd] = m;
  // 先當成 UTC 組出時間戳,再扣掉使用者指定的偏移,換算回真正的 UTC 時刻
  const asUtc = Date.UTC(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh), Number(mm));
  return new Date(asUtc - utcOffsetMinutes * 60000);
}

function toNum(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// 用多/空兩種公式反推方向:哪個算出來的損益比較接近 CSV 給的
// Realized P&L,就是哪個方向。已用真實資料驗證(見檔案開頭註解)。
function inferDirection(
  entryPrice: number,
  exitPrice: number,
  qty: number,
  openFee: number,
  closeFee: number,
  fundingFee: number,
  realizedPnl: number,
): "LONG" | "SHORT" {
  const longPnl = (exitPrice - entryPrice) * qty - openFee - closeFee - fundingFee;
  const shortPnl = (entryPrice - exitPrice) * qty - openFee - closeFee - fundingFee;
  const longDiff = Math.abs(longPnl - realizedPnl);
  const shortDiff = Math.abs(shortPnl - realizedPnl);
  return shortDiff < longDiff ? "SHORT" : "LONG";
}

export function parseBybitCsv(text: string, utcOffsetMinutes: number): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows: CsvRow[] = [];
  const errors: { line: number; message: string }[] = [];

  if (lines.length === 0) {
    return { rows, errors: [{ line: 0, message: "檔案是空的" }] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) idx[col] = header.indexOf(col);

  const missing = REQUIRED_COLUMNS.filter((c) => idx[c] === -1);
  if (missing.length > 0) {
    return {
      rows,
      errors: [{ line: 1, message: `找不到欄位:${missing.join("、")}——這份檔案的格式跟預期的 Bybit 匯出格式不一樣` }],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = parseCsvLine(lines[i]);
    try {
      const symbol = cells[idx["Market"]]?.trim();
      const qty = toNum(cells[idx["Order Quantity"]]);
      const entryPrice = toNum(cells[idx["Entry Price"]]);
      const exitPrice = toNum(cells[idx["Exit Price"]]);
      const openFee = toNum(cells[idx["Opening Fee"]]);
      const closeFee = toNum(cells[idx["Closing Fee"]]);
      const fundingFee = toNum(cells[idx["Funding Fee"]]);
      const realizedPnl = toNum(cells[idx["Realized P&L"]]);
      const closedAt = parseTradeTime(cells[idx["Trade time"]], utcOffsetMinutes);

      if (!symbol) throw new Error("商品名稱是空的");
      if (qty === null || qty <= 0) throw new Error("倉位數量不是有效數字");
      if (entryPrice === null || exitPrice === null) throw new Error("入場/出場價不是有效數字");
      if (openFee === null || closeFee === null || fundingFee === null) throw new Error("手續費欄位不是有效數字");
      if (realizedPnl === null) throw new Error("已實現損益不是有效數字");
      if (!closedAt) throw new Error("平倉時間格式不符預期(應為 HH:MM YYYY-MM-DD)");

      const direction = inferDirection(entryPrice, exitPrice, qty, openFee, closeFee, fundingFee, realizedPnl);

      rows.push({
        symbol,
        direction,
        positionSize: qty,
        entryPrice,
        exitPrice,
        fee: openFee + closeFee,
        realizedPnl,
        closedAt,
      });
    } catch (err) {
      errors.push({ line: lineNo, message: err instanceof Error ? err.message : "解析失敗" });
    }
  }

  return { rows, errors };
}
