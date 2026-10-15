"use client";

import Link from "next/link";
import {
  formatAccountLabel,
  resolveActiveAccountId,
  resolveActiveQuotaAccount,
} from "@/lib/doubao-session";
import { describeChannelStatus } from "@/lib/provider-status";
import type { ApiSettings, JimengAccount } from "@/lib/types";

const LABELS: Record<string, string> = {
  doubao: "豆包",
  jimeng: "即梦",
  xyq: "小云雀",
  mock: "Mock",
};

function platformTag(p: JimengAccount["platform"]) {
  if (p === "doubao") return "豆包";
  if (p === "jimeng") return "即梦";
  if (p === "xyq") return "小云雀";
  return "账号";
}

export function ChannelStatusBar({
  settings,
  activeAccountLabel,
  onSelectAccount,
}: {
  settings: ApiSettings;
  /** 最近一次生成实际使用的账号（优先展示） */
  activeAccountLabel?: string;
  /** 工作室内快速切换当前账号 */
  onSelectAccount?: (accountId: string) => void;
}) {
  const status = describeChannelStatus(settings);
  const preferred = resolveActiveQuotaAccount(settings);
  const activeId = resolveActiveAccountId(settings) || "";
  const accounts = settings.jimengAccounts.filter((a) => a.sessionId?.trim());
  const shown =
    activeAccountLabel?.trim() ||
    (preferred ? `${preferred.platform} · ${preferred.label}` : "");

  return (
    <div className="rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2.5 text-xs">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-ink">
          通道：
          <span className="text-teal">
            {status.mock ? "演示 Mock" : "线上豆包（主）"}
          </span>
        </p>
        <Link
          href="/settings"
          className="text-muted underline-offset-2 hover:underline"
        >
          调整
        </Link>
      </div>

      {accounts.length > 0 ? (
        <div className="mb-1.5 space-y-1.5">
          <label className="block text-[11px] text-muted">当前账号</label>
          <select
            className="w-full rounded-md border border-[var(--line)] bg-white px-2 py-1.5 text-[11px] text-ink outline-none focus:border-teal/50"
            value={activeId}
            disabled={!onSelectAccount || accounts.length < 1}
            onChange={(e) => {
              const id = e.target.value;
              if (id && onSelectAccount) onSelectAccount(id);
            }}
          >
            {accounts.map((acc) => {
              const label = `${platformTag(acc.platform)} · ${formatAccountLabel(acc)}`;
              return (
                <option key={acc.id} value={acc.id} disabled={!acc.enabled}>
                  {label}
                  {!acc.enabled ? "（已停用）" : ""}
                  {acc.conversationId ? " · 已绑对话窗" : ""}
                </option>
              );
            })}
          </select>
        </div>
      ) : shown ? (
        <p className="mb-1.5 rounded-md bg-teal/10 px-2 py-1.5 text-[11px] font-medium text-teal">
          当前账号：{shown}
        </p>
      ) : (
        <p className="mb-1.5 text-[11px] text-muted">
          当前账号：未登录额度账号
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted">
        每次只用选定账号；豆包每账号一个聊天窗，确认时自动发「确定」并从对话取视频
        {status.arkReady ? "；已配置方舟 Key" : ""}
        {status.autoFallback && status.queue.length > 1
          ? ` · 通道回退 ${status.queue
              .slice(1)
              .map((p) => LABELS[p] || p)
              .join(" → ")}`
          : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
        <ReadyDot ok={status.doubaoReady} label="豆包登录" />
        <ReadyDot ok={status.arkReady} label="方舟 Key" />
        <ReadyDot ok={status.jimengReady} label="即梦（可选）" />
        <ReadyDot ok={status.xyqReady} label="小云雀（可选）" />
      </div>
    </div>
  );
}

function ReadyDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
        ok ? "bg-teal/15 text-teal" : "bg-ink/5 text-muted"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-teal" : "bg-muted"}`}
      />
      {label}
    </span>
  );
}
