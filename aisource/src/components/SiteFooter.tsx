export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="brand-mark text-2xl text-ink">镜叙</p>
          <p className="mt-1 text-sm text-muted">
            AI 漫剧生成 · 提示词与图片驱动视频
          </p>
        </div>
        <p className="text-xs text-muted">
          支持演示模式；实机请用已注册手机号验证码登录豆包 / 即梦 / 小云雀获取额度。
        </p>
      </div>
    </footer>
  );
}
