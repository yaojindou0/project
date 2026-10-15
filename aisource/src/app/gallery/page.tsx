"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Film, Trash2 } from "lucide-react";
import { aspectClass } from "@/lib/aspect";
import {
  deleteProject,
  loadProjectsRaw,
  migrateProjectsOffLocalStorage,
  setActiveProjectId,
} from "@/lib/store";
import { hydrateProjectMedia } from "@/lib/media-db";
import type { DramaProject } from "@/lib/types";

export default function GalleryPage() {
  const [projects, setProjects] = useState<DramaProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateProjectsOffLocalStorage();
      } catch {
        /* ignore */
      }
      const raw = loadProjectsRaw();
      const hydrated = await Promise.all(raw.map((p) => hydrateProjectMedia(p)));
      if (!cancelled) setProjects(hydrated);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(id: string) {
    await deleteProject(id);
    const raw = loadProjectsRaw();
    const hydrated = await Promise.all(raw.map((p) => hydrateProjectMedia(p)));
    setProjects(hydrated);
  }

  function openInStudio(id: string) {
    setActiveProjectId(id);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8">
        <p className="mb-2 text-xs tracking-[0.25em] text-teal uppercase">
          Gallery
        </p>
        <h1 className="display text-3xl font-semibold">成片库</h1>
        <p className="mt-2 text-sm text-muted">
          本地保存的漫剧项目与已生成镜头，大图存 IndexedDB，元数据存浏览器。
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="surface flex min-h-64 flex-col items-center justify-center rounded-xl p-8 text-center">
          <Film className="mb-3 text-teal" size={32} />
          <p className="mb-4 text-muted">还没有成片，去创作台生成第一部。</p>
          <Link href="/studio" className="btn-primary">
            前往创作台
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const cover =
              p.coverUrl ||
              p.shots.find((s) => s.imageUrl)?.imageUrl ||
              p.shots.find((s) => s.videoUrl)?.videoUrl;
            const ready = p.shots.filter((s) => s.status === "ready").length;
            return (
              <article
                key={p.id}
                className="surface overflow-hidden rounded-xl"
              >
                <div className={`bg-ink/90 ${aspectClass(p.aspectRatio)}`}>
                  {p.shots.some((s) => s.videoUrl) &&
                  cover?.match(/\.mp4|video|blob:|data:video/i) ? (
                    <video
                      src={p.shots.find((s) => s.videoUrl)?.videoUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                  ) : cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={p.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-mist/50">
                      无预览
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <h2 className="display text-lg font-semibold">{p.title}</h2>
                  <p className="line-clamp-2 text-xs text-muted">{p.premise}</p>
                  <p className="text-xs text-teal">
                    {ready}/{p.shots.length} 镜完成 · {p.aspectRatio}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/studio?id=${encodeURIComponent(p.id)}`}
                      onClick={() => openInStudio(p.id)}
                      className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-paper"
                    >
                      继续编辑
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(p.id)}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs text-muted hover:text-cinnabar"
                    >
                      <Trash2 size={13} />
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
