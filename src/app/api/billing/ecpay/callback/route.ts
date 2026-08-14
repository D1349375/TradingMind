import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEcpayCallback } from "@/lib/ecpay";

// 綠界的 ReturnURL——伺服器對伺服器呼叫,沒有登入 cookie,身分驗證靠
// CheckMacValue(等同綠界簽章)而不是 session。
//
// 綠界規定一定要回傳純文字 "1|OK",格式不對或不是 200 會被視為失敗,
// 之後會重打(最多重試一段時間)。不管處理結果如何,只要驗簽通過就回
// "1|OK",驗簽失敗才回別的內容讓它重試(可能是我們這邊一時性錯誤)。
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    fields[key] = String(value);
  }

  if (!verifyEcpayCallback(fields)) {
    console.error("[ecpay-callback] CheckMacValue 驗證失敗", fields);
    return new Response("0|CheckMacValue Error", { status: 400 });
  }

  const merchantTradeNo = fields.MerchantTradeNo;
  const order = await prisma.creditPurchase.findUnique({
    where: { merchantTradeNo },
  });
  if (!order) {
    console.error("[ecpay-callback] 找不到對應訂單", merchantTradeNo);
    // 驗簽是通過的,只是我們這邊真的沒這筆單——回 1|OK 讓它別再重打。
    return new Response("1|OK");
  }

  // 已經處理過(綠界重送/我們自己重複收到)就直接回應,不要重複加值。
  if (order.status !== "PENDING") {
    return new Response("1|OK");
  }

  const succeeded = fields.RtnCode === "1";

  if (!succeeded) {
    await prisma.creditPurchase.update({
      where: { merchantTradeNo },
      data: { status: "FAILED" },
    });
    return new Response("1|OK");
  }

  // Credit 數量/金額一律用建單當下存的值,不信任 callback 帶來的金額——
  // 避免有人竄改 callback 內容偽造大額加值。
  await prisma.$transaction([
    prisma.creditPurchase.update({
      where: { merchantTradeNo },
      data: {
        status: "PAID",
        ecpayTradeNo: fields.TradeNo ?? null,
        paymentType: fields.PaymentType ?? null,
        paidAt: new Date(),
      },
    }),
    // 正常情況下 CreditBalance 一定已經存在(登入時就會 upsert 出來),
    // create 分支只是防禦性寫法,不假設任何既有餘額。
    prisma.creditBalance.upsert({
      where: { userId: order.userId },
      update: {
        balance: { increment: order.creditAmount },
        totalEarned: { increment: order.creditAmount },
      },
      create: {
        userId: order.userId,
        balance: order.creditAmount,
        totalEarned: order.creditAmount,
      },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: order.userId,
        amount: order.creditAmount,
        reason: `ecpay_purchase:${merchantTradeNo}`,
      },
    }),
  ]);

  return new Response("1|OK");
}
