<script>
export default {
  onLaunch() {},
};
</script>

<style>
page {
  background: #eef4f5;
  color: #122022;
  font-size: 28rpx;
  line-height: 1.5;
}

button {
  margin: 0;
  padding: 0 24rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 12rpx;
  background: #dfe9eb;
  color: #122022;
  font-size: 26rpx;
  box-sizing: border-box;
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.45;
}
</style>
