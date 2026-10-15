import crypto from "crypto";

const share =
  "https://www.doubao.com/video-sharing?source_type=mobile&share_id=58551969963638530&video_id=v0369cg10004db824la7dld7h97l7hr0";
const u = new URL(share);
const vid = u.searchParams.get("video_id");
console.log("vid", vid);

const res = await fetch("https://www.doubao.com/alice/resource/get_video_model", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    Origin: "https://www.doubao.com",
    Referer: share,
  },
  body: JSON.stringify({ params: [{ uri: vid }] }),
});
const json = await res.json();
console.log("code", json.code, json.msg);
const vmRaw = json?.data?.results?.[0]?.video_model_result?.video_model;
if (!vmRaw) {
  console.log(JSON.stringify(json).slice(0, 800));
  process.exit(1);
}
const vm = typeof vmRaw === "string" ? JSON.parse(vmRaw) : vmRaw;
console.log("keys", Object.keys(vm));
console.log("fallback_api", vm.fallback_api?.slice?.(0, 180));

function getNoWatermarkApi(fallbackApi) {
  const url = new URL(fallbackApi);
  url.searchParams.delete("force_fids");
  url.searchParams.delete("logo_type");
  url.searchParams.set("codec_type", "1");
  url.searchParams.set("logo_type", "unwatermarked");
  return url.toString();
}

const FPLAY_KDF_SALT = Buffer.from(
  "TdTC5rgxYgkOUrPHpnM7pByyRiuCmrWKGWs521cXdST0m69/COjWjSanLjfBqVovHwWlGJKu8pSXMrYqOKrdWA==",
  "base64",
);

function b64ToBytes(v) {
  const s = String(v || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(s + "=".repeat((4 - (s.length % 4)) % 4), "base64");
}

function decryptMainUrl(token, keySeed) {
  if (/^https?:\/\//i.test(token)) return token;
  try {
    const plain = Buffer.from(token, "base64").toString("utf8");
    if (/^https?:\/\//i.test(plain)) return plain;
  } catch {
    /* ignore */
  }
  const encrypted = b64ToBytes(token);
  const seed = b64ToBytes(keySeed);
  const ciphertext = encrypted.subarray(4);
  const firstHash = crypto.createHash("sha512").update(seed).digest();
  const keyMaterial = Buffer.concat([firstHash, FPLAY_KDF_SALT]);
  const derived = crypto.createHash("sha512").update(keyMaterial).digest();
  const key = derived.subarray(0, 16);
  const iv = derived.subarray(16, 32);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  let end = decrypted.length;
  const pad = decrypted[end - 1];
  if (pad >= 1 && pad <= 16) {
    end -= pad;
  }
  return decrypted.subarray(0, end).toString("utf8").trim();
}

const api = getNoWatermarkApi(vm.fallback_api);
console.log("api", api.slice(0, 200));
const r2 = await fetch(api, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.doubao.com/",
  },
});
const payload = await r2.json();
const data = payload?.video_info?.data || payload?.data || payload;
console.log("payload keys", Object.keys(payload || {}));
console.log("data keys", data && typeof data === "object" ? Object.keys(data) : data);
const keySeed = data?.key_seed || "";
const list = data?.video_list || {};
const first = list.video_1 || Object.values(list)[0];
console.log("entry keys", first && Object.keys(first));
const token = first?.main_url || first?.backup_url_1 || "";
console.log("token prefix", String(token).slice(0, 40));
try {
  const url = decryptMainUrl(token, keySeed);
  console.log("decoded", url.slice(0, 200));
} catch (e) {
  console.error("decrypt fail", e.message);
}
