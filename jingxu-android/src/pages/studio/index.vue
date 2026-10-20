<template>
  <view class="page">
    <view class="banner">
      {{ bannerText }}
    </view>

    <!-- 公共参数：在未分镜/已分镜 tab 之上，可折叠 -->
    <view class="card common-params">
      <view class="common-params-hd" @click="commonParamsOpen = !commonParamsOpen">
        <view class="common-params-titles">
          <text class="h2">公共参数</text>
          <text class="common-params-summary">{{ commonParamsSummary }}</text>
        </view>
        <text class="common-params-caret">{{ commonParamsOpen ? "收起" : "展开" }}</text>
      </view>
      <view v-show="commonParamsOpen" class="common-params-body">
        <text class="label">画面风格</text>
        <view class="choice-row">
          <button
            v-for="s in styles"
            :key="s.id"
            class="chip"
            :class="{ on: styleId === s.id }"
            @click="onStylePick(s.id)"
          >{{ s.label }}</button>
        </view>
        <view class="grid">
          <view>
            <text class="label">镜数 {{ shotCount }}</text>
            <slider
              :value="shotCount"
              min="1"
              max="12"
              show-value
              @changing="onCommonShotCountChanging"
              @change="onCommonShotCount($event.detail.value)"
            />
          </view>
          <view>
            <text class="label">默认秒数 {{ durationPerShot }}</text>
            <slider :value="durationPerShot" min="4" max="15" show-value @change="onDurationDefault($event.detail.value)" />
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
        <view v-if="accounts.length">
          <text class="label">当前额度账号</text>
          <picker :range="accountLabels" :value="accountIndex" @change="onPickAccount">
            <view class="picker">{{ accountLabels[accountIndex] || "选择账号" }}</view>
          </picker>
        </view>
      </view>
    </view>

    <!-- 公共角色包：参数下方、模式 tab 上方，默认可折叠 -->
    <view id="characters" class="card common-chars">
      <view class="common-params-hd" @click="commonCharsOpen = !commonCharsOpen">
        <view class="common-params-titles">
          <text class="h2">角色包 {{ commonCharCount }}</text>
          <text class="common-params-summary">{{ commonCharsSummary }}</text>
        </view>
        <text class="common-params-caret">{{ commonCharsOpen ? "收起" : "展开" }}</text>
      </view>
      <view v-show="commonCharsOpen" class="common-params-body">
        <view class="between">
          <text class="hint tight-top">未分镜 / 已分镜共用</text>
          <button class="mini teal" @click.stop="ensureProject(); addCharacter()">添加</button>
        </view>
        <view class="tool-grid">
          <button class="mini" :disabled="scriptBusy" @click="ensureProject(); generateAllCharacterPrompts()">提取人物</button>
          <button class="mini" :disabled="scriptBusy" @click="ensureProject(); generateAllScenePrompts()">补场景词</button>
          <button class="mini" @click="ensureProject(); generateAllCharacterThreeViews()">全部三视图</button>
          <button class="mini" @click="ensureProject(); repairCharacters()">修复角色图</button>
        </view>
        <view class="tool-grid three">
          <button class="mini ink" @click="ensureProject(); exportCharacters()">导出角色包</button>
          <button class="mini ink" @click="ensureProject(); importCharacters()">导入角色包</button>
          <button class="mini ink" @click="ensureProject(); exportStoryboard()">导出分镜</button>
        </view>
        <template v-if="project && project.characters.length">
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
        </template>
        <text v-else class="hint">暂无角色，可提取人物或手动添加。</text>
      </view>
    </view>

    <view class="mode-tabs">
      <view
        class="mode-tab"
        :class="{ on: studioMode === 'raw' }"
        @click="switchStudioMode('raw')"
      >未分镜</view>
      <view
        class="mode-tab"
        :class="{ on: studioMode === 'board' }"
        @click="switchStudioMode('board')"
      >已分镜</view>
    </view>

    <!-- ===== 未分镜：保留现有全流程 ===== -->
    <view v-if="studioMode === 'raw'">
    <view class="card">
      <text class="h2">故事</text>
      <textarea
        class="area story"
        v-model="premise"
        maxlength="-1"
        placeholder="一句话或一段故事梗概（不限字数）"
        @blur="onPremiseBlur"
      />
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

    <view v-if="project" class="card shots-card">
      <view class="between title-edit">
        <input
          class="input project-title"
          :value="project.title || defaultProjectTitle"
          placeholder="项目名"
          @input="onProjectTitle($event.detail.value)"
        />
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
          <button
            class="primary slim"
            :disabled="busyShotId === activeShot.id"
            @click="generateShotVideo(activeShot, variant)"
          >
            {{
              busyShotId === activeShot.id
                ? "出片中…"
                : `生成视频（${variant === "fast" ? "Fast" : "Mini"}）`
            }}
          </button>
          <button class="mini" @click="patchShot(activeShot.id, { videoUrl: '', status: 'pending', error: '' })">重置视频</button>
        </view>
        <text v-if="activeShot.error" class="hint bad">{{ activeShot.error }}</text>
        <text v-if="activeShot.usedAccountLabel" class="hint">{{ activeShot.usedAccountLabel }} {{ activeShot.usedModel || "" }}</text>
        <video
          v-if="activeShot.videoUrl && !activeShot.videoUrl.startsWith('data:')"
          class="player"
          :src="mediaSrc(activeShot.videoUrl)"
          controls
        />
        <text v-else-if="activeShot.videoUrl" class="hint">视频为内嵌数据，请在电脑端下载。</text>
        <view v-if="activeShot.videoUrl" class="row">
          <button class="mini" @click="copyLink(activeShot)">{{ activeShot.videoUrl.startsWith('data:') ? '内嵌视频' : '复制链接' }}</button>
          <button class="mini" @click="saveVideo(activeShot)">下载视频</button>
        </view>

        <view v-if="activeShot.videoChat" class="doubao-chat">
          <view class="doubao-chat-hd">
            <view class="doubao-chat-brand">
              <view class="doubao-logo">豆</view>
              <view class="doubao-chat-titles">
                <text class="doubao-chat-title">豆包</text>
                <text class="doubao-chat-sub">{{ doubaoChatSubtitle(activeShot) }}</text>
              </view>
            </view>
          </view>
          <scroll-view
            class="doubao-chat-list"
            scroll-y
            :scroll-into-view="chatScrollInto"
            scroll-with-animation
          >
            <view
              v-if="!(activeShot.videoChat.messages || []).length"
              class="doubao-empty"
            >
              <text>生成视频后说明会出现在这里。可点下方「确定」继续，或改词后发送。</text>
            </view>
            <view
              v-for="m in activeShot.videoChat.messages"
              :id="'vchat-' + m.id"
              :key="m.id"
              class="doubao-row"
              :class="m.role"
            >
              <view v-if="m.role !== 'user'" class="doubao-avatar">豆</view>
              <view
                class="doubao-bubble"
                :class="[m.role, { tall: isChatTall(m) && !chatExpanded[m.id] }]"
                @click="onChatBubbleClick(m)"
              >
                <text v-if="m.role !== 'user'" class="doubao-name">豆包</text>
                <view class="doubao-bubble-body">
                  <!-- 用 view 不用 text：uni-app text 在 flex 里易逐字折行 -->
                  <view class="doubao-text">{{ displayChatText(m.text) }}</view>
                </view>
                <text
                  v-if="m.role === 'user' && isChatTall(m)"
                  class="doubao-expand"
                >{{ chatExpanded[m.id] ? "收起" : "展开全文" }}</text>
              </view>
            </view>
            <view v-if="chatReplyBusy" class="doubao-row assistant">
              <view class="doubao-avatar">豆</view>
              <view class="doubao-bubble assistant typing">
                <text class="doubao-name">豆包</text>
                <text class="doubao-typing">正在回复…</text>
              </view>
            </view>
            <view id="vchat-end" class="doubao-list-end" />
          </scroll-view>
          <view class="doubao-composer">
            <view class="doubao-quick">
              <button
                class="doubao-chip"
                :disabled="chatReplyBusy || busyShotId === activeShot.id"
                @click="quickReply(activeShot, '确定')"
              >确定</button>
              <button
                class="doubao-chip ghost"
                :disabled="chatReplyBusy || busyShotId === activeShot.id"
                @click="chatDraft = '请直接生成，不要再确认'"
              >直接生成</button>
            </view>
            <view class="doubao-composer-row">
              <textarea
                class="doubao-input"
                maxlength="2000"
                :disabled="chatReplyBusy || busyShotId === activeShot.id"
                :value="chatDraft"
                placeholder="输入回复…"
                @input="chatDraft = $event.detail.value"
              />
              <button
                class="doubao-send"
                :disabled="chatReplyBusy || !chatDraft.trim() || busyShotId === activeShot.id"
                @click="replyVideoChat(activeShot)"
              >
                {{ chatReplyBusy ? "…" : "发送" }}
              </button>
            </view>
          </view>
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
    </view>

    <!-- ===== 已分镜：分镜词 + 角色 + 出片对话 ===== -->
    <view v-else class="board-mode">
      <view class="card">
        <text class="h2">分镜词</text>
        <textarea
          class="area story"
          v-model="premise"
          maxlength="-1"
          placeholder="粘贴或编写分镜词（不限字数）"
          @blur="onBoardPremiseBlur"
        />
        <text v-if="modeHint" class="hint">{{ modeHint }}</text>
        <text v-if="error" class="hint bad">{{ error }}</text>
      </view>

      <view v-if="boardShot" class="card">
        <view class="between">
          <text class="h2">画面</text>
          <button class="mini ink" :disabled="boardBusy" @click="generateBoardFramePack">一键生成三图</button>
        </view>
        <text class="hint">场景图 · 首镜首帧 · 末镜末帧（按当前画幅 {{ aspectRatio }}）</text>
        <view class="frame-cards">
          <view v-for="slot in boardFrameSlots" :key="slot.key" class="frame-card">
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
              <button class="mini teal" :disabled="boardBusy" @click="slot.gen()">生成</button>
              <button class="mini ink" @click="uploadShot(slot.shotId, slot.key)">上传</button>
              <button class="mini danger" :disabled="!slot.url" @click="clearFrameById(slot.shotId, slot.key)">清除</button>
            </view>
          </view>
        </view>
        <view class="row">
          <button
            v-if="boardLastShot && boardLastShot.videoUrl"
            class="mini"
            :disabled="frameBusy"
            @click="grabBoardLastShotTailAsLastFrame"
          >末镜视频尾帧作末镜末帧</button>
        </view>
      </view>

      <view class="card">
        <view class="pick-box">
          <text class="label tight">生成视频所用角色</text>
          <view v-if="project && project.characters.length" class="tool-grid three">
            <button class="mini soft" @click="selectBoardChars('auto')">按分镜自动勾选</button>
            <button class="mini soft" @click="selectBoardChars('all')">全选</button>
            <button class="mini soft" @click="selectBoardChars('none')">清空</button>
          </view>
          <view v-if="project && project.characters.length" class="pick-list">
            <view
              v-for="c in project.characters"
              :key="characterKey(c)"
              class="pick-card"
              :class="{ on: boardSelectedKeys.includes(characterKey(c)) }"
              @click="toggleBoardChar(c)"
            >
              <view class="pick-box-mark">{{ boardSelectedKeys.includes(characterKey(c)) ? "✓" : "" }}</view>
              <text class="pick-name">{{ c.name || "未命名" }}</text>
              <text v-if="!(c.threeViewUrl || c.referenceImageUrl)" class="pick-miss">缺图</text>
            </view>
          </view>
          <text v-else class="hint">暂无角色卡，生成视频将不附带角色参考图</text>
          <text v-if="project && project.characters.length" class="hint">勾选后点下方生成；只附带已勾选且有参考图的角色。</text>
        </view>

        <view class="row">
          <button class="primary slim" :disabled="boardBusy" @click="boardGenerateVideo()">
            {{
              boardBusy
                ? "出片中…"
                : shotCount > 1
                  ? `一次出${shotCount}镜（${variant === "fast" ? "Fast" : "Mini"}）`
                  : `生成视频（${variant === "fast" ? "Fast" : "Mini"}）`
            }}
          </button>
          <button class="mini" @click="boardResetVideos">重置视频</button>
        </view>
        <text v-if="boardFocusShot && boardFocusShot.error" class="hint bad">镜{{ (boardFocusShot.index || 0) + 1 }}：{{ boardFocusShot.error }}</text>
        <text v-if="boardFocusShot && boardFocusShot.usedAccountLabel" class="hint">{{ boardFocusShot.usedAccountLabel }} {{ boardFocusShot.usedModel || "" }}</text>
        <video
          v-if="boardFocusShot && boardFocusShot.videoUrl && !boardFocusShot.videoUrl.startsWith('data:')"
          class="player"
          :src="mediaSrc(boardFocusShot.videoUrl)"
          controls
        />
        <text v-else-if="boardFocusShot && boardFocusShot.videoUrl" class="hint">视频为内嵌数据，请在电脑端下载。</text>
        <view v-if="boardFocusShot && boardFocusShot.videoUrl" class="row">
          <button class="mini" @click="copyLink(boardFocusShot)">{{ boardFocusShot.videoUrl.startsWith('data:') ? '内嵌视频' : '复制链接' }}</button>
          <button class="mini" @click="saveVideo(boardFocusShot)">下载视频</button>
        </view>

        <view v-if="boardFocusShot && boardFocusShot.videoChat" class="doubao-chat">
          <view class="doubao-chat-hd">
            <view class="doubao-chat-brand">
              <view class="doubao-logo">豆</view>
              <view class="doubao-chat-titles">
                <text class="doubao-chat-title">豆包</text>
                <text class="doubao-chat-sub">{{ doubaoChatSubtitle(boardFocusShot) }}</text>
              </view>
            </view>
          </view>
          <scroll-view
            class="doubao-chat-list"
            scroll-y
            :scroll-into-view="chatScrollInto"
            scroll-with-animation
          >
            <view v-if="!(boardFocusShot.videoChat.messages || []).length" class="doubao-empty">
              <text>生成视频后说明会出现在这里。可点下方「确定」继续，或改词后发送。</text>
            </view>
            <view
              v-for="m in boardFocusShot.videoChat.messages"
              :id="'vchat-' + m.id"
              :key="m.id"
              class="doubao-row"
              :class="m.role"
            >
              <view v-if="m.role !== 'user'" class="doubao-avatar">豆</view>
              <view
                class="doubao-bubble"
                :class="[m.role, { tall: isChatTall(m) && !chatExpanded[m.id] }]"
                @click="onChatBubbleClick(m)"
              >
                <text v-if="m.role !== 'user'" class="doubao-name">豆包</text>
                <view class="doubao-bubble-body">
                  <view class="doubao-text">{{ displayChatText(m.text) }}</view>
                </view>
                <text v-if="m.role === 'user' && isChatTall(m)" class="doubao-expand">
                  {{ chatExpanded[m.id] ? "收起" : "展开全文" }}
                </text>
              </view>
            </view>
            <view v-if="chatReplyBusy" class="doubao-row assistant">
              <view class="doubao-avatar">豆</view>
              <view class="doubao-bubble assistant typing">
                <text class="doubao-name">豆包</text>
                <text class="doubao-typing">正在回复…</text>
              </view>
            </view>
            <view id="vchat-end" class="doubao-list-end" />
          </scroll-view>
          <view class="doubao-composer">
            <view class="doubao-quick">
              <button
                class="doubao-chip"
                :disabled="chatReplyBusy || boardBusy || !boardFocusShot"
                @click="quickReply(boardFocusShot, '确定')"
              >确定</button>
              <button
                class="doubao-chip ghost"
                :disabled="chatReplyBusy || boardBusy"
                @click="chatDraft = '请直接生成，不要再确认'"
              >直接生成</button>
            </view>
            <view class="doubao-composer-row">
              <textarea
                class="doubao-input"
                maxlength="2000"
                :disabled="chatReplyBusy || boardBusy || !boardFocusShot"
                :value="chatDraft"
                placeholder="输入回复…"
                @input="chatDraft = $event.detail.value"
              />
              <button
                class="doubao-send"
                :disabled="chatReplyBusy || !chatDraft.trim() || boardBusy || !boardFocusShot"
                @click="boardFocusShot && replyVideoChat(boardFocusShot)"
              >
                {{ chatReplyBusy ? "…" : "发送" }}
              </button>
            </view>
          </view>
        </view>
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
  DEFAULT_PROJECT_TITLE,
  accountHasFullCookie,
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
  ensureDefaultProjectBound,
  extractLastFrameFromVideo,
  flattenDialogue,
  formatAccountLabel,
  loadActiveProject,
  loadActiveProjectAsync,
  loadSettings,
  matchShotCharacters,
  mergeCharactersByName,
  applyPresetForPlatform,
  persistAccountConversationId,
  pickImageDataUrl,
  readCharacterPackFile,
  repairCharacterImages,
  resolveActiveAccountId,
  resolveProjectConversationId,
  resolveSelectedAccount,
  resolveShotDuration,
  saveProjectAsync,
  saveSettings,
  setActiveProjectId,
  toPersistentMediaUrl,
  toastErr,
  uid,
  withActiveAccount,
  withProjectConversationId,
} from "../../common/jingxu.js";

export default {
  components: { AppTab },
  data() {
    return {
      settings: null,
      premise: "",
      styleId: "guoman",
      styles: STYLE_PRESETS,
      studioMode: "raw",
      commonParamsOpen: false,
      commonCharsOpen: false,
      shotCount: 4,
      aspectRatio: "9:16",
      ratios: ["9:16", "16:9", "1:1"],
      durationPerShot: 15,
      variant: "mini",
      chainPrevFrame: true,
      boardCharKeys: null,
      project: null,
      scriptBusy: false,
      busyShotId: "",
      busyCharIndex: -1,
      chatReplyBusy: false,
      chatScrollInto: "",
      chatDraft: "",
      chatExpanded: {},
      error: "",
      modeHint: "",
      activeShotId: "",
      shotTabScrollId: "",
      shotSection: "script",
      frameVideoUrl: "",
      frameBusy: false,
      kinds: LINE_KINDS,
      defaultProjectTitle: DEFAULT_PROJECT_TITLE,
    };
  },
  computed: {
    bannerText() {
      const name = this.project?.title || DEFAULT_PROJECT_TITLE;
      const acc = this.settings ? resolveSelectedAccount(this.settings) : null;
      if (acc?.sessionId && !accountHasFullCookie(acc)) {
        return `项目「${name}」· 当前账号仅有 session，出片请到设置粘贴完整 Cookie`;
      }
      return `项目「${name}」· 按 config.js 代理`;
    },
    stylePrompt() {
      return this.styles.find((s) => s.id === this.styleId)?.prompt || this.styles[0].prompt;
    },
    commonParamsSummary() {
      const style =
        this.styles.find((s) => s.id === this.styleId)?.label || "风格";
      const seed = this.variant === "fast" ? "Fast" : "Mini";
      const acc = this.accountLabels[this.accountIndex] || "未选账号";
      const accShort = acc.length > 10 ? `${acc.slice(0, 10)}…` : acc;
      return `${style} · ${this.shotCount}镜 · ${this.durationPerShot}秒 · ${this.aspectRatio} · ${seed} · ${accShort}`;
    },
    commonCharCount() {
      return this.project?.characters?.length || 0;
    },
    commonCharsSummary() {
      const list = this.project?.characters || [];
      if (!list.length) return "暂无角色 · 展开可提取/导入";
      const names = list
        .map((c) => c.name || "未命名")
        .slice(0, 4)
        .join("、");
      const more = list.length > 4 ? ` 等${list.length}人` : "";
      const withImg = list.filter((c) => c.threeViewUrl || c.referenceImageUrl).length;
      return `${names}${more} · 有图 ${withImg}/${list.length}`;
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
    /** 已分镜：首镜（画面三图的「首镜」） */
    boardShot() {
      if (!this.project?.shots?.length) return null;
      return this.project.shots[0] || null;
    },
    /** 已分镜：末镜 */
    boardLastShot() {
      const shots = this.project?.shots || [];
      if (!shots.length) return null;
      return shots[shots.length - 1] || null;
    },
    /** 已分镜：当前选中镜（视频/对话）；无选中则回落首镜 */
    boardFocusShot() {
      return this.activeShot || this.boardShot;
    },
    boardBusy() {
      return Boolean(this.busyShotId) || this.scriptBusy;
    },
    boardSelectedKeys() {
      if (Array.isArray(this.boardCharKeys)) return this.boardCharKeys;
      if (this.boardFocusShot) return this.selectedKeys(this.boardFocusShot);
      return [];
    },
    /** 已分镜画面：场景图 / 首镜首帧 / 末镜末帧 */
    boardFrameSlots() {
      const first = this.boardShot;
      const last = this.boardLastShot;
      if (!first || !last) return [];
      return [
        {
          key: "sceneImageUrl",
          label: "场景图",
          shotId: first.id,
          url: first.sceneImageUrl,
          gen: () => this.generateSceneImage(first),
        },
        {
          key: "imageUrl",
          label: "首镜首帧",
          shotId: first.id,
          url: first.imageUrl,
          gen: () => this.generateShotImage(first),
        },
        {
          key: "lastFrameUrl",
          label: "末镜末帧",
          shotId: last.id,
          url: last.lastFrameUrl,
          gen: () => this.generateLastFrame(last),
        },
      ];
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
  async onShow() {
    this.settings = loadSettings();
    // 切换项目后重新带缓存进入；无项目则绑定默认「仙帝重生」
    const activeMeta = loadActiveProject();
    const needReload =
      !this.project ||
      !activeMeta ||
      this.project.id !== activeMeta.id;
    if (!needReload) {
      // 同项目再次进入：抢救空未分镜缓存 + 纠正竖排对话
      const rawBefore = this.project.studioCaches?.raw?.shots?.length || 0;
      this.project = this.migrateStudioCaches(this.project);
      const repaired = this.repairVideoChatTexts(this.project);
      this.project = repaired.project;
      const rawAfter = this.project.studioCaches?.raw?.shots?.length || 0;
      if (rawAfter > rawBefore || repaired.changed) {
        this.applyModeCache(this.studioMode === "board" ? "board" : "raw");
      }
      return;
    }
    try {
      const saved =
        (await ensureDefaultProjectBound(DEFAULT_PROJECT_TITLE)) ||
        (await loadActiveProjectAsync());
      if (saved) {
        const migrated = this.migrateStudioCaches({
          ...saved,
          shots: this.normalizeShotIndices(saved.shots || []),
        });
        const repaired = this.repairVideoChatTexts(migrated);
        this.project = repaired.project;
        this.aspectRatio = saved.aspectRatio || "9:16";
        if (saved.style) {
          const hit = this.styles.find((s) => s.prompt === saved.style || s.id === saved.style);
          if (hit) this.styleId = hit.id;
        }
        const mode = saved.studioMode === "board" ? "board" : "raw";
        this.studioMode = mode;
        this.applyModeCache(mode, { persist: false });
        const indexDirty = (this.project.shots || []).some((s, i) => Number(s.index) !== i);
        if (indexDirty || repaired.changed || !saved.studioCaches) {
          this.persist();
        }
      } else {
        this.ensureProject();
      }
    } catch (e) {
      this.error = toastErr(e, "加载项目失败");
      this.ensureProject();
    }
  },
  methods: {
    characterKey,
    defaultShotCountForMode(mode) {
      return mode === "board" ? 2 : 4;
    },
    /** 深拷贝，避免未分镜/已分镜共享同一 shot 引用被互相改掉 */
    cloneShots(shots) {
      try {
        return this.normalizeShotIndices(
          JSON.parse(JSON.stringify(Array.isArray(shots) ? shots : [])),
        );
      } catch {
        return this.normalizeShotIndices(
          (shots || []).map((s) => ({ ...s })),
        );
      }
    },
    cacheHasShots(cache) {
      return Array.isArray(cache?.shots) && cache.shots.length > 0;
    },
    makeModeCache(mode, partial = {}) {
      const defN = this.defaultShotCountForMode(mode);
      const shots = this.cloneShots(partial.shots || []);
      return {
        premise: partial.premise != null ? String(partial.premise) : "",
        shotCount: Math.max(
          1,
          Math.min(
            12,
            Number(partial.shotCount) || (shots.length > 0 ? shots.length : defN),
          ),
        ),
        durationPerShot: Number(partial.durationPerShot) || 15,
        shots,
        activeShotId: partial.activeShotId || shots[0]?.id || "",
        ...(mode === "board"
          ? {
              boardCharKeys:
                partial.boardCharKeys === undefined
                  ? null
                  : partial.boardCharKeys,
            }
          : {}),
      };
    },
    blankModeCache(mode) {
      return this.makeModeCache(mode, { shotCount: this.defaultShotCountForMode(mode), shots: [] });
    },
    /**
     * 迁移/修复双缓存：
     * - 首次：顶层 shots → 未分镜
     * - 若未分镜空、顶层仍有分镜且不像已分镜缓存 → 找回未分镜
     */
    migrateStudioCaches(project) {
      if (!project) return project;
      const topShots = this.cloneShots(project.shots || []);
      let raw = project.studioCaches?.raw
        ? this.makeModeCache("raw", project.studioCaches.raw)
        : null;
      let board = project.studioCaches?.board
        ? this.makeModeCache("board", project.studioCaches.board)
        : null;

      if (!raw && !board) {
        raw = this.makeModeCache("raw", {
          premise: project.premise || "",
          shotCount: topShots.length > 0 ? topShots.length : 4,
          durationPerShot: project.durationPerShot || 15,
          shots: topShots,
          activeShotId: topShots[0]?.id || "",
        });
        board = this.blankModeCache("board");
      } else {
        if (!raw) raw = this.blankModeCache("raw");
        if (!board) board = this.blankModeCache("board");
        // 未分镜被误写成空：用顶层 shots 抢救（确认不是已分镜那一套）
        if (!this.cacheHasShots(raw) && topShots.length > 0) {
          const boardIds = new Set((board.shots || []).map((s) => s.id));
          const topIsBoard =
            project.studioMode === "board" &&
            topShots.length === (board.shots || []).length &&
            topShots.every((s) => boardIds.has(s.id));
          if (!topIsBoard) {
            raw = this.makeModeCache("raw", {
              premise: project.premise || "",
              shotCount: topShots.length,
              durationPerShot: project.durationPerShot || 15,
              shots: topShots,
              activeShotId: topShots[0]?.id || "",
            });
          }
        }
      }

      return {
        ...project,
        studioMode: project.studioMode === "board" ? "board" : "raw",
        studioCaches: { raw, board },
      };
    },
    /** 把当前界面写入对应模式缓存（深拷贝）；禁止用空列表覆盖已有未分镜 */
    snapshotModeCache(mode = this.studioMode) {
      if (!this.project) return;
      const key = mode === "board" ? "board" : "raw";
      const caches = { ...(this.project.studioCaches || {}) };
      const prev = caches[key];
      const nextShots = this.cloneShots(this.project.shots || []);
      // 防护：未分镜已有内容时，不允许被空快照盖掉
      if (
        key === "raw" &&
        this.cacheHasShots(prev) &&
        nextShots.length === 0
      ) {
        caches[key] = {
          ...this.makeModeCache("raw", prev),
          premise: this.premise || prev.premise || "",
          shotCount: Math.max(
            1,
            Math.min(12, Number(this.shotCount) || prev.shotCount || 4),
          ),
          durationPerShot: this.durationPerShot || prev.durationPerShot || 15,
          activeShotId: this.activeShotId || prev.activeShotId || "",
        };
        this.project.studioCaches = caches;
        this.project.studioMode = key;
        return;
      }
      caches[key] = this.makeModeCache(key, {
        premise: this.premise,
        shotCount: this.shotCount,
        durationPerShot: this.durationPerShot,
        shots: nextShots,
        activeShotId: this.activeShotId || "",
        boardCharKeys:
          key === "board"
            ? Array.isArray(this.boardCharKeys)
              ? [...this.boardCharKeys]
              : this.boardCharKeys
            : undefined,
      });
      this.project.studioCaches = caches;
      this.project.studioMode = key;
    },
    /** 从模式缓存恢复界面；已分镜空缓存时按默认 2 镜建空分镜 */
    applyModeCache(mode, opts = {}) {
      this.ensureProject();
      this.project = this.migrateStudioCaches(this.project);
      const key = mode === "board" ? "board" : "raw";
      const cache =
        this.project.studioCaches?.[key] || this.blankModeCache(key);
      const defN = this.defaultShotCountForMode(key);
      this.studioMode = key;
      this.premise = cache.premise || "";
      this.shotCount = Math.max(
        1,
        Math.min(
          12,
          Number(cache.shotCount) ||
            (cache.shots?.length ? cache.shots.length : defN),
        ),
      );
      this.durationPerShot =
        cache.durationPerShot || this.project.durationPerShot || 15;
      // 深拷贝取出，与缓存脱钩
      this.project.shots = this.cloneShots(cache.shots || []);
      this.project.premise = this.premise;
      this.project.durationPerShot = this.durationPerShot;
      this.project.studioMode = key;
      if (key === "board") {
        this.boardCharKeys =
          cache.boardCharKeys === undefined ? null : cache.boardCharKeys;
        this.shotSection = "video";
        if (!this.project.shots.length) {
          this.shotCount = defN;
          this.ensureBoardShots({ allowTrim: false, skipSnapshot: true });
        } else {
          this.shotCount = Math.min(
            12,
            Number(cache.shotCount) || this.project.shots.length || defN,
          );
          if (
            cache.activeShotId &&
            this.project.shots.some((s) => s.id === cache.activeShotId)
          ) {
            this.selectShotTab(cache.activeShotId);
          } else if (this.project.shots[0]?.id) {
            this.selectShotTab(this.project.shots[0].id);
          }
        }
      } else {
        this.boardCharKeys = null;
        // 未分镜空但缓存里其实有：再迁一次抢救
        if (!this.project.shots.length && this.cacheHasShots(cache)) {
          this.project.shots = this.cloneShots(cache.shots);
        }
        if (
          cache.activeShotId &&
          this.project.shots.some((s) => s.id === cache.activeShotId)
        ) {
          this.selectShotTab(cache.activeShotId);
        } else if (this.project.shots[0]?.id) {
          this.selectShotTab(this.project.shots[0].id);
        } else {
          this.activeShotId = "";
        }
      }
      this.snapshotModeCache(key);
      if (opts.persist !== false) this.persist();
    },
    switchStudioMode(mode) {
      if (mode !== "raw" && mode !== "board") return;
      if (mode === this.studioMode) return;
      this.error = "";
      this.ensureProject();
      this.project = this.migrateStudioCaches(this.project);
      // 先把当前模式深拷贝存档，再加载另一套
      this.snapshotModeCache(this.studioMode);
      this.applyModeCache(mode);
    },
    /**
     * @param {{ allowTrim?: boolean, skipSnapshot?: boolean }} opts
     * 默认只补齐、不截断；仅用户拖镜数滑块时 allowTrim=true 才可减少镜数
     * 只改已分镜缓存，绝不触碰未分镜 shots
     */
    ensureBoardShots(opts = {}) {
      this.ensureProject();
      if (this.studioMode !== "board") return this.project.shots;
      const allowTrim = opts.allowTrim === true;
      const n = Math.max(1, Math.min(12, Number(this.shotCount) || 2));
      const prompt = String(this.premise || "").trim();
      let shots = [...(this.project.shots || [])];
      while (shots.length < n) {
        const i = shots.length;
        shots.push({
          id: uid("shot"),
          index: i,
          scene: "",
          locationName: "",
          placeIntro: "",
          characterIntros: [],
          lines: [],
          dialogue: "",
          camera: "中景",
          imagePrompt: "",
          storyboardPrompt: prompt,
          status: "pending",
          duration: this.durationPerShot,
          videoCharacterKeys: Array.isArray(this.boardCharKeys)
            ? [...this.boardCharKeys]
            : undefined,
        });
      }
      if (allowTrim && shots.length > n) shots = shots.slice(0, n);
      else if (!allowTrim && shots.length > n) {
        this.shotCount = Math.min(12, shots.length);
      }
      shots = shots.map((s, i) => ({
        ...s,
        index: i,
        duration: s.duration || this.durationPerShot,
        storyboardPrompt: s.storyboardPrompt?.trim() ? s.storyboardPrompt : prompt,
      }));
      this.project.shots = this.normalizeShotIndices(shots);
      if (shots[0]?.id && !this.activeShotId) this.selectShotTab(shots[0].id);
      else if (shots[0]?.id && !shots.some((s) => s.id === this.activeShotId)) {
        this.selectShotTab(shots[0].id);
      }
      this.syncBoardCharKeysToShots();
      if (!opts.skipSnapshot) {
        this.snapshotModeCache("board");
        this.persist();
      }
      return this.project.shots;
    },
    onCommonShotCountChanging(e) {
      const n = Number(e?.detail?.value);
      if (Number.isFinite(n)) this.shotCount = n;
    },
    onCommonShotCount(v) {
      if (this.studioMode === "board") {
        this.onBoardShotCount(v);
        return;
      }
      this.shotCount = Math.max(1, Math.min(12, Number(v) || 4));
      this.persist();
    },
    onBoardShotCountChanging(e) {
      // 仅更新展示，松手后再裁剪，避免拖动过程中反复截断
      const n = Number(e?.detail?.value);
      if (Number.isFinite(n)) this.shotCount = n;
    },
    onBoardShotCount(v) {
      const next = Math.max(1, Math.min(12, Number(v) || 2));
      const cur = this.project?.shots?.length || 0;
      if (cur > next) {
        uni.showModal({
          title: "减少镜数",
          content: `将删除镜${next + 1}～镜${cur}（含画面与视频），是否继续？`,
          success: (res) => {
            if (!res.confirm) {
              this.shotCount = cur;
              return;
            }
            this.shotCount = next;
            this.ensureBoardShots({ allowTrim: true });
          },
        });
        return;
      }
      this.shotCount = next;
      this.ensureBoardShots({ allowTrim: true });
    },
    onBoardPremiseBlur() {
      this.onPremiseBlur();
      if (this.studioMode === "board") {
        this.ensureBoardShots();
        // 把分镜词同步到尚无文案的镜头
        const prompt = String(this.premise || "").trim();
        if (prompt && this.project?.shots?.length) {
          this.project.shots = this.project.shots.map((s) =>
            s.storyboardPrompt?.trim()
              ? s
              : { ...s, storyboardPrompt: prompt },
          );
          this.persist();
        }
      }
    },
    syncBoardCharKeysToShots() {
      if (!this.project?.shots?.length || !Array.isArray(this.boardCharKeys)) return;
      const keys = [...this.boardCharKeys];
      this.project.shots = this.project.shots.map((s) => ({
        ...s,
        videoCharacterKeys: keys,
      }));
    },
    selectBoardChars(mode) {
      this.ensureBoardShots();
      const shot = this.boardFocusShot || this.boardShot;
      if (!shot) return;
      this.selectShotChars(shot, mode);
      this.boardCharKeys = this.selectedKeys(shot);
      this.syncBoardCharKeysToShots();
      this.persist();
    },
    toggleBoardChar(c) {
      this.ensureBoardShots();
      const shot = this.boardFocusShot || this.boardShot;
      if (!shot) return;
      this.toggleChar(shot, c);
      this.boardCharKeys = this.selectedKeys(
        this.project.shots.find((s) => s.id === shot.id) || shot,
      );
      this.syncBoardCharKeysToShots();
      this.persist();
    },
    async boardGenerateVideo(variant) {
      this.ensureBoardShots();
      const prompt = String(this.premise || "").trim();
      if (!prompt) {
        this.error = "请先填写分镜词";
        return;
      }
      // 同步分镜词到各镜（一次请求里用多镜约束，不按镜循环）
      this.project.shots = this.project.shots.map((s) => ({
        ...s,
        storyboardPrompt: prompt,
        duration: this.durationPerShot,
        videoCharacterKeys: Array.isArray(this.boardCharKeys)
          ? [...this.boardCharKeys]
          : s.videoCharacterKeys,
      }));
      await this.persist();
      // 模型以公共参数 Seedance 为准；可传入覆盖
      if (variant === "mini" || variant === "fast") this.variant = variant;
      const primary = this.boardShot;
      if (!primary) {
        this.error = "请先设置镜数";
        return;
      }
      // 已分镜多镜也只打一次 /api/video（boardMultiShot + totalShotCount）
      await this.generateShotVideo(primary, this.variant);
    },
    boardResetVideos() {
      if (!this.project?.shots?.length) return;
      this.project.shots = this.project.shots.map((s) => ({
        ...s,
        videoUrl: "",
        status: "pending",
        error: "",
      }));
      this.persist();
    },
    /** 旧数据可能 index 从 1 起；统一成与 PC 相同的 0 起 */
    normalizeShotIndices(shots) {
      if (!Array.isArray(shots) || !shots.length) return shots || [];
      return shots.map((s, i) => ({ ...s, index: i }));
    },
    /**
     * 修好「流式分片被 \n 拼开」的文本：收成正常段落，按气泡宽度换行。
     */
    normalizeChatText(text) {
      let s = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\u200b/g, "");
      const lines = s.split("\n");
      const nonempty = lines.filter((l) => l.trim().length);
      if (nonempty.length >= 3) {
        const avg =
          nonempty.reduce((n, l) => n + l.trim().length, 0) / nonempty.length;
        const shortRatio =
          nonempty.filter((l) => l.trim().length <= 2).length / nonempty.length;
        // 流式分片被换行拼开：平均行很短 → 收成连续段落
        if (avg <= 4 || shortRatio > 0.5) {
          s = nonempty.map((l) => l.trim()).join("");
        }
      }
      return s
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    },
    displayChatText(text) {
      return this.normalizeChatText(text);
    },
    repairShotVideoChats(shots) {
      if (!Array.isArray(shots) || !shots.length) {
        return { shots: shots || [], changed: false };
      }
      let changed = false;
      const next = shots.map((shot) => {
        const msgs = shot.videoChat?.messages;
        if (!msgs?.length) return shot;
        let shotChanged = false;
        const messages = msgs.map((m) => {
          const text = this.normalizeChatText(m.text);
          if (text !== String(m.text || "")) {
            shotChanged = true;
            return { ...m, text };
          }
          return m;
        });
        if (!shotChanged) return shot;
        changed = true;
        return {
          ...shot,
          videoChat: { ...shot.videoChat, messages },
        };
      });
      return { shots: next, changed };
    },
    /** 把分镜里已存的竖排对话一并纠正（含未分镜/已分镜双缓存） */
    repairVideoChatTexts(project) {
      if (!project) return { project, changed: false };
      let changed = false;
      const top = this.repairShotVideoChats(project.shots || []);
      if (top.changed) changed = true;
      let studioCaches = project.studioCaches;
      if (studioCaches) {
        const nextCaches = { ...studioCaches };
        for (const key of ["raw", "board"]) {
          const entry = studioCaches[key];
          if (!entry?.shots?.length) continue;
          const fixed = this.repairShotVideoChats(entry.shots);
          if (fixed.changed) {
            changed = true;
            nextCaches[key] = { ...entry, shots: fixed.shots };
          }
        }
        studioCaches = nextCaches;
      }
      return {
        project: changed
          ? { ...project, shots: top.shots, studioCaches }
          : project,
        changed,
      };
    },
    scrollChatToEnd() {
      this.chatScrollInto = "";
      this.$nextTick(() => {
        this.chatScrollInto = "vchat-end";
      });
    },
    isChatTall(m) {
      return String(m?.text || "").length > 160;
    },
    toggleChatExpand(id) {
      this.chatExpanded = {
        ...this.chatExpanded,
        [id]: !this.chatExpanded[id],
      };
    },
    onChatBubbleClick(m) {
      if (m?.role === "user" && this.isChatTall(m)) this.toggleChatExpand(m.id);
    },
    async quickReply(shot, text) {
      this.chatDraft = text;
      await this.replyVideoChat(shot);
    },
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
    /** 保证有项目对象；默认标题「仙帝重生」 */
    ensureProject() {
      if (this.project) return this.project;
      const now = new Date().toISOString();
      const mode = this.studioMode === "board" ? "board" : "raw";
      this.project = {
        id: uid("proj"),
        title: DEFAULT_PROJECT_TITLE,
        premise: this.premise,
        style: this.stylePrompt,
        aspectRatio: this.aspectRatio,
        durationPerShot: this.durationPerShot,
        characters: [],
        shots: [],
        studioMode: mode,
        studioCaches: {
          raw: this.blankModeCache("raw"),
          board: this.blankModeCache("board"),
        },
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
    onProjectTitle(v) {
      if (!this.project) return;
      this.project.title = String(v || "").trim() || DEFAULT_PROJECT_TITLE;
      this.persist();
    },
    onPremiseBlur() {
      if (!this.project) return;
      this.ensureProject();
      this.persist();
    },
    async persist() {
      if (!this.project) return;
      // 故事/风格/画幅等表单写回当前模式缓存 + 项目镜像字段
      this.project.premise = this.premise;
      this.project.style = this.stylePrompt;
      this.project.aspectRatio = this.aspectRatio;
      this.project.durationPerShot = this.durationPerShot;
      this.project.studioMode = this.studioMode === "board" ? "board" : "raw";
      this.snapshotModeCache(this.studioMode);
      this.project.updatedAt = new Date().toISOString();
      try {
        await saveProjectAsync(this.project);
      } catch (e) {
        this.error = toastErr(e, "本地存储失败");
      }
    },
    /** 回写「项目×账号」对话窗；账号字段仅作最近一次镜像 */
    rememberProjectConversation(conversationId) {
      const id = String(conversationId || "").trim();
      if (!id || id === "0" || id.startsWith("static-") || !this.project) return;
      const accountId = resolveActiveAccountId(this.settings);
      this.project = {
        ...withProjectConversationId(this.project, id, accountId),
        updatedAt: new Date().toISOString(),
      };
      this.settings = persistAccountConversationId(this.settings, id);
      void saveProjectAsync(this.project).catch(() => {});
    },
    patchShot(id, patch) {
      if (!this.project) return Promise.resolve();
      this.project.shots = this.project.shots.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.lines) next.dialogue = flattenDialogue(patch.lines);
        return next;
      });
      return this.persist();
    },
    patchChar(index, patch) {
      const list = this.project.characters.slice();
      list[index] = { ...list[index], ...patch };
      this.project.characters = list;
      return this.persist();
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
    onDurationDefault(v) {
      this.durationPerShot = Number(v) || 15;
      if (this.project) this.persist();
    },
    onStylePick(id) {
      this.styleId = id;
      if (this.project) this.persist();
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
    clearFrameById(shotId, key) {
      this.patchShot(shotId, { [key]: "" });
    },
    async generateBoardFramePack() {
      this.ensureBoardShots();
      const first = this.boardShot;
      const last = this.boardLastShot;
      if (!first || !last) return;
      await this.generateSceneImage(first);
      const freshFirst = this.project.shots.find((s) => s.id === first.id) || first;
      await this.generateShotImage(freshFirst);
      const freshLast = this.project.shots.find((s) => s.id === last.id) || last;
      await this.generateLastFrame(freshLast);
    },
    async grabBoardLastShotTailAsLastFrame() {
      this.ensureBoardShots();
      const last = this.boardLastShot;
      if (!last?.videoUrl) {
        this.error = "末镜尚无视频";
        return;
      }
      this.selectShotTab(last.id);
      this.frameBusy = true;
      this.error = "";
      try {
        let playable = last.videoUrl;
        const isHttp = /^https?:\/\//i.test(playable);
        const isLocalTmp = /\/(?:api\/)?tmp-media\//i.test(playable);
        if (isHttp && !isLocalTmp) {
          const data = await apiRequest(UPSTREAM_PATHS.frameFromVideo, { videoUrl: playable });
          playable = this.mediaSrc(data.url || data.playUrl || "");
        } else {
          playable = this.mediaSrc(playable);
        }
        if (!playable) throw new Error("无法解析可播放的视频地址");
        const dataUrl = await extractLastFrameFromVideo(playable);
        this.patchShot(last.id, { lastFrameUrl: dataUrl, status: "pending", error: "" });
      } catch (e) {
        this.error = toastErr(e, "截取末镜末帧失败");
      } finally {
        this.frameBusy = false;
      }
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
        content: "本机这份漫剧会被删除，并重新绑定默认项目「仙帝重生」。",
        success: async (res) => {
          if (!res.confirm) return;
          deleteProject(this.project.id);
          this.project = null;
          this.activeShotId = "";
          this.error = "";
          try {
            const next = await ensureDefaultProjectBound(DEFAULT_PROJECT_TITLE);
            if (next) {
              this.project = this.migrateStudioCaches({
                ...next,
                shots: this.normalizeShotIndices(next.shots || []),
              });
              this.studioMode = "raw";
              this.applyModeCache("raw");
            }
          } catch {
            this.ensureProject();
          }
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
      // 与 PC 一致：已定义（含显式空数组「清空勾选」）用勾选；未定义才自动捕捉
      if (shot.videoCharacterKeys !== undefined) return shot.videoCharacterKeys;
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
        // 强制按数组序 0 起编号（旧代理曾用 1 起，会导致「镜2」起显示）
        const shots = (data.shots || []).map((s, index) => ({
          ...s,
          id: s.id || uid("shot"),
          index,
          status: s.status || "pending",
          videoCharacterKeys: matchShotCharacters(s, characters).map(characterKey),
        }));
        const now = new Date().toISOString();
        // 生成分镜只写入未分镜；保留已分镜独立缓存
        this.studioMode = "raw";
        this.shotCount = Math.min(12, Math.max(1, shots.length || this.shotCount || 4));
        const boardKeep = this.project.studioCaches?.board
          ? this.makeModeCache("board", this.project.studioCaches.board)
          : this.blankModeCache("board");
        this.project = {
          ...this.project,
          id: this.project?.id || uid("proj"),
          title: data.title || this.project.title || DEFAULT_PROJECT_TITLE,
          premise: this.premise,
          style: this.stylePrompt,
          aspectRatio: this.aspectRatio,
          durationPerShot: this.durationPerShot,
          characters,
          shots: this.cloneShots(shots),
          studioMode: "raw",
          studioCaches: {
            raw: this.makeModeCache("raw", {
              premise: this.premise,
              shotCount: this.shotCount,
              durationPerShot: this.durationPerShot,
              shots,
              activeShotId: shots[0]?.id || "",
            }),
            board: boardKeep,
          },
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
      // 与 PC 一致：已定义用勾选（含 []）；未定义才自动捕捉
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
        this.patchShot(shot.id, { status: "error", error: "请先勾选并上传角色参考图，或上传场景图/首帧" });
        return;
      }
      const acc = resolveSelectedAccount(this.settings);
      if (acc?.sessionId && !accountHasFullCookie(acc)) {
        this.error = "当前账号只有 session。建议到设置粘贴浏览器整段 Cookie 后再出片，成功率更高。";
      }
      const conversationId = resolveProjectConversationId(this.project, this.settings);
      const totalShots = Math.max(
        1,
        this.project.shots?.length || Number(this.shotCount) || 1,
      );
      const boardMulti = this.studioMode === "board" && totalShots > 1;
      this.busyShotId = shot.id;
      this.selectShotTab(shot.id);
      // 已分镜多镜：各镜 tab 同步「处理中」，但仍只发一次请求
      if (boardMulti) {
        this.project.shots = this.project.shots.map((s) => ({
          ...s,
          status: "animating",
          error: "",
          videoCharacterKeys: selectedKeys,
        }));
        this.persist();
      } else {
        this.patchShot(shot.id, {
          status: "animating",
          error: "",
          videoCharacterKeys: selectedKeys,
        });
      }
      try {
        // 必须落实成 data:；jingxu-media /tmp-media 代理端读不到或会丢
        const persistUrl = async (u, label) => {
          if (!u) return "";
          if (String(u).startsWith("data:") && /;base64,/i.test(u) && u.length > 64) return u;
          const got = await toPersistentMediaUrl(u);
          if (got && String(got).startsWith("data:") && got.length > 64) return got;
          if (got && /^https?:\/\//i.test(got)) return got;
          throw new Error(
            `${label || "参考图"}无法读取，请重新生成该图后再出片`,
          );
        };
        // 已分镜多镜一次请求：首帧取首镜，末帧取末镜
        const lastShot =
          boardMulti && this.boardLastShot && this.boardLastShot.id !== shot.id
            ? this.boardLastShot
            : shot;
        const frameUrl = imageUrl ? await persistUrl(imageUrl, "首帧") : "";
        const sceneUrl = shot.sceneImageUrl
          ? await persistUrl(shot.sceneImageUrl, "场景图")
          : "";
        const lastSrc = lastShot.lastFrameUrl || shot.lastFrameUrl;
        const lastUrl = lastSrc
          ? await persistUrl(lastSrc, boardMulti ? "末镜末帧" : "末帧")
          : "";
        const characters = await Promise.all(
          this.project.characters.map(async (c) => {
            const needImg = selectedKeys.includes(characterKey(c));
            const base = {
              id: c.id,
              name: c.name,
              appearance: c.appearance,
              locked: c.locked,
            };
            if (!needImg || !(c.threeViewUrl || c.referenceImageUrl)) return base;
            const three = c.threeViewUrl
              ? await persistUrl(c.threeViewUrl, `角色「${c.name || ""}」三视图`)
              : "";
            const ref = c.referenceImageUrl
              ? await persistUrl(c.referenceImageUrl, `角色「${c.name || ""}」参考图`)
              : "";
            return {
              ...base,
              threeViewUrl: three || undefined,
              referenceImageUrl: ref || three || undefined,
            };
          }),
        );
        const attached = characters.filter((c) => c.threeViewUrl || c.referenceImageUrl).length;
        if (!frameUrl && !sceneUrl && !lastUrl && !attached) {
          throw new Error("出片参数中没有可用图片，请先生成首帧或角色三视图");
        }
        const data = await apiRequest(UPSTREAM_PATHS.video, {
          prompt,
          imageUrl: frameUrl || undefined,
          lastFrameUrl: lastUrl || undefined,
          sceneImageUrl: sceneUrl || undefined,
          duration: resolveShotDuration(shot, this.project.durationPerShot),
          aspectRatio: this.project.aspectRatio,
          index: shot.index,
          characters,
          selectedCharacterKeys: selectedKeys,
          conversationId,
          boardMultiShot: boardMulti,
          totalShotCount: boardMulti ? totalShots : 1,
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
          this.rememberProjectConversation(String(data.conversationId));
        }
        saveSettings(this.settings);
        const now = new Date().toISOString();
        const messages = [];
        if (data.chatText) {
          messages.push({
            id: uid("vchat"),
            role: "user",
            text: boardMulti
              ? `生成视频（${totalShots}镜一次）：${prompt.slice(0, 400)}`
              : `生成视频：${prompt.slice(0, 400)}`,
            at: now,
          });
          messages.push({
            id: uid("vchat"),
            role: "assistant",
            text: this.normalizeChatText(data.chatText),
            at: now,
          });
        }
        const videoChat = {
          conversationId: data.conversationId || conversationId,
          matchedCharacterNames: data.matchedCharacters || involved.map((c) => c.name),
          messages: messages.length ? messages : shot.videoChat?.messages || [],
        };
        if (data.videoUrl) {
          // 成片挂在首镜；其余镜只同步状态（同一段多镜视频）
          this.project.shots = this.project.shots.map((s) => {
            if (s.id === shot.id) {
              return {
                ...s,
                videoUrl: data.videoUrl,
                status: "ready",
                error: "",
                usedAccountLabel: data.accountLabel,
                usedModel: data.model,
                triedChannels: data.tried,
                ...(imageUrl ? { imageUrl } : {}),
                videoChat,
              };
            }
            if (!boardMulti) return s;
            return {
              ...s,
              status: "ready",
              error: "",
              usedAccountLabel: data.accountLabel,
              usedModel: data.model,
            };
          });
          if (!this.project.coverUrl) this.project.coverUrl = imageUrl || shot.imageUrl;
          this.modeHint = boardMulti
            ? `${data.mode || ""} · ${totalShots}镜一次请求`.trim()
            : data.mode || "";
          this.persist();
        } else {
          const errText = data.error || "未生成视频，可在下方继续回复";
          this.project.shots = this.project.shots.map((s) => {
            if (s.id === shot.id) {
              return {
                ...s,
                status: "error",
                error: errText,
                usedAccountLabel: data.accountLabel,
                usedModel: data.model,
                videoChat,
              };
            }
            if (!boardMulti) return s;
            return { ...s, status: "error", error: errText };
          });
          this.persist();
        }
        this.scrollChatToEnd();
      } catch (e) {
        const msg = e?.message || "出片失败";
        if (boardMulti) {
          this.project.shots = this.project.shots.map((s) => ({
            ...s,
            status: "error",
            error: msg,
          }));
          this.persist();
        } else {
          this.patchShot(shot.id, { status: "error", error: msg });
        }
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
    doubaoChatSubtitle(shot) {
      const names = shot?.videoChat?.matchedCharacterNames || [];
      const conv =
        resolveProjectConversationId(this.project, this.settings) ||
        shot?.videoChat?.conversationId ||
        "";
      const sync = conv
        ? `已同步豆包 · …${String(conv).slice(-6)}`
        : "未绑定豆包对话（请先出片）";
      if (names.length) return `${sync} · ${names.join("、")}`;
      return sync;
    },
    async replyVideoChat(shot) {
      const text = (this.chatDraft || "").trim();
      if (!text) return;
      const conversationId =
        resolveProjectConversationId(this.project, this.settings) ||
        shot.videoChat?.conversationId ||
        "";
      if (!conversationId || conversationId === "0") {
        this.error =
          "尚未绑定豆包对话窗。请先生成一次视频，之后的问答才会同步到同一豆包对话。";
        return;
      }
      this.chatReplyBusy = true;
      this.chatDraft = "";
      const userMsg = { id: uid("vchat"), role: "user", text, at: new Date().toISOString() };
      this.patchShot(shot.id, {
        videoChat: {
          ...(shot.videoChat || {}),
          conversationId,
          messages: [...(shot.videoChat?.messages || []), userMsg],
        },
      });
      this.scrollChatToEnd();
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
          this.rememberProjectConversation(String(data.conversationId));
        }
        saveSettings(this.settings);
        const current = this.project.shots.find((s) => s.id === shot.id);
        const messages = [...(current?.videoChat?.messages || [])];
        if (data.chatText || data.reply || data.text) {
          messages.push({
            id: uid("vchat"),
            role: "assistant",
            text: this.normalizeChatText(data.chatText || data.reply || data.text),
            at: new Date().toISOString(),
          });
        }
        this.patchShot(shot.id, {
          ...(data.videoUrl ? { videoUrl: data.videoUrl, status: "ready", error: "" } : {}),
          videoChat: { ...(current?.videoChat || {}), conversationId: data.conversationId || conversationId, messages },
        });
        this.scrollChatToEnd();
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
        await this.persist();
        this.error = `角色包已缓存：更新 ${replaced} · 新增 ${added} · 保留本机 ${kept}（共 ${characters.length}）。刷新后仍在。`;
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
          playable = this.mediaSrc(data.url || data.playUrl || "");
        } else {
          playable = this.mediaSrc(playable);
        }
        if (!playable) throw new Error("无法解析可播放的视频地址");
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
.common-params,
.common-chars { margin-top: 16rpx; }
.common-params-hd {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}
.common-params-titles { flex: 1; min-width: 0; }
.common-params-summary {
  display: block;
  margin-top: 8rpx;
  color: #5c6b6e;
  font-size: 22rpx;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.common-params-caret {
  flex-shrink: 0;
  margin-top: 6rpx;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: #eef4f5;
  color: #1f6f78;
  font-size: 22rpx;
  font-weight: 600;
}
.common-params-body { margin-top: 8rpx; }
.hint.tight-top { margin-top: 0; }
.mode-tabs {
  display: flex;
  gap: 12rpx;
  margin: 16rpx 28rpx 8rpx;
  padding: 8rpx;
  background: #e4ecee;
  border-radius: 18rpx;
}
.mode-tab {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  border-radius: 14rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #5c6b6e;
  background: transparent;
}
.mode-tab.on {
  background: #122022;
  color: #eef4f5;
}
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
.title-edit { gap: 16rpx; }
.project-title {
  flex: 1;
  margin-top: 0;
  font-size: 34rpx;
  font-weight: 600;
  height: 72rpx;
  line-height: 72rpx;
}
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

/* —— 豆包对话框：顶栏 + 可滚消息 + 底栏固定，互不遮挡 —— */
.doubao-chat {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  height: 720rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: #f3f4f6;
  border: 1px solid rgba(18, 32, 34, 0.08);
  position: relative;
  isolation: isolate;
}
.doubao-chat-hd {
  flex: 0 0 auto;
  z-index: 2;
  padding: 18rpx 22rpx;
  background: #fff;
  border-bottom: 1px solid rgba(18, 32, 34, 0.06);
}
.doubao-chat-brand {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.doubao-logo {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 26rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.doubao-chat-titles {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  min-width: 0;
  flex: 1;
}
.doubao-chat-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1a1a1a;
}
.doubao-chat-sub {
  font-size: 22rpx;
  color: #8b949e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doubao-chat-list {
  flex: 1 1 auto;
  height: 0;
  min-height: 0;
  width: 100%;
  padding: 16rpx 16rpx 12rpx;
  box-sizing: border-box;
  overflow: hidden;
}
.doubao-empty {
  padding: 48rpx 28rpx;
  text-align: center;
  color: #8b949e;
  font-size: 24rpx;
  line-height: 1.65;
}
.doubao-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 20rpx;
  width: 100%;
  box-sizing: border-box;
}
.doubao-row.user {
  flex-direction: row-reverse;
}
.doubao-avatar {
  flex-shrink: 0;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.doubao-bubble {
  width: 82%;
  max-width: 82%;
  min-width: 0;
  flex: 0 1 auto;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  box-sizing: border-box;
  overflow: hidden;
}
.doubao-bubble.assistant {
  background: #fff;
  border-top-left-radius: 4rpx;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.doubao-bubble.user {
  width: auto;
  max-width: 82%;
  background: #dceeff;
  border-top-right-radius: 4rpx;
}
.doubao-bubble.tall .doubao-bubble-body {
  max-height: 220rpx;
  overflow: hidden;
  mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
}
.doubao-bubble-body {
  width: 100%;
  max-width: 100%;
}
.doubao-expand {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #2563eb;
  font-weight: 600;
}
.doubao-name {
  display: block;
  margin-bottom: 6rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: #8b949e;
}
.doubao-text {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: normal;
  overflow-wrap: break-word;
  line-break: auto;
  font-size: 28rpx;
  line-height: 1.65;
  color: #1a1a1a;
  /* H5：避免 flex 子项被压成一字宽 */
  min-width: 0;
}
.doubao-typing {
  font-size: 26rpx;
  color: #8b949e;
}
.doubao-list-end {
  height: 4rpx;
}
.doubao-composer {
  flex: 0 0 auto;
  z-index: 3;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 12rpx 16rpx calc(12rpx + env(safe-area-inset-bottom, 0px));
  background: #fff;
  border-top: 1px solid rgba(18, 32, 34, 0.08);
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.03);
}
.doubao-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.doubao-chip {
  margin: 0;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 22rpx;
  border: none;
  border-radius: 999rpx;
  background: rgba(42, 154, 164, 0.14);
  color: #1f6f78;
  font-size: 24rpx;
  font-weight: 600;
}
.doubao-chip.ghost {
  background: #eef1f3;
  color: #5c6b6e;
}
.doubao-chip[disabled] {
  opacity: 0.45;
}
.doubao-chip::after {
  border: none;
}
.doubao-composer-row {
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
}
.doubao-input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 80rpx;
  min-height: 80rpx;
  max-height: 80rpx;
  padding: 18rpx 22rpx;
  box-sizing: border-box;
  border: none;
  border-radius: 16rpx;
  background: #f0f1f3;
  color: #1a1a1a;
  font-size: 28rpx;
  line-height: 1.45;
  overflow-y: auto;
}
.doubao-input :deep(.uni-textarea-wrapper),
.doubao-input :deep(.uni-textarea-textarea),
.doubao-input :deep(textarea) {
  width: 100% !important;
  height: 44rpx !important;
  min-height: 44rpx !important;
  max-height: 44rpx !important;
  background: transparent !important;
  color: #1a1a1a !important;
  font-size: 28rpx !important;
  line-height: 1.45 !important;
  overflow-y: auto !important;
}
.doubao-send {
  flex: 0 0 auto;
  margin: 0;
  width: 128rpx;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0;
  border: none;
  border-radius: 16rpx;
  background: #2a9aa4;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}
.doubao-send[disabled] {
  opacity: 0.4;
}
.doubao-send::after {
  border: none;
}
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
