import { Route, Routes } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { LandingChannels } from "@/components/LandingChannels";
import { LandingFlow } from "@/components/LandingFlow";
import { LandingHero } from "@/components/LandingHero";
import { StudioWorkspace } from "@/components/StudioWorkspace";
import { hasOnlineEndpoints, resolveApiBase } from "@/lib/api-fetch";
import GalleryPage from "@/app/gallery/page";
import SettingsPage from "@/app/settings/page";

function HomePage() {
  return (
    <>
      <LandingHero />
      <LandingChannels />
      <LandingFlow />
      <SiteFooter />
    </>
  );
}

export function StaticApp() {
  const online = hasOnlineEndpoints();
  const apiBase = resolveApiBase();
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <div
        className={`border-b px-4 py-2 text-center text-[11px] ${
          online
            ? "border-teal/30 bg-teal/10 text-teal"
            : "border-cinnabar/30 bg-cinnabar/10 text-cinnabar"
        }`}
      >
        {online
          ? apiBase
            ? `在线版 · 自建根 ${apiBase}（上游原路径）`
            : "在线版 · 原线上接口 www.doubao.com / ark.cn-beijing.volces.com / passport"
          : "未配置原线上接口。请检查 config.js 的 __JINGXU_ENDPOINTS__"}
      </div>
      <SiteNav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/studio" element={<StudioWorkspace />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  );
}
