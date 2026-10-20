<template>
  <view class="page">
    <text class="kicker">PROJECTS</text>
    <text class="h1">项目</text>
    <text class="muted">
      新建、导入、导出、删除漫剧项目。点击项目带缓存进入创作台。当前缓存默认绑定「{{ defaultTitle }}」。
    </text>

    <view class="toolbar">
      <button class="primary" @click="createNew">新建项目</button>
      <button class="ghost" :disabled="busy" @click="doImport">导入项目</button>
    </view>
    <text v-if="hint" class="hint" :class="{ bad: hintBad }">{{ hint }}</text>

    <view v-if="!projects.length" class="empty">
      <text class="muted">还没有项目。可新建「{{ defaultTitle }}」，或导入完整项目包。</text>
    </view>

    <view
      v-for="p in projects"
      :key="p.id"
      class="card"
      :class="{ active: p.id === activeId }"
    >
      <view class="cover-hit" @click="open(p)">
        <image
          v-if="coverOf(p) && !isVideo(coverOf(p))"
          class="cover"
          :src="mediaSrc(coverOf(p))"
          mode="aspectFill"
        />
        <view v-else class="cover placeholder">
          <text>{{ p.id === activeId ? "当前 · 点此进入" : "点此进入创作" }}</text>
        </view>
      </view>
      <view class="body">
        <view class="title-row" @click="open(p)">
          <text class="h3">{{ p.title || defaultTitle }}</text>
          <text v-if="p.id === activeId" class="badge">当前</text>
        </view>
        <text class="muted">
          {{ p.aspectRatio || "9:16" }} · {{ readyCount(p) }}/{{ (p.shots || []).length }} 镜 ·
          角色 {{ (p.characters || []).length }}
        </text>
        <text class="muted line">{{ p.premise || "暂无故事梗概" }}</text>
        <text class="muted tiny">更新 {{ formatTime(p.updatedAt) }}</text>
        <view class="row">
          <button class="ink" @click="open(p)">进入创作</button>
          <button class="soft" @click="rename(p)">改名</button>
          <button class="soft" :disabled="busy" @click="doExport(p)">导出</button>
          <button class="danger" @click="remove(p)">删除</button>
        </view>
      </view>
    </view>

    <AppTab current="/pages/projects/index" />
  </view>
</template>

<script>
import AppTab from "../../components/AppTab.vue";
import {
  DEFAULT_PROJECT_TITLE,
  createEmptyProject,
  deleteProject,
  ensureDefaultProjectBound,
  exportProjectById,
  importProjectFromFile,
  loadActiveProject,
  loadProjects,
  setActiveProjectId,
  saveProjectAsync,
} from "../../common/jingxu.js";
import { hydrateProjectMedia } from "../../common/media-db.js";

export default {
  components: { AppTab },
  data() {
    return {
      projects: [],
      activeId: "",
      busy: false,
      hint: "",
      hintBad: false,
      defaultTitle: DEFAULT_PROJECT_TITLE,
    };
  },
  async onShow() {
    try {
      await ensureDefaultProjectBound(DEFAULT_PROJECT_TITLE);
    } catch (e) {
      this.hint = e?.message || "绑定默认项目失败";
      this.hintBad = true;
    }
    await this.refresh();
  },
  methods: {
    async refresh() {
      const raw = loadProjects();
      this.activeId = loadActiveProject()?.id || "";
      const hydrated = [];
      for (const p of raw) {
        try {
          hydrated.push(await hydrateProjectMedia(p));
        } catch {
          hydrated.push(p);
        }
      }
      this.projects = hydrated;
    },
    coverOf(p) {
      return (
        p.coverUrl ||
        p.shots?.find((s) => s.imageUrl)?.imageUrl ||
        p.shots?.find((s) => s.sceneImageUrl)?.sceneImageUrl ||
        ""
      );
    },
    isVideo(url) {
      return /\.mp4|\.webm|video\/|data:video/i.test(url || "");
    },
    mediaSrc(url) {
      if (!url) return "";
      if (/^(https?:|data:|blob:)/i.test(url)) return url;
      if (url.startsWith("/") && typeof location !== "undefined") {
        return `${location.origin}${url}`;
      }
      return url;
    },
    readyCount(p) {
      return (p.shots || []).filter((s) => s.status === "ready" || s.videoUrl).length;
    },
    formatTime(iso) {
      if (!iso) return "—";
      try {
        const d = new Date(iso);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } catch {
        return "—";
      }
    },
    open(p) {
      setActiveProjectId(p.id);
      uni.reLaunch({ url: "/pages/studio/index" });
    },
    async askTitle(initial, dialogTitle) {
      const fallback = initial || DEFAULT_PROJECT_TITLE;
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        const t = window.prompt(dialogTitle || "项目名称", fallback);
        if (t === null) return null;
        return String(t).trim() || fallback;
      }
      const modal = await new Promise((resolve) => {
        uni.showModal({
          title: dialogTitle || "项目名称",
          editable: true,
          placeholderText: fallback,
          content: fallback,
          success: resolve,
          fail: () => resolve({ confirm: false }),
        });
      });
      if (!modal.confirm) return null;
      return String(modal.content || "").trim() || fallback;
    },
    async createNew() {
      const title = await this.askTitle(DEFAULT_PROJECT_TITLE, "新建项目");
      if (title === null) return;
      try {
        const project = createEmptyProject({ title });
        await saveProjectAsync(project);
        setActiveProjectId(project.id);
        this.hint = `已新建「${title}」`;
        this.hintBad = false;
        await this.refresh();
        uni.reLaunch({ url: "/pages/studio/index" });
      } catch (e) {
        this.hint = e?.message || "新建失败";
        this.hintBad = true;
      }
    },
    async rename(p) {
      const title = await this.askTitle(p.title || DEFAULT_PROJECT_TITLE, "重命名项目");
      if (title === null) return;
      try {
        const next = {
          ...p,
          title,
          updatedAt: new Date().toISOString(),
        };
        await saveProjectAsync(next);
        this.hint = `已改名为「${title}」`;
        this.hintBad = false;
        await this.refresh();
      } catch (e) {
        this.hint = e?.message || "改名失败";
        this.hintBad = true;
      }
    },
    async doImport() {
      this.busy = true;
      this.hint = "";
      try {
        const project = await importProjectFromFile();
        this.hint = `已导入「${project.title}」并设为当前项目`;
        this.hintBad = false;
        await this.refresh();
        uni.showModal({
          title: "导入成功",
          content: `「${project.title}」已设为当前项目，是否立即进入创作台？`,
          success: (res) => {
            if (res.confirm) this.open(project);
          },
        });
      } catch (e) {
        if (!/取消/.test(e?.message || "")) {
          this.hint = e?.message || "导入失败";
          this.hintBad = true;
        }
      } finally {
        this.busy = false;
      }
    },
    async doExport(p) {
      this.busy = true;
      this.hint = "";
      try {
        await exportProjectById(p.id);
        this.hint = `已导出「${p.title || this.defaultTitle}」完整项目包（含角色/分镜/故事/媒体）`;
        this.hintBad = false;
      } catch (e) {
        this.hint = e?.message || "导出失败";
        this.hintBad = true;
      } finally {
        this.busy = false;
      }
    },
    remove(p) {
      uni.showModal({
        title: "删除项目",
        content: `确定删除「${p.title || this.defaultTitle}」？本机缓存的分镜与媒体一并清除。`,
        success: async (res) => {
          if (!res.confirm) return;
          deleteProject(p.id);
          if (this.activeId === p.id) {
            const rest = loadProjects();
            if (rest[0]) setActiveProjectId(rest[0].id);
            else {
              try {
                await ensureDefaultProjectBound(DEFAULT_PROJECT_TITLE);
              } catch {
                /* ignore */
              }
            }
          }
          this.hint = "已删除";
          this.hintBad = false;
          await this.refresh();
        },
      });
    },
  },
};
</script>

<style scoped>
.page {
  padding: 32rpx 32rpx 160rpx;
}
.kicker {
  color: #2a9aa4;
  letter-spacing: 4rpx;
  font-size: 22rpx;
}
.h1 {
  display: block;
  margin: 8rpx 0 12rpx;
  font-size: 48rpx;
  font-weight: 600;
  color: #122022;
}
.h3 {
  font-size: 32rpx;
  font-weight: 600;
  color: #122022;
}
.muted {
  display: block;
  color: #5c6b6e;
  font-size: 26rpx;
  line-height: 1.5;
}
.line {
  margin-top: 8rpx;
  overflow: hidden;
  max-height: 72rpx;
}
.tiny {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8b949e;
}
.toolbar {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
}
.hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #1f6f78;
}
.hint.bad {
  color: #c83c28;
}
.empty {
  margin-top: 48rpx;
  padding: 48rpx;
  background: #fff;
  border-radius: 20rpx;
}
.card {
  margin-top: 28rpx;
  background: #fff;
  border-radius: 20rpx;
  overflow: hidden;
  border: 2rpx solid transparent;
}
.card.active {
  border-color: rgba(42, 154, 164, 0.55);
}
.cover-hit {
  width: 100%;
}
.cover {
  width: 100%;
  height: 280rpx;
  background: #122022;
  display: block;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(238, 244, 245, 0.7);
  font-size: 26rpx;
}
.body {
  padding: 24rpx;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.badge {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(42, 154, 164, 0.15);
  color: #1f6f78;
  font-size: 20rpx;
  font-weight: 600;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}
.primary,
.ghost,
.ink,
.soft,
.danger {
  flex: 1 1 calc(50% - 12rpx);
  min-width: calc(50% - 12rpx);
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  border: none;
  margin: 0;
  padding: 0;
}
.toolbar .primary,
.toolbar .ghost {
  flex: 1;
  min-width: 0;
}
.primary {
  background: #c83c28;
  color: #fff;
}
.ghost {
  background: #122022;
  color: #eef4f5;
}
.ink {
  background: #2a9aa4;
  color: #fff;
}
.soft {
  background: #e4ecee;
  color: #122022;
}
.danger {
  background: #f8e4e0;
  color: #c83c28;
}
.primary[disabled],
.ghost[disabled],
.soft[disabled] {
  opacity: 0.45;
}
</style>
