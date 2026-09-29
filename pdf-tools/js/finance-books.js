/* global XLSX */
(function (global) {
  "use strict";

  const DB_NAME = "pdf-tools-finance";
  const DB_STORE = "handles";

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

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function toast(msg) {
    if (global.PdfToolsToast) return global.PdfToolsToast(msg);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(v) {
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * 通用本地表格账本：导入 / 记住文件 / 增删改 / 写回
   */
  function createSheetBook(cfg) {
    const id = cfg.id;
    const metaKey = cfg.metaKey || id;
    const state = {
      headers: [...cfg.defaultHeaders],
      rows: [],
      fileName: "",
      fileHandle: null,
      dirty: false,
      supportsFS: typeof window.showOpenFilePicker === "function",
    };

    function setStatus(msg, ok) {
      const el = $(`#${id}-status`);
      if (!el) return;
      el.textContent = msg || "";
      el.className = "status" + (ok === true ? " ok" : ok === false ? " error" : "");
    }

    function updateFileLabel() {
      const el = $(`#${id}-file-label`);
      if (!el) return;
      el.textContent = state.fileName
        ? (state.dirty ? "● 未保存 · " : "○ 已同步 · ") + state.fileName
        : "未选择数据表";
    }

    async function persist() {
      await idbSet(metaKey, {
        fileName: state.fileName,
        headers: state.headers,
        rows: state.rows,
        dirty: state.dirty,
        savedAt: Date.now(),
      });
      if (state.fileHandle) {
        try {
          await idbSet(metaKey + "-handle", state.fileHandle);
        } catch (_) {}
      }
    }

    async function loadMeta() {
      const meta = await idbGet(metaKey);
      if (meta) {
        state.fileName = meta.fileName || "";
        state.headers = meta.headers?.length ? meta.headers : [...cfg.defaultHeaders];
        state.rows = Array.isArray(meta.rows) ? meta.rows : [];
        state.dirty = !!meta.dirty;
      }
      try {
        const handle = await idbGet(metaKey + "-handle");
        if (handle) state.fileHandle = handle;
      } catch (_) {}
    }

    function markDirty(v = true) {
      state.dirty = v;
      updateFileLabel();
      persist().catch(() => {});
      if (v && $(`#${id}-autosave`)?.checked) {
        clearTimeout(markDirty._t);
        markDirty._t = setTimeout(() => {
          saveToOriginal().catch((e) => setStatus(e.message || String(e), false));
        }, 800);
      }
      if (typeof cfg.onChange === "function") cfg.onChange(state);
    }

    function sheetToData(workbook) {
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      if (!aoa.length) return { headers: [...cfg.defaultHeaders], rows: [] };
      const headers = (aoa[0] || []).map((h, i) => String(h || "").trim() || `列${i + 1}`);
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
      const aoa = [state.headers, ...state.rows.map((row) => state.headers.map((h) => row[h] ?? ""))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName || "Sheet1");
      return wb;
    }

    async function parseFile(file) {
      const buf = await file.arrayBuffer();
      return sheetToData(XLSX.read(buf, { type: "array", cellDates: true }));
    }

    async function verifyPermission(handle, write) {
      const opts = { mode: write ? "readwrite" : "read" };
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
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
                "text/csv": [".csv"],
              },
            },
          ],
        });
        if (!(await verifyPermission(handle, false))) throw new Error("未获得读取权限");
        const file = await handle.getFile();
        const data = await parseFile(file);
        state.fileHandle = handle;
        state.fileName = file.name;
        state.headers = data.headers;
        state.rows = data.rows;
        markDirty(false);
        await persist();
        render();
        setStatus(`已导入 ${state.rows.length} 条，已记住文件`, true);
        toast("已导入并记住文件");
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls,.csv";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const data = await parseFile(file);
        state.fileHandle = null;
        state.fileName = file.name;
        state.headers = data.headers;
        state.rows = data.rows;
        markDirty(false);
        await persist();
        render();
        setStatus(`已导入 ${state.rows.length} 条`, true);
        toast("已导入");
      };
      input.click();
    }

    async function reloadFromOriginal() {
      if (state.fileHandle) {
        if (!(await verifyPermission(state.fileHandle, false))) throw new Error("请重新授权读取原表");
        const file = await state.fileHandle.getFile();
        const data = await parseFile(file);
        state.fileName = file.name;
        state.headers = data.headers;
        state.rows = data.rows;
        markDirty(false);
        await persist();
        render();
        setStatus(`已从原表加载 ${state.rows.length} 条`, true);
        toast("已从原表加载");
        return;
      }
      if (state.rows.length) {
        render();
        setStatus("显示本地缓存，请导入以关联原表", true);
        return;
      }
      await openWithPicker();
    }

    async function saveToOriginal() {
      const wb = dataToWorkbook();
      const isCsv = (state.fileName || "").toLowerCase().endsWith(".csv");
      if (state.fileHandle && state.supportsFS) {
        if (!(await verifyPermission(state.fileHandle, true))) throw new Error("未获得写入权限");
        if (isCsv) {
          const content = XLSX.utils.sheet_to_csv(wb.Sheets[cfg.sheetName || "Sheet1"]);
          const w = await state.fileHandle.createWritable();
          await w.write(content);
          await w.close();
        } else {
          const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
          const w = await state.fileHandle.createWritable();
          await w.write(out);
          await w.close();
        }
        markDirty(false);
        await persist();
        setStatus("已同步写入原表", true);
        toast("已保存到原表");
        return;
      }
      XLSX.writeFile(wb, state.fileName || cfg.templateName || `${id}.xlsx`);
      markDirty(false);
      await persist();
      setStatus("已下载，请覆盖原文件完成同步", true);
      toast("已导出");
    }

    async function saveAs() {
      const wb = dataToWorkbook();
      if (state.supportsFS && window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: state.fileName || cfg.templateName || `${id}.xlsx`,
          types: [
            {
              description: "Excel",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              },
            },
          ],
        });
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const w = await handle.createWritable();
        await w.write(out);
        await w.close();
        state.fileHandle = handle;
        state.fileName = handle.name;
        markDirty(false);
        await persist();
        setStatus("已另存并绑定新文件", true);
        toast("另存成功");
        return;
      }
      XLSX.writeFile(wb, state.fileName || cfg.templateName || `${id}.xlsx`);
      markDirty(false);
      toast("已下载");
    }

    function emptyRow() {
      const row = {};
      state.headers.forEach((h) => {
        if (h === "日期" || h === "申请日期") row[h] = new Date().toISOString().slice(0, 10);
        else if (cfg.selectFields?.[h]) row[h] = cfg.selectFields[h][0] || "";
        else row[h] = "";
      });
      return row;
    }

    function addRow() {
      if (!state.headers.length) state.headers = [...cfg.defaultHeaders];
      state.rows.unshift(emptyRow());
      markDirty(true);
      render();
    }

    function deleteRow(index) {
      state.rows.splice(index, 1);
      markDirty(true);
      render();
    }

    function getFilteredIndexes() {
      const q = ($(`#${id}-search`)?.value || "").trim().toLowerCase();
      const typeSel = $(`#${id}-type-filter`);
      const type = typeSel?.value || "";
      const typeField = cfg.typeField || "";
      const indexes = [];
      state.rows.forEach((row, i) => {
        if (type && typeField && String(row[typeField] || "") !== type) return;
        if (q) {
          const hit = state.headers.some((h) => String(row[h] ?? "").toLowerCase().includes(q));
          if (!hit) return;
        }
        indexes.push(i);
      });
      return indexes;
    }

    function afterEdit(row, h) {
      if (typeof cfg.afterEdit === "function") cfg.afterEdit(row, h, state);
    }

    function render() {
      const thead = $(`#${id}-thead`);
      const tbody = $(`#${id}-tbody`);
      const empty = $(`#${id}-empty`);
      if (!thead || !tbody) return;
      updateFileLabel();
      renderSummary();

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
          const opts = cfg.selectFields?.[h];
          if (opts) {
            const sel = document.createElement("select");
            opts.forEach((opt) => {
              const o = document.createElement("option");
              o.value = opt;
              o.textContent = opt || "（空）";
              if (String(row[h] || "") === opt) o.selected = true;
              sel.appendChild(o);
            });
            sel.addEventListener("change", () => {
              row[h] = sel.value;
              afterEdit(row, h);
              markDirty(true);
              renderSummary();
            });
            td.appendChild(sel);
          } else {
            const input = document.createElement("input");
            input.type = "text";
            input.value = row[h] ?? "";
            input.addEventListener("input", () => {
              row[h] = input.value;
              afterEdit(row, h);
              if (cfg.recalcFields?.includes(h)) {
                const idx = state.headers.indexOf(cfg.amountField || "金额");
                if (idx >= 0) {
                  const amt = tr.children[idx]?.querySelector("input");
                  if (amt && cfg.amountField) amt.value = row[cfg.amountField] ?? "";
                }
                // budget remaining
                ["剩余金额", "已用金额"].forEach((fh) => {
                  const fi = state.headers.indexOf(fh);
                  if (fi >= 0) {
                    const el = tr.children[fi]?.querySelector("input");
                    if (el) el.value = row[fh] ?? "";
                  }
                });
              }
              markDirty(true);
              renderSummary();
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

    function renderSummary() {
      const box = $(`#${id}-summary`);
      if (!box || typeof cfg.buildSummary !== "function") return;
      box.innerHTML = cfg.buildSummary(state) || "";
    }

    function downloadTemplate() {
      const sample = cfg.sampleRows || [cfg.defaultHeaders.map(() => "")];
      const aoa = [cfg.defaultHeaders, ...sample];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName || "Sheet1");
      XLSX.writeFile(wb, cfg.templateName || `${id}_模板.xlsx`);
      toast("已下载模板");
    }

    function mountPanel(container) {
      const typeOptions = cfg.typeField && cfg.selectFields?.[cfg.typeField]
        ? cfg.selectFields[cfg.typeField]
        : null;
      container.innerHTML = `
        <div class="inv-toolbar">
          <div class="inv-file-meta">
            <span class="chip" id="${id}-file-label">未选择数据表</span>
            <span class="status" id="${id}-status"></span>
          </div>
          <div class="inv-actions">
            <button type="button" class="btn btn-primary" id="${id}-btn-open">选择 / 导入表格</button>
            <button type="button" class="btn btn-ghost" id="${id}-btn-reload">重新从原表加载</button>
            <button type="button" class="btn btn-primary" id="${id}-btn-save">保存到原表</button>
            <button type="button" class="btn btn-ghost" id="${id}-btn-export">另存为…</button>
            <button type="button" class="btn btn-ghost" id="${id}-btn-template">下载空模板</button>
            <button type="button" class="btn btn-ghost" id="${id}-btn-add">新增行</button>
            <label class="inv-autosave"><input type="checkbox" id="${id}-autosave" /> 改后自动保存</label>
          </div>
        </div>
        <div class="inv-filters">
          <input type="search" id="${id}-search" placeholder="${escapeHtml(cfg.searchPlaceholder || "搜索…")}" />
          ${
            typeOptions
              ? `<select id="${id}-type-filter"><option value="">全部</option>${typeOptions
                  .filter(Boolean)
                  .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
                  .join("")}</select>`
              : ""
          }
        </div>
        <div class="stats-cards" id="${id}-summary"></div>
        <div class="inv-table-wrap" style="margin-top:12px">
          <table class="inv-table" id="${id}-table">
            <thead id="${id}-thead"></thead>
            <tbody id="${id}-tbody"></tbody>
          </table>
          <div class="empty-hint" id="${id}-empty">${escapeHtml(cfg.emptyHint || "请先导入表格或下载模板")}</div>
        </div>
      `;
    }

    function bind() {
      $(`#${id}-btn-open`)?.addEventListener("click", () =>
        openWithPicker().catch((e) => {
          if (e?.name === "AbortError") return;
          setStatus(e.message || String(e), false);
        })
      );
      $(`#${id}-btn-reload`)?.addEventListener("click", () =>
        reloadFromOriginal().catch((e) => setStatus(e.message || String(e), false))
      );
      $(`#${id}-btn-save`)?.addEventListener("click", () =>
        saveToOriginal().catch((e) => setStatus(e.message || String(e), false))
      );
      $(`#${id}-btn-export`)?.addEventListener("click", () =>
        saveAs().catch((e) => {
          if (e?.name === "AbortError") return;
          setStatus(e.message || String(e), false);
        })
      );
      $(`#${id}-btn-template`)?.addEventListener("click", downloadTemplate);
      $(`#${id}-btn-add`)?.addEventListener("click", addRow);
      $(`#${id}-search`)?.addEventListener("input", render);
      $(`#${id}-type-filter`)?.addEventListener("change", render);
      const auto = $(`#${id}-autosave`);
      if (auto) {
        auto.checked = localStorage.getItem(`finance_autosave_${id}`) === "1";
        auto.addEventListener("change", () => {
          localStorage.setItem(`finance_autosave_${id}`, auto.checked ? "1" : "0");
        });
      }
    }

    async function activate(opts = {}) {
      await loadMeta();
      render();
      if (opts.cacheOnly) return;
      if (state.fileHandle) {
        try {
          await reloadFromOriginal();
        } catch (_) {
          setStatus("已记住文件，需重新授权后加载。本地缓存已显示。", true);
          render();
        }
      } else if (state.rows.length) {
        setStatus(`已恢复缓存 ${state.rows.length} 条`, true);
      }
    }

    function setData(headers, rows, opts = {}) {
      state.headers = headers?.length ? [...headers] : [...cfg.defaultHeaders];
      state.rows = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
      if (opts.fileName != null) state.fileName = opts.fileName;
      if (!state.fileName) state.fileName = cfg.templateName || id + ".xlsx";
      markDirty(opts.dirty !== false);
      render();
    }

    function getSnapshot() {
      return {
        id,
        fileName: state.fileName,
        headers: state.headers,
        rows: state.rows,
      };
    }

    return {
      id,
      cfg,
      state,
      mountPanel,
      bind,
      activate,
      render,
      setData,
      getSnapshot,
      getRows: () => state.rows,
      getHeaders: () => state.headers,
    };
  }

  // —— 各账本配置 ——
  const today = () => new Date().toISOString().slice(0, 10);

  const BOOK_DEFS = [
    {
      id: "ledger",
      title: "财务台账",
      sheetName: "财务台账",
      templateName: "财务台账_模板.xlsx",
      searchPlaceholder: "搜索凭证号 / 摘要 / 科目…",
      emptyHint: "请导入财务台账，或下载模板填写",
      defaultHeaders: ["日期", "凭证号", "摘要", "科目", "借方", "贷方", "余额", "经办人", "备注"],
      sampleRows: [[today(), "记-001", "销售收入", "主营业务收入", "", "1000", "1000", "张三", ""]],
      buildSummary(state) {
        let debit = 0,
          credit = 0;
        state.rows.forEach((r) => {
          debit += num(r["借方"]);
          credit += num(r["贷方"]);
        });
        return [
          ["笔数", state.rows.length],
          ["借方合计", Math.round(debit * 100) / 100],
          ["贷方合计", Math.round(credit * 100) / 100],
          ["差额(借-贷)", Math.round((debit - credit) * 100) / 100],
        ]
          .map(
            ([l, v]) =>
              `<div class="stats-card"><div class="label">${l}</div><div class="value">${v}</div></div>`
          )
          .join("");
      },
    },
    {
      id: "budget",
      title: "预算表",
      sheetName: "预算表",
      templateName: "预算表_模板.xlsx",
      searchPlaceholder: "搜索部门 / 科目…",
      emptyHint: "请导入预算表，或下载模板填写",
      defaultHeaders: ["年度", "月份", "部门", "科目", "预算金额", "已用金额", "剩余金额", "备注"],
      sampleRows: [[String(new Date().getFullYear()), "1", "行政部", "办公费", "5000", "1200", "3800", ""]],
      recalcFields: ["预算金额", "已用金额"],
      afterEdit(row, h) {
        if (h === "预算金额" || h === "已用金额") {
          row["剩余金额"] = String(
            Math.round((num(row["预算金额"]) - num(row["已用金额"])) * 100) / 100
          );
        }
      },
      buildSummary(state) {
        let budget = 0,
          used = 0;
        state.rows.forEach((r) => {
          budget += num(r["预算金额"]);
          used += num(r["已用金额"]);
        });
        const left = budget - used;
        return [
          ["预算合计", Math.round(budget * 100) / 100],
          ["已用合计", Math.round(used * 100) / 100],
          ["剩余合计", Math.round(left * 100) / 100],
          ["执行率", budget ? Math.round((used / budget) * 1000) / 10 + "%" : "-"],
        ]
          .map(
            ([l, v]) =>
              `<div class="stats-card"><div class="label">${l}</div><div class="value">${v}</div></div>`
          )
          .join("");
      },
    },
    {
      id: "expense",
      title: "费用统计",
      sheetName: "费用明细",
      templateName: "费用统计_模板.xlsx",
      searchPlaceholder: "搜索费用类型 / 部门 / 项目…",
      emptyHint: "请导入费用明细，或下载模板填写",
      typeField: "费用类型",
      selectFields: {
        费用类型: ["差旅费", "办公费", "招待费", "交通费", "通讯费", "其他", ""],
      },
      defaultHeaders: ["日期", "费用类型", "部门", "项目", "金额", "经办人", "备注"],
      sampleRows: [[today(), "办公费", "行政部", "日常采购", "320", "王五", ""]],
      buildSummary(state) {
        const byType = new Map();
        let total = 0;
        state.rows.forEach((r) => {
          const t = String(r["费用类型"] || "未分类");
          const a = num(r["金额"]);
          total += a;
          byType.set(t, (byType.get(t) || 0) + a);
        });
        const cards = [["费用合计", Math.round(total * 100) / 100], ["笔数", state.rows.length]];
        [...byType.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .forEach(([k, v]) => cards.push([k, Math.round(v * 100) / 100]));
        return cards
          .map(
            ([l, v]) =>
              `<div class="stats-card"><div class="label">${escapeHtml(String(l))}</div><div class="value">${v}</div></div>`
          )
          .join("");
      },
    },
    {
      id: "reimburse",
      title: "报销汇总",
      sheetName: "报销明细",
      templateName: "报销汇总_模板.xlsx",
      searchPlaceholder: "搜索单号 / 申请人 / 部门…",
      emptyHint: "请导入报销明细，或下载模板填写",
      typeField: "状态",
      selectFields: {
        状态: ["待提交", "审批中", "已通过", "已驳回", "已打款", ""],
        费用类型: ["差旅费", "办公费", "招待费", "交通费", "其他", ""],
      },
      defaultHeaders: [
        "申请日期",
        "报销单号",
        "申请人",
        "部门",
        "费用类型",
        "金额",
        "状态",
        "审批人",
        "备注",
      ],
      sampleRows: [[today(), "BX001", "赵六", "销售部", "差旅费", "860", "审批中", "经理", ""]],
      buildSummary(state) {
        const byStatus = new Map();
        let total = 0;
        state.rows.forEach((r) => {
          const s = String(r["状态"] || "未填");
          const a = num(r["金额"]);
          total += a;
          byStatus.set(s, (byStatus.get(s) || 0) + a);
        });
        const cards = [["报销合计", Math.round(total * 100) / 100], ["单据数", state.rows.length]];
        [...byStatus.entries()].forEach(([k, v]) =>
          cards.push([k, Math.round(v * 100) / 100])
        );
        return cards
          .map(
            ([l, v]) =>
              `<div class="stats-card"><div class="label">${escapeHtml(String(l))}</div><div class="value">${v}</div></div>`
          )
          .join("");
      },
    },
  ];

  const books = {};

  function ensurePanels() {
    const host = $("#finance-extra-panels");
    if (!host) return;
    host.innerHTML = "";
    BOOK_DEFS.forEach((def) => {
      const panel = document.createElement("div");
      panel.className = "finance-panel hidden";
      panel.id = `finance-panel-${def.id}`;
      panel.dataset.panel = def.id;
      host.appendChild(panel);
      const book = createSheetBook(def);
      book.mountPanel(panel);
      book.bind();
      books[def.id] = book;
    });
  }

  function getInventoryRows() {
    return global.FinanceApp?.getInventoryState?.()?.rows || [];
  }

  function getInventoryHeaders() {
    return global.FinanceApp?.getInventoryState?.()?.headers || [];
  }

  function pivotSources() {
    return {
      inventory: { name: "进销存明细", headers: getInventoryHeaders(), rows: getInventoryRows() },
      ledger: { name: "财务台账", headers: books.ledger?.getHeaders() || [], rows: books.ledger?.getRows() || [] },
      budget: { name: "预算表", headers: books.budget?.getHeaders() || [], rows: books.budget?.getRows() || [] },
      expense: { name: "费用统计", headers: books.expense?.getHeaders() || [], rows: books.expense?.getRows() || [] },
      reimburse: {
        name: "报销汇总",
        headers: books.reimburse?.getHeaders() || [],
        rows: books.reimburse?.getRows() || [],
      },
    };
  }

  function fillPivotFieldSelects() {
    const src = $("#pivot-source")?.value || "expense";
    const data = pivotSources()[src];
    const headers = data?.headers?.length ? data.headers : ["（无字段）"];
    ["pivot-row", "pivot-col", "pivot-val"].forEach((sid) => {
      const sel = $(`#${sid}`);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = headers.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
      if (headers.includes(cur)) sel.value = cur;
    });
    // sensible defaults
    const row = $("#pivot-row");
    const col = $("#pivot-col");
    const val = $("#pivot-val");
    if (row && headers.includes("费用类型")) row.value = "费用类型";
    else if (row && headers.includes("科目")) row.value = "科目";
    else if (row && headers.includes("部门")) row.value = "部门";
    if (col && headers.includes("部门")) col.value = "部门";
    else if (col && headers.includes("月份")) col.value = "月份";
    else if (col && headers.includes("状态")) col.value = "状态";
    if (val && headers.includes("金额")) val.value = "金额";
    else if (val && headers.includes("借方")) val.value = "借方";
    else if (val && headers.includes("数量")) val.value = "数量";
  }

  function runPivot() {
    const src = $("#pivot-source")?.value || "expense";
    const rowField = $("#pivot-row")?.value;
    const colField = $("#pivot-col")?.value;
    const valField = $("#pivot-val")?.value;
    const agg = $("#pivot-agg")?.value || "sum";
    const data = pivotSources()[src];
    const thead = $("#pivot-thead");
    const tbody = $("#pivot-tbody");
    const empty = $("#pivot-empty");
    const status = $("#pivot-status");
    if (!thead || !tbody) return;
    if (!data?.rows?.length || !rowField || !colField || !valField) {
      thead.innerHTML = "";
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      if (status) status.textContent = "请先在对应 Tab 导入数据，再选择字段分析";
      return;
    }
    empty?.classList.add("hidden");

    const cols = new Set();
    const matrix = new Map(); // rowKey -> Map(colKey -> values[])
    data.rows.forEach((r) => {
      const rk = String(r[rowField] ?? "") || "(空)";
      const ck = String(r[colField] ?? "") || "(空)";
      cols.add(ck);
      if (!matrix.has(rk)) matrix.set(rk, new Map());
      const m = matrix.get(rk);
      if (!m.has(ck)) m.set(ck, []);
      m.get(ck).push(num(r[valField]));
    });
    const colList = [...cols].sort((a, b) => a.localeCompare(b, "zh"));
    const aggFn = (arr) => {
      if (!arr.length) return 0;
      if (agg === "count") return arr.length;
      if (agg === "avg") return Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 100) / 100;
      if (agg === "max") return Math.max(...arr);
      if (agg === "min") return Math.min(...arr);
      return Math.round(arr.reduce((s, x) => s + x, 0) * 100) / 100;
    };

    thead.innerHTML =
      `<tr><th>${escapeHtml(rowField)}</th>` +
      colList.map((c) => `<th>${escapeHtml(c)}</th>`).join("") +
      "<th>合计</th></tr>";

    const rowKeys = [...matrix.keys()].sort((a, b) => a.localeCompare(b, "zh"));
    const colTotals = Object.fromEntries(colList.map((c) => [c, []]));
    tbody.innerHTML = rowKeys
      .map((rk) => {
        const m = matrix.get(rk);
        let rowSum = 0;
        const cells = colList.map((ck) => {
          const v = aggFn(m.get(ck) || []);
          rowSum += agg === "count" ? v : v;
          if (m.has(ck)) colTotals[ck].push(...m.get(ck));
          return `<td>${v}</td>`;
        });
        return `<tr><td>${escapeHtml(rk)}</td>${cells.join("")}<td><b>${
          Math.round(rowSum * 100) / 100
        }</b></td></tr>`;
      })
      .join("");

    // footer totals
    const footCells = colList.map((ck) => `<td><b>${aggFn(colTotals[ck])}</b></td>`).join("");
    const grand = aggFn(colList.flatMap((ck) => colTotals[ck]));
    tbody.innerHTML += `<tr><td><b>合计</b></td>${footCells}<td><b>${grand}</b></td></tr>`;
    if (status) {
      status.textContent = `${data.name} · ${rowKeys.length} 行 × ${colList.length} 列`;
      status.className = "status ok";
    }
  }

  function exportPivot() {
    const table = $("#pivot-table");
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, "数据透视分析.xlsx");
    toast("已导出透视表");
  }

  function bindPivot() {
    $("#pivot-source")?.addEventListener("change", () => {
      fillPivotFieldSelects();
      runPivot();
    });
    ["pivot-row", "pivot-col", "pivot-val", "pivot-agg"].forEach((sid) => {
      $(`#${sid}`)?.addEventListener("change", runPivot);
    });
    $("#pivot-btn-run")?.addEventListener("click", runPivot);
    $("#pivot-btn-export")?.addEventListener("click", exportPivot);
  }

  async function activateBook(id, opts) {
    if (books[id]) await books[id].activate(opts);
  }

  function loadDemoBooks() {
    const y = String(new Date().getFullYear());
    const d = today();
    books.ledger?.setData(BOOK_DEFS[0].defaultHeaders, [
      { 日期: d, 凭证号: "记-001", 摘要: "销售收入", 科目: "主营业务收入", 借方: "", 贷方: "12800", 余额: "12800", 经办人: "张三", 备注: "" },
      { 日期: d, 凭证号: "记-002", 摘要: "采购办公用品", 科目: "管理费用-办公费", 借方: "860", 贷方: "", 余额: "11940", 经办人: "李四", 备注: "" },
    ], { fileName: "财务台账_演示.xlsx" });
    books.budget?.setData(BOOK_DEFS[1].defaultHeaders, [
      { 年度: y, 月份: "1", 部门: "行政部", 科目: "办公费", 预算金额: "5000", 已用金额: "860", 剩余金额: "4140", 备注: "" },
      { 年度: y, 月份: "1", 部门: "销售部", 科目: "差旅费", 预算金额: "20000", 已用金额: "3200", 剩余金额: "16800", 备注: "" },
    ], { fileName: "预算表_演示.xlsx" });
    books.expense?.setData(BOOK_DEFS[2].defaultHeaders, [
      { 日期: d, 费用类型: "办公费", 部门: "行政部", 项目: "文具采购", 金额: "860", 经办人: "李四", 备注: "" },
      { 日期: d, 费用类型: "差旅费", 部门: "销售部", 项目: "客户拜访", 金额: "3200", 经办人: "王五", 备注: "" },
      { 日期: d, 费用类型: "招待费", 部门: "销售部", 项目: "商务宴请", 金额: "1500", 经办人: "王五", 备注: "" },
    ], { fileName: "费用统计_演示.xlsx" });
    books.reimburse?.setData(BOOK_DEFS[3].defaultHeaders, [
      { 申请日期: d, 报销单号: "BX001", 申请人: "赵六", 部门: "销售部", 费用类型: "差旅费", 金额: "860", 状态: "审批中", 审批人: "经理", 备注: "" },
      { 申请日期: d, 报销单号: "BX002", 申请人: "钱七", 部门: "行政部", 费用类型: "办公费", 金额: "320", 状态: "已通过", 审批人: "经理", 备注: "" },
    ], { fileName: "报销汇总_演示.xlsx" });
  }

  function syncExpenseToBudget() {
    const expense = books.expense;
    const budget = books.budget;
    if (!expense || !budget) return { updated: 0 };
    const usedByKey = new Map();
    expense.getRows().forEach((r) => {
      const dept = String(r["部门"] || "").trim();
      const subject = String(r["费用类型"] || r["科目"] || "").trim();
      const key = dept + "\t" + subject;
      usedByKey.set(key, (usedByKey.get(key) || 0) + num(r["金额"]));
    });
    let updated = 0;
    budget.getRows().forEach((r) => {
      const key = String(r["部门"] || "").trim() + "\t" + String(r["科目"] || "").trim();
      if (!usedByKey.has(key)) return;
      r["已用金额"] = String(Math.round(usedByKey.get(key) * 100) / 100);
      r["剩余金额"] = String(
        Math.round((num(r["预算金额"]) - num(r["已用金额"])) * 100) / 100
      );
      updated += 1;
    });
    if (updated) {
      budget.state.dirty = true;
      budget.render();
      budget.state && budget.state;
      // persist via markDirty path
      const snap = budget.getSnapshot();
      budget.setData(snap.headers, snap.rows, { fileName: snap.fileName, dirty: true });
    }
    return { updated };
  }

  function backupAllToWorkbook(inventorySnap) {
    const wb = XLSX.utils.book_new();
    const put = (name, headers, rows) => {
      if (!headers?.length) return;
      const aoa = [headers, ...(rows || []).map((r) => headers.map((h) => r[h] ?? ""))];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));
    };
    if (inventorySnap) put("进销存明细", inventorySnap.headers, inventorySnap.rows);
    BOOK_DEFS.forEach((def) => {
      const b = books[def.id];
      if (!b) return;
      const s = b.getSnapshot();
      put(def.title, s.headers, s.rows);
    });
    XLSX.writeFile(wb, "财务数据备份_" + new Date().toISOString().slice(0, 10) + ".xlsx");
    toast("已导出财务备份");
  }

  async function restoreFromFile(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".json")) {
      const data = JSON.parse(await file.text());
      if (data.inventory && global.FinanceApp?.loadSnapshot) {
        FinanceApp.loadSnapshot(data.inventory);
      }
      (data.books || []).forEach((b) => {
        if (books[b.id]) books[b.id].setData(b.headers, b.rows, { fileName: b.fileName, dirty: true });
      });
      toast("已从 JSON 恢复");
      return;
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const mapSheet = (sheetName, bookId, inv) => {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) return;
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      if (!aoa.length) return;
      const headers = aoa[0].map((h, i) => String(h || "").trim() || `列${i + 1}`);
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
      if (inv && global.FinanceApp?.loadSnapshot) {
        FinanceApp.loadSnapshot({ headers, rows, fileName: file.name });
      } else if (books[bookId]) {
        books[bookId].setData(headers, rows, { fileName: file.name, dirty: true });
      }
    };
    mapSheet("进销存明细", null, true);
    mapSheet("财务台账", "ledger");
    mapSheet("预算表", "budget");
    mapSheet("费用统计", "expense");
    mapSheet("费用明细", "expense");
    mapSheet("报销汇总", "reimburse");
    mapSheet("报销明细", "reimburse");
    toast("已从 Excel 恢复（按工作表名匹配）");
  }

  function initExtraBooks() {
    ensurePanels();
    bindPivot();
  }

  global.FinanceBooks = {
    init: initExtraBooks,
    activate: activateBook,
    activatePivot() {
      fillPivotFieldSelects();
      runPivot();
    },
    bookIds: BOOK_DEFS.map((d) => d.id),
    getBook: (id) => books[id],
    getDefs: () => BOOK_DEFS,
    loadDemoBooks,
    syncExpenseToBudget,
    backupAllToWorkbook,
    restoreFromFile,
    getAllSnapshots() {
      return BOOK_DEFS.map((d) => books[d.id]?.getSnapshot()).filter(Boolean);
    },
  };
})(window);
