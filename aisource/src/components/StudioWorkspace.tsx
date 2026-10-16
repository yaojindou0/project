"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard,
  Copy,
  Download,
  Link2,
  Lock,
  LockOpen,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { readResponseJson } from "@/lib/safe-json";
import { ChannelStatusBar } from "@/components/ChannelStatusBar";
import {
  formatAccountLabel,
  hasDoubaoWebSession,
  persistAccountConversationId,
  resolveAccountConversationId,
  withActiveAccount,
} from "@/lib/doubao-session";
import { applyProviderPreset } from "@/lib/provider-status";
import { matchShotCharacters, characterKey } from "@/lib/shot-characters";
import { UPSTREAM_PATHS } from "@/lib/upstream-paths";
import {
  deleteProject,
  downloadJson,
  loadActiveProjectHydrated,
  loadProjectHydrated,
  loadSettings,
  migrateProjectsOffLocalStorage,
  saveProject,
  saveSettings,
  setActiveProjectId,
  uid,
} from "@/lib/store";
import {
  buildCharacterThreeViewPrompt,
  buildFirstFramePrompt,
  buildLastFramePrompt,
  buildSceneImagePrompt,
} from "@/lib/prompts";
import {
  extractLastFrameFromVideo,
  isProbablyVideoUrl,
  resolvePlayableVideoUrl,
} from "@/lib/video-frame";
import { aspectClass } from "@/lib/aspect";
import {
  buildCharacterPack,
  downloadCharacterPack,
  mergeCharactersByName,
  readCharacterPackFile,
} from "@/lib/character-pack";
import { isMediaRef, toPersistentMediaUrl } from "@/lib/media-db";
import {
  buildMergedStoryboard,
  composeVideoPrompt,
  createEmptyLine,
  flattenDialogue,
  kindLabel,
} from "@/lib/shot-script";
import {
  DEFAULT_STYLE_ID,
  STYLE_PRESETS,
  clampShotDuration,
  resolveShotDuration,
  type ApiSettings,
  type CharacterCard,
  type CharacterIntro,
  type DialogueLine,
  type DialogueLineKind,
  type DramaProject,
  type SeedanceVariant,
  type Shot,
  type VideoChatMessage,
} from "@/lib/types";

type Phase = "idle" | "script" | "videos" | "done";

export function StudioWorkspace() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [premise, setPremise] = useState(
    "雨夜重逢的青梅竹马，一个想离开这座城，一个还在等一句未说出口的话。",
  );
  const [styleId, setStyleId] = useState<(typeof STYLE_PRESETS)[number]["id"]>(
    DEFAULT_STYLE_ID,
  );
  const [shotCount, setShotCount] = useState(4);
  const [aspectRatio, setAspectRatio] =
    useState<DramaProject["aspectRatio"]>("16:9");
  const [durationPerShot, setDurationPerShot] = useState(15);
  const [variant, setVariant] = useState<SeedanceVariant>("mini");
  const [project, setProject] = useState<DramaProject | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busyShotId, setBusyShotId] = useState<string | null>(null);
  const [busyCharIndex, setBusyCharIndex] = useState<number | null>(null);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [chatReplyBusy, setChatReplyBusy] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [error, setError] = useState("");
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [modeHint, setModeHint] = useState("mock");
  const [chainPrevFrame, setChainPrevFrame] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);
  /** 最近一次视频实际使用的额度账号（顶部展示） */
  const [activeAccountLabel, setActiveAccountLabel] = useState("");
  /** 从视频链接取尾帧作首帧 */
  const [frameVideoUrl, setFrameVideoUrl] = useState("");
  const [frameFromVideoBusy, setFrameFromVideoBusy] = useState(false);
  const projectRef = useRef<DramaProject | null>(null);
  projectRef.current = project;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = loadSettings();
      if (cancelled) return;
      setSettings(s);
      setVariant(s.seedanceVariant);

      try {
        await migrateProjectsOffLocalStorage();
      } catch {
        /* ignore migration errors */
      }

      const qid = searchParams.get("id");
      const restored = qid
        ? await loadProjectHydrated(qid)
        : await loadActiveProjectHydrated();
      if (cancelled || !restored) return;
      const withCharIds: DramaProject = {
        ...restored,
        characters: restored.characters.map((c) => ({
          ...c,
          id: c.id || uid("char"),
        })),
      };
      setProject(withCharIds);
      setPremise(withCharIds.premise);
      setAspectRatio(withCharIds.aspectRatio);
      setDurationPerShot(withCharIds.durationPerShot);
      setShotCount(withCharIds.shots.length || 4);
      setActiveShotId(withCharIds.shots[0]?.id ?? null);
      setActiveProjectId(withCharIds.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // 换号 / 加载项目：项目对话迁到当前账号，或跟账号窗对齐；清空分镜里旧窗历史
  const lastSyncedAccountRef = useRef<string>("");
  useEffect(() => {
    if (!settings || !project) return;
    const activeId = settings.activeAccountId || "";
    const accConv = resolveAccountConversationId(settings) || "";
    const projConv = (project.videoConversationId || "").trim();
    const accountSwitched =
      Boolean(activeId) && lastSyncedAccountRef.current !== activeId;

    // 旧项目只有 videoConversationId：迁到当前豆包账号
    if (
      !accConv &&
      projConv &&
      projConv !== "0" &&
      !projConv.startsWith("static-")
    ) {
      persistSettings(persistAccountConversationId(settings, projConv));
      lastSyncedAccountRef.current = activeId;
      return;
    }

    if (accConv && projConv === accConv && !accountSwitched) {
      lastSyncedAccountRef.current = activeId;
      return;
    }
    if (!accConv && !projConv && !accountSwitched) return;

    setProject((prev) => {
      if (!prev) return prev;
      const nextShots = accountSwitched
        ? prev.shots.map((s) =>
            s.videoChat
              ? {
                  ...s,
                  videoChat: {
                    ...s.videoChat,
                    conversationId: accConv || undefined,
                    messages: [],
                  },
                }
              : s,
          )
        : prev.shots;
      const next = {
        ...prev,
        videoConversationId: accConv || undefined,
        shots: nextShots,
        updatedAt: new Date().toISOString(),
      };
      void saveProject(next).catch(() => {});
      return next;
    });
    lastSyncedAccountRef.current = activeId;
  }, [
    settings?.activeAccountId,
    settings?.doubaoConversationId,
    project?.id,
  ]);

  const stylePrompt = useMemo(
    () => STYLE_PRESETS.find((s) => s.id === styleId)?.prompt || "",
    [styleId],
  );

  const progress = useMemo(() => {
    if (!project?.shots.length) return 0;
    const ready = project.shots.filter((s) => s.status === "ready").length;
    return Math.round((ready / project.shots.length) * 100);
  }, [project]);

  const busy = scriptBusy || Boolean(busyShotId) || busyCharIndex !== null;

  function persistSettings(next: ApiSettings) {
    setSettings(next);
    saveSettings(next);
  }

  /** 工作室快速切号：加载该账号对话窗，并同步通道预设 */
  function selectStudioAccount(accountId: string) {
    if (!settings) return;
    const acc = settings.jimengAccounts.find((a) => a.id === accountId);
    if (!acc) return;
    let next = withActiveAccount(settings, accountId);
    if (acc.platform === "doubao") next = applyProviderPreset(next, "doubao");
    else if (acc.platform === "jimeng") next = applyProviderPreset(next, "jimeng");
    else if (acc.platform === "xyq") next = applyProviderPreset(next, "xyq");
    persistSettings(next);
    setActiveAccountLabel(
      `${acc.platform === "doubao" ? "豆包" : acc.platform === "jimeng" ? "即梦" : acc.platform === "xyq" ? "小云雀" : "账号"} · ${formatAccountLabel(acc)}`,
    );
  }

  /**
   * 每豆包账号固定一个聊天窗：只认当前账号绑定的 id。
   * 无绑定则留空，由服务端新建一次并回写到该账号，不串用其他账号/项目缓存。
   */
  function resolveSharedConversationId(_shot?: Shot) {
    if (!settings) return undefined;
    return resolveAccountConversationId(settings);
  }

  /** base：传入刚合并的 settings，避免用过期账号状态覆盖 usedCount/cooldown */
  function rememberConversationId(
    conversationId?: string | null,
    base?: ApiSettings,
  ) {
    const id = (conversationId || "").trim();
    if (!id || id === "0" || id.startsWith("static-")) return;
    updateProject((prev) =>
      prev.videoConversationId === id
        ? prev
        : {
            ...prev,
            videoConversationId: id,
            updatedAt: new Date().toISOString(),
          },
    );
    const src = base || settings;
    if (!src) return;
    const next = persistAccountConversationId(src, id);
    if (
      next.doubaoConversationId !== src.doubaoConversationId ||
      next.jimengAccounts !== src.jimengAccounts
    ) {
      persistSettings(next);
    }
  }

  function updateProject(mutator: (prev: DramaProject) => DramaProject) {
    setProject((prev) => {
      if (!prev) return prev;
      const next = mutator(prev);
      // 内存保留完整 data URL；落盘时异步卸到 IndexedDB
      void saveProject(next).catch((e) => {
        console.error(e);
        setError(
          e instanceof Error
            ? e.message
            : "本地存储已满，请删除旧项目后再试",
        );
      });
      return next;
    });
  }

  function updateShot(shotId: string, patch: Partial<Shot>) {
    updateProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      shots: prev.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)),
    }));
  }

  function updateCharacter(index: number, patch: Partial<CharacterCard>) {
    updateProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      characters: prev.characters.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    }));
  }

  /** 写入镜头/角色媒体前，把 tmp-media 等临时链落实，避免刷新后裂图 */
  async function persistMediaField(
    url?: string | null,
  ): Promise<string | undefined> {
    if (url == null || url === "") return undefined;
    const s = String(url);
    return (await toPersistentMediaUrl(s)) || s;
  }

  async function updateShotMedia(shotId: string, patch: Partial<Shot>) {
    const next: Partial<Shot> = { ...patch };
    if ("imageUrl" in next) next.imageUrl = await persistMediaField(next.imageUrl);
    if ("sceneImageUrl" in next) {
      next.sceneImageUrl = await persistMediaField(next.sceneImageUrl);
    }
    if ("lastFrameUrl" in next) {
      next.lastFrameUrl = await persistMediaField(next.lastFrameUrl);
    }
    if ("videoUrl" in next) next.videoUrl = await persistMediaField(next.videoUrl);
    updateShot(shotId, next);
  }

  async function updateCharacterMedia(
    index: number,
    patch: Partial<CharacterCard>,
  ) {
    const next: Partial<CharacterCard> = { ...patch };
    if ("threeViewUrl" in next) {
      next.threeViewUrl = await persistMediaField(next.threeViewUrl);
    }
    if ("referenceImageUrl" in next) {
      next.referenceImageUrl = await persistMediaField(next.referenceImageUrl);
    }
    updateCharacter(index, next);
  }

  async function generateScript() {
    if (!settings) return;
    setScriptBusy(true);
    setError("");
    setPhase("script");
    try {
      const res = await apiFetch(UPSTREAM_PATHS.script, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          premise,
          style: stylePrompt,
          shotCount,
          aspectRatio,
          settings,
          lockedCharacters: project?.characters.filter((c) => c.locked) || [],
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "分镜生成失败");

      setModeHint(data.provider || data.mode);
      if (data.hint) setError(data.hint);
      else setError("");
      const now = new Date().toISOString();
      const characters = (data.characters as CharacterCard[]).map((c) => ({
        ...c,
        id: c.id || uid("char"),
        locked: c.locked ?? true,
      }));
      const shots = (data.shots as Shot[]).map((s) => ({
        ...s,
        duration: clampShotDuration(s.duration ?? durationPerShot),
        videoCharacterKeys: matchShotCharacters(s, characters).map(
          characterKey,
        ),
      }));
      const next: DramaProject = {
        id: project?.id || uid("proj"),
        title: data.title,
        premise,
        style: stylePrompt,
        aspectRatio,
        durationPerShot,
        characters,
        shots,
        createdAt: project?.createdAt || now,
        updatedAt: now,
      };
      setProject(next);
      setActiveShotId(data.shots[0]?.id ?? null);
      void saveProject(next).catch((e) => {
        console.error(e);
        setError(
          e instanceof Error
            ? e.message
            : "本地存储已满，请删除旧项目后再试",
        );
      });
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "分镜生成失败");
      setPhase("idle");
    } finally {
      setScriptBusy(false);
    }
  }

  async function generateShotImage(shot: Shot) {
    if (!settings || !project) return;
    setBusyShotId(shot.id);
    setActiveShotId(shot.id);
    updateShot(shot.id, { status: "imaging", error: undefined });
    try {
      const chars = project.characters
        .map((c) => `${c.name}: ${c.appearance}`)
        .join("; ");
      const res = await apiFetch(UPSTREAM_PATHS.image, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildFirstFramePrompt({
            scene: shot.scene,
            storyboardPrompt: shot.storyboardPrompt,
            imagePrompt: shot.imagePrompt,
            style: project.style,
            aspectRatio: project.aspectRatio,
            characters: chars,
          }),
          index: shot.index,
          aspectRatio: project.aspectRatio,
          kind: "frame",
          settings,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) {
        const extra =
          data?.debug?.textHint ||
          data?.debug?.fatalHint ||
          data?.debug?.snippet;
        throw new Error(
          [data.error || "生图失败", extra].filter(Boolean).join(" · "),
        );
      }
      await updateShotMedia(shot.id, {
        imageUrl: data.imageUrl,
        status: "pending",
        usedModel: data.model,
      });
      setModeHint(data.provider || data.mode);
    } catch (e) {
      updateShot(shot.id, {
        status: "error",
        error: e instanceof Error ? e.message : "生图失败",
      });
    } finally {
      setBusyShotId(null);
    }
  }

  async function generateSceneImage(shot: Shot) {
    if (!settings || !project) return;
    setBusyShotId(shot.id);
    setActiveShotId(shot.id);
    setError("");
    try {
      const res = await apiFetch(UPSTREAM_PATHS.image, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildSceneImagePrompt({
            scene: shot.scene,
            storyboardPrompt: shot.storyboardPrompt,
            style: project.style,
            aspectRatio: project.aspectRatio,
            locationName: shot.locationName,
            placeIntro: shot.placeIntro,
            scenePrompt: shot.scenePrompt,
          }),
          index: shot.index,
          aspectRatio: project.aspectRatio,
          kind: "scene",
          settings,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) {
        const extra =
          data?.debug?.textHint ||
          data?.debug?.fatalHint ||
          data?.debug?.snippet;
        throw new Error(
          [data.error || "场景图生成失败", extra].filter(Boolean).join(" · "),
        );
      }
      await updateShotMedia(shot.id, { sceneImageUrl: data.imageUrl });
      setModeHint(data.provider || data.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "场景图生成失败");
    } finally {
      setBusyShotId(null);
    }
  }

  async function generateLastFrame(shot: Shot) {
    if (!settings || !project) return;
    setBusyShotId(shot.id);
    setActiveShotId(shot.id);
    setError("");
    try {
      const chars = project.characters
        .map((c) => `${c.name}: ${c.appearance}`)
        .join("; ");
      const res = await apiFetch(UPSTREAM_PATHS.image, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildLastFramePrompt({
            scene: shot.scene,
            storyboardPrompt: shot.storyboardPrompt,
            style: project.style,
            aspectRatio: project.aspectRatio,
            characters: chars,
          }),
          index: shot.index,
          aspectRatio: project.aspectRatio,
          kind: "frame",
          settings,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) {
        const extra =
          data?.debug?.textHint ||
          data?.debug?.fatalHint ||
          data?.debug?.snippet;
        throw new Error(
          [data.error || "末帧生成失败", extra].filter(Boolean).join(" · "),
        );
      }
      await updateShotMedia(shot.id, { lastFrameUrl: data.imageUrl });
      setModeHint(data.provider || data.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "末帧生成失败");
    } finally {
      setBusyShotId(null);
    }
  }

  /** 本镜：场景图 → 首帧 → 末帧 顺序自动生成 */
  async function generateShotFramePack(shot: Shot) {
    await generateSceneImage(shot);
    await generateShotImage(shot);
    await generateLastFrame(shot);
  }

  async function generateCharacterThreeView(index: number) {
    if (!settings || !project) return;
    const c = project.characters[index];
    if (!c?.appearance?.trim()) {
      setError("请先填写角色外貌描述，再生成三视图");
      return;
    }
    setBusyCharIndex(index);
    setError("");
    try {
      const res = await apiFetch(UPSTREAM_PATHS.image, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildCharacterThreeViewPrompt({
            name: c.name,
            appearance: c.appearance,
            style: project.style,
            aspectRatio: project.aspectRatio,
          }),
          index,
          aspectRatio: project.aspectRatio,
          kind: "character",
          settings,
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) {
        const errMain = String(data.error || "三视图生成失败");
        const extra =
          data?.debug?.textHint ||
          data?.debug?.fatalHint ||
          (data?.debug?.contentTypes?.length
            ? `types=${data.debug.contentTypes.join(",")}`
            : "") ||
          data?.hint ||
          data?.debug?.snippet;
        const detail =
          extra && !errMain.includes(String(extra).slice(0, 24))
            ? String(extra)
            : "";
        throw new Error([errMain, detail].filter(Boolean).join(" · "));
      }
      await updateCharacterMedia(index, {
        threeViewUrl: String(data.imageUrl || ""),
        referenceImageUrl: String(data.imageUrl || ""),
        locked: true,
      });
      setModeHint(
        [data.provider || data.mode, data.model, data.hint]
          .filter(Boolean)
          .join(" · "),
      );
      if (Array.isArray(data.accounts) && settings) {
        const next = { ...settings, jimengAccounts: data.accounts };
        setSettings(next);
        saveSettings(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "三视图生成失败");
    } finally {
      setBusyCharIndex(null);
    }
  }

  /** 无本镜首帧时：优先沿用上一镜末帧，其次上一镜首帧 */
  function resolveChainedFirstFrame(shot: Shot, proj: DramaProject) {
    if (shot.imageUrl) return shot.imageUrl;
    if (!chainPrevFrame || shot.index <= 0) return undefined;
    const prev = proj.shots.find((s) => s.index === shot.index - 1);
    return prev?.lastFrameUrl || prev?.imageUrl;
  }

  function resolveCopyableVideoUrl(url: string) {
    if (typeof window === "undefined") return url;
    if (url.startsWith("/")) return `${window.location.origin}${url}`;
    return url;
  }

  function displayVideoLink(url: string) {
    if (url.startsWith("data:")) {
      const kb = Math.max(1, Math.round((url.length * 0.75) / 1024));
      return `data:video（约 ${kb} KB，建议下载文件）`;
    }
    return resolveCopyableVideoUrl(url);
  }

  async function copyShotVideoLink(shot: Shot) {
    if (!shot.videoUrl) return;
    // data URL 过大不宜塞剪贴板，改为下载
    if (shot.videoUrl.startsWith("data:")) {
      await downloadShotVideo(shot);
      setCopiedVideoId(shot.id);
      window.setTimeout(() => {
        setCopiedVideoId((cur) => (cur === shot.id ? null : cur));
      }, 1600);
      return;
    }
    const text = resolveCopyableVideoUrl(shot.videoUrl);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedVideoId(shot.id);
    window.setTimeout(() => {
      setCopiedVideoId((cur) => (cur === shot.id ? null : cur));
    }, 1600);
  }

  async function downloadShotVideo(shot: Shot) {
    if (!shot.videoUrl) return;
    const name = `镜${shot.index + 1}-${(shot.scene || "shot").slice(0, 18)}.mp4`.replace(
      /[\\/:*?"<>|]/g,
      "_",
    );
    try {
      if (shot.videoUrl.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = shot.videoUrl;
        a.download = name;
        a.click();
        return;
      }
      const href = resolveCopyableVideoUrl(shot.videoUrl);
      const res = await fetch(href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = name;
      a.click();
      URL.revokeObjectURL(obj);
    } catch {
      // 跨域失败时仍打开新标签，便于用户另存
      window.open(resolveCopyableVideoUrl(shot.videoUrl), "_blank");
    }
  }

  async function generateShotVideo(
    shot: Shot,
    chosenVariant: SeedanceVariant = variant,
  ) {
    const proj = projectRef.current;
    if (!settings || !proj) return;
    if (!effectiveCompose(shot).trim()) {
      updateShot(shot.id, { status: "error", error: "请先填写分镜词或台词" });
      return;
    }

    const imageUrl = resolveChainedFirstFrame(shot, proj);
    const selectedKeys =
      shot.videoCharacterKeys !== undefined
        ? shot.videoCharacterKeys
        : matchShotCharacters(shot, proj.characters).map(characterKey);
    const involved = proj.characters.filter((c) =>
      selectedKeys.includes(characterKey(c)),
    );
    const involvedWithImg = involved.filter(
      (c) => c.threeViewUrl || c.referenceImageUrl,
    );
    const lockedWithImg = proj.characters.filter(
      (c) => c.locked && (c.threeViewUrl || c.referenceImageUrl),
    );
    if (
      !settings.useMock &&
      settings.videoProvider === "doubao" &&
      !imageUrl &&
      !shot.sceneImageUrl &&
      involvedWithImg.length === 0 &&
      lockedWithImg.length === 0
    ) {
      updateShot(shot.id, {
        status: "error",
        error: "请先勾选并上传角色参考图，或上传场景图/首帧",
      });
      return;
    }
    if (
      !settings.useMock &&
      (settings.videoProvider === "jimeng" ||
        settings.videoProvider === "xyq" ||
        (settings.videoProvider === "doubao" &&
          settings.autoFallback &&
          !hasDoubaoWebSession(settings))) &&
      !imageUrl &&
      involvedWithImg.length === 0 &&
      lockedWithImg.length === 0
    ) {
      updateShot(shot.id, {
        status: "error",
        error: "请勾选并上传角色参考图，或为本镜上传首帧图",
      });
      return;
    }

    setBusyShotId(shot.id);
    setActiveShotId(shot.id);
    const sharedConversationId = resolveSharedConversationId(shot);
    updateShot(shot.id, {
      status: "animating",
      error: undefined,
      videoCharacterKeys: selectedKeys,
      ...(imageUrl && !shot.imageUrl ? { imageUrl } : {}),
      ...(sharedConversationId
        ? {
            videoChat: {
              ...(shot.videoChat || { messages: [] }),
              conversationId: sharedConversationId,
              matchedCharacterNames:
                shot.videoChat?.matchedCharacterNames ||
                involved.map((c) => c.name),
              messages: shot.videoChat?.messages || [],
            },
          }
        : {}),
    });
    try {
      const res = await apiFetch(UPSTREAM_PATHS.video, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effectiveCompose(shot),
          imageUrl,
          lastFrameUrl: shot.lastFrameUrl,
          sceneImageUrl: shot.sceneImageUrl,
          duration: resolveShotDuration(shot, proj.durationPerShot),
          aspectRatio: proj.aspectRatio,
          index: shot.index,
          // 仅附勾选角色的参考图，避免全量 base64 撑爆请求体
          characters: proj.characters.map((c) => {
            const key = characterKey(c);
            const needImg = selectedKeys.includes(key);
            return {
              id: c.id,
              name: c.name,
              appearance: c.appearance,
              locked: c.locked,
              ...(needImg
                ? {
                    threeViewUrl: c.threeViewUrl,
                    referenceImageUrl: c.referenceImageUrl,
                  }
                : {}),
            };
          }),
          selectedCharacterKeys: selectedKeys,
          conversationId: sharedConversationId,
          shot: {
            id: shot.id,
            scene: shot.scene,
            dialogue: shot.dialogue,
            lines: shot.lines,
            characterIntros: shot.characterIntros,
            storyboardPrompt: shot.storyboardPrompt,
            imagePrompt: shot.imagePrompt,
            camera: shot.camera,
            videoCharacterKeys: selectedKeys,
          },
          variant: chosenVariant,
          settings,
        }),
      });
      const data = await readResponseJson(res);
      const mergedSettings = Array.isArray(data.accounts)
        ? { ...settings, jimengAccounts: data.accounts }
        : settings;
      if (data.conversationId) {
        rememberConversationId(String(data.conversationId), mergedSettings);
      } else if (Array.isArray(data.accounts)) {
        persistSettings(mergedSettings);
      }
      if (data.accountLabel) {
        setActiveAccountLabel(String(data.accountLabel));
      }
      if (!res.ok && !data.chatText && !data.videoUrl) {
        throw new Error(data.error || "视频生成失败");
      }

      const threadId =
        String(data.conversationId || sharedConversationId || "").trim() ||
        undefined;
      const matchedNames = Array.isArray(data.matchedCharacters)
        ? (data.matchedCharacters as string[])
        : involved.map((c) => c.name);
      const now = new Date().toISOString();
      const chatMessages: VideoChatMessage[] = [];
      if (data.chatText) {
        chatMessages.push({
          id: uid("vchat"),
          role: "user",
          text: `生成视频：${effectiveCompose(shot).slice(0, 400)}`,
          at: now,
        });
        chatMessages.push({
          id: uid("vchat"),
          role: "assistant",
          text: String(data.chatText),
          at: now,
        });
      }

      if (data.videoUrl) {
        await updateShotMedia(shot.id, {
          videoUrl: data.videoUrl,
          status: "ready",
          error: undefined,
          usedAccountLabel: data.accountLabel,
          usedModel: data.model,
          triedChannels: data.tried,
          ...(imageUrl ? { imageUrl } : {}),
          videoChat: {
            conversationId: threadId,
            matchedCharacterNames: matchedNames,
            messages: chatMessages.length
              ? chatMessages
              : shot.videoChat?.messages || [],
          },
        });
        setModeHint(data.mode);
        setPhase("done");
      } else {
        updateShot(shot.id, {
          status: "error",
          error:
            data.error ||
            "未生成视频；见下方对话面板，可继续回复豆包",
          usedAccountLabel: data.accountLabel,
          usedModel: data.model,
          triedChannels: data.tried,
          videoChat: {
            conversationId: threadId,
            matchedCharacterNames: matchedNames,
            messages: chatMessages.length
              ? chatMessages
              : shot.videoChat?.messages || [],
          },
        });
      }
    } catch (e) {
      updateShot(shot.id, {
        status: "error",
        error: e instanceof Error ? e.message : "视频生成失败",
      });
    } finally {
      setBusyShotId(null);
    }
  }

  async function replyVideoChat(shot: Shot) {
    if (!settings || !chatDraft.trim()) return;
    const text = chatDraft.trim();
    setChatReplyBusy(true);
    setChatDraft("");
    const sharedConversationId = resolveSharedConversationId(shot);
    const userMsg: VideoChatMessage = {
      id: uid("vchat"),
      role: "user",
      text,
      at: new Date().toISOString(),
    };
    updateShot(shot.id, {
      videoChat: {
        conversationId: sharedConversationId,
        matchedCharacterNames: shot.videoChat?.matchedCharacterNames,
        messages: [...(shot.videoChat?.messages || []), userMsg],
      },
    });
    try {
      const res = await apiFetch(UPSTREAM_PATHS.chatReply, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: sharedConversationId,
          settings,
          aspectRatio: projectRef.current?.aspectRatio,
          duration: resolveShotDuration(
            shot,
            projectRef.current?.durationPerShot,
          ),
          variant,
          context: [
            shot.scene,
            shot.storyboardPrompt,
            shot.videoChat?.matchedCharacterNames?.length
              ? `涉及角色：${shot.videoChat.matchedCharacterNames.join("、")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "回复失败");
      const mergedSettings = Array.isArray(data.accounts)
        ? { ...settings, jimengAccounts: data.accounts }
        : settings;
      const threadId =
        String(
          data.conversationId || sharedConversationId || "",
        ).trim() || undefined;
      if (threadId) {
        rememberConversationId(threadId, mergedSettings);
      } else if (Array.isArray(data.accounts)) {
        persistSettings(mergedSettings);
      }
      const latest = projectRef.current?.shots.find((s) => s.id === shot.id);
      const prevMsgs = latest?.videoChat?.messages || [
        ...(shot.videoChat?.messages || []),
        userMsg,
      ];
      const withoutDup = prevMsgs.some((m) => m.id === userMsg.id)
        ? prevMsgs
        : [...prevMsgs, userMsg];
      const assistantText = String(
        data.text || (data.videoUrl ? "视频已从对话中获取" : ""),
      );
      await updateShotMedia(shot.id, {
        ...(data.videoUrl
          ? {
              videoUrl: String(data.videoUrl),
              status: "ready" as const,
              error: undefined,
              usedModel: data.model ? String(data.model) : undefined,
            }
          : {}),
        videoChat: {
          conversationId: threadId,
          matchedCharacterNames: shot.videoChat?.matchedCharacterNames,
          messages: [
            ...withoutDup,
            {
              id: uid("vchat"),
              role: "assistant",
              text: assistantText,
              at: new Date().toISOString(),
            },
          ],
        },
      });
    } catch (e) {
      updateShot(shot.id, {
        error: e instanceof Error ? e.message : "对话回复失败",
      });
    } finally {
      setChatReplyBusy(false);
    }
  }

  async function generateAllVideos() {
    if (!projectRef.current || !settings) return;
    setPhase("videos");
    const ids = projectRef.current.shots.map((s) => s.id);
    for (const id of ids) {
      const latest = projectRef.current;
      if (!latest) break;
      const shot = latest.shots.find((s) => s.id === id);
      if (!shot) continue;
      if (shot.videoUrl && shot.status === "ready") continue;

      // 批量：显式把上一镜末帧写入本镜首帧（便于预览与衔接）
      const chained = resolveChainedFirstFrame(shot, latest);
      if (chained && !shot.imageUrl) {
        updateShot(shot.id, { imageUrl: chained });
        await new Promise((r) => setTimeout(r, 0));
      }
      const refreshed =
        projectRef.current?.shots.find((s) => s.id === id) || shot;
      await generateShotVideo(refreshed, variant);
    }
  }

  function onUploadShotField(
    shot: Shot,
    field: "sceneImageUrl" | "imageUrl" | "lastFrameUrl",
    file: File,
  ) {
    const reader = new FileReader();
    reader.onload = () => {
      void updateShotMedia(shot.id, {
        [field]: String(reader.result || ""),
        status: field === "imageUrl" ? "pending" : shot.status,
        error: undefined,
      });
    };
    reader.readAsDataURL(file);
  }

  function onUploadCharacterImage(index: number, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      void updateCharacterMedia(index, {
        referenceImageUrl: String(reader.result || ""),
        locked: true,
      });
    };
    reader.readAsDataURL(file);
  }

  function onUploadCharacterThreeView(index: number, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      void updateCharacterMedia(index, {
        threeViewUrl: url,
        referenceImageUrl: url,
        locked: true,
      });
    };
    reader.readAsDataURL(file);
  }

  function addCharacter() {
    if (!project) return;
    updateProject((prev) => ({
      ...prev,
      characters: [
        ...prev.characters,
        {
          name: `角色${prev.characters.length + 1}`,
          appearance: "",
          locked: true,
          id: uid("char"),
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  }

  function removeCharacter(index: number) {
    updateProject((prev) => {
      const removed = prev.characters[index];
      const removedKey = removed ? characterKey(removed) : "";
      return {
        ...prev,
        characters: prev.characters.filter((_, i) => i !== index),
        shots: prev.shots.map((s) =>
          removedKey && s.videoCharacterKeys
            ? {
                ...s,
                videoCharacterKeys: s.videoCharacterKeys.filter(
                  (k) => k !== removedKey,
                ),
              }
            : s,
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function chainFromPrevious(shot: Shot) {
    if (!project) return;
    const prev = project.shots.find((s) => s.index === shot.index - 1);
    const frame = prev?.lastFrameUrl || prev?.imageUrl;
    if (!frame) {
      setError("上一镜尚无末帧/首帧，无法衔接");
      return;
    }
    updateShot(shot.id, {
      imageUrl: frame,
      status: "pending",
      error: undefined,
    });
    setError("");
  }

  /** 本机代理远程视频（勿走 apiFetch，避免被 apiBaseUrl 错转到上游 502） */
  async function proxyVideoForFrame(videoUrl: string): Promise<string | null> {
    try {
      const res = await fetch("/api/frame-from-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl }),
      });
      const data = await readResponseJson(res);
      if (!res.ok || !data.url) return null;
      return resolvePlayableVideoUrl(String(data.url));
    } catch {
      return null;
    }
  }

  /**
   * 从视频链接截取尾帧，写入本镜首帧。
   * 本镜/同源临时视频直接截；外链先本机代理，失败再尝试浏览器直截。
   */
  async function applyFirstFrameFromVideoUrl(
    shot: Shot,
    rawUrl?: string,
  ) {
    const url = (rawUrl || frameVideoUrl || shot.videoUrl || "").trim();
    if (!isProbablyVideoUrl(url)) {
      setError("请填写有效的视频链接，或先生成本镜视频");
      return;
    }
    setFrameFromVideoBusy(true);
    setBusyShotId(shot.id);
    setActiveShotId(shot.id);
    setError("");
    try {
      let playable = resolvePlayableVideoUrl(url);
      const isHttp = /^https?:\/\//i.test(playable);
      const isLocalTmp = /\/(?:api\/)?tmp-media\//i.test(playable);
      const isDoubaoShare = /doubao\.com\/.*video-sharing/i.test(playable);
      const sameOrigin =
        typeof window !== "undefined" &&
        isHttp &&
        playable.startsWith(window.location.origin);
      const isBlobOrData =
        playable.startsWith("blob:") || playable.startsWith("data:");

      // 外链 / 豆包分享页：本机代理解析并下载到同源
      if (isHttp && !sameOrigin && !isLocalTmp) {
        const proxied = await proxyVideoForFrame(playable);
        if (proxied) {
          playable = proxied;
        } else if (isDoubaoShare) {
          throw new Error(
            "无法解析豆包分享链接（需含 share_id、video_id，且链接未失效）",
          );
        }
      }

      let dataUrl: string | null = null;
      let lastError: Error | null = null;
      try {
        dataUrl = await extractLastFrameFromVideo(playable);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error("截取失败");
      }

      // 代理失败或截帧失败：对外链再试直截 / 再代理一次
      if (!dataUrl && isHttp && !isBlobOrData) {
        if (!isLocalTmp) {
          const proxied = await proxyVideoForFrame(
            resolvePlayableVideoUrl(url),
          );
          if (proxied) {
            try {
              dataUrl = await extractLastFrameFromVideo(proxied);
            } catch (e) {
              lastError = e instanceof Error ? e : lastError;
            }
          }
        }
        if (!dataUrl) {
          try {
            dataUrl = await extractLastFrameFromVideo(
              resolvePlayableVideoUrl(url),
            );
          } catch (e) {
            lastError = e instanceof Error ? e : lastError;
          }
        }
      }

      if (!dataUrl) {
        throw lastError || new Error("从视频取尾帧失败");
      }

      await updateShotMedia(shot.id, {
        imageUrl: dataUrl,
        status: "pending",
        error: undefined,
      });
      if (!frameVideoUrl.trim()) setFrameVideoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "从视频取尾帧失败");
    } finally {
      setFrameFromVideoBusy(false);
      setBusyShotId(null);
    }
  }

  function patchShotLines(shotId: string, lines: DialogueLine[]) {
    updateShot(shotId, {
      lines,
      dialogue: flattenDialogue(lines),
    });
  }

  function updateShotLine(
    shotId: string,
    lineId: string,
    patch: Partial<DialogueLine>,
  ) {
    const shot = projectRef.current?.shots.find((s) => s.id === shotId);
    if (!shot) return;
    let lines: DialogueLine[] = shot.lines?.length ? [...shot.lines] : [];
    if (!lines.length && shot.dialogue) {
      lines = [
        {
          id: lineId,
          kind: "dialogue",
          speaker: "",
          text: shot.dialogue,
        },
      ];
    }
    if (!lines.length) lines = [createEmptyLine()];
    if (!lines.some((l) => l.id === lineId)) {
      lines.push({
        id: lineId,
        kind: "dialogue",
        speaker: "",
        text: "",
        ...patch,
      });
    } else {
      lines = lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l));
    }
    patchShotLines(shotId, lines);
  }

  function addShotLine(shotId: string, kind: DialogueLineKind = "dialogue") {
    const shot = projectRef.current?.shots.find((s) => s.id === shotId);
    if (!shot) return;
    const base =
      shot.lines?.length
        ? shot.lines
        : shot.dialogue
          ? [
              {
                id: createEmptyLine().id,
                kind: "dialogue" as const,
                speaker: "",
                text: shot.dialogue,
              },
            ]
          : [];
    patchShotLines(shotId, [...base, createEmptyLine(kind)]);
  }

  function removeShotLine(shotId: string, lineId: string) {
    const shot = projectRef.current?.shots.find((s) => s.id === shotId);
    if (!shot?.lines) return;
    patchShotLines(
      shotId,
      shot.lines.filter((l) => l.id !== lineId),
    );
  }

  function patchCharacterIntros(shotId: string, intros: CharacterIntro[]) {
    updateShot(shotId, { characterIntros: intros });
  }

  async function generateAllCharacterPrompts() {
    if (!settings) return;
    const story = project?.premise?.trim() || premise.trim();
    if (!story) {
      setError("请先填写故事内容或生成分镜");
      return;
    }
    setScriptBusy(true);
    setError("");
    try {
      const res = await apiFetch(UPSTREAM_PATHS.enrich, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "characters",
          premise: story,
          style: project?.style || stylePrompt,
          settings,
          characters: project?.characters || [],
          shots: (project?.shots || []).map((s) => ({
            index: s.index,
            scene: s.scene,
            locationName: s.locationName,
            placeIntro: s.placeIntro,
            storyboardPrompt: s.storyboardPrompt,
            dialogue: s.dialogue,
            lines: s.lines,
            characterIntros: s.characterIntros,
          })),
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "人物提取失败");
      const list = (data.characters || []) as CharacterCard[];
      if (!list.length) throw new Error("未提取到人物，请丰富故事内容后重试");

      const now = new Date().toISOString();
      if (project) {
        updateProject((prev) => ({
          ...prev,
          updatedAt: now,
          characters: list.map((c) => ({
            ...c,
            id: c.id || uid("char"),
            locked: c.locked ?? true,
          })),
        }));
      } else {
        const next: DramaProject = {
          id: uid("proj"),
          title: story.slice(0, 12) || "未命名漫剧",
          premise: story,
          style: stylePrompt,
          aspectRatio,
          durationPerShot,
          characters: list.map((c) => ({
            ...c,
            id: c.id || uid("char"),
            locked: c.locked ?? true,
          })),
          shots: [],
          createdAt: now,
          updatedAt: now,
        };
        setProject(next);
        setActiveProjectId(next.id);
        void saveProject(next).catch(console.error);
      }

      setError(
        data.hint ||
          `已提取 ${list.length} 个角色并生成提示词，卡片已全部显示`,
      );
      setModeHint(data.provider || data.mode || "enrich");
      // 滚到角色区
      requestAnimationFrame(() => {
        document
          .getElementById("character-cards")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "人物提示词生成失败");
    } finally {
      setScriptBusy(false);
    }
  }

  async function generateAllScenePrompts() {
    if (!settings || !project) return;
    setScriptBusy(true);
    setError("");
    try {
      const res = await apiFetch(UPSTREAM_PATHS.enrich, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scenes",
          premise: project.premise || premise,
          style: project.style || stylePrompt,
          aspectRatio: project.aspectRatio || aspectRatio,
          settings,
          shots: project.shots.map((s) => ({
            index: s.index,
            scene: s.scene,
            locationName: s.locationName,
            placeIntro: s.placeIntro,
            storyboardPrompt: s.storyboardPrompt,
          })),
        }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "场景提示词生成失败");
      const list = (data.shots || []) as {
        index: number;
        scene?: string;
        locationName?: string;
        placeIntro?: string;
        scenePrompt?: string;
      }[];
      updateProject((prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        shots: prev.shots.map((s) => {
          const hit =
            list.find((x) => x.index === s.index) ||
            list.find((x) => x.index === s.index + 1);
          if (!hit) return s;
          return {
            ...s,
            scene: hit.scene || s.scene,
            locationName: hit.locationName ?? s.locationName,
            placeIntro: hit.placeIntro ?? s.placeIntro,
            scenePrompt: hit.scenePrompt || s.scenePrompt,
          };
        }),
      }));
      if (data.hint) setError(data.hint);
      setModeHint(data.provider || data.mode || "enrich");
    } catch (e) {
      setError(e instanceof Error ? e.message : "场景提示词生成失败");
    } finally {
      setScriptBusy(false);
    }
  }

  async function generateAllCharacterThreeViews() {
    if (!settings || !project) return;
    const targets = project.characters
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.appearance?.trim());
    if (!targets.length) {
      setError("请先填写或一键生成人物提示词，再批量三视图");
      return;
    }
    setError("");
    for (const { i } of targets) {
      await generateCharacterThreeView(i);
      // 降低豆包连发风控
      await new Promise((r) => setTimeout(r, 1800));
    }
  }

  async function exportAllCharacters() {
    if (!project?.characters.length) {
      setError("当前没有可导出的角色");
      return;
    }
    try {
      const pack = await buildCharacterPack(
        project.characters,
        project.title,
      );
      downloadCharacterPack(
        `${project.title || "镜叙"}-角色包.json`,
        pack,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出角色失败");
    }
  }

  async function importAllCharacters(file: File) {
    if (!project) return;
    try {
      const incoming = await readCharacterPackFile(file);
      const { characters, replaced, added, kept } = mergeCharactersByName(
        project.characters,
        incoming,
      );
      updateProject((prev) => ({
        ...prev,
        characters,
        updatedAt: new Date().toISOString(),
      }));
      setError(
        `角色包已按名称合并：更新 ${replaced} · 新增 ${added} · 保留本机 ${kept}（共 ${characters.length}）`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入角色失败");
    }
  }

  function exportStoryboard() {
    if (!project) return;
    downloadJson(`${project.title || "分镜"}.json`, {
      title: project.title,
      premise: project.premise,
      aspectRatio: project.aspectRatio,
      durationPerShot: project.durationPerShot,
      characters: project.characters,
      shots: project.shots.map((s) => ({
        index: s.index + 1,
        duration: resolveShotDuration(s, project.durationPerShot),
        scene: s.scene,
        locationName: s.locationName,
        placeIntro: s.placeIntro,
        characterIntros: s.characterIntros,
        lines: s.lines,
        dialogue: s.dialogue,
        camera: s.camera,
        storyboardPrompt: s.storyboardPrompt,
        composedPrompt: effectiveCompose(s),
        imagePrompt: s.imagePrompt,
        videoUrl: s.videoUrl,
      })),
    });
  }

  const frameRatio = project?.aspectRatio || aspectRatio;
  const activeStyle = project?.style || stylePrompt;

  function effectiveCompose(shot: Shot) {
    return composeVideoPrompt(shot, activeStyle, frameRatio);
  }

  const activeShot =
    project?.shots.find((s) => s.id === activeShotId) || project?.shots[0];

  const doubaoReady = !!settings && hasDoubaoWebSession(settings);

  const needsDoubaoLogin =
    settings &&
    !settings.useMock &&
    settings.videoProvider !== "mock" &&
    !doubaoReady;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[340px_1fr]">
      <aside className="surface h-fit space-y-4 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Wand2 size={18} className="text-cinnabar" />
          <h1 className="display text-xl font-semibold">创作台</h1>
        </div>

        {needsDoubaoLogin ? (
          <Link
            href="/settings"
            className="flex items-start gap-2 rounded-lg border border-cinnabar/30 bg-cinnabar/5 px-3 py-2.5 text-xs leading-relaxed text-cinnabar transition-colors hover:bg-cinnabar/10"
          >
            <Smartphone size={14} className="mt-0.5 shrink-0" />
            <span>
              演示已关闭且未登录豆包：请
              <span className="font-medium underline underline-offset-2">
                手机号登录豆包
              </span>
              （线上 session，本机无需代理）。
            </span>
          </Link>
        ) : null}
        <div>
          <label className="mb-1 block text-xs tracking-wider text-muted">
            故事内容
          </label>
          <textarea
            className="input-field min-h-28 resize-y text-sm leading-relaxed"
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="输入剧情，将自动生成可编辑分镜词…"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs tracking-wider text-muted">
            画面风格
          </label>
          <div className="flex flex-wrap gap-2">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStyleId(s.id);
                  if (project) {
                    updateProject((prev) => ({
                      ...prev,
                      style: s.prompt,
                      updatedAt: new Date().toISOString(),
                    }));
                  }
                }}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  styleId === s.id
                    ? "bg-ink text-paper"
                    : "bg-white/70 text-ink-soft hover:bg-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            默认 CG 国漫电影级 · 干净轮廓 · 统一光影
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">镜头数</label>
            <input
              type="number"
              min={3}
              max={8}
              className="input-field"
              value={shotCount}
              onChange={(e) => setShotCount(Number(e.target.value) || 4)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              默认单镜秒数
            </label>
            <input
              type="number"
              min={4}
              max={15}
              className="input-field"
              value={durationPerShot}
              onChange={(e) => {
                const next = clampShotDuration(Number(e.target.value));
                setDurationPerShot(next);
                if (project) {
                  updateProject((prev) => ({
                    ...prev,
                    durationPerShot: next,
                    updatedAt: new Date().toISOString(),
                  }));
                }
              }}
            />
            <p className="mt-1 text-[10px] text-muted">
              仅作新分镜默认；已有分镜请在列表或右侧单独改时长
            </p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs tracking-wider text-muted">
            Seedance 模型
          </label>
          <div className="flex gap-2">
            {(
              [
                ["mini", "2.0 Mini"],
                ["fast", "2.0 Fast"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVariant(id)}
                className={`flex-1 rounded-md px-2 py-2 text-xs ${
                  variant === id
                    ? "bg-teal text-white"
                    : "bg-white/70 text-ink-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs tracking-wider text-muted">
            画幅（全部生图/视频/预览均按此比例）
          </label>
          <div className="flex gap-2">
            {(["9:16", "16:9", "1:1"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setAspectRatio(r);
                  if (project) {
                    updateProject((prev) => ({
                      ...prev,
                      aspectRatio: r,
                      updatedAt: new Date().toISOString(),
                    }));
                  }
                }}
                className={`flex-1 rounded-md px-2 py-2 text-xs ${
                  aspectRatio === r
                    ? "bg-ink text-paper"
                    : "bg-white/70 text-ink-soft"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !premise.trim()}
            onClick={generateScript}
            className="btn-primary w-full disabled:opacity-50"
          >
            {scriptBusy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Clapperboard size={16} />
            )}
            按内容生成分镜词
          </button>
          <button
            type="button"
            disabled={busy || !premise.trim()}
            onClick={() => void generateAllCharacterPrompts()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-medium disabled:opacity-50"
          >
            {scriptBusy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Wand2 size={16} />
            )}
            一键提取人物卡片
          </button>
          <button
            type="button"
            disabled={busy || !project}
            onClick={generateAllVideos}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {phase === "videos" && busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Play size={16} />
            )}
            按分镜词批量生成视频
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          分镜 / 生图 / 视频默认使用
          <span className="text-teal"> 线上豆包网页 session </span>
          （本机无需代理）。生图为 Seedream 4.5。
        </p>

        {settings ? (
          <ChannelStatusBar
            settings={settings}
            activeAccountLabel={activeAccountLabel}
            onSelectAccount={selectStudioAccount}
          />
        ) : null}

        {error ? (
          <p className="rounded-md bg-cinnabar/10 px-3 py-2 text-xs text-cinnabar">
            {error}
          </p>
        ) : null}
      </aside>

      <section className="min-w-0 space-y-4">
        {!project ? (
          <div className="surface flex min-h-[420px] flex-col items-center justify-center rounded-xl p-8 text-center">
            <Clapperboard className="mb-4 text-teal" size={36} />
            <h2 className="display mb-2 text-2xl font-semibold">
              先生成分镜词
            </h2>
            <p className="max-w-md text-sm text-muted">
              输入故事内容 → 自动出分镜词（可改）→ 锁定角色参考图 →
              按镜点击生成 Seedance 视频。
            </p>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={generateScript}
              disabled={busy}
            >
              立即生成分镜
            </button>
          </div>
        ) : (
          <>
            <div className="surface rounded-xl p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-muted">PROJECT</p>
                  <h2 className="display text-2xl font-semibold">
                    {project.title}
                  </h2>
                </div>
                <p className="text-xs text-muted">完成度 {progress}%</p>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-ink/10">
                <motion.div
                  className="progress-bar h-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: progress / 100 }}
                />
              </div>

              <div className="mt-5" id="character-cards">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs tracking-wider text-muted">
                    角色锁定（一键提取全部人物 → 显示角色卡 → 可生成三视图）
                    {project.characters.length
                      ? ` · 共 ${project.characters.length} 人`
                      : ""}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateAllCharacterPrompts()}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      {scriptBusy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Wand2 size={12} />
                      )}
                      一键提取人物卡片
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateAllScenePrompts()}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      {scriptBusy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Wand2 size={12} />
                      )}
                      一键场景提示词
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateAllCharacterThreeViews()}
                      className="inline-flex items-center gap-1 rounded-md bg-teal px-2 py-1 text-[11px] text-white disabled:opacity-50"
                    >
                      {busyCharIndex !== null ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      一键全部三视图
                    </button>
                    <button
                      type="button"
                      disabled={busy || !project.characters.length}
                      onClick={() => void exportAllCharacters()}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      <Download size={12} />
                      导出角色包
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px]">
                      <Upload size={12} />
                      导入角色包
                      <input
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void importAllCharacters(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={exportStoryboard}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px]"
                    >
                      <Download size={12} />
                      导出分镜 JSON
                    </button>
                    <button
                      type="button"
                      onClick={addCharacter}
                      className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-[11px] text-paper"
                    >
                      <Plus size={12} />
                      添加角色
                    </button>
                  </div>
                </div>
                <label className="mb-3 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={chainPrevFrame}
                    onChange={(e) => setChainPrevFrame(e.target.checked)}
                    className="accent-[var(--teal)]"
                  />
                  镜头衔接：无本镜首帧时，默认沿用上一镜末帧（无末帧则用上一镜首帧）
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {project.characters.map((c, i) => (
                    <div
                      key={c.id || `char-${i}`}
                      className="rounded-lg border border-[var(--line)] bg-white/70 p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          className="input-field py-1.5 text-sm font-medium"
                          value={c.name}
                          onChange={(e) =>
                            updateCharacter(i, { name: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          title={c.locked ? "已锁定" : "未锁定"}
                          onClick={() =>
                            updateCharacter(i, { locked: !c.locked })
                          }
                          className={`rounded-md p-2 ${
                            c.locked
                              ? "bg-teal text-white"
                              : "bg-white text-muted"
                          }`}
                        >
                          {c.locked ? (
                            <Lock size={14} />
                          ) : (
                            <LockOpen size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCharacter(i)}
                          className="rounded-md p-2 text-muted hover:text-cinnabar"
                          title="删除角色"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <textarea
                        className="input-field mb-2 min-h-16 resize-y text-xs"
                        value={c.appearance}
                        onChange={(e) =>
                          updateCharacter(i, { appearance: e.target.value })
                        }
                        placeholder="外貌锚定描述"
                      />
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const thumbClass = `rounded object-cover ${aspectClass(project.aspectRatio)} ${
                              project.aspectRatio === "9:16"
                                ? "h-16 w-10"
                                : project.aspectRatio === "1:1"
                                  ? "h-14 w-14"
                                  : "h-12 w-20"
                            }`;
                            // jingxu-media: 不能直接当 src；其余 data/http/tmp-media 可显示
                            const pickSrc = (u?: string) =>
                              u && !isMediaRef(u) ? u : undefined;
                            const charImg =
                              pickSrc(c.threeViewUrl) ||
                              pickSrc(c.referenceImageUrl);
                            if (charImg) {
                              return (
                                <>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={charImg}
                                    alt={c.name}
                                    referrerPolicy="no-referrer"
                                    onClick={() => setPreviewUrl(charImg)}
                                    className={`cursor-zoom-in ${thumbClass}`}
                                    title="点击放大"
                                    onError={(e) => {
                                      const el = e.currentTarget;
                                      el.style.display = "none";
                                      const sib = el.nextElementSibling;
                                      if (sib instanceof HTMLElement) {
                                        sib.hidden = false;
                                      }
                                    }}
                                  />
                                  <div
                                    hidden
                                    className={`flex items-center justify-center bg-ink/5 text-[10px] text-cinnabar ${thumbClass}`}
                                    title="图片加载失败，请重新上传/生成"
                                  >
                                    失效
                                  </div>
                                </>
                              );
                            }
                            if (c.threeViewUrl || c.referenceImageUrl) {
                              return (
                                <div
                                  className={`flex items-center justify-center bg-ink/5 text-[10px] text-cinnabar ${thumbClass}`}
                                  title="图片地址无效或已失效，请重新上传/生成"
                                >
                                  失效
                                </div>
                              );
                            }
                            return (
                              <div
                                className={`flex items-center justify-center bg-ink/5 text-[10px] text-muted ${thumbClass}`}
                              >
                                无图
                              </div>
                            );
                          })()}
                          <div className="flex flex-1 flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={busy || busyCharIndex === i}
                              onClick={() => generateCharacterThreeView(i)}
                              className="inline-flex items-center gap-1 rounded-md bg-teal px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                            >
                              {busyCharIndex === i ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Sparkles size={12} />
                              )}
                              生成三视图
                            </button>
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px]">
                              <Upload size={12} />
                              上传三视图
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) onUploadCharacterThreeView(i, file);
                                }}
                              />
                            </label>
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px]">
                              <Upload size={12} />
                              参考图
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) onUploadCharacterImage(i, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                !(c.threeViewUrl || c.referenceImageUrl)
                              }
                              onClick={() =>
                                updateCharacter(i, {
                                  threeViewUrl: undefined,
                                  referenceImageUrl: undefined,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px] text-muted hover:border-cinnabar hover:text-cinnabar disabled:opacity-40"
                              title="清除角色图片"
                            >
                              <Trash2 size={12} />
                              清除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {project.characters.length === 0 ? (
                    <div className="col-span-full flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--line)] bg-white/50 p-6 text-center">
                      <p className="text-sm text-muted">
                        还没有角色卡。可从故事/分镜一键提取全部人物并生成外貌提示词。
                      </p>
                      <button
                        type="button"
                        disabled={busy || !premise.trim()}
                        onClick={() => void generateAllCharacterPrompts()}
                        className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {scriptBusy ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Wand2 size={16} />
                        )}
                        一键提取人物卡片
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <div className="surface overflow-hidden rounded-xl">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeShot?.id || "empty"}
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`relative max-h-[56vh] w-full bg-ink sm:max-h-none ${aspectClass(project.aspectRatio)}`}
                  >
                    {activeShot?.videoUrl ? (
                      <video
                        key={activeShot.videoUrl}
                        src={activeShot.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        autoPlay
                        loop
                        className="h-full w-full object-contain"
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.dataset.failed = "1";
                          updateShot(activeShot.id, {
                            error:
                              "视频地址无法播放（可能是防盗链或空链接）。请点「重置视频」后重试",
                          });
                        }}
                      />
                    ) : activeShot?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeShot.imageUrl}
                        alt={activeShot.scene}
                        referrerPolicy="no-referrer"
                        onClick={() => setPreviewUrl(activeShot.imageUrl!)}
                        className="h-full w-full cursor-zoom-in object-cover"
                        title="点击放大"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-mist/60">
                        编辑分镜词后点击「按分镜词生成视频」
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {activeShot ? (
                  <div className="space-y-3 border-t border-[var(--line)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        镜 {activeShot.index + 1} · {activeShot.scene}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-muted">本镜时长</span>
                          <div className="flex overflow-hidden rounded-md border border-[var(--line)]">
                            {([4, 6, 8, 10, 12, 15] as const).map((sec) => {
                              const cur = resolveShotDuration(
                                activeShot,
                                project.durationPerShot,
                              );
                              return (
                                <button
                                  key={sec}
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    updateShot(activeShot.id, {
                                      duration: sec,
                                    })
                                  }
                                  className={`px-1.5 py-1 text-[10px] ${
                                    cur === sec
                                      ? "bg-teal text-white"
                                      : "bg-white/80 text-muted hover:text-ink"
                                  }`}
                                >
                                  {sec}s
                                </button>
                              );
                            })}
                          </div>
                          <input
                            type="number"
                            min={4}
                            max={15}
                            className="input-field w-14 py-1 text-center text-xs"
                            value={resolveShotDuration(
                              activeShot,
                              project.durationPerShot,
                            )}
                            onChange={(e) =>
                              updateShot(activeShot.id, {
                                duration: clampShotDuration(
                                  Number(e.target.value),
                                  project.durationPerShot,
                                ),
                              })
                            }
                            title="自定义 4–15 秒"
                          />
                        </div>
                        <StatusPill status={activeShot.status} />
                      </div>
                    </div>

                    <label className="block text-xs text-muted">场景概述</label>
                    <input
                      className="input-field text-sm"
                      value={activeShot.scene}
                      onChange={(e) =>
                        updateShot(activeShot.id, { scene: e.target.value })
                      }
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-muted">
                          地点名
                        </label>
                        <input
                          className="input-field text-sm"
                          value={activeShot.locationName || ""}
                          onChange={(e) =>
                            updateShot(activeShot.id, {
                              locationName: e.target.value,
                            })
                          }
                          placeholder="如：青云城西市"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">
                          运镜
                        </label>
                        <input
                          className="input-field text-sm"
                          value={activeShot.camera}
                          onChange={(e) =>
                            updateShot(activeShot.id, {
                              camera: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        地名首次介绍（仅该地第一次出现时填写）
                      </label>
                      <textarea
                        className="input-field min-h-14 resize-y text-xs"
                        value={activeShot.placeIntro || ""}
                        onChange={(e) =>
                          updateShot(activeShot.id, {
                            placeIntro: e.target.value,
                          })
                        }
                        placeholder="例：青云城西市——摊贩云集的凡人坊市，灵草与废丹混卖"
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border border-[var(--line)] bg-white/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium">
                          人物首次登场介绍
                        </p>
                        <button
                          type="button"
                          className="rounded-md bg-ink px-2 py-1 text-[10px] text-paper"
                          onClick={() =>
                            patchCharacterIntros(activeShot.id, [
                              ...(activeShot.characterIntros || []),
                              { name: "", intro: "" },
                            ])
                          }
                        >
                          + 添加人物介绍
                        </button>
                      </div>
                      {(activeShot.characterIntros || []).length === 0 ? (
                        <p className="text-[11px] text-muted">
                          无。角色首次出场时可添加姓名与身份介绍。
                        </p>
                      ) : (
                        (activeShot.characterIntros || []).map((ci, idx) => (
                          <div
                            key={`intro-${activeShot.id}-${idx}`}
                            className="grid gap-2 sm:grid-cols-[120px_1fr_auto]"
                          >
                            <input
                              className="input-field py-1.5 text-xs"
                              placeholder="人名"
                              value={ci.name}
                              onChange={(e) => {
                                const next = [
                                  ...(activeShot.characterIntros || []),
                                ];
                                next[idx] = { ...ci, name: e.target.value };
                                patchCharacterIntros(activeShot.id, next);
                              }}
                            />
                            <input
                              className="input-field py-1.5 text-xs"
                              placeholder="首次登场介绍"
                              value={ci.intro}
                              onChange={(e) => {
                                const next = [
                                  ...(activeShot.characterIntros || []),
                                ];
                                next[idx] = { ...ci, intro: e.target.value };
                                patchCharacterIntros(activeShot.id, next);
                              }}
                            />
                            <button
                              type="button"
                              className="rounded-md p-2 text-muted hover:text-cinnabar"
                              onClick={() =>
                                patchCharacterIntros(
                                  activeShot.id,
                                  (activeShot.characterIntros || []).filter(
                                    (_, i) => i !== idx,
                                  ),
                                )
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2 rounded-lg border border-[var(--line)] bg-white/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium">
                          多台词（对白 / 独白 / 旁白 / 内心）
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              ["dialogue", "对白"],
                              ["monologue", "独白"],
                              ["aside", "旁白"],
                              ["inner", "内心"],
                            ] as const
                          ).map(([k, label]) => (
                            <button
                              key={k}
                              type="button"
                              className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] hover:bg-white"
                              onClick={() => addShotLine(activeShot.id, k)}
                            >
                              + {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(activeShot.lines?.length
                        ? activeShot.lines
                        : activeShot.dialogue
                          ? [
                              {
                                id: `legacy-${activeShot.id}`,
                                kind: "dialogue" as const,
                                speaker: "",
                                text: activeShot.dialogue,
                              },
                            ]
                          : []
                      ).map((line) => (
                        <div
                          key={line.id}
                          className="grid gap-2 rounded-md bg-white/70 p-2 sm:grid-cols-[88px_100px_1fr_auto]"
                        >
                          <select
                            className="input-field py-1.5 text-[11px]"
                            value={line.kind}
                            onChange={(e) =>
                              updateShotLine(activeShot.id, line.id, {
                                kind: e.target.value as DialogueLineKind,
                              })
                            }
                          >
                            <option value="dialogue">对白</option>
                            <option value="monologue">独白</option>
                            <option value="aside">旁白</option>
                            <option value="inner">内心</option>
                          </select>
                          <input
                            className="input-field py-1.5 text-xs"
                            placeholder={
                              line.kind === "aside" ? "（旁白可空）" : "说话人"
                            }
                            value={line.speaker || ""}
                            onChange={(e) =>
                              updateShotLine(activeShot.id, line.id, {
                                speaker: e.target.value,
                              })
                            }
                          />
                          <input
                            className="input-field py-1.5 text-xs"
                            placeholder={`${kindLabel(line.kind)}内容`}
                            value={line.text}
                            onChange={(e) =>
                              updateShotLine(activeShot.id, line.id, {
                                text: e.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            className="rounded-md p-2 text-muted hover:text-cinnabar"
                            onClick={() =>
                              removeShotLine(activeShot.id, line.id)
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      {!activeShot.lines?.length && !activeShot.dialogue ? (
                        <p className="text-[11px] text-muted">
                          尚无台词。可添加对白、独白、旁白或内心。
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <label className="block text-xs text-muted">
                        分镜词（生成视频时会自动拼上地名/人物介绍与台词）
                      </label>
                      <button
                        type="button"
                        className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] hover:bg-white"
                        onClick={() =>
                          updateShot(activeShot.id, {
                            storyboardPrompt: buildMergedStoryboard(activeShot),
                          })
                        }
                      >
                        台词介绍写入分镜词
                      </button>
                    </div>
                    <textarea
                      className="input-field min-h-28 resize-y text-sm leading-relaxed"
                      value={activeShot.storyboardPrompt}
                      onChange={(e) =>
                        updateShot(activeShot.id, {
                          storyboardPrompt: e.target.value,
                        })
                      }
                    />
                    <details className="rounded-md border border-[var(--line)] bg-white/40 px-3 py-2 text-[11px] text-muted">
                      <summary className="cursor-pointer select-none text-ink">
                        预览实际投喂 Seedance 的合成提示词
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-ink/80">
                        {effectiveCompose(activeShot)}
                      </pre>
                    </details>

                    <div className="space-y-2 rounded-lg border border-[var(--line)] bg-white/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-ink">
                          场景图 · 首帧 · 末帧
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => generateShotFramePack(activeShot)}
                          className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-[11px] text-paper disabled:opacity-50"
                        >
                          {busyShotId === activeShot.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          一键生成三图
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {(
                          [
                            {
                              key: "sceneImageUrl" as const,
                              label: "场景图",
                              url: activeShot.sceneImageUrl,
                              onGen: () => generateSceneImage(activeShot),
                            },
                            {
                              key: "imageUrl" as const,
                              label: "首帧",
                              url: activeShot.imageUrl,
                              onGen: () => generateShotImage(activeShot),
                            },
                            {
                              key: "lastFrameUrl" as const,
                              label: "末帧",
                              url: activeShot.lastFrameUrl,
                              onGen: () => generateLastFrame(activeShot),
                            },
                          ] as const
                        ).map((slot) => (
                          <div key={slot.key} className="space-y-1.5">
                            <p className="text-[11px] text-muted">
                              {slot.label}
                              {slot.key === "sceneImageUrl" ? " · 无人" : ""}
                              {` · ${project.aspectRatio}`}
                            </p>
                            {slot.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={slot.url}
                                alt={slot.label}
                                referrerPolicy="no-referrer"
                                onClick={() => setPreviewUrl(slot.url!)}
                                className={`w-full cursor-zoom-in rounded object-cover ${aspectClass(project.aspectRatio)}`}
                                title="点击放大"
                              />
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={slot.onGen}
                                className={`flex w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-[var(--line)] bg-ink/[0.03] text-[10px] text-muted transition hover:border-teal hover:text-teal disabled:opacity-50 ${aspectClass(project.aspectRatio)}`}
                                title={`点击自动生成${slot.label}`}
                              >
                                <Sparkles size={14} />
                                点击生成{slot.label}
                              </button>
                            )}
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={slot.onGen}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-teal px-2 py-1.5 text-[10px] font-medium text-white disabled:opacity-50"
                              >
                                {busyShotId === activeShot.id ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Sparkles size={11} />
                                )}
                                生成
                              </button>
                              <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-[var(--line)] px-2 py-1.5 text-[10px]">
                                <Upload size={11} />
                                上传
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      onUploadShotField(
                                        activeShot,
                                        slot.key,
                                        file,
                                      );
                                    }
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                disabled={busy || !slot.url}
                                onClick={() =>
                                  updateShot(activeShot.id, {
                                    [slot.key]: undefined,
                                  })
                                }
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--line)] px-2 py-1.5 text-[10px] text-muted hover:border-cinnabar hover:text-cinnabar disabled:opacity-40"
                                title={`清除${slot.label}`}
                              >
                                <Trash2 size={11} />
                                清除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeShot.index > 0 ? (
                          <button
                            type="button"
                            disabled={busy || frameFromVideoBusy}
                            onClick={() => chainFromPrevious(activeShot)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px]"
                          >
                            <Link2 size={12} />
                            沿用上一镜末帧作首帧
                          </button>
                        ) : null}
                        {activeShot.videoUrl ? (
                          <button
                            type="button"
                            disabled={busy || frameFromVideoBusy}
                            onClick={() =>
                              applyFirstFrameFromVideoUrl(
                                activeShot,
                                activeShot.videoUrl,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px]"
                          >
                            {frameFromVideoBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Clapperboard size={12} />
                            )}
                            本镜视频尾帧作首帧
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-1.5 rounded-md border border-dashed border-[var(--line)] bg-white/40 px-2.5 py-2">
                        <p className="text-[11px] font-medium text-ink">
                          视频链接 → 尾帧作首帧
                        </p>
                        <p className="text-[10px] leading-relaxed text-muted">
                          支持豆包分享页（video-sharing）或 mp4
                          直链；截取最后一帧写入本镜首帧
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <input
                            className="input-field min-w-0 flex-1 text-[11px]"
                            placeholder="豆包分享链接或 mp4 地址"
                            value={frameVideoUrl}
                            onChange={(e) => setFrameVideoUrl(e.target.value)}
                            disabled={frameFromVideoBusy}
                          />
                          <button
                            type="button"
                            disabled={
                              busy ||
                              frameFromVideoBusy ||
                              !frameVideoUrl.trim()
                            }
                            onClick={() =>
                              applyFirstFrameFromVideoUrl(activeShot)
                            }
                            className="inline-flex items-center gap-1 rounded-md bg-teal px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                          >
                            {frameFromVideoBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Clapperboard size={12} />
                            )}
                            取尾帧
                          </button>
                        </div>
                      </div>
                    </div>

                    {project.characters.length ? (
                      <div className="space-y-2 rounded-lg border border-[var(--line)] bg-white/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-ink">
                            生成视频所用角色
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                updateShot(activeShot.id, {
                                  videoCharacterKeys: matchShotCharacters(
                                    activeShot,
                                    project.characters,
                                  ).map(characterKey),
                                })
                              }
                              className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[10px] text-muted hover:text-ink"
                            >
                              按分镜自动勾选
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                updateShot(activeShot.id, {
                                  videoCharacterKeys:
                                    project.characters.map(characterKey),
                                })
                              }
                              className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[10px] text-muted hover:text-ink"
                            >
                              全选
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                updateShot(activeShot.id, {
                                  videoCharacterKeys: [],
                                })
                              }
                              className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[10px] text-muted hover:text-ink"
                            >
                              清空
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {project.characters.map((c) => {
                            const key = characterKey(c);
                            const autoKeys = matchShotCharacters(
                              activeShot,
                              project.characters,
                            ).map(characterKey);
                            const selected =
                              activeShot.videoCharacterKeys !== undefined
                                ? activeShot.videoCharacterKeys.includes(key)
                                : autoKeys.includes(key);
                            const hasImg = Boolean(
                              c.threeViewUrl || c.referenceImageUrl,
                            );
                            return (
                              <label
                                key={key || c.name}
                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] ${
                                  selected
                                    ? "border-teal/40 bg-teal/10 text-ink"
                                    : "border-[var(--line)] bg-white/70 text-muted"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-[var(--teal,#2a9aa4)]"
                                  checked={selected}
                                  disabled={busy}
                                  onChange={() => {
                                    const current =
                                      activeShot.videoCharacterKeys !==
                                      undefined
                                        ? [...activeShot.videoCharacterKeys]
                                        : [...autoKeys];
                                    const next = selected
                                      ? current.filter((k) => k !== key)
                                      : [...current, key];
                                    updateShot(activeShot.id, {
                                      videoCharacterKeys: next,
                                    });
                                  }}
                                />
                                <span>{c.name || "未命名"}</span>
                                {!hasImg ? (
                                  <span className="text-[10px] text-cinnabar">
                                    缺图
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted">
                          勾选后点击下方生成；只上传已勾选且有参考图的角色。
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted">
                        暂无角色卡，生成视频将不附带角色参考图
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => generateShotVideo(activeShot, "mini")}
                        className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busyShotId === activeShot.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Play size={14} />
                        )}
                        Mini 生成视频
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => generateShotVideo(activeShot, "fast")}
                        className="inline-flex items-center gap-1.5 rounded-md bg-cinnabar px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busyShotId === activeShot.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Play size={14} />
                        )}
                        Fast 生成视频
                      </button>
                      {activeShot.videoUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() => copyShotVideoLink(activeShot)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-xs text-ink hover:bg-paper"
                          >
                            <Copy size={14} />
                            {copiedVideoId === activeShot.id
                              ? activeShot.videoUrl.startsWith("data:")
                                ? "已下载"
                                : "已复制"
                              : activeShot.videoUrl.startsWith("data:")
                                ? "下载视频"
                                : "复制视频链接"}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadShotVideo(activeShot)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-xs text-ink hover:bg-paper"
                          >
                            <Download size={14} />
                            下载视频
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          updateShot(activeShot.id, {
                            videoUrl: undefined,
                            status: "pending",
                            error: undefined,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted hover:bg-white"
                      >
                        <RefreshCw size={14} />
                        重置视频
                      </button>
                    </div>

                    {activeShot.videoUrl ? (
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">
                          视频链接（可复制 / 下载）
                        </label>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            className="input-field min-w-0 flex-1 truncate font-mono text-[11px]"
                            value={displayVideoLink(activeShot.videoUrl)}
                            title={
                              activeShot.videoUrl.startsWith("data:")
                                ? "内嵌视频，请使用下载"
                                : resolveCopyableVideoUrl(activeShot.videoUrl)
                            }
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.currentTarget.select()}
                          />
                          <button
                            type="button"
                            onClick={() => copyShotVideoLink(activeShot)}
                            className="shrink-0 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs text-ink hover:bg-paper"
                          >
                            {copiedVideoId === activeShot.id
                              ? activeShot.videoUrl.startsWith("data:")
                                ? "已下载"
                                : "已复制"
                              : activeShot.videoUrl.startsWith("data:")
                                ? "下载"
                                : "复制"}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadShotVideo(activeShot)}
                            className="shrink-0 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs text-ink hover:bg-paper"
                            title="下载 mp4"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {activeShot.usedModel ? (
                      <p className="text-[11px] text-muted">
                        上次：{activeShot.usedModel}
                        {activeShot.usedAccountLabel
                          ? ` · ${activeShot.usedAccountLabel}`
                          : ""}
                        {activeShot.triedChannels?.length
                          ? ` · 路径 ${activeShot.triedChannels.join(" → ")}`
                          : ""}
                      </p>
                    ) : null}
                    {busyShotId === activeShot.id ? (
                      <p className="flex items-center gap-2 text-xs text-teal">
                        <Loader2 size={14} className="animate-spin" />
                        正在用 Seedance 按分镜词生成…
                      </p>
                    ) : null}
                    {activeShot.error ? (
                      <p className="text-xs text-cinnabar">{activeShot.error}</p>
                    ) : null}

                    <div className="rounded-lg border border-[var(--line)] bg-white/80 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                        <MessageSquare size={14} className="text-teal" />
                        视频对话
                        {activeShot.videoChat?.matchedCharacterNames?.length
                          ? ` · ${activeShot.videoChat.matchedCharacterNames.join("、")}`
                          : ""}
                      </div>
                      <div className="mb-2 max-h-48 space-y-2 overflow-y-auto rounded-md bg-paper/60 p-2">
                        {(activeShot.videoChat?.messages || []).length === 0 ? (
                          <p className="text-[11px] text-muted">
                            生成视频后，豆包返回的说明会出现在这里，可继续追问改词/补图。
                          </p>
                        ) : (
                          activeShot.videoChat!.messages.map((m) => (
                            <div
                              key={m.id}
                              className={`rounded-md px-2 py-1.5 text-xs leading-relaxed ${
                                m.role === "user"
                                  ? "ml-6 bg-teal/10 text-ink"
                                  : "mr-6 bg-white text-ink"
                              }`}
                            >
                              <span className="mb-0.5 block text-[10px] text-muted">
                                {m.role === "user" ? "你" : "豆包"}
                              </span>
                              <p className="whitespace-pre-wrap">{m.text}</p>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="input-field flex-1 text-xs"
                          placeholder="回复豆包…"
                          value={
                            activeShotId === activeShot.id ? chatDraft : ""
                          }
                          onChange={(e) => setChatDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void replyVideoChat(activeShot);
                            }
                          }}
                          disabled={chatReplyBusy || busyShotId === activeShot.id}
                        />
                        <button
                          type="button"
                          disabled={
                            chatReplyBusy ||
                            !chatDraft.trim() ||
                            busyShotId === activeShot.id
                          }
                          onClick={() => void replyVideoChat(activeShot)}
                          className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50"
                        >
                          {chatReplyBusy ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            "发送"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                {project.shots.map((shot) => (
                  <div
                    key={shot.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      activeShot?.id === shot.id
                        ? "border-teal bg-white"
                        : "border-[var(--line)] bg-white/50"
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setActiveShotId(shot.id)}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold tracking-wider">
                          SHOT {String(shot.index + 1).padStart(2, "0")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <label
                            className="inline-flex items-center gap-0.5 text-[10px] text-muted"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <select
                              className="rounded border border-[var(--line)] bg-white px-1 py-0.5 text-[10px] text-ink"
                              value={resolveShotDuration(
                                shot,
                                project.durationPerShot,
                              )}
                              disabled={busy}
                              title="本镜时长（单独设置）"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateShot(shot.id, {
                                  duration: clampShotDuration(
                                    Number(e.target.value),
                                    project.durationPerShot,
                                  ),
                                });
                              }}
                            >
                              {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
                                (sec) => (
                                  <option key={sec} value={sec}>
                                    {sec}s
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <StatusPill status={shot.status} />
                        </div>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted">
                        {shot.dialogue ||
                          shot.storyboardPrompt ||
                          shot.scene}
                        {shot.placeIntro ? " · 含地名介绍" : ""}
                        {shot.characterIntros?.length
                          ? ` · 人物介绍×${shot.characterIntros.length}`
                          : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => generateShotVideo(shot, variant)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-ink px-2 py-1.5 text-[11px] font-medium text-paper disabled:opacity-50"
                    >
                      {busyShotId === shot.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      按分镜词生成（{variant === "fast" ? "Fast" : "Mini"}）
                    </button>
                    {shot.videoUrl ? (
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyShotVideoLink(shot);
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-ink hover:bg-white"
                        >
                          <Copy size={11} />
                          {copiedVideoId === shot.id
                            ? shot.videoUrl.startsWith("data:")
                              ? "已下载"
                              : "已复制"
                            : shot.videoUrl.startsWith("data:")
                              ? "下载"
                              : "复制链接"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadShotVideo(shot);
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-[var(--line)] px-2 py-1 text-ink hover:bg-white"
                          title="下载视频"
                        >
                          <Download size={11} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="w-full rounded-lg border border-dashed border-[var(--line)] px-3 py-3 text-xs text-muted hover:bg-white/60"
                  onClick={() => {
                    if (project) {
                      deleteProject(project.id).catch(console.error);
                      setActiveProjectId(null);
                      setProject(null);
                      setPhase("idle");
                    }
                  }}
                >
                  清空当前项目
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <AnimatePresence>
        {previewUrl ? (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
            onClick={() => setPreviewUrl(null)}
            role="dialog"
            aria-modal="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="预览"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink"
              onClick={() => setPreviewUrl(null)}
            >
              关闭
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StatusPill({ status }: { status: Shot["status"] }) {
  const map: Record<Shot["status"], string> = {
    pending: "待生成",
    scripting: "编剧中",
    imaging: "生图中",
    animating: "视频中",
    ready: "已完成",
    error: "失败",
  };
  const color =
    status === "ready"
      ? "text-teal"
      : status === "error"
        ? "text-cinnabar"
        : "text-muted";
  return <span className={`text-[10px] ${color}`}>{map[status]}</span>;
}
