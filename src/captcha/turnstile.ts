import { config } from "../config.js";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function verifyTurnstileToken(token: string, remoteIp: string): Promise<boolean> {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: config.captcha.secretKey,
      response: token,
      remoteip: remoteIp,
    }),
  });

  if (!res.ok) {
    console.error("Turnstile verification request failed", res.status);
    return false;
  }

  const data = (await res.json()) as TurnstileVerifyResponse;
  if (!data.success) {
    console.error("Turnstile verification failed", data["error-codes"]);
  }
  return data.success;
}
