import type { ApiSettings } from "./types";
import { hasDoubaoScriptAuth } from "./doubao-content";

export async function falSubscribe<T>(
  model: string,
  input: Record<string, unknown>,
  falKey: string,
): Promise<T> {
  const submitRes = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`fal submit failed: ${submitRes.status} ${text}`);
  }

  const submitted = (await submitRes.json()) as {
    request_id: string;
    status_url?: string;
    response_url?: string;
  };

  const statusUrl =
    submitted.status_url ||
    `https://queue.fal.run/${model}/requests/${submitted.request_id}/status`;
  const responseUrl =
    submitted.response_url ||
    `https://queue.fal.run/${model}/requests/${submitted.request_id}`;

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as { status: string };
    if (status.status === "COMPLETED") {
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${falKey}` },
      });
      if (!resultRes.ok) {
        throw new Error(`fal result failed: ${resultRes.status}`);
      }
      return (await resultRes.json()) as T;
    }
    if (status.status === "FAILED") {
      throw new Error("fal generation failed");
    }
  }
  throw new Error("fal generation timeout");
}

/** @deprecated 请用 doubao-content.callChatJson */
export async function callChatJson<T>(
  settings: Pick<ApiSettings, "llmBaseUrl" | "llmApiKey" | "llmModel">,
  system: string,
  user: string,
): Promise<T> {
  const { callChatJson: doubaoChat } = await import("./doubao-content");
  const result = await doubaoChat<T>(
    settings as ApiSettings,
    system,
    user,
  );
  return result.data;
}

export function shouldUseMock(settings: ApiSettings) {
  if (settings.useMock) return true;
  return !hasDoubaoScriptAuth(settings);
}
