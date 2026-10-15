"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Loader2,
  Trash2,
  Upload,
  Wifi,
} from "lucide-react";
import { PhoneLoginPanel } from "@/components/PhoneLoginPanel";
import {
  buildAccessPack,
  downloadAccessPack,
  mergeAccessPack,
  readAccessPackFile,
} from "@/lib/access-pack";
import { maskPhone } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";
import { readResponseJson } from "@/lib/safe-json";
import { applyProviderPreset } from "@/lib/provider-status";
import {
  hasDoubaoWebSession,
  resolveActiveAccountId,
  withActiveAccount,
} from "@/lib/doubao-session";
import { loadSettings, saveSettings } from "@/lib/store";
import { UPSTREAM_PATHS } from "@/lib/upstream-paths";
import {
  DEFAULT_SETTINGS,
  PROVIDER_PRESETS,
  type ApiSettings,
  type JimengAccount,
  type ProviderPresetId,
  type VideoProvider,
} from "@/lib/types";

function platformLabel(p: JimengAccount["platform"]) {
  if (p === "doubao") return "豆包";
  if (p === "jimeng") return "即梦";
  if (p === "xyq") return "小云雀";
  return "通用";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<ApiSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<Record<string, string>>({});
  const [packMsg, setPackMsg] = useState("");
  const [packBusy, setPackBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function exportAccessConfig() {
    try {
      const pack = buildAccessPack(settings);
      if (!pack.accounts.length) {
        setPackMsg("尚无已登录账号可导出");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadAccessPack(`jingxu-access-${stamp}`, pack);
      setPackMsg(
        `已导出 ${pack.accounts.length} 个账号及接入配置（含 session / Cookie / Key）`,
      );
    } catch (e) {
      setPackMsg(e instanceof Error ? e.message : "导出失败");
    }
  }

  async function importAccessConfig(
    file: File,
    mode: "merge" | "replace",
  ) {
    setPackBusy(true);
    setPackMsg("");
    try {
      const parsed = await readAccessPackFile(file);
      const next = mergeAccessPack(settings, parsed, mode);
      commit(next, true);
      setPackMsg(
        mode === "replace"
          ? `已覆盖导入 ${parsed.accounts.length} 个账号及接入配置`
          : `已合并导入 ${parsed.accounts.length} 个账号及接入配置`,
      );
    } catch (e) {
      setPackMsg(e instanceof Error ? e.message : "导入失败");
    } finally {
      setPackBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function update<K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function commit(next: ApiSettings, markSaved = false) {
    setSettings(next);
    if (markSaved) {
      saveSettings(next);
      setSaved(true);
    } else {
      setSaved(false);
    }
  }

  function switchProvider(kind: ProviderPresetId) {
    setSettings((prev) => applyProviderPreset(prev, kind));
    setSaved(false);
  }

  function onProviderSelect(value: VideoProvider) {
    if (value === "doubao" || value === "jimeng" || value === "xyq") {
      switchProvider(value);
      return;
    }
    update("videoProvider", value);
  }

  function toggleFallback(p: VideoProvider) {
    const list = settings.fallbackProviders || [];
    if (list.includes(p)) {
      update(
        "fallbackProviders",
        list.filter((x) => x !== p),
      );
    } else {
      update("fallbackProviders", [...list, p]);
    }
  }

  function patchAccount(id: string, patch: Partial<JimengAccount>) {
    update(
      "jimengAccounts",
      settings.jimengAccounts.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    );
  }

  function selectActiveAccount(id: string) {
    const acc = settings.jimengAccounts.find((a) => a.id === id);
    if (!acc) return;
    // 换号：加载该账号自己的聊天窗，不串用其他账号对话
    let next = withActiveAccount(settings, id);
    if (acc.platform === "doubao") next = applyProviderPreset(next, "doubao");
    else if (acc.platform === "jimeng") next = applyProviderPreset(next, "jimeng");
    else if (acc.platform === "xyq") next = applyProviderPreset(next, "xyq");
    commit(next, true);
  }

  function removeAccount(id: string) {
    const acc = settings.jimengAccounts.find((a) => a.id === id);
    let next: ApiSettings = {
      ...settings,
      jimengAccounts: settings.jimengAccounts.filter((a) => a.id !== id),
    };
    if (settings.activeAccountId === id) {
      const nextId = resolveActiveAccountId(next) || "";
      next = nextId ? withActiveAccount(next, nextId) : { ...next, activeAccountId: "", doubaoConversationId: "" };
      const nextActive = next.jimengAccounts.find(
        (a) => a.id === next.activeAccountId,
      );
      if (nextActive?.platform === "doubao") {
        next = applyProviderPreset(next, "doubao");
      } else if (nextActive?.platform === "jimeng") {
        next = applyProviderPreset(next, "jimeng");
      } else if (nextActive?.platform === "xyq") {
        next = applyProviderPreset(next, "xyq");
      }
    }
    if (acc?.platform === "doubao") {
      const stillDoubao = next.jimengAccounts.some((a) => a.platform === "doubao");
      if (!stillDoubao) next = { ...next, doubaoApiKey: "" };
    }
    commit(next, true);
  }

  function onSave() {
    saveSettings(settings);
    setSaved(true);
  }

  async function checkAccount(acc: JimengAccount) {
    setCheckingId(acc.id);
    setCheckMsg((m) => ({ ...m, [acc.id]: "检测中…" }));
    try {
      const platform =
        acc.platform === "doubao" ||
        acc.platform === "jimeng" ||
        acc.platform === "xyq"
          ? acc.platform
          : settings.videoProvider === "xyq"
            ? "xyq"
            : "jimeng";

      const res = await apiFetch(UPSTREAM_PATHS.authCheckSession, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          sessionId: acc.sessionId,
          label: acc.label,
        }),
      });
      const data = await readResponseJson(res);
      setCheckMsg((m) => ({
        ...m,
        [acc.id]: data.ok
          ? data.message || "已注册登录有效"
          : data.error || "检测失败",
      }));
      if (!data.ok) {
        patchAccount(acc.id, { lastError: data.error });
      } else {
        patchAccount(acc.id, {
          lastError: undefined,
          cooldownUntil: undefined,
        });
      }
    } catch (e) {
      setCheckMsg((m) => ({
        ...m,
        [acc.id]: e instanceof Error ? e.message : "检测失败",
      }));
    } finally {
      setCheckingId(null);
    }
  }

  const primary = PROVIDER_PRESETS.doubao;
  const auxiliaries = [PROVIDER_PRESETS.jimeng, PROVIDER_PRESETS.xyq];
  const doubaoLoggedIn =
    hasDoubaoWebSession(settings) ||
    settings.jimengAccounts.some(
      (a) => a.platform === "doubao" && Boolean(a.sessionId?.trim()),
    );

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-8">
        <p className="mb-2 text-xs tracking-[0.25em] text-teal uppercase">
          Settings
        </p>
        <h1 className="display text-3xl font-semibold">接入设置</h1>
        <p className="mt-2 text-sm text-muted">
          <span className="text-teal">全部走线上豆包</span>
          （本机只需前端）。用已注册手机号登录豆包获取 session；生图为
          Seedream 4.5。即梦 / 小云雀代理为可选，默认不需要。
        </p>
      </div>

      <div className="space-y-5">
        <div className="surface space-y-5 rounded-xl p-6">
          <div>
            <label className="mb-1 block text-xs tracking-wider text-muted">
              自建服务根（可选；默认直连原线上接口）
            </label>
            <input
              className="input-field font-mono text-xs"
              placeholder="留空=豆包/方舟原线上；填写则走自建 jingxu-web"
              value={settings.apiBaseUrl || ""}
              onChange={(e) => update("apiBaseUrl", e.target.value.trim())}
            />
            <p className="mt-1 text-[11px] text-muted">
              默认在线：www.doubao.com、ark.cn-beijing.volces.com、passport。填根地址后改走自建代理同名原路径。也可改
              config.js。
            </p>
          </div>

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">离线演示 Mock</span>
              <span className="text-xs text-muted">
                默认关闭（在线版）。开启后用样例素材，不请求原线上接口
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.useMock}
              onChange={(e) => update("useMock", e.target.checked)}
              className="h-4 w-4 accent-[var(--teal)]"
            />
          </label>

          <div>
            <label className="mb-2 block text-xs tracking-wider text-muted">
              主通道
            </label>
            <button
              type="button"
              onClick={() => switchProvider("doubao")}
              className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                settings.videoProvider === "doubao"
                  ? "border-teal bg-teal/10"
                  : "border-[var(--line)] bg-white/70 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold">{primary.label}</p>
                <span className="rounded bg-cinnabar/15 px-2 py-0.5 text-[10px] font-medium text-cinnabar">
                  主 · 线上
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                分镜 / Seedream 4.5 生图 / Seedance 视频 · 本机无需代理
              </p>
              <p className="mt-2 font-mono text-[10px] text-teal">
                {primary.apiBase}
              </p>
            </button>
          </div>

          <details className="rounded-lg border border-[var(--line)] bg-white/40 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted">
              高级：辅助通道与本地代理（默认不需要）
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {auxiliaries.map((preset) => {
                  const active = settings.videoProvider === preset.videoProvider;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => switchProvider(preset.id)}
                      className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                        active
                          ? "border-teal bg-teal/10"
                          : "border-[var(--line)] bg-white/70 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold">{preset.label}</p>
                        <span className="text-[10px] text-muted">辅</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">
                        需自建兼容代理，本机仅前端时可忽略
                      </p>
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--line)] bg-white/50 px-3 py-3">
                <span>
                  <span className="block text-sm font-medium">
                    主通道失败自动回退辅助
                  </span>
                  <span className="text-xs text-muted">
                    需本机已启动代理；默认关闭
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.autoFallback}
                  onChange={(e) => update("autoFallback", e.target.checked)}
                  className="h-4 w-4 accent-[var(--teal)]"
                />
              </label>

              {settings.autoFallback ? (
                <div className="flex flex-wrap gap-3 text-xs">
                  {(["jimeng", "xyq"] as const).map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-1.5 text-muted"
                    >
                      <input
                        type="checkbox"
                        checked={(settings.fallbackProviders || []).includes(p)}
                        onChange={() => toggleFallback(p)}
                        className="accent-[var(--teal)]"
                      />
                      {p === "jimeng" ? "回退即梦" : "回退小云雀"}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </details>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">
                默认模型档位
              </label>
              <select
                className="input-field"
                value={settings.seedanceVariant}
                onChange={(e) =>
                  update(
                    "seedanceVariant",
                    e.target.value as ApiSettings["seedanceVariant"],
                  )
                }
              >
                <option value="mini">Seedance 2.0 Mini</option>
                <option value="fast">Seedance 2.0 Fast</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">视频通道</label>
              <select
                className="input-field"
                value={settings.videoProvider}
                onChange={(e) =>
                  onProviderSelect(e.target.value as VideoProvider)
                }
              >
                <option value="doubao">豆包（线上主）</option>
                <option value="jimeng">即梦（需本地代理）</option>
                <option value="xyq">小云雀（需本地代理）</option>
                <option value="mock">强制 Mock</option>
              </select>
            </div>
          </div>

          {settings.videoProvider === "jimeng" ||
          settings.videoProvider === "xyq" ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Mini 模型 ID（辅助代理）
                </label>
                <input
                  className="input-field"
                  value={settings.seedanceMiniModel}
                  onChange={(e) => update("seedanceMiniModel", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Fast 模型 ID（辅助代理）
                </label>
                <input
                  className="input-field"
                  value={settings.seedanceFastModel}
                  onChange={(e) => update("seedanceFastModel", e.target.value)}
                />
              </div>
            </>
          ) : null}

          <div
            className={`rounded-lg border px-3 py-3 text-xs ${
              doubaoLoggedIn
                ? "border-teal/40 bg-teal/5 text-teal"
                : "border-[var(--line)] bg-white/50 text-muted"
            }`}
          >
            {doubaoLoggedIn
              ? settings.doubaoApiKey?.trim()
                ? "已登录豆包 + 已填方舟 Key：网页失败会自动走官方 Seedance"
                : "已登录豆包网页。若视频报「技能未启动」，请在下方填写方舟 API Key"
              : "豆包尚未登录 — 手机号登录后可用网页分镜/生图；视频建议再填方舟 Key"}
          </div>
        </div>

        <PhoneLoginPanel
          onLoggedIn={({ platform, account }) => {
            setSettings((prev) => {
              let next = { ...prev, useMock: false };
              let activeId = prev.activeAccountId;
              if (account) {
                const exists = next.jimengAccounts.find(
                  (a) =>
                    (a.sessionId &&
                      account.sessionId &&
                      a.sessionId === account.sessionId) ||
                    (a.phone &&
                      account.phone &&
                      a.phone === account.phone &&
                      a.platform === account.platform),
                );
                activeId = exists?.id || account.id;
                const mergedAccounts = exists
                  ? next.jimengAccounts.map((a) =>
                      a.id === exists.id
                        ? {
                            ...a,
                            ...account,
                            id: a.id,
                            usedCount: a.usedCount,
                            // 保留该账号已有聊天窗
                            conversationId:
                              account.conversationId || a.conversationId,
                          }
                        : a,
                    )
                  : [account, ...next.jimengAccounts];
                next = withActiveAccount(
                  { ...next, jimengAccounts: mergedAccounts },
                  activeId,
                );
              }
              if (platform === "doubao") next = applyProviderPreset(next, "doubao");
              else if (platform === "jimeng")
                next = applyProviderPreset(next, "jimeng");
              else if (platform === "xyq") next = applyProviderPreset(next, "xyq");
              saveSettings(next);
              return next;
            });
            setSaved(true);
          }}
        />

        <div className="surface space-y-4 rounded-xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="display text-lg font-semibold">已登录额度账号</h2>
              <p className="text-xs text-muted">
                可登录多个账号，每次只用选定的一个。豆包每个账号固定一个聊天窗；额度用尽请手动切换，不会自动轮换。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportAccessConfig}
                disabled={!settings.jimengAccounts.length}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                <Download size={14} />
                导出配置
              </button>
              <button
                type="button"
                disabled={packBusy}
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {packBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                导入配置
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const merge =
                    settings.jimengAccounts.length === 0 ||
                    window.confirm(
                      "检测到本机已有账号。\n确定 = 合并导入（同手机号/session 覆盖更新）\n取消 = 全部覆盖本机账号",
                    );
                  void importAccessConfig(file, merge ? "merge" : "replace");
                }}
              />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            导出包含全部已登录账号的 session / Cookie、方舟 Key、通道与代理等接入配置，便于换机迁移。文件含敏感凭证，请妥善保管。
          </p>
          {packMsg ? (
            <p
              className={`rounded-md px-3 py-2 text-[11px] ${
                packMsg.includes("失败") || packMsg.includes("尚无")
                  ? "bg-cinnabar/10 text-cinnabar"
                  : "bg-teal/10 text-teal"
              }`}
            >
              {packMsg}
            </p>
          ) : null}

          {settings.jimengAccounts.length === 0 && !doubaoLoggedIn ? (
            <p className="rounded-md border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-muted">
              尚未登录。豆包可用短信；即梦请官网登录后粘贴 sessionid。
            </p>
          ) : (
            <div className="space-y-3">
              {settings.jimengAccounts.map((acc) => {
                const isActive =
                  (settings.activeAccountId ||
                    resolveActiveAccountId(settings)) === acc.id;
                return (
                <div
                  key={acc.id}
                  className={`rounded-lg border p-3 ${
                    isActive
                      ? "border-teal/50 bg-teal/5"
                      : "border-[var(--line)] bg-white/70"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <input
                      type="radio"
                      name="active-account"
                      checked={isActive}
                      onChange={() => selectActiveAccount(acc.id)}
                      className="accent-teal"
                      title="设为当前使用"
                    />
                    <input
                      className="input-field max-w-[140px]"
                      value={acc.label}
                      onChange={(e) =>
                        patchAccount(acc.id, { label: e.target.value })
                      }
                      placeholder="备注名"
                    />
                    <span className="rounded bg-ink/5 px-2 py-1 text-[11px] text-muted">
                      {platformLabel(acc.platform)}
                    </span>
                    {isActive ? (
                      <span className="rounded bg-teal/15 px-2 py-1 text-[11px] font-medium text-teal">
                        当前使用
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectActiveAccount(acc.id)}
                        className="rounded border border-[var(--line)] px-2 py-1 text-[11px] text-muted hover:border-teal/40 hover:text-teal"
                      >
                        使用此账号
                      </button>
                    )}
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={acc.enabled}
                        onChange={(e) =>
                          patchAccount(acc.id, { enabled: e.target.checked })
                        }
                      />
                      启用
                    </label>
                    <button
                      type="button"
                      onClick={() => removeAccount(acc.id)}
                      className="ml-auto text-muted hover:text-cinnabar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mb-2 text-[11px] text-muted">
                    {acc.phone
                      ? `手机 ${maskPhone(acc.phone)}`
                      : "无手机号记录"}
                    {acc.loginAt
                      ? ` · ${new Date(acc.loginAt).toLocaleString()}`
                      : ""}
                    {" · 凭证已由登录写入"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!acc.sessionId || checkingId === acc.id}
                      onClick={() => checkAccount(acc)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      {checkingId === acc.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Wifi size={12} />
                      )}
                      {acc.platform === "doubao"
                        ? "检测 session"
                        : "检测已注册登录"}
                    </button>
                    <p className="text-[11px] text-muted">
                      已用 {acc.usedCount} 次
                      {acc.platform === "doubao" && acc.conversationId
                        ? ` · 对话窗 …${acc.conversationId.slice(-6)}`
                        : ""}
                    </p>
                  </div>
                  {checkMsg[acc.id] || acc.lastError ? (
                    <p
                      className={`mt-1 text-[11px] ${
                        checkMsg[acc.id]?.includes("正常") ||
                        checkMsg[acc.id]?.includes("可达") ||
                        checkMsg[acc.id]?.includes("有效") ||
                        checkMsg[acc.id]?.includes("可用")
                          ? "text-teal"
                          : "text-cinnabar"
                      }`}
                    >
                      {checkMsg[acc.id] || acc.lastError}
                    </p>
                  ) : null}
                </div>
              );
              })}
            </div>
          )}
        </div>

        <div className="surface space-y-3 rounded-xl p-6">
          <h2 className="display text-lg font-semibold">豆包 · Seedream 4.5 生图</h2>
          <p className="text-xs leading-relaxed text-muted">
            本机只需前端。生图 / 分镜 / 视频一律走线上{" "}
            <span className="text-ink">www.doubao.com</span> 网页 session（Seedream
            4.5），<span className="text-cinnabar">不依赖本机 :5100 代理</span>。
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted">生图模型</label>
            <input
              className="input-field font-mono text-xs"
              value={settings.doubaoImageModel}
              onChange={(e) => {
                update("doubaoImageModel", e.target.value);
                update("imageModel", e.target.value);
              }}
              placeholder="doubao-seedream-4-5-251128"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              火山方舟 API Key（网页视频技能不可用时回退 Seedance）
            </label>
            <input
              className="input-field font-mono text-xs"
              type="password"
              autoComplete="off"
              value={settings.doubaoApiKey}
              onChange={(e) => update("doubaoApiKey", e.target.value)}
              placeholder="ARK_API_KEY / 方舟控制台密钥"
            />
            <p className="mt-1 text-[11px] text-muted">
              若报「视频技能未启动」：请改粘贴浏览器整段 Cookie，或填写方舟 Key。
              本站已按官网同源（/chat/completion + 图文）提交；方舟 Key 走官方
              Seedance 首帧图生视频。
            </p>
          </div>
          <ul className="space-y-1.5 text-xs text-muted">
            <li>· 分镜词 / 三视图 / 场景 / 首末帧 — 优先线上豆包网页</li>
            <li>· 视频：官网图文生视频（/chat/completion）；失败且有方舟 Key 则回退官方 Seedance</li>
            <li className="text-cinnabar">
              · 若报「访问频繁 710022002」：请隔 2–3 分钟再点一次；勿连点
            </li>
          </ul>
        </div>

        <details className="surface rounded-xl p-6">
          <summary className="cursor-pointer text-sm font-medium">
            高级：可选本地视频代理（非必需）
          </summary>
          <div className="mt-4 space-y-3">
            <p className="text-[11px] text-muted">
              豆包固定走官网网页接口。以下仅用于即梦 / 小云雀视频兼容代理。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted">
                  即梦兼容代理
                </label>
                <input
                  className="input-field font-mono text-xs"
                  value={settings.jimengProxyBase}
                  onChange={(e) => {
                    update("jimengProxyBase", e.target.value);
                    if (settings.videoProvider === "jimeng") {
                      update("jimengApiBase", e.target.value);
                    }
                  }}
                  placeholder="http://127.0.0.1:5100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  小云雀兼容代理
                </label>
                <input
                  className="input-field font-mono text-xs"
                  value={settings.xyqProxyBase}
                  onChange={(e) => {
                    update("xyqProxyBase", e.target.value);
                    if (settings.videoProvider === "xyq") {
                      update("jimengApiBase", e.target.value);
                    }
                  }}
                  placeholder="http://127.0.0.1:5200"
                />
              </div>
            </div>
          </div>
        </details>

        <button type="button" onClick={onSave} className="btn-primary">
          {saved ? <Check size={16} /> : null}
          {saved ? "已保存" : "保存设置"}
        </button>
      </div>
    </div>
  );
}
