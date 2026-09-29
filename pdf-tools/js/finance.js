/* global XLSX */
(function (global) {
  "use strict";

  const DB_NAME = "pdf-tools-finance";
  const DB_STORE = "handles";
  const META_KEY = "inventory";
  const DEFAULT_HEADERS = [
    "日期",
    "类型",
    "单号",
    "商品编码",
    "商品名称",
    "规格",
    "单位",
    "数量",
    "单价",
    "金额",
    "仓库",
    "经办人",
    "备注",
  ];

  const state = {
    headers: [...DEFAULT_HEADERS],
    rows: [],
    fileName: "",
    fileHandle: null,
    dirty: false,
    supportsFS: typeof window.showOpenFilePicker === "function",
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function toast(msg) {
    if (global.PdfToolsToast) return global.PdfToolsToast(msg);
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function setStatus(msg, ok) {
    const el = $("#inv-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (ok === true ? " ok" : ok === false ? " error" : "");
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function persistMeta() {
    await idbSet(META_KEY, {
      fileName: state.fileName,
      headers: state.headers,
      rows: state.rows,
      dirty: state.dirty,
      savedAt: Date.now(),
      // fileHandle stored separately when supported
    });
    if (state.fileHandle) {
      try {
        await idbSet(META_KEY + "-handle", state.fileHandle);
      } catch (_) {
        /* some browsers may not serialize handle in private mode */
      }
    }
  }

  async function loadMeta() {
    const meta = await idbGet(META_KEY);
    if (meta) {
      state.fileName = meta.fileName || "";
      state.headers = meta.headers?.length ? meta.headers : [...DEFAULT_HEADERS];
      state.rows = Array.isArray(meta.rows) ? meta.rows : [];
      state.dirty = !!meta.dirty;
    }
    try {
      const handle = await idbGet(META_KEY + "-handle");
      if (handle) state.fileHandle = handle;
    } catch (_) {}
  }

  function updateFileLabel() {
    const el = $("#inv-file-label");
    if (!el) return;
    if (state.fileName) {
      el.textContent =
        (state.dirty ? "● 未保存 · " : "○ 已同步 · ") + state.fileName;
    } else {
      el.textContent = "未选择数据表";
    }
  }

  function markDirty(v = true) {
    state.dirty = v;
    updateFileLabel();
    persistMeta().catch(() => {});
    if (v && $("#inv-autosave")?.checked) {
      clearTimeout(markDirty._t);
      markDirty._t = setTimeout(() => {
        saveToOriginal().catch((e) => setStatus(e.message || String(e), false));
      }, 800);
    }
  }

  function sheetToData(workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!aoa.length) {
      return { headers: [...DEFAULT_HEADERS], rows: [] };
    }
    let headers = (aoa[0] || []).map((h, i) => String(h || "").trim() || `列${i + 1}`);
    if (!headers.filter(Boolean).length) headers = [...DEFAULT_HEADERS];
    const rows = [];
    for (let r = 1; r < aoa.length; r++) {
      const line = aoa[r] || [];
      if (line.every((c) => String(c ?? "").trim() === "")) continue;
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(line[i] ?? "");
      });
      rows.push(obj);
    }
    return { headers, rows };
  }

  function dataToWorkbook() {
    const aoa = [state.headers];
    state.rows.forEach((row) => {
      aoa.push(state.headers.map((h) => row[h] ?? ""));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "出入库明细");
    return wb;
  }

  async function parseFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    return sheetToData(wb);
  }

  async function verifyPermission(handle, write) {
    const opts = write ? { mode: "readwrite" } : { mode: "read" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  async function openWithPicker() {
    if (state.supportsFS) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "表格",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
                ".xlsx",
              ],
              "application/vnd.ms-excel": [".xls"],
              "text/csv": [".csv"],
            },
          },
        ],
      });
      if (!(await verifyPermission(handle, false))) {
        throw new Error("未获得文件读取权限");
      }
      const file = await handle.getFile();
      const data = await parseFile(file);
      state.fileHandle = handle;
      state.fileName = file.name;
      state.headers = data.headers;
      state.rows = data.rows;
      markDirty(false);
      await persistMeta();
      renderTable();
      setStatus(`已导入 ${state.rows.length} 条，已记住文件`, true);
      toast("已导入并记住文件路径");
      return;
    }

    // fallback file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = await parseFile(file);
        state.fileHandle = null;
        state.fileName = file.name;
        state.headers = data.headers;
        state.rows = data.rows;
        markDirty(false);
        await persistMeta();
        renderTable();
        setStatus(
          `已导入 ${state.rows.length} 条（当前浏览器无法记住路径，请用「保存/另存为」同步）`,
          true
        );
        toast("已导入表格");
      } catch (e) {
        setStatus(e.message || String(e), false);
      }
    };
    input.click();
  }

  async function reloadFromOriginal() {
    if (state.fileHandle) {
      if (!(await verifyPermission(state.fileHandle, false))) {
        throw new Error("请重新授权读取原表");
      }
      const file = await state.fileHandle.getFile();
      const data = await parseFile(file);
      state.fileName = file.name;
      state.headers = data.headers;
      state.rows = data.rows;
      markDirty(false);
      await persistMeta();
      renderTable();
      setStatus(`已从原表重新加载 ${state.rows.length} 条`, true);
      toast("已从原表加载");
      return;
    }
    if (state.rows.length) {
      setStatus("无文件句柄，已显示本地缓存数据。请点「选择/导入表格」关联原表。", true);
      renderTable();
      return;
    }
    await openWithPicker();
  }

  async function saveToOriginal() {
    const wb = dataToWorkbook();
    const ext = (state.fileName || "").toLowerCase().endsWith(".csv") ? "csv" : "xlsx";

    if (state.fileHandle && state.supportsFS) {
      if (!(await verifyPermission(state.fileHandle, true))) {
        throw new Error("未获得写入权限，请重新选择文件");
      }
      let content;
      if (ext === "csv") {
        content = XLSX.utils.sheet_to_csv(wb.Sheets["出入库明细"]);
        const writable = await state.fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await state.fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
      }
      markDirty(false);
      await persistMeta();
      setStatus("已同步写入原表", true);
      toast("已保存到原表");
      return;
    }

    // fallback download
    if (ext === "csv") {
      XLSX.writeFile(wb, state.fileName || "出入库明细.csv", { bookType: "csv" });
    } else {
      XLSX.writeFile(wb, state.fileName || "出入库明细.xlsx");
    }
    markDirty(false);
    await persistMeta();
    setStatus("已下载同步文件（请覆盖原表以完成同步）", true);
    toast("已导出，请覆盖原文件");
  }

  async function saveAs() {
    const wb = dataToWorkbook();
    if (state.supportsFS && window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: state.fileName || "出入库明细.xlsx",
        types: [
          {
            description: "Excel",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
                ".xlsx",
              ],
            },
          },
        ],
      });
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const writable = await handle.createWritable();
      await writable.write(out);
      await writable.close();
      state.fileHandle = handle;
      state.fileName = handle.name;
      markDirty(false);
      await persistMeta();
      setStatus("已另存并绑定新文件", true);
      toast("另存成功");
      return;
    }
    XLSX.writeFile(wb, state.fileName || "出入库明细.xlsx");
    markDirty(false);
    toast("已下载");
  }

  function emptyRow() {
    const row = {};
    state.headers.forEach((h) => {
      row[h] = h === "日期" ? new Date().toISOString().slice(0, 10) : h === "类型" ? "入库" : "";
    });
    return row;
  }

  function addRow() {
    if (!state.headers.length) state.headers = [...DEFAULT_HEADERS];
    state.rows.unshift(emptyRow());
    markDirty(true);
    renderTable();
  }

  function deleteRow(index) {
    state.rows.splice(index, 1);
    markDirty(true);
    renderTable();
  }

  function getFilteredIndexes() {
    const q = ($("#inv-search")?.value || "").trim().toLowerCase();
    const type = $("#inv-type-filter")?.value || "";
    const indexes = [];
    state.rows.forEach((row, i) => {
      if (type && String(row["类型"] || "") !== type) return;
      if (q) {
        const hit = state.headers.some((h) =>
          String(row[h] ?? "").toLowerCase().includes(q)
        );
        if (!hit) return;
      }
      indexes.push(i);
    });
    return indexes;
  }

  function renderTable() {
    const thead = $("#inv-thead");
    const tbody = $("#inv-tbody");
    const empty = $("#inv-empty");
    if (!thead || !tbody) return;
    updateFileLabel();

    if (!state.rows.length && !state.fileName) {
      thead.innerHTML = "";
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");

    thead.innerHTML =
      "<tr>" +
      state.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("") +
      '<th class="inv-ops">操作</th></tr>';

    const indexes = getFilteredIndexes();
    tbody.innerHTML = "";
    indexes.forEach((rowIndex) => {
      const row = state.rows[rowIndex];
      const tr = document.createElement("tr");
      state.headers.forEach((h) => {
        const td = document.createElement("td");
        if (h === "类型") {
          const sel = document.createElement("select");
          ["入库", "出库", "调拨", "盘点", ""].forEach((opt) => {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt || "（空）";
            if (String(row[h] || "") === opt) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener("change", () => {
            row[h] = sel.value;
            if (h === "数量" || h === "单价") recalcAmount(row);
            markDirty(true);
          });
          td.appendChild(sel);
        } else {
          const input = document.createElement("input");
          input.type = "text";
          input.value = row[h] ?? "";
          input.addEventListener("input", () => {
            row[h] = input.value;
            if (h === "数量" || h === "单价") {
              recalcAmount(row);
              const amtIdx = state.headers.indexOf("金额");
              if (amtIdx >= 0) {
                const amtInput = tr.children[amtIdx]?.querySelector("input");
                if (amtInput) amtInput.value = row["金额"] ?? "";
              }
            }
            markDirty(true);
          });
          td.appendChild(input);
        }
        tr.appendChild(td);
      });
      const op = document.createElement("td");
      op.className = "inv-ops";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-icon";
      btn.textContent = "删除";
      btn.addEventListener("click", () => {
        if (confirm("确定删除该行？")) deleteRow(rowIndex);
      });
      op.appendChild(btn);
      tr.appendChild(op);
      tbody.appendChild(tr);
    });
  }

  function recalcAmount(row) {
    const qty = parseFloat(row["数量"]);
    const price = parseFloat(row["单价"]);
    if (!Number.isNaN(qty) && !Number.isNaN(price) && state.headers.includes("金额")) {
      row["金额"] = String(Math.round(qty * price * 100) / 100);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bindUi() {
    $("#inv-btn-open")?.addEventListener("click", () =>
      openWithPicker().catch((e) => {
        if (e?.name === "AbortError") return;
        setStatus(e.message || String(e), false);
      })
    );
    $("#inv-btn-reload")?.addEventListener("click", () =>
      reloadFromOriginal().catch((e) => setStatus(e.message || String(e), false))
    );
    $("#inv-btn-save")?.addEventListener("click", () =>
      saveToOriginal().catch((e) => setStatus(e.message || String(e), false))
    );
    $("#inv-btn-export")?.addEventListener("click", () =>
      saveAs().catch((e) => {
        if (e?.name === "AbortError") return;
        setStatus(e.message || String(e), false);
      })
    );
    $("#inv-btn-template")?.addEventListener("click", downloadTemplate);
    $("#inv-btn-add")?.addEventListener("click", addRow);
    $("#inv-search")?.addEventListener("input", renderTable);
    $("#inv-type-filter")?.addEventListener("change", renderTable);

    $("#stock-btn-refresh")?.addEventListener("click", renderStock);
    $("#stock-btn-export")?.addEventListener("click", exportStock);
    $("#stock-search")?.addEventListener("input", renderStock);
    $("#stock-hide-zero")?.addEventListener("change", renderStock);
    $("#stats-btn-refresh")?.addEventListener("click", renderStats);

    const auto = $("#inv-autosave");
    if (auto) {
      auto.checked = localStorage.getItem("finance_autosave") === "1";
      auto.addEventListener("change", () => {
        localStorage.setItem("finance_autosave", auto.checked ? "1" : "0");
      });
    }

    $$(".finance-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
  }

  function num(v) {
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function buildStockRows() {
    const map = new Map();
    state.rows.forEach((row) => {
      const code = String(row["商品编码"] || "").trim() || "-";
      const name = String(row["商品名称"] || "").trim();
      const spec = String(row["规格"] || "").trim();
      const unit = String(row["单位"] || "").trim();
      const wh = String(row["仓库"] || "").trim() || "默认仓";
      const key = [code, name, spec, unit, wh].join("\t");
      if (!map.has(key)) {
        map.set(key, {
          商品编码: code,
          商品名称: name,
          规格: spec,
          单位: unit,
          仓库: wh,
          入库合计: 0,
          出库合计: 0,
          当前库存: 0,
          库存金额: 0,
          _cost: 0,
        });
      }
      const item = map.get(key);
      const q = Math.abs(num(row["数量"]));
      const amt = num(row["金额"]) || q * num(row["单价"]);
      const t = String(row["类型"] || "");
      if (t.includes("出")) {
        item.出库合计 += q;
        item.当前库存 -= q;
      } else if (t.includes("盘")) {
        item.当前库存 = num(row["数量"]);
      } else {
        item.入库合计 += q;
        item.当前库存 += q;
        item._cost += amt;
      }
    });
    return [...map.values()]
      .map((it) => {
        const avg = it.入库合计 > 0 ? it._cost / it.入库合计 : 0;
        it.库存金额 = Math.round(it.当前库存 * avg * 100) / 100;
        it.入库合计 = Math.round(it.入库合计 * 1000) / 1000;
        it.出库合计 = Math.round(it.出库合计 * 1000) / 1000;
        it.当前库存 = Math.round(it.当前库存 * 1000) / 1000;
        delete it._cost;
        return it;
      })
      .sort((a, b) => String(a.商品编码).localeCompare(String(b.商品编码), "zh"));
  }

  function renderStock() {
    const tbody = $("#stock-tbody");
    const empty = $("#stock-empty");
    if (!tbody) return;
    const q = ($("#stock-search")?.value || "").trim().toLowerCase();
    const hideZero = $("#stock-hide-zero")?.checked;
    let rows = buildStockRows();
    if (hideZero) rows = rows.filter((r) => r.当前库存 !== 0);
    if (q) {
      rows = rows.filter((r) =>
        [r.商品编码, r.商品名称, r.仓库, r.规格].some((x) =>
          String(x).toLowerCase().includes(q)
        )
      );
    }
    const st = $("#stock-status");
    if (!rows.length) {
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      if (st) {
        st.textContent = state.rows.length ? "无匹配库存行" : "请先导入出入库明细";
        st.className = "status";
      }
      return;
    }
    empty?.classList.add("hidden");
    tbody.innerHTML = rows
      .map((r) => {
        const low = r.当前库存 < 0 ? ' style="color:#c62828;font-weight:700"' : "";
        return `<tr>
          <td>${escapeHtml(r.商品编码)}</td>
          <td>${escapeHtml(r.商品名称)}</td>
          <td>${escapeHtml(r.规格)}</td>
          <td>${escapeHtml(r.单位)}</td>
          <td>${escapeHtml(r.仓库)}</td>
          <td>${r.入库合计}</td>
          <td>${r.出库合计}</td>
          <td${low}>${r.当前库存}</td>
          <td>${r.库存金额}</td>
        </tr>`;
      })
      .join("");
    if (st) {
      st.textContent = `共 ${rows.length} 个 SKU`;
      st.className = "status ok";
    }
  }

  function exportStock() {
    const rows = buildStockRows();
    const headers = [
      "商品编码",
      "商品名称",
      "规格",
      "单位",
      "仓库",
      "入库合计",
      "出库合计",
      "当前库存",
      "库存金额",
    ];
    const aoa = [headers, ...rows.map((r) => headers.map((h) => r[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "库存汇总");
    XLSX.writeFile(wb, "库存汇总.xlsx");
    toast("已导出库存汇总");
  }

  function renderStats() {
    const cards = $("#stats-cards");
    const tbody = $("#stats-tbody");
    const empty = $("#stats-empty");
    if (!cards || !tbody) return;

    let inQty = 0,
      outQty = 0,
      inAmt = 0,
      outAmt = 0,
      inCnt = 0,
      outCnt = 0;
    const byDate = new Map();

    state.rows.forEach((row) => {
      const t = String(row["类型"] || "");
      const q = Math.abs(num(row["数量"]));
      const a = num(row["金额"]) || q * num(row["单价"]);
      const d = String(row["日期"] || "").slice(0, 10) || "未填日期";
      if (!byDate.has(d)) {
        byDate.set(d, {
          日期: d,
          入库单数: 0,
          入库数量: 0,
          入库金额: 0,
          出库单数: 0,
          出库数量: 0,
          出库金额: 0,
        });
      }
      const day = byDate.get(d);
      if (t.includes("出")) {
        outQty += q;
        outAmt += a;
        outCnt += 1;
        day.出库单数 += 1;
        day.出库数量 += q;
        day.出库金额 += a;
      } else if (!t.includes("盘") && !t.includes("调")) {
        inQty += q;
        inAmt += a;
        inCnt += 1;
        day.入库单数 += 1;
        day.入库数量 += q;
        day.入库金额 += a;
      }
    });

    cards.innerHTML = [
      ["明细条数", state.rows.length],
      ["入库笔数", inCnt],
      ["入库数量", Math.round(inQty * 1000) / 1000],
      ["入库金额", Math.round(inAmt * 100) / 100],
      ["出库笔数", outCnt],
      ["出库数量", Math.round(outQty * 1000) / 1000],
      ["出库金额", Math.round(outAmt * 100) / 100],
      ["净入库数量", Math.round((inQty - outQty) * 1000) / 1000],
    ]
      .map(
        ([label, value]) =>
          `<div class="stats-card"><div class="label">${label}</div><div class="value">${value}</div></div>`
      )
      .join("");

    const days = [...byDate.values()].sort((a, b) =>
      String(b.日期).localeCompare(String(a.日期))
    );
    if (!days.length) {
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    tbody.innerHTML = days
      .map(
        (d) => `<tr>
        <td>${escapeHtml(d.日期)}</td>
        <td>${d.入库单数}</td>
        <td>${Math.round(d.入库数量 * 1000) / 1000}</td>
        <td>${Math.round(d.入库金额 * 100) / 100}</td>
        <td>${d.出库单数}</td>
        <td>${Math.round(d.出库数量 * 1000) / 1000}</td>
        <td>${Math.round(d.出库金额 * 100) / 100}</td>
      </tr>`
      )
      .join("");
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const sample = [
      DEFAULT_HEADERS,
      [
        new Date().toISOString().slice(0, 10),
        "入库",
        "RK001",
        "P001",
        "示例商品",
        "标准",
        "个",
        "10",
        "5",
        "50",
        "主仓",
        "张三",
        "",
      ],
      [
        new Date().toISOString().slice(0, 10),
        "出库",
        "CK001",
        "P001",
        "示例商品",
        "标准",
        "个",
        "2",
        "5",
        "10",
        "主仓",
        "李四",
        "",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, "出入库明细");
    XLSX.writeFile(wb, "进销存_出入库明细_模板.xlsx");
    toast("已下载模板");
  }

  function switchTab(id) {
    $$(".finance-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === id)
    );
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.classList.toggle("hidden", p.dataset.panel !== id);
    });
    if (id === "overview") renderOverview();
    if (id === "stock") renderStock();
    if (id === "stats") renderStats();
    if (window.FinanceBooks) {
      if (FinanceBooks.bookIds.includes(id)) FinanceBooks.activate(id);
      if (id === "pivot") FinanceBooks.activatePivot();
    }
  }

  function $$(sel) {
    return [...document.querySelectorAll(sel)];
  }

  function numVal(v) {
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function renderOverview() {
    const cards = $("#overview-cards");
    const grid = $("#overview-grid");
    const st = $("#overview-status");
    if (!cards || !grid) return;

    const invN = state.rows.length;
    let inAmt = 0,
      outAmt = 0;
    state.rows.forEach((r) => {
      const t = String(r["类型"] || "");
      const a = numVal(r["金额"]) || Math.abs(numVal(r["数量"])) * numVal(r["单价"]);
      if (t.includes("出")) outAmt += a;
      else if (!t.includes("盘") && !t.includes("调")) inAmt += a;
    });

    const bookStats = {};
    if (window.FinanceBooks) {
      FinanceBooks.bookIds.forEach((id) => {
        const b = FinanceBooks.getBook(id);
        const rows = b?.getRows?.() || [];
        let sum = 0;
        rows.forEach((r) => {
          sum += numVal(r["金额"]) || numVal(r["借方"]) || numVal(r["贷方"]) || numVal(r["预算金额"]);
        });
        bookStats[id] = { n: rows.length, sum: Math.round(sum * 100) / 100 };
      });
    }

    cards.innerHTML = [
      ["进销存明细", invN + " 条"],
      ["入库金额", Math.round(inAmt * 100) / 100],
      ["出库金额", Math.round(outAmt * 100) / 100],
      ["台账笔数", (bookStats.ledger?.n || 0) + " 条"],
      ["预算条目", (bookStats.budget?.n || 0) + " 条"],
      ["费用合计", bookStats.expense?.sum || 0],
      ["报销合计", bookStats.reimburse?.sum || 0],
    ]
      .map(
        ([l, v]) =>
          `<div class="stats-card"><div class="label">${l}</div><div class="value">${v}</div></div>`
      )
      .join("");

    const modules = [
      { id: "inventory", title: "进销存明细", desc: "出入库流水，可写回 Excel", n: invN },
      { id: "stock", title: "库存汇总", desc: "由明细自动汇总结存", n: "—" },
      { id: "ledger", title: "财务台账", desc: "借贷凭证明细", n: bookStats.ledger?.n || 0 },
      { id: "budget", title: "预算表", desc: "预算/已用/剩余", n: bookStats.budget?.n || 0 },
      { id: "expense", title: "费用统计", desc: "费用明细与分类汇总", n: bookStats.expense?.n || 0 },
      { id: "reimburse", title: "报销汇总", desc: "报销单状态与金额", n: bookStats.reimburse?.n || 0 },
      { id: "pivot", title: "数据透视", desc: "多维交叉分析", n: "—" },
    ];
    grid.innerHTML = modules
      .map(
        (m) => `<button type="button" class="overview-card" data-goto="${m.id}">
        <h3>${m.title}</h3>
        <div class="n">${m.n}</div>
        <p>${m.desc}</p>
      </button>`
      )
      .join("");

    if (st) {
      st.textContent = "点击卡片可进入对应模块";
      st.className = "status ok";
    }
  }

  function loadInventoryDemo() {
    const d = new Date().toISOString().slice(0, 10);
    state.headers = [...DEFAULT_HEADERS];
    state.rows = [
      {
        日期: d, 类型: "入库", 单号: "RK001", 商品编码: "P001", 商品名称: "示例商品A",
        规格: "标准", 单位: "个", 数量: "100", 单价: "12", 金额: "1200", 仓库: "主仓", 经办人: "张三", 备注: "",
      },
      {
        日期: d, 类型: "出库", 单号: "CK001", 商品编码: "P001", 商品名称: "示例商品A",
        规格: "标准", 单位: "个", 数量: "20", 单价: "12", 金额: "240", 仓库: "主仓", 经办人: "李四", 备注: "",
      },
      {
        日期: d, 类型: "入库", 单号: "RK002", 商品编码: "P002", 商品名称: "示例商品B",
        规格: "大号", 单位: "箱", 数量: "30", 单价: "80", 金额: "2400", 仓库: "主仓", 经办人: "张三", 备注: "",
      },
    ];
    state.fileName = "进销存_演示.xlsx";
    markDirty(true);
    renderTable();
  }

  function loadSnapshot(snap) {
    if (!snap) return;
    state.headers = snap.headers?.length ? [...snap.headers] : [...DEFAULT_HEADERS];
    state.rows = Array.isArray(snap.rows) ? snap.rows.map((r) => ({ ...r })) : [];
    state.fileName = snap.fileName || state.fileName || "进销存明细.xlsx";
    markDirty(true);
    renderTable();
  }

  function bindOverview() {
    $("#overview-btn-refresh")?.addEventListener("click", renderOverview);
    $("#overview-btn-demo")?.addEventListener("click", () => {
      if (!confirm("将写入各模块演示数据（覆盖当前内存数据，不立即写磁盘）。继续？")) return;
      loadInventoryDemo();
      if (window.FinanceBooks) FinanceBooks.loadDemoBooks();
      renderOverview();
      toast("演示数据已填充");
    });
    $("#overview-btn-backup")?.addEventListener("click", () => {
      if (window.FinanceBooks) {
        FinanceBooks.backupAllToWorkbook({
          headers: state.headers,
          rows: state.rows,
        });
      }
    });
    $("#overview-btn-restore")?.addEventListener("click", () => {
      $("#overview-restore-input")?.click();
    });
    $("#overview-restore-input")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !window.FinanceBooks) return;
      try {
        await FinanceBooks.restoreFromFile(file);
        await loadMeta();
        renderTable();
        renderOverview();
      } catch (err) {
        toast(err.message || String(err));
      }
    });
    $("#overview-btn-sync-budget")?.addEventListener("click", () => {
      if (!window.FinanceBooks) return;
      const { updated } = FinanceBooks.syncExpenseToBudget();
      toast(updated ? `已更新 ${updated} 条预算「已用金额」` : "未匹配到部门+科目相同的预算行");
      renderOverview();
    });
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-goto")));
    });
    // delegation for dynamically rendered cards
    $("#overview-grid")?.addEventListener("click", (e) => {
      const card = e.target.closest("[data-goto]");
      if (card) switchTab(card.getAttribute("data-goto"));
    });
  }

  async function showFinance() {
    $("#view-catalog")?.classList.add("hidden");
    $("#view-tool")?.classList.remove("active");
    $("#view-tool")?.classList.add("hidden");
    $("#view-finance")?.classList.remove("hidden");
    history.replaceState(null, "", "#finance");

    await loadMeta();
    renderTable();

    if (state.fileHandle) {
      try {
        await reloadFromOriginal();
      } catch (e) {
        setStatus(
          "已记住文件，但需重新授权：请点击「重新从原表加载」或「选择/导入表格」。本地缓存已显示。",
          true
        );
        renderTable();
      }
    } else if (state.rows.length) {
      setStatus(
        `已恢复本地缓存 ${state.rows.length} 条` +
          (state.fileName ? `（${state.fileName}）` : ""),
        true
      );
    } else if (!state.supportsFS) {
      setStatus(
        "提示：Chrome / Edge 可选中表格后记住路径并写回；当前浏览器请用导入 + 另存为。",
        true
      );
    }

    // preload book caches for overview counts (no file permission prompts)
    if (window.FinanceBooks) {
      for (const id of FinanceBooks.bookIds) {
        try {
          await FinanceBooks.activate(id, { cacheOnly: true });
        } catch (_) {}
      }
    }
    switchTab("overview");
  }

  function hideFinance() {
    $("#view-finance")?.classList.add("hidden");
  }

  function initFinance() {
    bindUi();
    if (window.FinanceBooks) FinanceBooks.init();
    bindOverview();
  }

  global.FinanceApp = {
    init: initFinance,
    show: showFinance,
    hide: hideFinance,
    isOpen: () => !$("#view-finance")?.classList.contains("hidden"),
    getInventoryState: () => state,
    loadSnapshot,
    switchTab,
  };
})(window);
