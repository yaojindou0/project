/* global PDF24_TOOLS, PDF24_CATEGORIES, PdfOps */
(function () {
  "use strict";

  const LS_RECENT = "pdf24clone_recent";

  const state = {
    tool: null,
    files: [],
    pageOrder: [],
    selectedPages: new Set(),
    cameraStream: null,
    signDrawing: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
    } catch {
      return [];
    }
  }

  function pushRecent(id) {
    const list = getRecent().filter((x) => x !== id);
    list.unshift(id);
    localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 12)));
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  function toolsForCategory(catId) {
    return PDF24_TOOLS.filter((t) => t.cat === catId);
  }

  function renderSidebar(active) {
    const nav = $("#side-nav");
    nav.innerHTML = "";
    const h = document.createElement("h3");
    h.textContent = "分类";
    nav.appendChild(h);
    PDF24_CATEGORIES.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "nav-item" + (active === c.id ? " active" : "");
      btn.textContent = c.name;
      btn.addEventListener("click", () => {
        showCatalog();
        $("#search").value = "";
        renderCatalog(c.id);
        renderSidebar(c.id);
        document.getElementById("sec-" + c.id)?.scrollIntoView({ behavior: "smooth" });
      });
      nav.appendChild(btn);
    });

    const div = document.createElement("div");
    div.className = "nav-divider";
    div.textContent = "财务";
    nav.appendChild(div);
    const fin = document.createElement("button");
    fin.className = "nav-item" + (active === "finance" ? " active" : "");
    fin.textContent = "财务工具";
    fin.addEventListener("click", () => {
      showFinance();
      renderSidebar("finance");
    });
    nav.appendChild(fin);
  }

  function showFinance() {
    stopCamera();
    $("#view-catalog")?.classList.add("hidden");
    $("#view-tool")?.classList.remove("active");
    $("#view-tool")?.classList.add("hidden");
    if (window.FinanceApp) FinanceApp.show();
  }

  function showCatalog() {
    stopCamera();
    if (window.FinanceApp) FinanceApp.hide();
    $("#view-finance")?.classList.add("hidden");
    $("#view-catalog").classList.remove("hidden");
    $("#view-tool").classList.remove("active");
    $("#view-tool").classList.add("hidden");
    history.replaceState(null, "", "#");
  }

  function makeToolCard(tool) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "tool-card";
    card.innerHTML = `
      <div class="icon">${tool.icon}</div>
      <div class="name">${tool.name}</div>
      <div class="desc">${tool.desc}</div>
    `;
    card.addEventListener("click", () => openTool(tool.id));
    return card;
  }

  function renderCatalog(scrollCat, query) {
    const root = $("#catalog-sections");
    const q = (query ?? $("#search").value ?? "").trim().toLowerCase();
    root.innerHTML = "";

    if (q) {
      const matched = PDF24_TOOLS.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          t.id.includes(q)
      );
      const sec = document.createElement("section");
      sec.className = "section";
      sec.innerHTML = `<div class="section-head"><h2>搜索结果</h2><span>${matched.length} 个工具</span></div>`;
      const grid = document.createElement("div");
      grid.className = "tool-grid";
      if (!matched.length) {
        sec.innerHTML += `<div class="empty-hint">未找到符合您搜索的工具。请尝试其他关键词。</div>`;
      } else {
        matched.forEach((t) => grid.appendChild(makeToolCard(t)));
        sec.appendChild(grid);
      }
      root.appendChild(sec);
      return;
    }

    PDF24_CATEGORIES.forEach((c) => appendCategorySection(root, c));
    if (scrollCat) {
      requestAnimationFrame(() => {
        document.getElementById("sec-" + scrollCat)?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }

  function appendCategorySection(root, c) {
    const tools = toolsForCategory(c.id);
    const sec = document.createElement("section");
    sec.className = "section";
    sec.id = "sec-" + c.id;
    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = `<h2>${c.name}</h2><span>${tools.length} 个</span>`;
    sec.appendChild(head);
    if (!tools.length) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "暂无工具";
      sec.appendChild(hint);
    } else {
      const grid = document.createElement("div");
      grid.className = "tool-grid";
      tools.forEach((t) => grid.appendChild(makeToolCard(t)));
      sec.appendChild(grid);
    }
    root.appendChild(sec);
  }

  function openTool(id) {
    const tool = PDF24_TOOLS.find((t) => t.id === id);
    if (!tool) return;
    pushRecent(id);
    state.tool = tool;
    state.files = [];
    state.pageOrder = [];
    state.selectedPages = new Set();
    stopCamera();
    if (window.FinanceApp) FinanceApp.hide();
    $("#view-finance")?.classList.add("hidden");
    $("#view-catalog").classList.add("hidden");
    $("#view-tool").classList.remove("hidden");
    $("#view-tool").classList.add("active");
    history.replaceState(null, "", "#" + id);
    renderToolWorkspace(tool);
  }

  function defaultAccept(tool) {
    if (tool.accept) return tool.accept;
    if (tool.kind === "images") return "image/*";
    if (tool.kind === "multi" || tool.kind === "single") return "application/pdf,.pdf";
    return "*/*";
  }

  function renderToolWorkspace(tool) {
    $("#tool-title").textContent = tool.name;
    $("#tool-desc").textContent = tool.desc;
    const options = $("#tool-options");
    const uploadBlock = $("#upload-block");
    const preview = $("#preview-area");
    preview.innerHTML = "";
    preview.classList.add("hidden");
    $("#file-list").innerHTML = "";
    setStatus("");

    const multiple = tool.kind === "multi" || tool.kind === "images" || tool.impl === "compare";
    $("#file-input").multiple = multiple || tool.kind === "images";
    $("#file-input").accept = defaultAccept(tool);

    const noUpload = [
      "create-text",
      "create-form",
      "job-app",
      "invoice",
      "qrcode",
      "gen-password",
      "md-to-pdf",
      "camera",
    ].includes(tool.impl);

    uploadBlock.classList.toggle("hidden", noUpload && tool.impl !== "camera");
    if (tool.impl === "camera") {
      uploadBlock.classList.add("hidden");
    }

    options.innerHTML = buildOptionsHtml(tool);
    bindOptionExtras(tool);

    $("#btn-run").onclick = () => runTool().catch((e) => setStatus(e.message || String(e), "error"));
    $("#btn-clear").onclick = () => {
      state.files = [];
      $("#file-list").innerHTML = "";
      preview.innerHTML = "";
      preview.classList.add("hidden");
      setStatus("");
    };
  }

  function buildOptionsHtml(tool) {
    const impl = tool.impl;
    const map = {
      merge: `<p class="chip">按添加顺序合并</p>`,
      split: `
        <div class="field"><label>拆分方式</label>
          <select id="opt-split-mode">
            <option value="each">每页一个文件</option>
            <option value="every">按固定页数</option>
            <option value="ranges">按自定义范围（用 ; 分隔多段）</option>
          </select>
        </div>
        <div class="field"><label>每 N 页 / 范围</label><input id="opt-split-arg" placeholder="例如 2 或 1-3;4-6" value="1"></div>`,
      "extract-pages": `<div class="field"><label>页码范围</label><input id="opt-pages" placeholder="如 1,3,5-8" value="1"></div>`,
      "delete-pages": `<div class="field"><label>要删除的页码</label><input id="opt-pages" placeholder="如 2,4-5"></div>`,
      rotate: `
        <div class="field"><label>旋转角度</label>
          <select id="opt-angle"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>
        </div>
        <div class="field"><label>页码（空=全部）</label><input id="opt-pages" placeholder="留空表示全部"></div>`,
      reorder: `<p>上传后可在预览区拖拽缩略图调整顺序，再点击开始处理。</p>`,
      watermark: `
        <div class="field"><label>水印文字</label><input id="opt-wm" value="机密"></div>
        <div class="field"><label>字号</label><input id="opt-wm-size" type="number" value="48"></div>
        <div class="field"><label>透明度 0-1</label><input id="opt-wm-op" type="number" step="0.05" value="0.25"></div>`,
      "page-numbers": `<div class="field"><label>格式</label><input id="opt-pn" value="n / N"></div>`,
      compress: `<div class="field"><label>压缩强度</label>
        <select id="opt-quality"><option value="0.85">轻度</option><option value="0.65" selected>中等</option><option value="0.45">强力</option></select></div>`,
      "doc-info": `
        <div class="field"><label>标题</label><input id="opt-title"></div>
        <div class="field"><label>作者</label><input id="opt-author"></div>
        <div class="field"><label>主题</label><input id="opt-subject"></div>
        <div class="field"><label>关键词</label><input id="opt-keywords"></div>`,
      overlay: `<div class="field"><label>叠加透明度</label><input id="opt-opacity" type="number" step="0.1" min="0" max="1" value="0.5"></div>
        <p class="chip">请选择 2 个 PDF：第 1 个为底层，第 2 个为叠加层</p>`,
      crop: `
        <div class="field"><label>上</label><input id="opt-top" type="number" value="20"></div>
        <div class="field"><label>下</label><input id="opt-bottom" type="number" value="20"></div>
        <div class="field"><label>左</label><input id="opt-left" type="number" value="20"></div>
        <div class="field"><label>右</label><input id="opt-right" type="number" value="20"></div>`,
      "page-size": `<div class="field"><label>目标尺寸</label>
        <select id="opt-size"><option>A4</option><option>Letter</option><option>A3</option><option>Legal</option></select></div>`,
      "n-up": `
        <div class="field"><label>列</label><input id="opt-cols" type="number" value="2" min="1" max="4"></div>
        <div class="field"><label>行</label><input id="opt-rows" type="number" value="2" min="1" max="4"></div>`,
      "split-half": `<div class="field"><label>方向</label>
        <select id="opt-half"><option value="vertical">左右对半</option><option value="horizontal">上下对半</option></select></div>`,
      "pdf-to-images": `<div class="field"><label>格式</label>
        <select id="opt-img-fmt"><option value="png">PNG</option><option value="jpeg">JPG</option></select></div>`,
      edit: `
        <div class="field"><label>文字</label><input id="opt-text" value="注释文字"></div>
        <div class="field"><label>页码</label><input id="opt-page" type="number" value="1"></div>
        <div class="field"><label>X</label><input id="opt-x" type="number" value="72"></div>
        <div class="field"><label>Y</label><input id="opt-y" type="number" value="700"></div>
        <div class="field"><label>字号</label><input id="opt-size" type="number" value="14"></div>`,
      redact: `
        <div class="field"><label>页码</label><input id="opt-page" type="number" value="1"></div>
        <div class="field"><label>X</label><input id="opt-x" type="number" value="50"></div>
        <div class="field"><label>Y</label><input id="opt-y" type="number" value="700"></div>
        <div class="field"><label>宽</label><input id="opt-w" type="number" value="150"></div>
        <div class="field"><label>高</label><input id="opt-h" type="number" value="24"></div>`,
      sign: `<p>在下方签名板书写，处理时将贴到第 1 页。</p>
        <canvas id="sign-pad" class="sign-pad" width="400" height="160"></canvas>
        <div class="actions"><button type="button" class="btn btn-ghost" id="btn-clear-sign">清除签名</button></div>
        <div class="field"><label>X</label><input id="opt-x" type="number" value="50"></div>
        <div class="field"><label>Y</label><input id="opt-y" type="number" value="80"></div>`,
      "create-text": `<div class="field"><label>标题</label><input id="opt-title" value="新建文档"></div>
        <div class="field"><label>正文</label><textarea id="opt-body" placeholder="输入文本内容…"></textarea></div>`,
      "md-to-pdf": `<div class="field"><label>Markdown</label><textarea id="opt-body" placeholder="# 标题&#10;正文…"></textarea></div>`,
      "create-form": `<div class="field"><label>表单标题</label><input id="opt-title" value="信息登记表"></div>
        <div class="field"><label>字段（逗号分隔）</label><input id="opt-fields" value="姓名,邮箱,电话,备注"></div>`,
      "job-app": `
        <div class="field"><label>姓名</label><input id="opt-name"></div>
        <div class="field"><label>电话</label><input id="opt-phone"></div>
        <div class="field"><label>邮箱</label><input id="opt-email"></div>
        <div class="field"><label>岗位</label><input id="opt-position"></div>
        <div class="field"><label>自我介绍</label><textarea id="opt-intro"></textarea></div>
        <div class="field"><label>工作经历</label><textarea id="opt-exp"></textarea></div>
        <div class="field"><label>教育背景</label><textarea id="opt-edu"></textarea></div>`,
      invoice: `
        <div class="field"><label>标题</label><input id="opt-title" value="发票"></div>
        <div class="field"><label>发票号</label><input id="opt-no" value="INV-001"></div>
        <div class="field"><label>收款方</label><input id="opt-seller"></div>
        <div class="field"><label>付款方</label><input id="opt-buyer"></div>
        <div class="field"><label>项目名称</label><input id="opt-item" value="咨询服务"></div>
        <div class="field"><label>金额</label><input id="opt-amount" value="1000.00"></div>
        <div class="field"><label>合计</label><input id="opt-total" value="1000.00"></div>`,
      qrcode: `<div class="field"><label>内容 / URL</label><input id="opt-qr" value="https://example.com"></div>`,
      "gen-password": `
        <div class="field"><label>长度</label><input id="opt-len" type="number" value="16"></div>
        <div class="field"><label><input type="checkbox" id="opt-syms"> 包含符号</label></div>
        <div class="field"><label>结果</label><input id="opt-result" readonly></div>`,
      camera: `
        <div class="camera-wrap"><video id="cam-video" autoplay playsinline></video></div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" id="btn-start-cam">开启摄像头</button>
          <button type="button" class="btn btn-primary" id="btn-snap">拍照加入</button>
        </div>
        <canvas id="cam-canvas" class="hidden"></canvas>
        <p class="chip">拍多张后点击「开始处理」生成 PDF</p>`,
      compare: `<p class="chip">请选择恰好 2 个 PDF 进行并排预览</p>`,
      viewer: `<p>上传后点击处理即可预览全部页面</p>`,
      "img-convert": `<p>上传图片后转换为目标格式并下载。</p>`,
      "office-to-pdf": `<p class="chip">支持 CSV / TXT 转 PDF</p>`,
      "docx-to-pdf": `
        <p class="chip">按 Word 原排版与嵌入字体渲染后导出 PDF（接近 PDF24 效果）</p>
        <div class="field"><label>清晰度</label>
          <select id="opt-docx-scale">
            <option value="2" selected>标准（推荐）</option>
            <option value="2.5">高清</option>
            <option value="3">超清（较慢）</option>
          </select>
        </div>`,
      "pdf-to-docx": `
        <div class="field"><label>转换模式</label>
          <select id="opt-docx-mode">
            <option value="exact" selected>精确还原（排版/字体不变，推荐）</option>
            <option value="text">可编辑文字（排版近似）</option>
          </select>
        </div>
        <div class="field"><label>清晰度（精确还原）</label>
          <select id="opt-pdf-scale">
            <option value="2">标准</option>
            <option value="2.5" selected>高清（推荐）</option>
            <option value="3">超清</option>
          </select>
        </div>
        <p class="chip">精确还原：整页高清嵌入 Word，纸张尺寸与 PDF 一致</p>`,
    };
    if (impl === "pdf-to-images" && tool.format) {
      return `<input type="hidden" id="opt-img-fmt" value="${tool.format}">`;
    }
    return map[impl] ?? `<p>上传文件后点击开始处理。处理在本地浏览器完成。</p>`;
  }

  function bindOptionExtras(tool) {
    if (tool.impl === "sign") {
      const canvas = $("#sign-pad");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      let drawing = false;
      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: ((src.clientX - r.left) / r.width) * canvas.width, y: ((src.clientY - r.top) / r.height) * canvas.height };
      };
      const start = (e) => {
        drawing = true;
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        e.preventDefault();
      };
      const move = (e) => {
        if (!drawing) return;
        const p = pos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        e.preventDefault();
      };
      const end = () => {
        drawing = false;
      };
      canvas.onmousedown = start;
      canvas.onmousemove = move;
      canvas.onmouseup = end;
      canvas.onmouseleave = end;
      canvas.ontouchstart = start;
      canvas.ontouchmove = move;
      canvas.ontouchend = end;
      $("#btn-clear-sign").onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (tool.impl === "camera") {
      $("#btn-start-cam").onclick = startCamera;
      $("#btn-snap").onclick = snapPhoto;
    }
    if (tool.impl === "gen-password") {
      // auto-generate on open
      setTimeout(() => {
        const pwd = PdfOps.genPassword(16, { syms: false });
        const el = $("#opt-result");
        if (el) el.value = pwd;
      }, 0);
    }
  }

  async function startCamera() {
    stopCamera();
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const v = $("#cam-video");
      v.srcObject = state.cameraStream;
      toast("摄像头已开启");
    } catch (e) {
      setStatus("无法访问摄像头: " + e.message, "error");
    }
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((t) => t.stop());
      state.cameraStream = null;
    }
  }

  function snapPhoto() {
    const v = $("#cam-video");
    const c = $("#cam-canvas");
    if (!v || !v.srcObject) {
      toast("请先开启摄像头");
      return;
    }
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      addFiles([file]);
      toast("已加入照片");
    }, "image/jpeg", 0.92);
  }

  function setStatus(msg, type) {
    const el = $("#status");
    el.textContent = msg || "";
    el.className = "status" + (type ? " " + type : "");
  }

  function addFiles(fileList) {
    const arr = [...fileList];
    const tool = state.tool;
    if (!tool) return;
    if (tool.kind === "single" && tool.impl !== "compare") {
      state.files = arr.slice(0, 1);
    } else if (tool.impl === "overlay" || tool.impl === "compare") {
      state.files = [...state.files, ...arr].slice(0, 2);
    } else {
      state.files = [...state.files, ...arr];
    }
    renderFileList();
    if (tool.impl === "reorder" || tool.impl === "viewer" || tool.impl === "compare") {
      previewPages().catch(() => {});
    }
  }

  function renderFileList() {
    const list = $("#file-list");
    list.innerHTML = "";
    state.files.forEach((f, i) => {
      const row = document.createElement("div");
      row.className = "file-item";
      row.innerHTML = `<span class="fi-name">${i + 1}. ${f.name}</span><span class="fi-size">${formatSize(f.size)}</span>
        <button type="button" class="btn btn-ghost" data-rm="${i}">移除</button>`;
      row.querySelector("[data-rm]").onclick = () => {
        state.files.splice(i, 1);
        renderFileList();
      };
      list.appendChild(row);
    });
  }

  async function previewPages() {
    const preview = $("#preview-area");
    preview.classList.remove("hidden");
    preview.innerHTML = "加载预览…";
    await PdfOps.ensurePdfJs();
    if (state.tool.impl === "compare" && state.files.length === 2) {
      preview.innerHTML = "";
      const grid = document.createElement("div");
      grid.className = "compare-grid";
      for (const f of state.files) {
        const col = document.createElement("div");
        const data = await PdfOps.fileToBytes(f);
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const canvas = await PdfOps.renderPageToCanvas(pdf, 1, 1.1);
        const h = document.createElement("h4");
        h.textContent = f.name;
        col.appendChild(h);
        col.appendChild(canvas);
        grid.appendChild(col);
      }
      preview.appendChild(grid);
      return;
    }
    if (!state.files[0]) return;
    const data = await PdfOps.fileToBytes(state.files[0]);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    state._previewPdf = pdf;
    if (!state.pageOrder.length || state.pageOrder.length !== pdf.numPages) {
      state.pageOrder = Array.from({ length: pdf.numPages }, (_, i) => i);
    }
    await renderReorderThumbs(pdf);
  }

  async function renderReorderThumbs(pdf) {
    const preview = $("#preview-area");
    preview.classList.remove("hidden");
    preview.innerHTML = "";
    const thumbs = document.createElement("div");
    thumbs.className = "page-thumbs";
    const order = state.pageOrder;
    for (let pos = 0; pos < order.length; pos++) {
      const pageIndex = order[pos];
      const canvas = await PdfOps.renderPageToCanvas(pdf, pageIndex + 1, 0.35);
      const wrap = document.createElement("div");
      wrap.className = "page-thumb";
      wrap.draggable = state.tool.impl === "reorder";
      wrap.dataset.idx = String(pageIndex);
      wrap.appendChild(canvas);
      wrap.appendChild(document.createTextNode("第 " + (pageIndex + 1) + " 页"));
      if (state.tool.impl === "reorder") {
        wrap.ondragstart = (e) => e.dataTransfer.setData("text/plain", wrap.dataset.idx);
        wrap.ondragover = (e) => e.preventDefault();
        wrap.ondrop = (e) => {
          e.preventDefault();
          const from = Number(e.dataTransfer.getData("text/plain"));
          const to = Number(wrap.dataset.idx);
          const next = state.pageOrder.slice();
          const fromPos = next.indexOf(from);
          const toPos = next.indexOf(to);
          if (fromPos < 0 || toPos < 0) return;
          next.splice(fromPos, 1);
          next.splice(toPos, 0, from);
          state.pageOrder = next;
          renderReorderThumbs(state._previewPdf);
        };
      }
      thumbs.appendChild(wrap);
    }
    preview.appendChild(thumbs);
  }

  async function runTool() {
    const tool = state.tool;
    if (!tool) return;
    setStatus("处理中…");
    $("#btn-run").disabled = true;
    try {
      await executeImpl(tool);
      setStatus("完成", "ok");
      toast("处理完成");
    } finally {
      $("#btn-run").disabled = false;
    }
  }

  async function executeImpl(tool) {
    const impl = tool.impl;
    const f = state.files[0];
    const needFile = ![
      "create-text",
      "create-form",
      "job-app",
      "invoice",
      "qrcode",
      "gen-password",
      "md-to-pdf",
      "camera",
    ].includes(impl);
    if (needFile && !f && impl !== "camera") throw new Error("请先上传文件");
    if (impl === "camera" && !state.files.length) throw new Error("请先拍照");

    switch (impl) {
      case "merge": {
        if (state.files.length < 2) throw new Error("请至少上传 2 个 PDF");
        const bytes = await PdfOps.mergePdfs(state.files);
        PdfOps.downloadBytes(bytes, "merged.pdf");
        break;
      }
      case "split": {
        const mode = $("#opt-split-mode")?.value || "each";
        const arg = $("#opt-split-arg")?.value || "1";
        const parts = await PdfOps.splitPdf(f, mode, {
          every: arg,
          ranges: arg,
        });
        if (parts.length === 1) {
          PdfOps.downloadBytes(parts[0].bytes, parts[0].name);
        } else {
          const blob = await PdfOps.zipFiles(parts);
          PdfOps.downloadBlob(blob, "split.zip");
        }
        break;
      }
      case "extract-pages": {
        const bytes = await PdfOps.extractPages(f, $("#opt-pages").value);
        PdfOps.downloadBytes(bytes, "extracted.pdf");
        break;
      }
      case "delete-pages": {
        const bytes = await PdfOps.deletePages(f, $("#opt-pages").value);
        PdfOps.downloadBytes(bytes, "deleted-pages.pdf");
        break;
      }
      case "rotate": {
        const bytes = await PdfOps.rotatePages(
          f,
          Number($("#opt-angle").value),
          $("#opt-pages").value
        );
        PdfOps.downloadBytes(bytes, "rotated.pdf");
        break;
      }
      case "reorder": {
        if (!state.pageOrder.length) await previewPages();
        const bytes = await PdfOps.reorderPages(f, state.pageOrder);
        PdfOps.downloadBytes(bytes, "reordered.pdf");
        break;
      }
      case "watermark": {
        const bytes = await PdfOps.addWatermark(f, $("#opt-wm").value, {
          size: Number($("#opt-wm-size").value),
          opacity: Number($("#opt-wm-op").value),
        });
        PdfOps.downloadBytes(bytes, "watermarked.pdf");
        break;
      }
      case "page-numbers": {
        const bytes = await PdfOps.addPageNumbers(f, { format: $("#opt-pn").value });
        PdfOps.downloadBytes(bytes, "numbered.pdf");
        break;
      }
      case "images-to-pdf": {
        if (!state.files.length) throw new Error("请上传图片");
        const bytes = await PdfOps.imagesToPdf(state.files);
        PdfOps.downloadBytes(bytes, "images.pdf");
        break;
      }
      case "svg-to-pdf": {
        const bytes = await PdfOps.svgToPdf(f);
        PdfOps.downloadBytes(bytes, "svg.pdf");
        break;
      }
      case "pdf-to-images": {
        const fmt = tool.format || $("#opt-img-fmt")?.value || "png";
        const images = await PdfOps.pdfToImages(f, fmt, 1.5);
        if (images.length === 1) {
          PdfOps.downloadBlob(images[0].blob, images[0].name);
        } else {
          const blob = await PdfOps.zipFiles(images);
          PdfOps.downloadBlob(blob, "pages.zip");
        }
        break;
      }
      case "compress": {
        const q = Number($("#opt-quality")?.value || 0.65);
        const bytes = await PdfOps.compressPdf(f, q);
        PdfOps.downloadBytes(bytes, "compressed.pdf");
        break;
      }
      case "rasterize": {
        const bytes = await PdfOps.flattenViaRaster(f);
        PdfOps.downloadBytes(bytes, "rasterized.pdf");
        break;
      }
      case "doc-info": {
        const bytes = await PdfOps.setDocInfo(f, {
          title: $("#opt-title").value,
          author: $("#opt-author").value,
          subject: $("#opt-subject").value,
          keywords: $("#opt-keywords").value,
        });
        PdfOps.downloadBytes(bytes, "meta.pdf");
        break;
      }
      case "remove-meta": {
        const bytes = await PdfOps.removeMeta(f);
        PdfOps.downloadBytes(bytes, "no-meta.pdf");
        break;
      }
      case "overlay": {
        if (state.files.length < 2) throw new Error("需要两个 PDF");
        const bytes = await PdfOps.overlayPdfs(
          state.files[0],
          state.files[1],
          Number($("#opt-opacity").value)
        );
        PdfOps.downloadBytes(bytes, "overlay.pdf");
        break;
      }
      case "crop": {
        const bytes = await PdfOps.cropPdf(f, {
          top: Number($("#opt-top").value),
          bottom: Number($("#opt-bottom").value),
          left: Number($("#opt-left").value),
          right: Number($("#opt-right").value),
        });
        PdfOps.downloadBytes(bytes, "cropped.pdf");
        break;
      }
      case "page-size": {
        const bytes = await PdfOps.changePageSize(f, $("#opt-size").value);
        PdfOps.downloadBytes(bytes, "resized.pdf");
        break;
      }
      case "n-up": {
        const bytes = await PdfOps.nUp(
          f,
          Number($("#opt-cols").value),
          Number($("#opt-rows").value)
        );
        PdfOps.downloadBytes(bytes, "n-up.pdf");
        break;
      }
      case "split-half": {
        const bytes = await PdfOps.splitHalf(f, $("#opt-half").value);
        PdfOps.downloadBytes(bytes, "half.pdf");
        break;
      }
      case "edit": {
        const bytes = await PdfOps.addTextOverlay(
          f,
          $("#opt-text").value,
          $("#opt-x").value,
          $("#opt-y").value,
          Number($("#opt-page").value) - 1,
          $("#opt-size").value
        );
        PdfOps.downloadBytes(bytes, "edited.pdf");
        break;
      }
      case "redact": {
        const bytes = await PdfOps.redactArea(
          f,
          Number($("#opt-page").value) - 1,
          $("#opt-x").value,
          $("#opt-y").value,
          $("#opt-w").value,
          $("#opt-h").value
        );
        PdfOps.downloadBytes(bytes, "redacted.pdf");
        break;
      }
      case "sign": {
        const canvas = $("#sign-pad");
        const dataUrl = canvas.toDataURL("image/png");
        const bytes = await PdfOps.addSignatureImage(
          f,
          dataUrl,
          0,
          $("#opt-x").value,
          $("#opt-y").value,
          160,
          64
        );
        PdfOps.downloadBytes(bytes, "signed.pdf");
        break;
      }
      case "create-text": {
        const bytes = await PdfOps.createTextPdf(
          $("#opt-body").value,
          $("#opt-title")?.value || "Document"
        );
        PdfOps.downloadBytes(bytes, "document.pdf");
        break;
      }
      case "md-to-pdf": {
        const bytes = await PdfOps.mdToPdf($("#opt-body").value);
        PdfOps.downloadBytes(bytes, "markdown.pdf");
        break;
      }
      case "create-form": {
        const items = ($("#opt-fields").value || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const bytes = await PdfOps.createFormPdf({
          title: $("#opt-title").value,
          items,
        });
        PdfOps.downloadBytes(bytes, "form.pdf");
        break;
      }
      case "job-app": {
        const bytes = await PdfOps.createJobApp({
          name: $("#opt-name").value,
          phone: $("#opt-phone").value,
          email: $("#opt-email").value,
          position: $("#opt-position").value,
          intro: $("#opt-intro").value,
          experience: $("#opt-exp").value,
          education: $("#opt-edu").value,
        });
        PdfOps.downloadBytes(bytes, "job-application.pdf");
        break;
      }
      case "invoice": {
        const bytes = await PdfOps.createInvoice({
          title: $("#opt-title").value,
          no: $("#opt-no").value,
          seller: $("#opt-seller").value,
          buyer: $("#opt-buyer").value,
          items: [{ name: $("#opt-item").value, amount: $("#opt-amount").value }],
          total: $("#opt-total").value,
        });
        PdfOps.downloadBytes(bytes, "invoice.pdf");
        break;
      }
      case "qrcode": {
        const { pdfBytes, pngBlob } = await PdfOps.makeQrPdf($("#opt-qr").value);
        PdfOps.downloadBytes(pdfBytes, "qrcode.pdf");
        PdfOps.downloadBlob(pngBlob, "qrcode.png");
        break;
      }
      case "gen-password": {
        const len = Number($("#opt-len").value) || 16;
        const pwd = PdfOps.genPassword(len, { syms: $("#opt-syms").checked });
        $("#opt-result").value = pwd;
        break;
      }
      case "camera": {
        const bytes = await PdfOps.imagesToPdf(state.files);
        PdfOps.downloadBytes(bytes, "camera.pdf");
        break;
      }
      case "pdf-to-docx": {
        const mode = $("#opt-docx-mode")?.value || "exact";
        const imageScale = Number($("#opt-pdf-scale")?.value || 2.5);
        setStatus(mode === "exact" ? "正在精确还原为 Word…" : "正在提取文字…");
        const blob = await PdfOps.pdfToDocx(f, { mode, imageScale });
        const base = (f.name || "document").replace(/\.pdf$/i, "");
        PdfOps.downloadBlob(blob, base + ".docx");
        break;
      }
      case "docx-to-pdf": {
        const scale = Number($("#opt-docx-scale")?.value || 2);
        setStatus("正在按原排版渲染 Word 并导出 PDF…");
        const bytes = await PdfOps.docxToPdf(f, { scale });
        const base = (f.name || "document").replace(/\.docx$/i, "");
        PdfOps.downloadBytes(bytes, base + ".pdf");
        break;
      }
      case "pdf-to-text": {
        const text = await PdfOps.extractText(f);
        PdfOps.downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "extracted.txt");
        showTextPreview(text);
        break;
      }
      case "pdf-to-html": {
        const html = await PdfOps.pdfToHtml(f);
        PdfOps.downloadBlob(new Blob([html], { type: "text/html" }), "converted.html");
        break;
      }
      case "pdf-to-md": {
        const md = await PdfOps.pdfToMarkdown(f);
        PdfOps.downloadBlob(new Blob([md], { type: "text/markdown" }), "converted.md");
        break;
      }
      case "pdf-to-csv": {
        const csv = await PdfOps.pdfToCsv(f);
        PdfOps.downloadBlob(new Blob([csv], { type: "text/csv" }), "converted.csv");
        break;
      }
      case "pdf-to-svg": {
        const svgs = await PdfOps.pdfToSvg(f);
        const blob = await PdfOps.zipFiles(svgs);
        PdfOps.downloadBlob(blob, "pages-svg.zip");
        break;
      }
      case "office-to-pdf": {
        const bytes = await PdfOps.officeToPdf(f);
        PdfOps.downloadBytes(bytes, "converted.pdf");
        break;
      }
      case "img-convert": {
        if (!state.files.length) throw new Error("请上传图片");
        const out = await PdfOps.convertImage(state.files, tool.to || "image/jpeg");
        if (out.length === 1) PdfOps.downloadBlob(out[0].blob, out[0].name);
        else {
          const blob = await PdfOps.zipFiles(out);
          PdfOps.downloadBlob(blob, "converted-images.zip");
        }
        break;
      }
      case "viewer":
      case "compare": {
        await previewPages();
        break;
      }
      default:
        throw new Error("未实现的操作: " + impl);
    }
  }

  function showTextPreview(text) {
    const preview = $("#preview-area");
    preview.classList.remove("hidden");
    preview.innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;margin:0">${escapeXml(text).slice(0, 8000)}</pre>`;
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupDropzone() {
    const dz = $("#dropzone");
    const input = $("#file-input");
    dz.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files?.length) addFiles(input.files);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove("dragover");
      })
    );
    dz.addEventListener("drop", (e) => {
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });
  }

  function init() {
    window.PdfToolsToast = toast;
    if (window.FinanceApp) FinanceApp.init();
    renderSidebar("from-pdf");
    renderCatalog();
    setupDropzone();
    $("#search").addEventListener("input", () => renderCatalog(null, $("#search").value));
    $(".brand").addEventListener("click", () => {
      showCatalog();
      renderCatalog();
      renderSidebar("from-pdf");
    });
    $("#btn-back").addEventListener("click", () => {
      showCatalog();
      renderCatalog();
      renderSidebar("from-pdf");
    });
    const hash = location.hash.replace(/^#/, "");
    if (hash === "finance") {
      showFinance();
      renderSidebar("finance");
    } else if (hash && PDF24_TOOLS.some((t) => t.id === hash)) {
      openTool(hash);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
