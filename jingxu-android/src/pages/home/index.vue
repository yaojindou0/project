<template>
  <view class="page">
    <view class="hero">
      <text class="brand">镜叙</text>
      <text class="title">一句话，长成一部竖屏漫剧。</text>
      <text class="desc">
        故事拆成可编辑分镜，豆包登录后出图出片。即梦与小云雀可在设置里手动切换。本页是安卓端，生成请求发往你填写的镜叙服务。
      </text>
      <button class="primary" @click="goStudio">开始生成</button>
    </view>

    <view class="block">
      <text class="kicker">CHANNELS</text>
      <text class="h2">豆包为主，即梦 · 小云雀辅助</text>
      <text class="muted">额度用手机号验证码或粘贴 session。可存多个账号，每次只用选定的一个。</text>
      <view v-for="c in channels" :key="c.name" class="card">
        <text class="role" :class="{ main: c.role === '主' }">{{ c.role }}通道</text>
        <text class="h3">{{ c.name }}</text>
        <text class="muted">{{ c.desc }}</text>
      </view>
    </view>

    <view class="block">
      <text class="kicker">PIPELINE</text>
      <text class="h2">从提示词到可播视频</text>
      <view v-for="(s, i) in steps" :key="s.title" class="card">
        <text class="kicker">0{{ i + 1 }}</text>
        <text class="h3">{{ s.title }}</text>
        <text class="muted">{{ s.desc }}</text>
      </view>
    </view>
    <AppTab current="/pages/home/index" />
  </view>
</template>

<script>
import AppTab from "../../components/AppTab.vue";

export default {
  components: { AppTab },
  data() {
    return {
      channels: [
        { role: "主", name: "豆包", desc: "手机号或 session 登录。分镜、生图、Seedance 视频走豆包。" },
        { role: "辅", name: "即梦", desc: "可选。在设置中手动选定账号后使用。" },
        { role: "辅", name: "小云雀", desc: "可选。与即梦一样需手动选定账号。" },
      ],
      steps: [
        { title: "写内容", desc: "输入故事梗概，自动拆出可编辑分镜词。" },
        { title: "锁角色", desc: "上传参考图或生成三视图，跨镜保持形象。" },
        { title: "改分镜词", desc: "每镜提示词可改，满意后再生成。" },
        { title: "出视频", desc: "豆包为主出片，可继续在对话里回复。" },
      ],
    };
  },
  methods: {
    goStudio() {
      uni.reLaunch({ url: "/pages/projects/index" });
    },
  },
};
</script>

<style scoped>
.page {
  padding: 0 0 140rpx;
}
.hero {
  min-height: 70vh;
  padding: 80rpx 40rpx 64rpx;
  background: #0c1a1c;
  color: #eef4f5;
}
.brand {
  display: block;
  font-size: 96rpx;
  letter-spacing: 8rpx;
}
.title {
  display: block;
  margin-top: 24rpx;
  font-size: 40rpx;
  font-weight: 600;
}
.desc {
  display: block;
  margin: 24rpx 0 40rpx;
  color: rgba(238, 244, 245, 0.78);
  font-size: 28rpx;
}
.primary {
  height: 88rpx;
  line-height: 88rpx;
  background: #c83c28;
  color: #fff;
  border-radius: 16rpx;
  font-size: 30rpx;
  border: none;
}
.block {
  padding: 48rpx 40rpx 8rpx;
}
.kicker {
  display: block;
  color: #2a9aa4;
  letter-spacing: 4rpx;
  font-size: 22rpx;
}
.h2 {
  display: block;
  margin: 12rpx 0 16rpx;
  font-size: 40rpx;
  font-weight: 600;
}
.h3 {
  display: block;
  margin: 8rpx 0;
  font-size: 34rpx;
  font-weight: 600;
}
.muted {
  display: block;
  color: #5c6b6e;
  font-size: 26rpx;
}
.card {
  margin-top: 28rpx;
  padding-top: 20rpx;
  border-top: 1px solid rgba(18, 32, 34, 0.12);
}
.role {
  color: #5c6b6e;
  font-size: 22rpx;
}
.role.main {
  color: #c83c28;
}
</style>
