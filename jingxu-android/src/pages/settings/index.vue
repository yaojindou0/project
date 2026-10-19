<template>
  <view class="page">
    <text class="kicker">ACCESS</text>
    <text class="h1">接入设置</text>
    <text class="muted">H5 按本目录 config.js 重新代理到线上地址，不调用电脑上的 Next 接口。只有自建服务时才填下面的根地址。</text>

    <view class="card">
      <text class="label">自建服务根（可选）</text>
      <input
        class="input input-tall"
        v-model="settings.apiBaseUrl"
        placeholder="留空则使用 config.js 代理"
      />
      <text class="hint">留空时走 jingxu-android/config.js。填写后请求改为该根上的 /api/*。</text>
    </view>

    <view class="card">
      <text class="label">主通道</text>
      <view class="row">
        <button class="chip" :class="{ on: settings.videoProvider === 'doubao' }" @click="switchProvider('doubao')">豆包</button>
        <button class="chip" :class="{ on: settings.videoProvider === 'jimeng' }" @click="switchProvider('jimeng')">即梦</button>
        <button class="chip" :class="{ on: settings.videoProvider === 'xyq' }" @click="switchProvider('xyq')">小云雀</button>
      </view>
      <view class="row">
        <button class="chip" :class="{ on: settings.seedanceVariant === 'mini' }" @click="settings.seedanceVariant = 'mini'">Seedance mini</button>
        <button class="chip" :class="{ on: settings.seedanceVariant === 'fast' }" @click="settings.seedanceVariant = 'fast'">Seedance fast</button>
      </view>
      <view class="switch-row">
        <text>离线演示 Mock</text>
        <switch :checked="settings.useMock" @change="settings.useMock = $event.detail.value" />
      </view>
      <view class="switch-row">
        <text>主通道失败自动回退</text>
        <switch :checked="settings.autoFallback" @change="onFallback($event.detail.value)" />
      </view>
      <view v-if="settings.autoFallback" class="row">
        <button
          class="chip"
          :class="{ on: (settings.fallbackProviders || []).includes('jimeng') }"
          @click="toggleFallback('jimeng')"
        >回退即梦</button>
        <button
          class="chip"
          :class="{ on: (settings.fallbackProviders || []).includes('xyq') }"
          @click="toggleFallback('xyq')"
        >回退小云雀</button>
      </view>
    </view>

    <view class="card">
      <text class="label">手机号登录</text>
      <view class="row">
        <button
          v-for="p in platforms"
          :key="p.id"
          class="chip"
          :class="{ on: platform === p.id }"
          @click="platform = p.id"
        >{{ p.label }}</button>
      </view>
      <input class="input" v-model="phone" type="number" maxlength="11" placeholder="手机号" />
      <view class="row">
        <input class="input grow" v-model="code" maxlength="8" placeholder="验证码" />
        <button class="ghost" :disabled="sending || cooldown > 0" @click="sendCode">
          {{ cooldown > 0 ? cooldown + "s" : "获取验证码" }}
        </button>
      </view>
      <button class="primary" :disabled="logging" @click="login">登录并写入账号</button>
      <text v-if="authMsg" class="hint ok">{{ authMsg }}</text>
      <text v-if="authErr" class="hint bad">{{ authErr }}</text>
    </view>

    <view class="card">
      <text class="label">粘贴 session / Cookie</text>
      <textarea class="area" maxlength="-1" v-model="sessionPaste" placeholder="sessionid=... 或浏览器整段 Cookie" />
      <button class="ghost" :disabled="pasting" @click="pasteSession">校验并保存</button>
    </view>

    <view class="card">
      <view class="between">
        <view>
          <text class="label">额度账号</text>
          <text class="hint">可存多个，创作时只用当前选定的一个。导出含 session / Cookie / Key，请妥善保管。</text>
        </view>
      </view>
      <view class="row">
        <button class="ghost" :disabled="!settings.jimengAccounts.length" @click="exportPack">导出配置</button>
        <button class="ghost" :disabled="packBusy" @click="importPack">{{ packBusy ? "导入中…" : "导入配置" }}</button>
      </view>
      <text v-if="packMsg" class="hint" :class="{ bad: packMsg.includes('失败') || packMsg.includes('尚无'), ok: !(packMsg.includes('失败') || packMsg.includes('尚无')) }">{{ packMsg }}</text>
      <view v-if="!settings.jimengAccounts.length" class="hint">还没有账号</view>
      <view v-for="a in settings.jimengAccounts" :key="a.id" class="account">
        <view class="switch-row">
          <text>{{ platformName(a.platform) }} · {{ a.label }}</text>
          <switch :checked="a.enabled" @change="a.enabled = $event.detail.value" />
        </view>
        <text class="hint">{{ a.phone ? maskPhone(a.phone) + " · " : "" }}{{ a.sessionId ? "已有 session" : "无 session" }}</text>
        <view class="row">
          <button class="chip" :class="{ on: settings.activeAccountId === a.id }" @click="selectAccount(a.id)">当前使用</button>
          <button class="chip" @click="checkAccount(a)">检测</button>
          <button class="chip danger" @click="removeAccount(a.id)">删除</button>
        </view>
        <text v-if="checkMsg[a.id]" class="hint">{{ checkMsg[a.id] }}</text>
      </view>
    </view>

    <view class="card">
      <text class="label">模型与 Key</text>
      <input class="input" v-model="settings.doubaoApiKey" password placeholder="方舟 API Key（可选）" />
      <input class="input" v-model="settings.doubaoChatModel" placeholder="对话模型" />
      <input class="input" v-model="settings.doubaoImageModel" placeholder="生图模型" />
      <input class="input" v-model="settings.jimengProxyBase" placeholder="即梦代理，默认 127.0.0.1:5100" />
      <input class="input" v-model="settings.xyqProxyBase" placeholder="小云雀代理，默认 127.0.0.1:5200" />
      <input class="input" v-model="settings.authProxyBase" placeholder="短信登录代理（可选）" />
      <input class="input" v-model="settings.llmBaseUrl" placeholder="对话基址" />
      <input class="input" v-model="settings.llmModel" placeholder="对话模型名" />
      <input class="input" v-model="settings.llmApiKey" password placeholder="对话 Key（可选）" />
    </view>

    <button class="primary" @click="save">保存设置</button>
    <AppTab current="/pages/settings/index" />
  </view>
</template>

<script>
import AppTab from "../../components/AppTab.vue";
import {
  apiRequest,
  applyPresetForPlatform,
  applyProviderPreset,
  buildAccessPack,
  downloadAccessPack,
  extractCookieHeader,
  extractSessionId,
  loadSettings,
  maskPhone,
  mergeAccessPack,
  readAccessPackFile,
  resolveActiveAccountId,
  saveSettings,
  toastErr,
  uid,
  upsertLoggedInAccount,
  withActiveAccount,
  UPSTREAM_PATHS,
} from "../../common/jingxu.js";

export default {
  components: { AppTab },
  data() {
    return {
      settings: loadSettings(),
      platform: "doubao",
      phone: "",
      code: "",
      handoff: "",
      sending: false,
      logging: false,
      pasting: false,
      cooldown: 0,
      authMsg: "",
      authErr: "",
      sessionPaste: "",
      packMsg: "",
      packBusy: false,
      checkMsg: {},
      platforms: [
        { id: "doubao", label: "豆包" },
        { id: "jimeng", label: "即梦" },
        { id: "xyq", label: "小云雀" },
      ],
    };
  },
  onShow() {
    this.settings = loadSettings();
  },
  methods: {
    maskPhone,
    platformName(p) {
      if (p === "doubao") return "豆包";
      if (p === "jimeng") return "即梦";
      if (p === "xyq") return "小云雀";
      return "通用";
    },
    save() {
      this.settings.apiBaseUrl = (this.settings.apiBaseUrl || "").trim().replace(/\/+$/, "");
      saveSettings(this.settings);
      uni.showToast({ title: "已保存", icon: "none" });
    },
    switchProvider(id) {
      this.settings = applyProviderPreset(this.settings, id);
    },
    onFallback(on) {
      this.settings.autoFallback = on;
      if (on && !(this.settings.fallbackProviders || []).length) {
        this.settings.fallbackProviders = ["jimeng", "xyq"];
      }
    },
    toggleFallback(p) {
      const list = this.settings.fallbackProviders || [];
      this.settings.fallbackProviders = list.includes(p) ? list.filter((x) => x !== p) : [...list, p];
    },
    remember(account) {
      if (!account?.id) return;
      this.settings = upsertLoggedInAccount(this.settings, account);
      saveSettings(this.settings);
    },
    async sendCode() {
      this.authErr = "";
      this.authMsg = "";
      this.sending = true;
      try {
        const data = await apiRequest(UPSTREAM_PATHS.authSendCode, {
          platform: this.platform,
          phone: this.phone,
        });
        this.handoff = data.handoff ? String(data.handoff) : "";
        this.authMsg = data.message || "验证码已发送";
        this.cooldown = 60;
        const timer = setInterval(() => {
          this.cooldown -= 1;
          if (this.cooldown <= 0) clearInterval(timer);
        }, 1000);
      } catch (e) {
        this.authErr = toastErr(e, "发送失败");
      } finally {
        this.sending = false;
      }
    },
    async login() {
      this.authErr = "";
      this.logging = true;
      try {
        if (!this.handoff) throw new Error("请先获取验证码");
        const data = await apiRequest(UPSTREAM_PATHS.authLogin, {
          platform: this.platform,
          phone: this.phone,
          code: this.code,
          handoff: this.handoff,
        });
        if (data.account) this.remember(data.account);
        if (data.apiKey) this.settings.doubaoApiKey = data.apiKey;
        this.authMsg = data.message || "登录成功";
        this.code = "";
        this.handoff = "";
        saveSettings(this.settings);
      } catch (e) {
        this.authErr = toastErr(e, "登录失败");
      } finally {
        this.logging = false;
      }
    },
    async pasteSession() {
      this.pasting = true;
      this.authErr = "";
      try {
        const sessionId = extractSessionId(this.sessionPaste);
        if (!sessionId || sessionId.length < 16) throw new Error("请粘贴有效 sessionid");
        const cookieHeader = extractCookieHeader(this.sessionPaste, sessionId);
        const data = await apiRequest(UPSTREAM_PATHS.authCheckSession, {
          platform: this.platform,
          sessionId,
          label: "安卓粘贴",
        });
        const names = { doubao: "豆包", jimeng: "即梦", xyq: "小云雀" };
        this.remember({
          id: uid("acc"),
          label: data.name ? `${names[this.platform]} · ${data.name}` : `${names[this.platform]} 粘贴`,
          sessionId,
          cookieHeader: cookieHeader || undefined,
          region: "cn",
          platform: this.platform,
          enabled: true,
          usedCount: 0,
          loginAt: new Date().toISOString(),
        });
        this.sessionPaste = "";
        this.authMsg = data.message || "session 已写入";
      } catch (e) {
        this.authErr = toastErr(e, "校验失败");
      } finally {
        this.pasting = false;
      }
    },
    selectAccount(id) {
      const acc = this.settings.jimengAccounts.find((a) => a.id === id);
      if (!acc) return;
      let next = withActiveAccount(this.settings, id);
      next = applyPresetForPlatform(next, acc.platform);
      this.settings = next;
      saveSettings(next);
    },
    removeAccount(id) {
      const acc = this.settings.jimengAccounts.find((a) => a.id === id);
      let next = {
        ...this.settings,
        jimengAccounts: this.settings.jimengAccounts.filter((a) => a.id !== id),
      };
      if (this.settings.activeAccountId === id) {
        const nextId = resolveActiveAccountId(next) || "";
        next = nextId
          ? withActiveAccount(next, nextId)
          : { ...next, activeAccountId: "", doubaoConversationId: "" };
        const nextActive = next.jimengAccounts.find((a) => a.id === next.activeAccountId);
        next = applyPresetForPlatform(next, nextActive?.platform);
      }
      if (acc?.platform === "doubao" && !next.jimengAccounts.some((a) => a.platform === "doubao")) {
        next = { ...next, doubaoApiKey: "" };
      }
      this.settings = next;
      saveSettings(next);
    },
    async checkAccount(account) {
      const platform =
        account.platform === "doubao" || account.platform === "jimeng" || account.platform === "xyq"
          ? account.platform
          : this.settings.videoProvider === "xyq"
            ? "xyq"
            : "jimeng";
      this.checkMsg = { ...this.checkMsg, [account.id]: "检测中…" };
      try {
        const data = await apiRequest(UPSTREAM_PATHS.authCheckSession, {
          platform,
          sessionId: account.sessionId,
          label: account.label,
        });
        this.checkMsg = { ...this.checkMsg, [account.id]: data.message || "已注册登录有效" };
        this.patchAccount(account.id, { lastError: undefined, cooldownUntil: undefined });
      } catch (e) {
        this.checkMsg = { ...this.checkMsg, [account.id]: e.message };
        this.patchAccount(account.id, { lastError: e.message });
      }
    },
    patchAccount(id, patch) {
      this.settings.jimengAccounts = this.settings.jimengAccounts.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      );
      saveSettings(this.settings);
    },
    exportPack() {
      try {
        const pack = buildAccessPack(this.settings);
        if (!pack.accounts.length) {
          this.packMsg = "尚无已登录账号可导出";
          return;
        }
        const stamp = new Date().toISOString().slice(0, 10);
        downloadAccessPack(`jingxu-access-${stamp}`, pack)
          .then(() => {
            this.packMsg = `已导出 ${pack.accounts.length} 个账号及接入配置（含 session / Cookie / Key）`;
          })
          .catch((e) => {
            this.packMsg = toastErr(e, "导出失败");
          });
      } catch (e) {
        this.packMsg = toastErr(e, "导出失败");
      }
    },
    async importPack() {
      this.packBusy = true;
      this.packMsg = "";
      try {
        const parsed = await readAccessPackFile();
        const mode = await this.askImportMode();
        const next = mergeAccessPack(this.settings, parsed, mode);
        this.settings = next;
        saveSettings(next);
        this.packMsg =
          mode === "replace"
            ? `已覆盖导入 ${parsed.accounts.length} 个账号及接入配置`
            : `已合并导入 ${parsed.accounts.length} 个账号及接入配置`;
      } catch (e) {
        if (!/取消/.test(e?.message || "")) {
          this.packMsg = toastErr(e, "导入失败");
        }
      } finally {
        this.packBusy = false;
      }
    },
    askImportMode() {
      return new Promise((resolve) => {
        if (!this.settings.jimengAccounts.length) {
          resolve("merge");
          return;
        }
        // 与网页 settings：window.confirm 确定=合并、取消=覆盖 一致
        uni.showModal({
          title: "导入配置",
          content:
            "检测到本机已有账号。\n确定 = 合并导入（同手机号/session 覆盖更新）\n取消 = 全部覆盖本机账号",
          confirmText: "确定",
          cancelText: "取消",
          success: (res) => {
            resolve(res.confirm ? "merge" : "replace");
          },
          fail: () => resolve("replace"),
        });
      });
    },
  },
};
</script>

<style scoped>
.page { padding: 32rpx 32rpx 180rpx; }
.kicker { color: #2a9aa4; letter-spacing: 4rpx; font-size: 22rpx; }
.h1 { display: block; margin: 8rpx 0 12rpx; font-size: 48rpx; font-weight: 600; }
.muted, .hint { display: block; color: #5c6b6e; font-size: 24rpx; }
.hint { margin-top: 12rpx; }
.hint.ok { color: #1f6f78; }
.hint.bad { color: #c83c28; }
.card { margin-top: 24rpx; padding: 24rpx; background: #fff; border-radius: 20rpx; }
.label { display: block; margin-bottom: 12rpx; font-weight: 600; }
.input, .area {
  width: 100%;
  box-sizing: border-box;
  margin-top: 16rpx;
  background: #f3f7f8;
  border-radius: 16rpx;
  border: 1px solid rgba(18, 32, 34, 0.08);
  font-size: 28rpx;
  color: #122022;
}
.input {
  height: 80rpx;
  min-height: 80rpx;
  line-height: 80rpx;
  padding: 0 24rpx;
}
.input.input-tall {
  height: 88rpx;
  min-height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
}
.area {
  display: block;
  height: 200rpx;
  padding: 20rpx 24rpx;
  line-height: 44rpx;
}
.area :deep(.uni-textarea-wrapper),
.area :deep(.uni-textarea-textarea),
.area :deep(textarea) {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  line-height: 44rpx;
  font-size: 28rpx;
}
.row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.grow { flex: 1; margin-top: 0; }
.switch-row { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; }
button.chip,
button.primary,
button.ghost {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 68rpx;
  line-height: 68rpx;
  padding: 0 22rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  border: none;
  background: #dfe9eb;
  color: #122022;
}
button.chip.on {
  background: #122022;
  color: #eef4f5;
}
button.ghost {
  background: #1f6f78;
  color: #fff;
}
button.primary {
  margin-top: 16rpx;
  width: 100%;
  height: 84rpx;
  line-height: 84rpx;
  background: #c83c28;
  color: #fff;
}
button.chip.danger {
  background: #f8e4e0;
  color: #c83c28;
}
.account { margin-top: 20rpx; padding-top: 16rpx; border-top: 1px solid rgba(18, 32, 34, 0.08); }
.between { display: flex; justify-content: space-between; gap: 12rpx; }
</style>
