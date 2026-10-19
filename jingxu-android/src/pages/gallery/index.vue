<template>
  <view class="page">
    <text class="kicker">GALLERY</text>
    <text class="h1">成片库</text>
    <text class="muted">项目保存在本机。点开回到创作台继续改分镜或出片。</text>

    <view v-if="!projects.length" class="empty">
      <text class="muted">还没有成片。</text>
      <button class="primary" @click="goStudio">前往创作台</button>
    </view>

    <view v-for="p in projects" :key="p.id" class="card">
      <image
        v-if="coverOf(p) && !isVideo(coverOf(p))"
        class="cover"
        :src="coverOf(p)"
        mode="aspectFill"
      />
      <video
        v-else-if="coverOf(p)"
        class="cover"
        :src="coverOf(p)"
        :controls="false"
        object-fit="cover"
      />
      <view v-else class="cover placeholder">无封面</view>
      <view class="body">
        <text class="h3">{{ p.title || "未命名漫剧" }}</text>
        <text class="muted">{{ p.aspectRatio }} · {{ readyCount(p) }}/{{ p.shots.length }} 镜完成</text>
        <text class="muted line">{{ p.premise }}</text>
        <view class="row">
          <button class="ghost" @click="open(p.id)">继续创作</button>
          <button class="danger" @click="remove(p.id)">删除</button>
        </view>
      </view>
    </view>
    <AppTab current="/pages/gallery/index" />
  </view>
</template>

<script>
import AppTab from "../../components/AppTab.vue";
import { deleteProject, loadProjects, setActiveProjectId } from "../../common/jingxu.js";

export default {
  components: { AppTab },
  data() {
    return { projects: [] };
  },
  onShow() {
    this.projects = loadProjects();
  },
  methods: {
    coverOf(p) {
      return p.coverUrl || p.shots.find((s) => s.imageUrl)?.imageUrl || p.shots.find((s) => s.videoUrl)?.videoUrl || "";
    },
    isVideo(url) {
      return /\.mp4|\.webm|video\//i.test(url || "");
    },
    readyCount(p) {
      return (p.shots || []).filter((s) => s.status === "ready").length;
    },
    open(id) {
      setActiveProjectId(id);
      uni.reLaunch({ url: "/pages/studio/index" });
    },
    remove(id) {
      uni.showModal({
        title: "删除项目",
        content: "本机成片会被删掉。",
        success: (res) => {
          if (!res.confirm) return;
          deleteProject(id);
          this.projects = loadProjects();
        },
      });
    },
    goStudio() {
      uni.reLaunch({ url: "/pages/studio/index" });
    },
  },
};
</script>

<style scoped>
.page { padding: 32rpx 32rpx 160rpx; }
.kicker { color: #2a9aa4; letter-spacing: 4rpx; font-size: 22rpx; }
.h1 { display: block; margin: 8rpx 0 12rpx; font-size: 48rpx; font-weight: 600; }
.h3 { display: block; font-size: 32rpx; font-weight: 600; }
.muted { display: block; color: #5c6b6e; font-size: 26rpx; }
.line { margin-top: 8rpx; overflow: hidden; max-height: 72rpx; }
.empty { margin-top: 48rpx; padding: 48rpx; background: #fff; border-radius: 20rpx; }
.card { margin-top: 28rpx; background: #fff; border-radius: 20rpx; overflow: hidden; }
.cover { width: 100%; height: 360rpx; background: #122022; }
.placeholder { color: #eef4f5; display: flex; align-items: center; justify-content: center; }
.body { padding: 24rpx; }
.row { display: flex; gap: 16rpx; margin-top: 16rpx; }
.primary, .ghost, .danger {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  border: none;
}
.primary { background: #c83c28; color: #fff; }
.ghost { background: #122022; color: #eef4f5; }
.danger { background: #f8e4e0; color: #c83c28; }
</style>
