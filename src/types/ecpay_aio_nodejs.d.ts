// 官方 SDK 沒有出 TypeScript 型別,這裡只描述我們實際會用到的表面,
// 其餘參數維持寬鬆(Record<string, unknown>)不逐一還原文件。
declare module "ecpay_aio_nodejs" {
  interface ECPayOptions {
    OperationMode: "Test" | "Production";
    MercProfile: { MerchantID: string; HashKey: string; HashIV: string };
    IgnorePayment: string[];
    IsProjectContractor: boolean;
  }

  class ECPayPayment {
    constructor(options: ECPayOptions);
    payment_client: {
      aio_check_out_all(
        parameters: Record<string, unknown>,
        invoice?: Record<string, unknown>,
      ): string;
      helper: {
        gen_chk_mac_value(params: Record<string, unknown>, mode?: number): string;
      };
    };
  }

  export = ECPayPayment;
}
