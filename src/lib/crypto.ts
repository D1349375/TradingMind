import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Bybit API 金鑰的加密儲存(規劃書 §5.3)。
// AES-256-GCM:除了加密,authTag 還能偵測密文被竄改。
//
// 儲存格式:iv.authTag.ciphertext,三段都是 base64url,用點分隔。
// 用 base64url 而不是 base64,避免 "/" "+" 在其他情境被誤解析。

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 建議 96-bit IV
const KEY_LENGTH = 32; // AES-256

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "缺少 ENCRYPTION_KEY 環境變數。產生方式:openssl rand -base64 32",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY 解碼後必須是 ${KEY_LENGTH} bytes,目前是 ${key.length} bytes`,
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("密文格式錯誤:應為 iv.authTag.ciphertext");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// 顯示用:只露出前後各幾碼,中間遮掉。絕不把完整金鑰送到前端。
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "*".repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${"*".repeat(6)}${apiKey.slice(-4)}`;
}

// 比對兩個字串時避免計時攻擊(之後驗證 webhook 之類的場景會用到)
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
