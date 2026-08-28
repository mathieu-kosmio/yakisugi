import { createHash, createHmac } from "node:crypto";

const TOKEN_CONTEXT = "yakisugi-download-v1";

export function deriveDownloadToken(sessionId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${TOKEN_CONTEXT}:${sessionId}`)
    .digest("base64url");
}

export function hashDownloadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
