<template>
  <view class="page">
    <text class="kicker">GALLERY</text>
    <text class="h1">成片库</text>
    <text class="muted">成片与项目已合并到「项目」页：导入导出、新建删除、带缓存进入创作。</text>
    <view class="empty">
      <button class="primary" @click="goProjects">前往项目</button>
      <button class="ghost" @click="goStudio">继续创作</button>
    </view>
    <AppTab current="/pages/gallery/index" />
  </view>
</template>

<script>
import AppTab from "../../components/AppTab.vue";

export default {
  components: { AppTab },
  methods: {
    goProjects() {
      uni.reLaunch({ url: "/pages/projects/index" });
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
.muted { display: block; color: #5c6b6e; font-size: 26rpx; line-height: 1.5; }
.empty {
  margin-top: 48rpx;
  padding: 48rpx;
  background: #fff;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.primary, .ghost {
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
  margin: 0;
}
.primary { background: #c83c28; color: #fff; }
.ghost { background: #122022; color: #eef4f5; }
</style>
