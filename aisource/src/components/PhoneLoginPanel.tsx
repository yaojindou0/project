"use client";

import { useState } from "react";
import { ExternalLink, KeyRound, Loader2, Smartphone } from "lucide-react";
import { maskPhone, type AuthPlatform } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";
import { readResponseJson } from "@/lib/safe-json";
import { uid } from "@/lib/id";
import { PASSPORT_CONFIG } from "@/lib/passport-config";
import { UPSTREAM_PATHS } from "@/lib/upstream-paths";
import type { JimengAccount } from "@/lib/types";

interface Props {
  onLoggedIn: (result: {
    platform: AuthPlatform;
    account?: JimengAccount | null;
    apiKey?: string;
  }) => void;
}

const PLATFORMS: { id: AuthPlatform; label: string; tip: string }[] = [
  {
    id: "doubao",
    label: "豆包",
    tip: "主通道 · 已注册手机号登录",
  },
  {
    id: "jimeng",
    label: "即梦",
    tip: "可选 · 默认不需要",
  },
  {
    id: "xyq",
    label: "小云雀",
    tip: "可选 · 默认不需要",
  },
];

function parseOfficialUrl(error: string): string | null {
  const m = error.match(/\|官网:(https?:\/\/\S+)/);
  return m?.[1] ?? null;
}

function cleanError(error: string) {
  return error.replace(/\s*\|官网:https?:\/\/\S+/, "").trim();
}

function extractSessionId(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  // 允许整段 Cookie：sessionid=xxx; sessionid_ss=xxx
  const m = t.match(/(?:^|[;\s])sessionid(?:_ss)?=([^;\s]+)/i);
  if (m?.[1]) return m[1].trim();
  // 纯 session 值
  if (!/[=;\s]/.test(t) && t.length >= 16) return t;
  return t.replace(/^sessionid(?:_ss)?=/i, "").split(/[;\s]/)[0].trim();
}

/** 若粘贴的是整段 Cookie，原样保留（视频技能更需要） */
function extractCookieHeader(raw: string, sessionId: string): string | undefined {
  const t = raw.trim();
  if (!t.includes("=") || !/;/.test(t)) return undefined;
  if (!/sessionid/i.test(t)) return undefined;
  // 确保含 sessionid
  if (!/(?:^|[;\s])sessionid=/i.test(t)) {
    return `sessionid=${sessionId}; sessionid_ss=${sessionId}; ${t}`;
  }
  return t;
}

export function PhoneLoginPanel({ onLoggedIn }: Props) {
  const [platform, setPlatform] = useState<AuthPlatform>("doubao");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [handoff, setHandoff] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [officialUrl, setOfficialUrl] = useState<string | null>(null);
  const [sessionPaste, setSessionPaste] = useState("");
  const [pasting, setPasting] = useState(false);

  const cfg = PASSPORT_CONFIG[platform];
  const preferPaste = platform === "jimeng" || platform === "xyq";

  async function sendCode() {
    setErr("");
    setMsg("");
    setOfficialUrl(null);
    setHandoff("");
    setSending(true);
    try {
      const res = await apiFetch(UPSTREAM_PATHS.authSendCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          phone,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok || data.ok === false) {
        const raw = String(data.error || "发送失败");
        const url =
          (typeof data.officialUrl === "string" && data.officialUrl) ||
          parseOfficialUrl(raw) ||
          (data.risk ? cfg.officialLoginUrl : null);
        if (url) setOfficialUrl(url);
        throw new Error(cleanError(raw));
      }
      if (data.handoff) setHandoff(String(data.handoff));
      setMsg(data.message || `验证码已发送至 ${maskPhone(phone)}`);
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "发送失败";
      setErr(message);
      if (!officialUrl && /滑块|风控|官网|验证码请求被官方拒绝/.test(message)) {
        setOfficialUrl(cfg.officialLoginUrl);
      }
    } finally {
      setSending(false);
    }
  }

  async function login() {
    setErr("");
    setMsg("");
    setOfficialUrl(null);
    setLogging(true);
    try {
      if (!handoff) {
        throw new Error("请先获取验证码，再登录（需保留同一次发码会话）");
      }
      const res = await apiFetch(UPSTREAM_PATHS.authLogin, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          phone,
          code,
          handoff,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok || data.ok === false) {
        const raw = String(data.error || "登录失败");
        setOfficialUrl(parseOfficialUrl(raw) || cfg.officialLoginUrl);
        throw new Error(cleanError(raw));
      }
      setMsg(data.message || "登录成功，额度已保存");
      setCode("");
      setHandoff("");
      onLoggedIn({
        platform,
        account: data.account,
        apiKey: data.apiKey,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "登录失败";
      setErr(message);
      if (/滑块|风控|官网/.test(message)) {
        setOfficialUrl(cfg.officialLoginUrl);
      }
    } finally {
      setLogging(false);
    }
  }

  async function savePastedSession() {
    setErr("");
    setMsg("");
    setOfficialUrl(null);
    setPasting(true);
    try {
      const sessionId = extractSessionId(sessionPaste);
      if (!sessionId || sessionId.length < 16) {
        throw new Error("请粘贴有效的 sessionid（可从浏览器 Cookie 复制）");
      }
      const cookieHeader = extractCookieHeader(sessionPaste, sessionId);

      const res = await apiFetch(UPSTREAM_PATHS.authCheckSession, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          sessionId,
          label: `${cfg.label} 粘贴`,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok || data.ok === false) {
        setOfficialUrl(cfg.officialLoginUrl);
        throw new Error(
          data.error ||
            "session 无效：请先在官网登录成功，再复制最新 sessionid",
        );
      }

      const account: JimengAccount = {
        id: uid("acc"),
        label: data.name
          ? `${cfg.label} · ${data.name}`
          : `${cfg.label} 官网粘贴`,
        sessionId,
        cookieHeader,
        region: "cn",
        platform,
        enabled: true,
        usedCount: 0,
        loginAt: new Date().toISOString(),
      };

      onLoggedIn({ platform, account });
      setSessionPaste("");
      setMsg(
        cookieHeader
          ? `${cfg.label} 整段 Cookie 已写入（视频更稳）。发码滑块可跳过。`
          : `${cfg.label} session 已写入（${data.message || "校验通过"}）。发码滑块可跳过。视频若失败请改粘贴浏览器整段 Cookie。`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写入失败");
    } finally {
      setPasting(false);
    }
  }

  return (
    <div className="surface space-y-4 rounded-xl p-6">
      <div>
        <h2 className="display flex items-center gap-2 text-lg font-semibold">
          <Smartphone size={18} className="text-cinnabar" />
          登录获取额度
        </h2>
        <p className="mt-1 text-xs text-muted">
          豆包可直接短信登录。即梦 / 小云雀官方发码几乎总会要求滑块，本站无法代过，请用下方「粘贴
          sessionid」。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPlatform(p.id);
              setErr("");
              setMsg("");
              setOfficialUrl(null);
            }}
            className={`rounded-lg border px-2 py-2.5 text-left transition-colors ${
              platform === p.id
                ? "border-teal bg-teal/10"
                : "border-[var(--line)] bg-white/70"
            }`}
          >
            <p className="text-sm font-semibold">{p.label}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted">{p.tip}</p>
          </button>
        ))}
      </div>

      {/* 推荐：粘贴 session —— 即梦/小云雀默认展开 */}
      <div
        className={`space-y-3 rounded-lg border p-3 ${
          preferPaste
            ? "border-teal/40 bg-teal/5"
            : "border-[var(--line)] bg-white/50"
        }`}
      >
        <div className="flex items-start gap-2">
          <KeyRound size={16} className="mt-0.5 shrink-0 text-teal" />
          <div>
            <p className="text-sm font-medium text-ink">
              {preferPaste ? "推荐：" : ""}官网登录后粘贴 sessionid
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              1. 打开{" "}
              <a
                href={cfg.officialLoginUrl}
                target="_blank"
                rel="noreferrer"
                className="text-teal underline underline-offset-2"
              >
                {cfg.label}官网
              </a>{" "}
              用手机号登录并完成滑块
              <br />
              2. 按 F12 → Application / 应用 → Cookies → 复制{" "}
              <code className="text-[10px]">sessionid</code>
              {platform === "doubao" ? (
                <>
                  {" "}
                  ，视频建议复制整段 Cookie（含 sessionid、ttwid 等）
                </>
              ) : null}
              <br />
              3. 粘贴到下方并点「校验并写入」
            </p>
          </div>
        </div>
        <textarea
          className="input-field min-h-[72px] resize-y font-mono text-xs"
          placeholder={
            platform === "doubao"
              ? "推荐粘贴整段 Cookie；也可只贴 sessionid"
              : "粘贴 sessionid，或整段 Cookie（含 sessionid=...）"
          }
          value={sessionPaste}
          onChange={(e) => setSessionPaste(e.target.value)}
        />
        <button
          type="button"
          disabled={pasting || !sessionPaste.trim()}
          onClick={savePastedSession}
          className="btn-primary w-full disabled:opacity-50"
        >
          {pasting ? <Loader2 size={16} className="animate-spin" /> : null}
          校验并写入 {cfg.label} 额度
        </button>
      </div>

      <details className="rounded-lg border border-[var(--line)] bg-white/50 p-3" open={!preferPaste}>
        <summary className="cursor-pointer text-sm font-medium">
          方式二：本站短信验证码登录
          {preferPaste ? "（即梦易被滑块拦截）" : ""}
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">手机号</label>
            <input
              className="input-field"
              inputMode="numeric"
              maxLength={11}
              placeholder="11 位已注册手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">短信验证码</label>
              <input
                className="input-field"
                inputMode="numeric"
                maxLength={8}
                placeholder="收到的验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={sending || cooldown > 0 || phone.length < 11}
              onClick={sendCode}
              className="mt-5 inline-flex min-w-[108px] items-center justify-center rounded-md border border-[var(--line)] bg-white px-3 text-xs font-medium disabled:opacity-50"
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : cooldown > 0 ? (
                `${cooldown}s`
              ) : (
                "获取验证码"
              )}
            </button>
          </div>

          <button
            type="button"
            disabled={logging || !phone || !code}
            onClick={login}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {logging ? <Loader2 size={16} className="animate-spin" /> : null}
            登录并写入额度
          </button>
        </div>
      </details>

      {msg ? <p className="text-xs text-teal">{msg}</p> : null}
      {err ? <p className="text-xs text-cinnabar">{err}</p> : null}
      {officialUrl ? (
        <a
          href={officialUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 rounded-lg border border-cinnabar/30 bg-cinnabar/5 px-3 py-2.5 text-xs leading-relaxed text-cinnabar transition-colors hover:bg-cinnabar/10"
        >
          <ExternalLink size={14} className="mt-0.5 shrink-0" />
          <span>
            官方要求滑块验证，本站无法代过。请打开
            <span className="font-medium underline underline-offset-2">
              {cfg.label}官网
            </span>
            登录成功后，把 Cookie 里的 sessionid 粘贴到上方写入。
          </span>
        </a>
      ) : null}
    </div>
  );
}
