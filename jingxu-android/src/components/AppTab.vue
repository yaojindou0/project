<template>
  <view class="tab">
    <view
      v-for="item in items"
      :key="item.path"
      class="tab-item"
      :class="{ on: current === item.path }"
      @click="go(item.path)"
    >
      <text>{{ item.label }}</text>
    </view>
  </view>
</template>

<script>
export default {
  props: { current: { type: String, required: true } },
  data() {
    return {
      items: [
        { path: "/pages/studio/index", label: "创作" },
        { path: "/pages/settings/index", label: "设置" },
      ],
    };
  },
  methods: {
    go(path) {
      if (path === this.current) return;
      uni.reLaunch({ url: path });
    },
  },
};
</script>

<style scoped>
.tab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  height: 110rpx;
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(238, 244, 245, 0.96);
  border-top: 1px solid rgba(18, 32, 34, 0.08);
}
.tab-item {
  flex: 1;
  margin: 12rpx 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72rpx;
  border-radius: 14rpx;
  background: #e4ecee;
  color: #5c6b6e;
  font-size: 26rpx;
}
.tab-item.on {
  background: #122022;
  color: #eef4f5;
  font-weight: 600;
}
</style>
