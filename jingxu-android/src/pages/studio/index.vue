<template>
  <view class="page">
    <view class="banner">
      {{ bannerText }}
    </view>

    <view class="card">
      <text class="h2">故事</text>
      <textarea
        class="area story"
        v-model="premise"
        maxlength="-1"
        placeholder="一句话或一段故事梗概（不限字数）"
      />
      <text class="label">画面风格</text>
      <view class="choice-row">
        <button
          v-for="s in styles"
          :key="s.id"
          class="chip"
          :class="{ on: styleId === s.id }"
          @click="styleId = s.id"
        >{{ s.label }}</button>
      </view>
      <view class="grid">
        <view>
          <text class="label">镜数 {{ shotCount }}</text>
          <slider :value="shotCount" min="1" max="12" show-value @change="shotCount = $event.detail.value" />
        </view>
        <view>
          <text class="label">默认秒数 {{ durationPerShot }}</text>
          <slider :value="durationPerShot" min="4" max="15" show-value @change="durationPerShot = $event.detail.value" />
        </view>
      </view>
      <text class="label">画幅（生图 / 视频 / 预览均按此比例）</text>
      <view class="choice-row">
        <button v-for="r in ratios" :key="r" class="chip" :class="{ on: aspectRatio === r }" @click="setAspect(r)">{{ r }}</button>
      </view>
      <text class="label">Seedance</text>
      <view class="choice-row">
        <button class="chip" :class="{ on: variant === 'mini' }" @click="variant = 'mini'">2.0 Mini</button>
        <button class="chip" :class="{ on: variant === 'fast' }" @click="variant = 'fast'">2.0 Fast</button>
      </view>
      <view class="choice-row">
        <button class="chip" :class="{ on: chainPrevFrame }" @click="chainPrevFrame = !chainPrevFrame">{{ chainPrevFrame ? "承接上镜：开" : "承接上镜：关" }}</button>
      </view>
      <view class="stack-actions">
        <button class="primary" :disabled="scriptBusy" @click="generateScript">
          {{ scriptBusy ? "生成中…" : "按内容生成分镜词" }}
        </button>
        <button class="ghost block" :disabled="scriptBusy" @click="generateAllCharacterPrompts">提取人物提示词</button>
      </view>
      <text v-if="modeHint" class="hint">{{ modeHint }}</text>
      <text v-if="error" class="hint bad">{{ error }}</text>
    </view>

    <view v-if="accounts.length" class="card">
      <text class="label">当前额度账号</text>
      <picker :range="accountLabels" :value="accountIndex" @change="onPickAccount">
        <view class="picker">{{ accountLabels[accountIndex] || "选择账号" }}</view>
      </picker>
    </view>

    <view v-if="project" id="characters" class="card">
      <view class="between">
        <text class="h2">角色 {{ project.characters.length }}</text>
        <button class="mini teal" @click="addCharacter">添加</button>
      </view>
      <view class="tool-grid">
        <button class="mini" :disabled="scriptBusy" @click="generateAllCharacterPrompts">提取人物</button>
        <button class="mini" :disabled="scriptBusy" @click="generateAllScenePrompts">补场景词</button>
        <button class="mini" @click="generateAllCharacterThreeViews">全部三视图</button>
        <button class="mini" @click="repairCharacters">修复角色图</button>
      </view>
      <view class="tool-grid three">
        <button class="mini ink" @click="exportCharacters">导出角色包</button>
        <button class="mini ink" @click="importCharacters">导入角色包</button>
        <button class="mini ink" @click="exportStoryboard">导出分镜</button>
      </view>
      <view v-for="(c, i) in project.characters" :key="c.id || i" class="char-card">
        <view class="char-top">
          <view class="char-media" @click="preview(c.threeViewUrl || c.referenceImageUrl)">
            <image
              v-if="c.threeViewUrl || c.referenceImageUrl"
              class="char-thumb"
              :src="mediaSrc(c.threeViewUrl || c.referenceImageUrl)"
              mode="aspectFill"
            />
            <view v-else class="char-placeholder">
              <text>暂无图</text>
            </view>
            <text class="char-badge">{{ c.threeViewUrl ? "三视图" : c.referenceImageUrl ? "参考图" : "待上传" }}</text>
          </view>
          <view class="char-main">
            <view class="char-head">
              <input class="input name" :value="c.name" placeholder="角色名" @input="patchChar(i, { name: $event.detail.value })" />
              <button class="mini lock" :class="{ on: c.locked }" @click="patchChar(i, { locked: !c.locked })">{{ c.locked ? "锁定" : "未锁" }}</button>
            </view>
            <textarea class="area look" maxlength="-1" :value="c.appearance" placeholder="外貌、服装与造型" @input="patchChar(i, { appearance: $event.detail.value })" />
          </view>
        </view>
        <view class="char-actions">
          <button class="mini teal" :disabled="busyCharIndex === i" @click="generateCharacterThreeView(i)">{{ busyCharIndex === i ? "生成中" : "生成三视图" }}</button>
          <button class="mini ink" @click="uploadCharThree(i)">上传三视图</button>
          <button class="mini ink" @click="uploadChar(i, 'referenceImageUrl')">参考图</button>
          <button class="mini soft" @click="patchChar(i, { threeViewUrl: '', referenceImageUrl: '' })">清除图</button>
          <button class="mini danger" @click="removeCharacter(i)">删除</button>
        </view>
      </view>
    </view>

    <view v-if="project" class="card shots-card">
      <view class="between">
        <text class="h2">{{ project.title || "分镜" }}</text>
        <button class="mini teal" @click="generateAllVideos">全部出片</button>
      </view>

      <view v-if="project.shots.length" class="shot-tabs-wrap">
        <scroll-view
          class="shot-tabs"
          scroll-x
          :scroll-into-view="shotTabScrollId"
          scroll-with-animation
          :show-scrollbar="false"
        >
          <view class="shot-tabs-inner">
            <view
              v-for="s in project.shots"
              :id="'shot-tab-' + s.id"
              :key="s.id"
              class="shot-tab"
              :class="{
                on: s.id === activeShotId,
                ready: s.status === 'ready',
                err: s.status === 'error',
                busy: busyShotId === s.id,
              }"
              @click="selectShotTab(s.id)"
            >
              <text class="shot-tab-title">镜{{ s.index + 1 }}</text>
              <text class="shot-tab-status">{{ busyShotId === s.id ? "处理中" : statusLabel(s.status) }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="shot-nav">
          <button class="mini soft" :disabled="!canPrevShot" @click="goAdjacentShot(-1)">上一镜</button>
          <text class="shot-nav-label">{{ activeShotIndex + 1 }} / {{ project.shots.length }}</text>
          <button class="mini soft" :disabled="!canNextShot" @click="goAdjacentShot(1)">下一镜</button>
        </view>
      </view>

      <view v-if="activeShot" class="shot-panel">
        <view class="between">
          <text class="h3">镜 {{ activeShot.index + 1 }} · {{ statusLabel(activeShot.status) }}</text>
          <text class="hint">{{ resolveDuration(activeShot) }} 秒</text>
        </view>
        <view class="section-tabs">
          <view class="section-tab" :class="{ on: shotSection === 'script' }" @click="shotSection = 'script'">文案</view>
          <view class="section-tab" :class="{ on: shotSection === 'frame' }" @click="shotSection = 'frame'">画面</view>
          <view class="section-tab" :class="{ on: shotSection === 'video' }" @click="shotSection = 'video'">成片</view>
        </view>

        <view v-show="shotSection === 'script'">
        <input class="input" :value="activeShot.scene" placeholder="场景" @input="patchShot(activeShot.id, { scene: $event.detail.value })" />
        <input class="input" :value="activeShot.locationName" placeholder="地点" @input="patchShot(activeShot.id, { locationName: $event.detail.value })" />
        <textarea class="area brief" maxlength="-1" :value="activeShot.placeIntro" placeholder="地名首次介绍" @input="patchShot(activeShot.id, { placeIntro: $event.detail.value })" />
        <textarea class="area prompt" maxlength="-1" :value="activeShot.storyboardPrompt" placeholder="分镜词" @input="patchShot(activeShot.id, { storyboardPrompt: $event.detail.value })" />
        <textarea class="area prompt" maxlength="-1" :value="activeShot.imagePrompt" placeholder="首帧提示词" @input="patchShot(activeShot.id, { imagePrompt: $event.detail.value })" />
        <textarea class="area prompt" maxlength="-1" :value="activeShot.scenePrompt" placeholder="场景空镜提示词" @input="patchShot(activeShot.id, { scenePrompt: $event.detail.value })" />
        <input class="input" :value="activeShot.camera" placeholder="镜头" @input="patchShot(activeShot.id, { camera: $event.detail.value })" />
        <slider :value="resolveDuration(activeShot)" min="4" max="15" show-value @change="patchShot(activeShot.id, { duration: Number($event.detail.value) })" />

        <view v-for="line in activeShot.lines || []" :key="line.id" class="line">
          <picker :range="kindLabels" :value="kindIndex(line.kind)" @change="updateLine(activeShot, line.id, { kind: kinds[$event.detail.value].id })">
            <text class="chip">{{ kindName(line.kind) }}</text>
          </picker>
          <input class="input grow" :value="line.speaker" placeholder="说话人" @input="updateLine(activeShot, line.id, { speaker: $event.detail.value })" />
          <textarea class="area brief" maxlength="-1" :value="line.text" placeholder="台词" @input="updateLine(activeShot, line.id, { text: $event.detail.value })" />
          <button class="mini danger" @click="removeLine(activeShot, line.id)">删台词</button>
        </view>
        <button class="mini" @click="addLine(activeShot.id)">加台词</button>

        <text class="label">人物首次登场</text>
        <view v-for="(ci, idx) in activeShot.characterIntros || []" :key="activeShot.id + '-intro-' + idx" class="line">
          <input class="input" :value="ci.name" placeholder="人名" @input="patchIntro(activeShot, idx, { name: $event.detail.value })" />
          <textarea class="area brief" maxlength="-1" :value="ci.intro" placeholder="首次登场介绍" @input="patchIntro(activeShot, idx, { intro: $event.detail.value })" />
          <button class="mini danger" @click="removeIntro(activeShot, idx)">删除介绍</button>
        </view>
        <button class="mini" @click="addIntro(activeShot.id)">添加人物介绍</button>
        </view>

        <view v-show="shotSection === 'frame'">
          <view class="between">
            <text class="label tight">场景图 · 首帧 · 末帧</text>
            <button class="mini ink" :disabled="busyShotId === activeShot.id" @click="generateShotFramePack(activeShot)">一键生成三图</button>
          </view>
          <view class="frame-cards">
            <view v-for="slot in frameSlots(activeShot)" :key="slot.key" class="frame-card">
              <text class="frame-title">{{ slot.label }}{{ slot.key === 'sceneImageUrl' ? ' · 无人' : '' }} · {{ project.aspectRatio }}</text>
              <image
                v-if="slot.url"
                class="frame-preview"
                :class="'ratio-' + (project.aspectRatio || '9:16').replace(':', '-')"
                :src="mediaSrc(slot.url)"
                mode="aspectFill"
                @click="preview(mediaSrc(slot.url))"
              />
              <view
                v-else
                class="frame-empty"
                :class="'ratio-' + (project.aspectRatio || '9:16').replace(':', '-')"
                @click="slot.gen()"
              >
                <text>点击生成{{ slot.label }}</text>
              </view>
              <view class="frame-ops">
                <button class="mini teal" :disabled="busyShotId === activeShot.id" @click="slot.gen()">生成</button>
                <button class="mini ink" @click="uploadShot(activeShot.id, slot.key)">上传</button>
                <button class="mini danger" :disabled="!slot.url" @click="clearFrame(activeShot, slot.key)">清除</button>
              </view>
            </view>
          </view>
          <view class="row">
            <button v-if="activeShot.index > 0" class="mini" @click="chainFromPrevious(activeShot)">沿用上一镜末帧作首帧</button>
            <button v-if="activeShot.videoUrl" class="mini" :disabled="frameBusy" @click="grabLastFrame(true)">本镜视频尾帧作首帧</button>
          </view>
        </view>

        <view v-show="shotSection === 'video'">
        <view class="pick-box">
          <view class="between">
            <text class="label tight">生成视频所用角色</text>
          </view>
          <view v-if="project.characters.length" class="tool-grid three">
            <button class="mini soft" @click="selectShotChars(activeShot, 'auto')">按分镜自动勾选</button>
            <button class="mini soft" @click="selectShotChars(activeShot, 'all')">全选</button>
            <button class="mini soft" @click="selectShotChars(activeShot, 'none')">清空</button>
          </view>
          <view v-if="project.characters.length" class="pick-list">
            <view
              v-for="c in project.characters"
              :key="characterKey(c)"
              class="pick-card"
              :class="{ on: selectedKeys(activeShot).includes(characterKey(c)) }"
              @click="toggleChar(activeShot, c)"
            >
              <view class="pick-box-mark">{{ selectedKeys(activeShot).includes(characterKey(c)) ? "✓" : "" }}</view>
              <text class="pick-name">{{ c.name || "未命名" }}</text>
              <text v-if="!(c.threeViewUrl || c.referenceImageUrl)" class="pick-miss">缺图</text>
            </view>
          </view>
          <text v-else class="hint">暂无角色卡，生成视频将不附带角色参考图</text>
          <text v-if="project.characters.length" class="hint">勾选后点下方生成；只附带已勾选且有参考图的角色。</text>
        </view>
        <view class="row">
          <button class="primary slim" :disabled="busyShotId === activeShot.id" @click="generateShotVideo(activeShot, 'mini')">
            {{ busyShotId === activeShot.id ? "出片中…" : "Mini 生成视频" }}
          </button>
          <button class="ghost" :disabled="busyShotId === activeShot.id" @click="generateShotVideo(activeShot, 'fast')">Fast 生成视频</button>
          <button class="mini" @click="patchShot(activeShot.id, { videoUrl: '', status: 'pending', error: '' })">重置视频</button>
        </view>
        <text v-if="activeShot.error" class="hint bad">{{ activeShot.error }}</text>
        <text v-if="activeShot.usedAccountLabel" class="hint">{{ activeShot.usedAccountLabel }} {{ activeShot.usedModel || "" }}</text>
        <video v-if="activeShot.videoUrl && !activeShot.videoUrl.startsWith('data:')" class="player" :src="activeShot.videoUrl" controls />
        <text v-else-if="activeShot.videoUrl" class="hint">视频为内嵌数据，请在电脑端下载。</text>
        <view v-if="activeShot.videoUrl" class="row">
          <button class="mini" @click="copyLink(activeShot)">{{ activeShot.videoUrl.startsWith('data:') ? '内嵌视频' : '复制链接' }}</button>
          <button class="mini" @click="saveVideo(activeShot)">下载视频</button>
        </view>

        <view v-if="activeShot.videoChat" class="chat">
          <text class="label">豆包对话</text>
          <view v-for="m in activeShot.videoChat.messages" :key="m.id" class="msg" :class="m.role">
            <text>{{ m.role === "user" ? "我" : "豆包" }}：{{ m.text }}</text>
          </view>
          <textarea class="area brief" maxlength="-1" v-model="chatDraft" placeholder="继续回复，例如：确定" />
          <button class="ghost" :disabled="chatReplyBusy" @click="replyVideoChat(activeShot)">发送</button>
        </view>

        <view class="shot-nav bottom">
          <button class="mini ink" :disabled="!canPrevShot" @click="goAdjacentShot(-1)">上一镜</button>
          <button class="mini teal" :disabled="!canNextShot" @click="goAdjacentShot(1)">下一镜</button>
        </view>
        </view>
      </view>

      <view v-else class="empty-shot">
        <text class="hint">还没有分镜，请先生成分镜</text>
      </view>

      <button class="mini danger clear-btn" @click="clearProject">清空当前项目</button>
    </view>
    <AppTab current="/pages/studio/index" />
  </view>
</template>

<script>
import AppTab from "../../components/AppTab.vue";
import {
  STYLE_PRESETS,
  STATUS_LABEL,
  LINE_KINDS,
  apiRequest,
  UPSTREAM_PATHS,
  buildCharacterPack,
  buildCharacterThreeViewPrompt,
  buildFirstFramePrompt,
  buildLastFramePrompt,
  buildSceneImagePrompt,
  buildStoryboardExport,
  characterKey,
  composeVideoPrompt,
  downloadCharacterPack,
  downloadJson,
  deleteProject,
  downloadShotVideo,
  extractLastFrameFromVideo,
  flattenDialogue,
  formatAccountLabel,
  loadActiveProject,
  loadSettings,
  matchShotCharacters,
  mergeCharactersByName,
  applyPresetForPlatform,
  persistAccountConversationId,
  pickImageDataUrl,
  readCharacterPackFile,
  repairCharacterImages,
  resolveAccountConversationId,
  resolveShotDuration,
  saveProject,
  saveSettings,
  setActiveProjectId,
  toastErr,
  uid,
  withActiveAccount,
} from "../../common/jingxu.js";

export default {
  components: { AppTab },
  data() {
    return {
      settings: null,
      premise: "",
      styleId: "guoman",
      styles: STYLE_PRESETS,
      shotCount: 4,
      aspectRatio: "9:16",
      ratios: ["9:16", "16:9", "1:1"],
      durationPerShot: 15,
      variant: "mini",
      chainPrevFrame: true,
      project: null,
      scriptBusy: false,
      busyShotId: "",
      busyCharIndex: -1,
      chatReplyBusy: false,
      chatDraft: "",
      error: "",
      modeHint: "",
      activeShotId: "",
      shotTabScrollId: "",
      shotSection: "script",
      frameVideoUrl: "",
      frameBusy: false,
      kinds: LINE_KINDS,
    };
  },
  computed: {
    bannerText() {
      return "按 config.js 重新代理 · 不经过电脑 3000";
    },
    stylePrompt() {
      return this.styles.find((s) => s.id === this.styleId)?.prompt || this.styles[0].prompt;
    },
    accounts() {
      return this.settings?.jimengAccounts || [];
    },
    accountLabels() {
      return this.accounts.map((a) => formatAccountLabel(a));
    },
    accountIndex() {
      const i = this.accounts.findIndex((a) => a.id === this.settings?.activeAccountId);
      return i < 0 ? 0 : i;
    },
    kindLabels() {
      return this.kinds.map((k) => k.label);
    },
    activeShot() {
      if (!this.project?.shots?.length) return null;
      return (
        this.project.shots.find((s) => s.id === this.activeShotId) ||
        this.project.shots[0] ||
        null
      );
    },
    activeShotIndex() {
      if (!this.project?.shots?.length || !this.activeShot) return 0;
      const i = this.project.shots.findIndex((s) => s.id === this.activeShot.id);
      return i < 0 ? 0 : i;
    },
    canPrevShot() {
      return this.activeShotIndex > 0;
    },
    canNextShot() {
      return !!this.project?.shots?.length && this.activeShotIndex < this.project.shots.length - 1;
    },
  },
  watch: {
    "project.shots"(shots) {
      if (!shots?.length) {
        this.activeShotId = "";
        this.shotTabScrollId = "";
        return;
      }
      if (!shots.some((s) => s.id === this.activeShotId)) {
        this.selectShotTab(shots[0].id);
      }
    },
    busyShotId(id) {
      if (id) this.selectShotTab(id);
    },
  },
  onShow() {
    this.settings = loadSettings();
    if (!this.project) {
      const saved = loadActiveProject();
      if (saved) {
        this.project = saved;
        this.premise = saved.premise || "";
        this.aspectRatio = saved.aspectRatio || "9:16";
        this.durationPerShot = saved.durationPerShot || 15;
        if (saved.shots?.[0]?.id) this.selectShotTab(saved.shots[0].id);
        else this.activeShotId = "";
      } else {
        // 无历史项目也先建草稿，角色包/分镜面板始终可见
        this.ensureProject();
      }
    }
  },
  methods: {
    characterKey,
    selectShotTab(id) {
      if (!id) return;
      this.activeShotId = id;
      this.chatDraft = "";
      this.$nextTick(() => {
        this.shotTabScrollId = "";
        this.$nextTick(() => {
          this.shotTabScrollId = `shot-tab-${id}`;
        });
      });
    },
    goAdjacentShot(step) {
      const shots = this.project?.shots || [];
      const next = shots[this.activeShotIndex + step];
      if (next) this.selectShotTab(next.id);
    },
    /** 保证有项目对象，角色与分镜面板可先导入/编辑 */
    ensureProject() {
      if (this.project) return this.project;
      const now = new Date().toISOString();
      this.project = {
        id: uid("proj"),
        title: "未命名漫剧",
        premise: this.premise,
        style: this.stylePrompt,
        aspectRatio: this.aspectRatio,
        durationPerShot: this.durationPerShot,
        characters: [],
        shots: [],
        createdAt: now,
        updatedAt: now,
      };
      setActiveProjectId(this.project.id);
      this.persist();
      return this.project;
    },
    mediaSrc(url) {
      if (!url) return "";
      if (/^(https?:|data:|blob:|file:)/i.test(url)) return url;
      if (url.startsWith("/")) {
        // #ifdef H5
        if (typeof location !== "undefined" && location.origin) {
          return `${location.origin}${url}`;
        }
        // #endif
      }
      return url;
    },
    statusLabel(s) {
      return STATUS_LABEL[s] || s;
    },
    resolveDuration(shot) {
      return resolveShotDuration(shot, this.project?.durationPerShot || this.durationPerShot);
    },
    kindName(kind) {
      return this.kinds.find((k) => k.id === kind)?.label || "对白";
    },
    kindIndex(kind) {
      const i = this.kinds.findIndex((k) => k.id === kind);
      return i < 0 ? 0 : i;
    },
    persist() {
      if (!this.project) return;
      this.project.updatedAt = new Date().toISOString();
      try {
        saveProject(this.project);
      } catch (e) {
        this.error = toastErr(e, "本地存储失败");
      }
    },
    patchShot(id, patch) {
      if (!this.project) return;
      this.project.shots = this.project.shots.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.lines) next.dialogue = flattenDialogue(patch.lines);
        return next;
      });
      this.persist();
    },
    patchChar(index, patch) {
      const list = this.project.characters.slice();
      list[index] = { ...list[index], ...patch };
      this.project.characters = list;
      this.persist();
    },
    onPickAccount(e) {
      const acc = this.accounts[Number(e.detail.value)];
      if (!acc) return;
      this.settings = applyPresetForPlatform(withActiveAccount(this.settings, acc.id), acc.platform);
      saveSettings(this.settings);
    },
    setAspect(r) {
      this.aspectRatio = r;
      if (this.project) {
        this.project.aspectRatio = r;
        this.persist();
      }
    },
    frameSlots(shot) {
      return [
        { key: "sceneImageUrl", label: "场景图", url: shot.sceneImageUrl, gen: () => this.generateSceneImage(shot) },
        { key: "imageUrl", label: "首帧", url: shot.imageUrl, gen: () => this.generateShotImage(shot) },
        { key: "lastFrameUrl", label: "末帧", url: shot.lastFrameUrl, gen: () => this.generateLastFrame(shot) },
      ];
    },
    clearFrame(shot, key) {
      this.patchShot(shot.id, { [key]: "" });
    },
    chainFromPrevious(shot) {
      const prev = this.project.shots.find((s) => s.index === shot.index - 1);
      const frame = prev?.lastFrameUrl || prev?.imageUrl;
      if (!frame) {
        this.error = "上一镜尚无末帧/首帧，无法衔接";
        return;
      }
      this.patchShot(shot.id, { imageUrl: frame, status: "pending", error: "" });
      this.error = "";
    },
    addIntro(shotId) {
      const shot = this.project.shots.find((s) => s.id === shotId);
      this.patchShot(shotId, { characterIntros: [...(shot.characterIntros || []), { name: "", intro: "" }] });
    },
    patchIntro(shot, idx, patch) {
      const next = (shot.characterIntros || []).slice();
      next[idx] = { ...next[idx], ...patch };
      this.patchShot(shot.id, { characterIntros: next });
    },
    removeIntro(shot, idx) {
      this.patchShot(shot.id, { characterIntros: (shot.characterIntros || []).filter((_, i) => i !== idx) });
    },
    clearProject() {
      if (!this.project) return;
      uni.showModal({
        title: "清空当前项目",
        content: "本机这份漫剧会被删除。",
        success: (res) => {
          if (!res.confirm) return;
          deleteProject(this.project.id);
          setActiveProjectId("");
          this.project = null;
          this.activeShotId = "";
          this.error = "";
        },
      });
    },
    saveVideo(shot) {
      downloadShotVideo(shot)
        .then(() => uni.showToast({ title: "已保存视频", icon: "none" }))
        .catch((e) => {
          this.error = toastErr(e, "下载失败");
        });
    },
    selectedKeys(shot) {
      if (shot.videoCharacterKeys) return shot.videoCharacterKeys;
      return matchShotCharacters(shot, this.project.characters).map(characterKey);
    },
    toggleChar(shot, c) {
      const key = characterKey(c);
      const cur = this.selectedKeys(shot);
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      this.patchShot(shot.id, { videoCharacterKeys: next });
    },
    async generateScript() {
      if (!this.settings) return;
      this.ensureProject();
      this.scriptBusy = true;
      this.error = "";
      try {
        const data = await apiRequest(UPSTREAM_PATHS.script, {
          premise: this.premise,
          style: this.stylePrompt,
          shotCount: this.shotCount,
          aspectRatio: this.aspectRatio,
          settings: this.settings,
          lockedCharacters: this.project?.characters.filter((c) => c.locked) || [],
        });
        if (!Array.isArray(data.shots) && !Array.isArray(data.characters)) {
          throw new Error("分镜接口未返回角色/镜头数据，请检查镜叙服务是否为最新版本");
        }
        const incomingChars = (data.characters || []).map((c) => ({
          ...c,
          id: c.id || uid("char"),
          locked: c.locked ?? true,
        }));
        // 按名称合并：生成结果覆盖同名，本机独有角色保留
        const { characters } = mergeCharactersByName(
          this.project.characters || [],
          incomingChars,
        );
        const shots = (data.shots || []).map((s, index) => ({
          ...s,
          id: s.id || uid("shot"),
          index: typeof s.index === "number" ? s.index : index,
          status: s.status || "pending",
          videoCharacterKeys: matchShotCharacters(s, characters).map(characterKey),
        }));
        const now = new Date().toISOString();
        this.project = {
          ...this.project,
          id: this.project?.id || uid("proj"),
          title: data.title || this.project.title || "未命名漫剧",
          premise: this.premise,
          style: this.stylePrompt,
          aspectRatio: this.aspectRatio,
          durationPerShot: this.durationPerShot,
          characters,
          shots,
          createdAt: this.project?.createdAt || now,
          updatedAt: now,
        };
        if (shots[0]?.id) this.selectShotTab(shots[0].id);
        else this.activeShotId = "";
        this.modeHint = data.provider || data.mode || "";
        if (data.hint) this.error = data.hint;
        else this.error = "";
        setActiveProjectId(this.project.id);
        this.persist();
      } catch (e) {
        this.error = toastErr(e, "分镜生成失败");
      } finally {
        this.scriptBusy = false;
      }
    },
    charText() {
      return (this.project?.characters || []).map((c) => `${c.name}: ${c.appearance}`).join("; ");
    },
    async requestImage(prompt, index, kind) {
      const data = await apiRequest(UPSTREAM_PATHS.image, {
        prompt,
        index,
        aspectRatio: this.project.aspectRatio,
        kind,
        settings: this.settings,
      });
      this.modeHint = [data.provider || data.mode, data.model].filter(Boolean).join(" · ");
      if (Array.isArray(data.accounts)) {
        this.settings = { ...this.settings, jimengAccounts: data.accounts };
        saveSettings(this.settings);
      }
      return data.imageUrl;
    },
    async generateShotImage(shot) {
      this.shotSection = "frame";
      this.busyShotId = shot.id;
      this.patchShot(shot.id, { status: "imaging", error: "" });
      try {
        const imageUrl = await this.requestImage(
          buildFirstFramePrompt({
            scene: shot.scene,
            storyboardPrompt: shot.storyboardPrompt,
            imagePrompt: shot.imagePrompt,
            style: this.project.style,
            aspectRatio: this.project.aspectRatio,
            characters: this.charText(),
          }),
          shot.index,
          "frame",
        );
        this.patchShot(shot.id, { imageUrl, status: "pending" });
      } catch (e) {
        this.patchShot(shot.id, { status: "error", error: e.message });
      } finally {
        this.busyShotId = "";
      }
    },
    async generateSceneImage(shot) {
      this.shotSection = "frame";
      this.busyShotId = shot.id;
      try {
        const sceneImageUrl = await this.requestImage(
          buildSceneImagePrompt({
            scene: shot.scene,
            storyboardPrompt: shot.storyboardPrompt,
            style: this.project.style,
            aspectRatio: this.project.aspectRatio,
            locationName: shot.locationName,
            placeIntro: shot.placeIntro,
            scenePrompt: shot.scenePrompt,
          }),
          shot.index,
          "scene",
        );
        this.patchShot(shot.id, { sceneImageUrl });
      } catch (e) {
        this.error = toastErr(e, "场景图失败");
      } finally {
        this.busyShotId = "";
      }
    },
    async generateLastFrame(shot) {
      this.shotSection = "frame";
      this.busyShotId = shot.id;
      try {
        const lastFrameUrl = await this.requestImage(
          buildLastFramePrompt({
            scene: shot.scene,
            storyboardPrompt: shot.storyboardPrompt,
            style: this.project.style,
            aspectRatio: this.project.aspectRatio,
            characters: this.charText(),
          }),
          shot.index,
          "frame",
        );
        this.patchShot(shot.id, { lastFrameUrl });
      } catch (e) {
        this.error = toastErr(e, "末帧失败");
      } finally {
        this.busyShotId = "";
      }
    },
    async generateShotFramePack(shot) {
      await this.generateSceneImage(shot);
      const fresh = this.project.shots.find((s) => s.id === shot.id) || shot;
      await this.generateShotImage(fresh);
      const again = this.project.shots.find((s) => s.id === shot.id) || shot;
      await this.generateLastFrame(again);
    },
    async generateCharacterThreeView(index) {
      const c = this.project.characters[index];
      if (!c?.appearance?.trim()) {
        this.error = "请先填写角色外貌";
        return;
      }
      this.busyCharIndex = index;
      try {
        const imageUrl = await this.requestImage(
          buildCharacterThreeViewPrompt({
            name: c.name,
            appearance: c.appearance,
            style: this.project.style,
            aspectRatio: this.project.aspectRatio,
          }),
          index,
          "character",
        );
        this.patchChar(index, { threeViewUrl: imageUrl, referenceImageUrl: imageUrl, locked: true });
      } catch (e) {
        this.error = toastErr(e, "三视图失败");
      } finally {
        this.busyCharIndex = -1;
      }
    },
    async generateAllCharacterThreeViews() {
      for (let i = 0; i < this.project.characters.length; i += 1) {
        if (!this.project.characters[i].appearance?.trim()) continue;
        await this.generateCharacterThreeView(i);
        await new Promise((r) => setTimeout(r, 1800));
      }
    },
    chainedFrame(shot) {
      if (shot.imageUrl) return shot.imageUrl;
      if (!this.chainPrevFrame || shot.index <= 0) return "";
      const prev = this.project.shots.find((s) => s.index === shot.index - 1);
      return prev?.lastFrameUrl || prev?.imageUrl || "";
    },
    selectShotChars(shot, mode) {
      let keys = [];
      if (mode === "all") keys = this.project.characters.map((c) => characterKey(c));
      else if (mode === "auto") {
        keys = matchShotCharacters(shot, this.project.characters).map(characterKey);
      }
      this.patchShot(shot.id, { videoCharacterKeys: keys });
    },
    async generateShotVideo(shot, variant) {
      this.shotSection = "video";
      const prompt = composeVideoPrompt(shot, this.project.style, this.project.aspectRatio);
      if (!prompt.trim()) {
        this.patchShot(shot.id, { status: "error", error: "请先填写分镜词或台词" });
        return;
      }
      const imageUrl = this.chainedFrame(shot);
      const selectedKeys = this.selectedKeys(shot);
      const involved = this.project.characters.filter((c) => selectedKeys.includes(characterKey(c)));
      const withImg = involved.filter((c) => c.threeViewUrl || c.referenceImageUrl);
      const lockedWithImg = this.project.characters.filter((c) => c.locked && (c.threeViewUrl || c.referenceImageUrl));
      if (
        !this.settings.useMock &&
        this.settings.videoProvider === "doubao" &&
        !imageUrl &&
        !shot.sceneImageUrl &&
        withImg.length === 0 &&
        lockedWithImg.length === 0
      ) {
        this.patchShot(shot.id, { status: "error", error: "请先上传角色图，或上传场景图/首帧" });
        return;
      }
      const conversationId = resolveAccountConversationId(this.settings);
      this.busyShotId = shot.id;
      this.patchShot(shot.id, { status: "animating", error: "", videoCharacterKeys: selectedKeys });
      try {
        const data = await apiRequest(UPSTREAM_PATHS.video, {
          prompt,
          imageUrl,
          lastFrameUrl: shot.lastFrameUrl,
          sceneImageUrl: shot.sceneImageUrl,
          duration: resolveShotDuration(shot, this.project.durationPerShot),
          aspectRatio: this.project.aspectRatio,
          index: shot.index,
          characters: this.project.characters.map((c) => {
            const needImg = selectedKeys.includes(characterKey(c));
            return {
              id: c.id,
              name: c.name,
              appearance: c.appearance,
              locked: c.locked,
              ...(needImg ? { threeViewUrl: c.threeViewUrl, referenceImageUrl: c.referenceImageUrl } : {}),
            };
          }),
          selectedCharacterKeys: selectedKeys,
          conversationId,
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
          variant: variant || this.variant,
          settings: this.settings,
        });
        if (Array.isArray(data.accounts)) {
          this.settings = { ...this.settings, jimengAccounts: data.accounts };
        }
        if (data.conversationId) {
          this.settings = persistAccountConversationId(this.settings, String(data.conversationId));
        }
        saveSettings(this.settings);
        const now = new Date().toISOString();
        const messages = [];
        if (data.chatText) {
          messages.push({ id: uid("vchat"), role: "user", text: `生成视频：${prompt.slice(0, 400)}`, at: now });
          messages.push({ id: uid("vchat"), role: "assistant", text: String(data.chatText), at: now });
        }
        const videoChat = {
          conversationId: data.conversationId || conversationId,
          matchedCharacterNames: data.matchedCharacters || involved.map((c) => c.name),
          messages: messages.length ? messages : shot.videoChat?.messages || [],
        };
        if (data.videoUrl) {
          this.patchShot(shot.id, {
            videoUrl: data.videoUrl,
            status: "ready",
            error: "",
            usedAccountLabel: data.accountLabel,
            usedModel: data.model,
            triedChannels: data.tried,
            ...(imageUrl ? { imageUrl } : {}),
            videoChat,
          });
          if (!this.project.coverUrl) this.project.coverUrl = imageUrl || shot.imageUrl;
          this.modeHint = data.mode || "";
        } else {
          this.patchShot(shot.id, {
            status: "error",
            error: data.error || "未生成视频，可在下方继续回复",
            usedAccountLabel: data.accountLabel,
            usedModel: data.model,
            videoChat,
          });
        }
      } catch (e) {
        this.patchShot(shot.id, { status: "error", error: e.message });
      } finally {
        this.busyShotId = "";
      }
    },
    async generateAllVideos() {
      this.shotSection = "video";
      for (const shot of this.project.shots) {
        const fresh = this.project.shots.find((s) => s.id === shot.id);
        if (!fresh || (fresh.videoUrl && fresh.status === "ready")) continue;
        const chained = this.chainedFrame(fresh);
        if (chained && !fresh.imageUrl) {
          this.patchShot(fresh.id, { imageUrl: chained });
        }
        const again = this.project.shots.find((s) => s.id === shot.id) || fresh;
        await this.generateShotVideo(again, this.variant);
      }
    },
    async replyVideoChat(shot) {
      const text = (this.chatDraft || "").trim();
      if (!text) return;
      this.chatReplyBusy = true;
      this.chatDraft = "";
      const conversationId = resolveAccountConversationId(this.settings) || shot.videoChat?.conversationId;
      const userMsg = { id: uid("vchat"), role: "user", text, at: new Date().toISOString() };
      this.patchShot(shot.id, {
        videoChat: {
          ...(shot.videoChat || {}),
          conversationId,
          messages: [...(shot.videoChat?.messages || []), userMsg],
        },
      });
      try {
        const data = await apiRequest(UPSTREAM_PATHS.chatReply, {
          message: text,
          conversationId,
          settings: this.settings,
          aspectRatio: this.project.aspectRatio,
          duration: resolveShotDuration(shot, this.project.durationPerShot),
          variant: this.variant,
          context: [shot.scene, shot.storyboardPrompt].filter(Boolean).join("\n"),
        });
        if (Array.isArray(data.accounts)) {
          this.settings = { ...this.settings, jimengAccounts: data.accounts };
        }
        if (data.conversationId) {
          this.settings = persistAccountConversationId(this.settings, String(data.conversationId));
        }
        saveSettings(this.settings);
        const current = this.project.shots.find((s) => s.id === shot.id);
        const messages = [...(current?.videoChat?.messages || [])];
        if (data.chatText || data.reply || data.text) {
          messages.push({
            id: uid("vchat"),
            role: "assistant",
            text: String(data.chatText || data.reply || data.text),
            at: new Date().toISOString(),
          });
        }
        this.patchShot(shot.id, {
          ...(data.videoUrl ? { videoUrl: data.videoUrl, status: "ready", error: "" } : {}),
          videoChat: { ...(current?.videoChat || {}), conversationId: data.conversationId || conversationId, messages },
        });
      } catch (e) {
        this.error = toastErr(e, "回复失败");
      } finally {
        this.chatReplyBusy = false;
      }
    },
    async generateAllCharacterPrompts() {
      const story = this.project?.premise?.trim() || this.premise.trim();
      if (!story) {
        this.error = "请先填写故事";
        return;
      }
      this.scriptBusy = true;
      try {
        const data = await apiRequest(UPSTREAM_PATHS.enrich, {
          mode: "characters",
          premise: story,
          style: this.project?.style || this.stylePrompt,
          settings: this.settings,
          characters: this.project?.characters || [],
          shots: (this.project?.shots || []).map((s) => ({
            index: s.index,
            scene: s.scene,
            dialogue: s.dialogue,
            lines: s.lines,
            storyboardPrompt: s.storyboardPrompt,
            characterIntros: s.characterIntros,
          })),
        });
        const list = (data.characters || []).map((c) => ({
          ...c,
          id: c.id || uid("char"),
          locked: c.locked ?? true,
        }));
        if (!list.length) throw new Error("未提取到人物");
        if (!this.project) {
          const now = new Date().toISOString();
          this.project = {
            id: uid("proj"),
            title: story.slice(0, 12),
            premise: story,
            style: this.stylePrompt,
            aspectRatio: this.aspectRatio,
            durationPerShot: this.durationPerShot,
            characters: list,
            shots: [],
            createdAt: now,
            updatedAt: now,
          };
        } else {
          this.project.characters = list;
        }
        this.persist();
        this.error = data.hint || `已提取 ${list.length} 个角色`;
      } catch (e) {
        this.error = toastErr(e, "人物提取失败");
      } finally {
        this.scriptBusy = false;
      }
    },
    async generateAllScenePrompts() {
      this.scriptBusy = true;
      try {
        const data = await apiRequest(UPSTREAM_PATHS.enrich, {
          mode: "scenes",
          premise: this.project.premise || this.premise,
          style: this.project.style,
          aspectRatio: this.project.aspectRatio,
          settings: this.settings,
          shots: this.project.shots.map((s) => ({
            index: s.index,
            scene: s.scene,
            locationName: s.locationName,
            placeIntro: s.placeIntro,
            storyboardPrompt: s.storyboardPrompt,
          })),
        });
        const list = data.shots || [];
        this.project.shots = this.project.shots.map((s) => {
          const hit = list.find((x) => x.index === s.index) || list.find((x) => x.index === s.index + 1);
          if (!hit) return s;
          return {
            ...s,
            scene: hit.scene || s.scene,
            locationName: hit.locationName ?? s.locationName,
            placeIntro: hit.placeIntro ?? s.placeIntro,
            scenePrompt: hit.scenePrompt || s.scenePrompt,
          };
        });
        this.persist();
        if (data.hint) this.error = data.hint;
      } catch (e) {
        this.error = toastErr(e, "场景词失败");
      } finally {
        this.scriptBusy = false;
      }
    },
    addCharacter() {
      this.project.characters.push({ id: uid("char"), name: "", appearance: "", locked: true });
      this.persist();
    },
    removeCharacter(index) {
      this.project.characters.splice(index, 1);
      this.persist();
    },
    addLine(shotId) {
      const shot = this.project.shots.find((s) => s.id === shotId);
      const lines = [...(shot.lines || []), { id: uid("line"), kind: "dialogue", speaker: "", text: "" }];
      this.patchShot(shotId, { lines, dialogue: flattenDialogue(lines) });
    },
    updateLine(shot, lineId, patch) {
      const lines = (shot.lines || []).map((l) => (l.id === lineId ? { ...l, ...patch } : l));
      this.patchShot(shot.id, { lines, dialogue: flattenDialogue(lines) });
    },
    removeLine(shot, lineId) {
      const lines = (shot.lines || []).filter((l) => l.id !== lineId);
      this.patchShot(shot.id, { lines, dialogue: flattenDialogue(lines) });
    },
    async uploadShot(shotId, field) {
      try {
        const url = await pickImageDataUrl();
        this.patchShot(shotId, { [field]: url });
      } catch (e) {
        if (!/取消/.test(e.message || "")) this.error = e.message;
      }
    },
    async uploadChar(index, field) {
      try {
        const url = await pickImageDataUrl();
        this.patchChar(index, { [field]: url, locked: true });
      } catch (e) {
        if (!/取消/.test(e.message || "")) this.error = e.message;
      }
    },
    async uploadCharThree(index) {
      try {
        const url = await pickImageDataUrl();
        this.patchChar(index, { threeViewUrl: url, referenceImageUrl: url, locked: true });
      } catch (e) {
        if (!/取消/.test(e.message || "")) this.error = e.message;
      }
    },
    async repairCharacters() {
      if (!this.project?.characters?.length) {
        this.error = "当前没有可修复的角色";
        return;
      }
      try {
        const { characters, ok, lost } = await repairCharacterImages(this.project.characters);
        this.project.characters = characters;
        this.persist();
        this.error = lost
          ? `角色图已修复：可用 ${ok} · 已失效无法找回 ${lost}`
          : `角色图已修复：可用 ${ok}`;
      } catch (e) {
        this.error = toastErr(e, "修复角色图失败");
      }
    },
    preview(url) {
      if (!url) return;
      uni.previewImage({ urls: [url] });
    },
    copyLink(shot) {
      if (!shot.videoUrl) return;
      uni.setClipboardData({ data: shot.videoUrl });
    },
    exportStoryboard() {
      if (!this.project) return;
      downloadJson(
        `${this.project.title || "分镜"}.json`,
        buildStoryboardExport(this.project, this.project.style || this.stylePrompt),
      ).catch((e) => {
        this.error = toastErr(e, "导出失败");
      });
    },
    async exportCharacters() {
      if (!this.project?.characters.length) {
        this.error = "当前没有可导出的角色";
        return;
      }
      try {
        const pack = await buildCharacterPack(this.project.characters, this.project.title);
        await downloadCharacterPack(`${this.project.title || "镜叙"}-角色包.json`, pack);
        this.error = "";
      } catch (e) {
        this.error = toastErr(e, "导出角色失败");
      }
    },
    async importCharacters() {
      this.ensureProject();
      try {
        const incoming = await readCharacterPackFile();
        const { characters, replaced, added, kept } = mergeCharactersByName(
          this.project.characters || [],
          incoming,
        );
        this.project.characters = characters;
        this.project.updatedAt = new Date().toISOString();
        this.persist();
        this.error = `角色包已按名称合并：更新 ${replaced} · 新增 ${added} · 保留本机 ${kept}（共 ${characters.length}）`;
      } catch (e) {
        if (!/取消/.test(e?.message || "")) {
          this.error = toastErr(e, "导入角色失败");
        }
      }
    },
    async grabLastFrame(useShotVideo) {
      const shot = this.project.shots.find((s) => s.id === this.activeShotId) || this.project.shots[0];
      if (!shot) {
        this.error = "请先生成分镜";
        return;
      }
      const raw = (useShotVideo ? shot.videoUrl : this.frameVideoUrl || shot.videoUrl || "").trim();
      if (!raw) {
        this.error = "请填写视频链接，或先生成本镜视频";
        return;
      }
      this.frameBusy = true;
      this.error = "";
      try {
        let playable = raw;
        const isHttp = /^https?:\/\//i.test(playable);
        const isLocalTmp = /\/(?:api\/)?tmp-media\//i.test(playable);
        if (isHttp && !isLocalTmp) {
          const data = await apiRequest(UPSTREAM_PATHS.frameFromVideo, { videoUrl: playable });
          const base = (this.settings.apiBaseUrl || "").replace(/\/+$/, "");
          playable = data.url?.startsWith("http") ? data.url : `${base}${data.url || ""}`;
        } else if (playable.startsWith("/")) {
          const base = (this.settings.apiBaseUrl || "").replace(/\/+$/, "");
          playable = `${base}${playable}`;
        }
        const dataUrl = await extractLastFrameFromVideo(playable);
        this.patchShot(shot.id, { imageUrl: dataUrl, status: "pending", error: "" });
      } catch (e) {
        this.error = toastErr(e, "从视频取尾帧失败");
      } finally {
        this.frameBusy = false;
      }
    },
  },
};
</script>

<style scoped>
.page { padding: 0 0 160rpx; background: #eef4f5; }
.banner { padding: 16rpx 28rpx; background: rgba(42, 154, 164, 0.15); color: #1f6f78; font-size: 22rpx; }
.banner.warn { background: rgba(200, 60, 40, 0.12); color: #c83c28; }
.card { margin: 20rpx 24rpx 0; padding: 24rpx; background: #fff; border-radius: 20rpx; }
.h2 { font-size: 36rpx; font-weight: 600; color: #122022; }
.h3 { font-size: 30rpx; font-weight: 600; color: #122022; }
.label, .hint { display: block; margin-top: 12rpx; color: #5c6b6e; font-size: 24rpx; }
.hint.bad { color: #c83c28; }
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
.area {
  display: block;
  padding: 20rpx 24rpx;
  line-height: 44rpx;
}
.area.story { height: 280rpx; }
.area.look { height: 180rpx; margin-top: 12rpx; }
.area.prompt { height: 220rpx; }
.area.brief { height: 128rpx; }
.area :deep(.uni-textarea-wrapper),
.area :deep(.uni-textarea-textarea),
.area :deep(textarea) {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  line-height: 44rpx;
  font-size: 28rpx;
}
.row, .between, .frames { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; align-items: center; }
.between { justify-content: space-between; align-items: center; }
.grid { margin-top: 8rpx; }

button.chip,
button.mini,
button.ghost,
button.primary {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 22rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
  border: none;
  box-sizing: border-box;
}
button.chip,
button.mini {
  background: #dfe9eb;
  color: #122022;
}
button.ghost {
  background: #1f6f78;
  color: #fff;
  height: 80rpx;
  line-height: 80rpx;
}
button.primary {
  background: #c83c28;
  color: #fff;
  height: 80rpx;
  line-height: 80rpx;
}
button.primary.slim { flex: 1; min-width: 240rpx; }
button.chip.on,
button.mini.lock.on {
  background: #122022;
  color: #eef4f5;
}
button.mini.ink { background: #122022; color: #eef4f5; }
button.mini.teal { background: #2a9aa4; color: #fff; }
button.mini.soft { background: #edf2f3; color: #5c6b6e; }
button.mini.danger,
button.chip.danger {
  background: #f8e4e0;
  color: #c83c28;
}
button[disabled] { opacity: 0.45; }

.char-card {
  margin-top: 20rpx;
  padding: 20rpx;
  background: linear-gradient(180deg, #f8fcfc 0%, #f2f7f8 100%);
  border: 1px solid rgba(18, 32, 34, 0.08);
  border-radius: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 32, 34, 0.04);
}
.char-top { display: flex; gap: 16rpx; align-items: stretch; }
.char-media {
  position: relative;
  width: 180rpx;
  flex-shrink: 0;
  border-radius: 18rpx;
  overflow: hidden;
  background: #122022;
}
.char-thumb { width: 180rpx; height: 240rpx; display: block; }
.char-placeholder {
  width: 180rpx;
  height: 240rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(238, 244, 245, 0.55);
  font-size: 22rpx;
  background: linear-gradient(160deg, #1a3034, #0c1a1c);
}
.char-badge {
  position: absolute;
  left: 10rpx;
  bottom: 10rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(12, 26, 28, 0.72);
  color: #eef4f5;
  font-size: 18rpx;
}
.char-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.char-head { display: flex; align-items: center; gap: 10rpx; }
.char-head .name { flex: 1; margin-top: 0; height: 72rpx; min-height: 72rpx; line-height: 72rpx; }
.char-head .lock { flex-shrink: 0; width: 110rpx; padding: 0; }
.char-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid rgba(18, 32, 34, 0.06);
}
.char-actions .mini { flex: 1 1 calc(33.33% - 10rpx); min-width: 180rpx; }

.shots-card { padding-top: 20rpx; }
.shot-tabs-wrap {
  position: sticky;
  top: 0;
  z-index: 8;
  margin: 16rpx -24rpx 0;
  padding: 12rpx 24rpx 8rpx;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid rgba(18, 32, 34, 0.06);
}
.shot-tabs {
  width: 100%;
  white-space: nowrap;
}
.shot-tabs-inner {
  display: inline-flex;
  gap: 12rpx;
  padding: 4rpx 2rpx 8rpx;
}
.shot-tab {
  flex-shrink: 0;
  min-width: 120rpx;
  padding: 14rpx 22rpx;
  border-radius: 16rpx;
  background: #dfe9eb;
  color: #122022;
  text-align: center;
}
.shot-tab.on {
  background: #122022;
  color: #eef4f5;
}
.shot-tab.ready:not(.on) {
  background: rgba(42, 154, 164, 0.18);
  color: #1f6f78;
}
.shot-tab.err:not(.on) {
  background: #f8e4e0;
  color: #c83c28;
}
.shot-tab.busy:not(.on) {
  background: #f3e7c8;
  color: #8a6a18;
}
.shot-tab-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.2;
}
.shot-tab-status {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  opacity: 0.8;
}
.shot-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 8rpx;
}
.shot-nav.bottom {
  margin-top: 28rpx;
  padding-top: 20rpx;
  border-top: 1px solid rgba(18, 32, 34, 0.08);
}
.shot-nav .mini { flex: 1; }
.shot-nav-label {
  min-width: 100rpx;
  text-align: center;
  color: #5c6b6e;
  font-size: 24rpx;
}
.shot-panel {
  margin-top: 8rpx;
  padding-top: 8rpx;
}
.section-tabs {
  display: flex;
  gap: 10rpx;
  margin-top: 16rpx;
}
.section-tab {
  flex: 1;
  height: 68rpx;
  line-height: 68rpx;
  text-align: center;
  border-radius: 14rpx;
  background: #dfe9eb;
  color: #122022;
  font-size: 26rpx;
  font-weight: 600;
}
.section-tab.on {
  background: #c83c28;
  color: #fff;
}
.shot-tools {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1px solid rgba(18, 32, 34, 0.08);
}
.empty-shot {
  margin-top: 24rpx;
  padding: 40rpx 0;
  text-align: center;
}
.clear-btn {
  margin-top: 24rpx;
  width: 100%;
}
.line { margin-top: 12rpx; padding: 12rpx; background: #f7fbfb; border-radius: 16rpx; }
.thumb { width: 200rpx; height: 260rpx; border-radius: 16rpx; background: #122022; }
.player { width: 100%; height: 420rpx; margin-top: 12rpx; background: #000; }
.picker {
  margin-top: 12rpx;
  padding: 0 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: #f3f7f8;
  border-radius: 16rpx;
  border: 1px solid rgba(18, 32, 34, 0.08);
}
.grow { flex: 1; margin-top: 0; }
.chat { margin-top: 12rpx; }
.msg { margin-top: 8rpx; font-size: 24rpx; color: #122022; }
.msg.user { color: #1f6f78; }
.choice-row {
  display: flex;
  gap: 12rpx;
  margin-top: 12rpx;
}
.choice-row .chip { flex: 1; }
.stack-actions { display: flex; flex-direction: column; gap: 12rpx; margin-top: 20rpx; }
.stack-actions .primary,
.stack-actions .ghost.block { width: 100%; margin: 0; }
.label.tight { margin-top: 0; }
.tool-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.tool-grid .mini { width: calc(50% - 6rpx); flex: none; }
.tool-grid.three .mini { width: calc(33.33% - 8rpx); padding: 0 8rpx; }
.frame-cards { display: flex; flex-direction: column; gap: 16rpx; margin-top: 16rpx; }
.frame-card {
  padding: 16rpx;
  background: #fff;
  border: 1px solid rgba(18, 32, 34, 0.08);
  border-radius: 18rpx;
}
.frame-title { display: block; color: #5c6b6e; font-size: 22rpx; }
.frame-preview, .frame-empty {
  width: 100%;
  margin-top: 12rpx;
  border-radius: 14rpx;
  background: #122022;
}
.frame-preview.ratio-9-16, .frame-empty.ratio-9-16 { height: 420rpx; }
.frame-preview.ratio-16-9, .frame-empty.ratio-16-9 { height: 220rpx; }
.frame-preview.ratio-1-1, .frame-empty.ratio-1-1 { height: 320rpx; }
.frame-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(238, 244, 245, 0.7);
  font-size: 24rpx;
  border: 1px dashed rgba(42, 154, 164, 0.45);
  background: #f4f8f8;
  color: #5c6b6e;
}
.frame-ops { display: flex; gap: 10rpx; margin-top: 12rpx; }
.frame-ops .mini { flex: 1; }
.pick-box {
  margin-top: 8rpx;
  padding: 16rpx;
  background: #f7fbfb;
  border: 1px solid rgba(18, 32, 34, 0.08);
  border-radius: 18rpx;
}
.pick-list { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
.pick-card {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 46%;
  flex: 1 1 46%;
  padding: 14rpx 16rpx;
  border-radius: 14rpx;
  background: #fff;
  border: 1px solid rgba(18, 32, 34, 0.1);
}
.pick-card.on {
  background: rgba(42, 154, 164, 0.12);
  border-color: rgba(42, 154, 164, 0.45);
}
.pick-box-mark {
  width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  text-align: center;
  border-radius: 8rpx;
  border: 1px solid rgba(18, 32, 34, 0.2);
  font-size: 22rpx;
  color: #1f6f78;
  background: #fff;
}
.pick-card.on .pick-box-mark { background: #2a9aa4; color: #fff; border-color: #2a9aa4; }
.pick-name { flex: 1; font-size: 26rpx; color: #122022; }
.pick-miss { font-size: 20rpx; color: #c83c28; }
</style>
