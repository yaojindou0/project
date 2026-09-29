/* global PDFLib, pdfjsLib, JSZip, QRCode, mammoth, docx, html2canvas */
(function (global) {
  "use strict";

  const { PDFDocument, rgb, StandardFonts, degrees, PageSizes } = PDFLib;

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadBytes(bytes, filename, mime = "application/pdf") {
    downloadBlob(new Blob([bytes], { type: mime }), filename);
  }

  async function loadPdf(fileOrBytes, password) {
    const bytes =
      fileOrBytes instanceof Uint8Array
        ? fileOrBytes
        : fileOrBytes instanceof ArrayBuffer
          ? new Uint8Array(fileOrBytes)
          : new Uint8Array(await fileOrBytes.arrayBuffer());
    const opts = {};
    if (password) opts.password = password;
    return PDFDocument.load(bytes, { ignoreEncryption: !password, ...opts });
  }

  async function fileToBytes(file) {
    return new Uint8Array(await file.arrayBuffer());
  }

  function parsePageRanges(str, max) {
    if (!str || !String(str).trim()) {
      return Array.from({ length: max }, (_, i) => i);
    }
    const set = new Set();
    String(str)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (part.includes("-")) {
          const [a, b] = part.split("-").map((x) => parseInt(x.trim(), 10));
          const start = Math.max(1, Math.min(a || 1, b || 1));
          const end = Math.min(max, Math.max(a || 1, b || 1));
          for (let i = start; i <= end; i++) set.add(i - 1);
        } else {
          const n = parseInt(part, 10);
          if (n >= 1 && n <= max) set.add(n - 1);
        }
      });
    return [...set].sort((a, b) => a - b);
  }

  async function mergePdfs(files) {
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await loadPdf(f);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    return out.save();
  }

  async function splitPdf(file, mode, options = {}) {
    const src = await loadPdf(file);
    const count = src.getPageCount();
    const results = [];
    if (mode === "each") {
      for (let i = 0; i < count; i++) {
        const doc = await PDFDocument.create();
        const [p] = await doc.copyPages(src, [i]);
        doc.addPage(p);
        results.push({ name: `page-${i + 1}.pdf`, bytes: await doc.save() });
      }
    } else if (mode === "ranges") {
      const ranges = (options.ranges || "1")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      let idx = 1;
      for (const r of ranges) {
        const indices = parsePageRanges(r, count);
        if (!indices.length) continue;
        const doc = await PDFDocument.create();
        const pages = await doc.copyPages(src, indices);
        pages.forEach((p) => doc.addPage(p));
        results.push({ name: `part-${idx++}.pdf`, bytes: await doc.save() });
      }
    } else {
      const size = Math.max(1, parseInt(options.every || "1", 10));
      for (let i = 0; i < count; i += size) {
        const indices = [];
        for (let j = i; j < Math.min(count, i + size); j++) indices.push(j);
        const doc = await PDFDocument.create();
        const pages = await doc.copyPages(src, indices);
        pages.forEach((p) => doc.addPage(p));
        results.push({
          name: `pages-${i + 1}-${i + indices.length}.pdf`,
          bytes: await doc.save(),
        });
      }
    }
    return results;
  }

  async function extractPages(file, rangeStr) {
    const src = await loadPdf(file);
    const indices = parsePageRanges(rangeStr, src.getPageCount());
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, indices);
    pages.forEach((p) => doc.addPage(p));
    return doc.save();
  }

  async function deletePages(file, rangeStr) {
    const src = await loadPdf(file);
    const remove = new Set(parsePageRanges(rangeStr, src.getPageCount()));
    const keep = src.getPageIndices().filter((i) => !remove.has(i));
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, keep);
    pages.forEach((p) => doc.addPage(p));
    return doc.save();
  }

  async function rotatePages(file, angle, rangeStr) {
    const src = await loadPdf(file);
    const targets = new Set(parsePageRanges(rangeStr, src.getPageCount()));
    src.getPages().forEach((page, i) => {
      if (targets.has(i)) {
        const cur = page.getRotation().angle || 0;
        page.setRotation(degrees((cur + angle) % 360));
      }
    });
    return src.save();
  }

  async function reorderPages(file, order) {
    const src = await loadPdf(file);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, order);
    pages.forEach((p) => doc.addPage(p));
    return doc.save();
  }

  async function canvasTextPng(text, size, color = "#666666") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const font = `bold ${size}px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(text || " ");
    const w = Math.ceil(Math.max(metrics.width, 4) + size);
    const h = Math.ceil(size * 1.6);
    canvas.width = w;
    canvas.height = h;
    const ctx2 = canvas.getContext("2d");
    ctx2.font = font;
    ctx2.fillStyle = color;
    ctx2.textBaseline = "top";
    ctx2.fillText(text || " ", size * 0.2, size * 0.2);
    const blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function addWatermark(file, text, opts = {}) {
    const src = await loadPdf(file);
    const opacity = opts.opacity ?? 0.25;
    const size = opts.size ?? 48;
    const png = await canvasTextPng(text || "WATERMARK", size, "#999999");
    const img = await src.embedPng(png);
    src.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      page.drawImage(img, {
        x: width * 0.15,
        y: height * 0.4,
        width: img.width,
        height: img.height,
        opacity,
        rotate: degrees(opts.angle ?? -30),
      });
    });
    return src.save();
  }

  async function addPageNumbers(file, opts = {}) {
    const src = await loadPdf(file);
    const font = await src.embedFont(StandardFonts.Helvetica);
    const pages = src.getPages();
    const total = pages.length;
    const fmt = opts.format || "n / N";
    pages.forEach((page, i) => {
      const { width } = page.getSize();
      const label = fmt.replace(/n/g, String(i + 1)).replace(/N/g, String(total));
      const tw = font.widthOfTextAtSize(label, 10);
      page.drawText(label, {
        x: (width - tw) / 2,
        y: 24,
        size: 10,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    });
    return src.save();
  }

  async function imagesToPdf(files) {
    const doc = await PDFDocument.create();
    for (const f of files) {
      const bytes = await fileToBytes(f);
      let img;
      const type = (f.type || "").toLowerCase();
      const name = (f.name || "").toLowerCase();
      if (type.includes("png") || name.endsWith(".png")) {
        img = await doc.embedPng(bytes);
      } else if (
        type.includes("jpeg") ||
        type.includes("jpg") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg")
      ) {
        img = await doc.embedJpg(bytes);
      } else {
        // convert via canvas
        const bitmap = await createImageBitmap(f);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        const jpg = await new Promise((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", 0.92)
        );
        img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      }
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    return doc.save();
  }

  async function svgToPdf(file) {
    const text = await file.text();
    const blob = new Blob([text], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const imgEl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = imgEl.naturalWidth || 800;
    canvas.height = imgEl.naturalHeight || 600;
    canvas.getContext("2d").drawImage(imgEl, 0, 0);
    URL.revokeObjectURL(url);
    const jpg = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.95)
    );
    return imagesToPdf([new File([jpg], "svg.jpg", { type: "image/jpeg" })]);
  }

  async function ensurePdfJs() {
    if (!global.pdfjsLib) throw new Error("pdf.js 未加载");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  async function renderPageToCanvas(pdf, pageNum, scale = 1.5) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return canvas;
  }

  async function pdfToImages(file, format = "png", scale = 1.5) {
    await ensurePdfJs();
    const data = await fileToBytes(file);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const out = [];
    const mime = format === "jpeg" || format === "jpg" ? "image/jpeg" : "image/png";
    const ext = mime === "image/jpeg" ? "jpg" : "png";
    for (let i = 1; i <= pdf.numPages; i++) {
      const canvas = await renderPageToCanvas(pdf, i, scale);
      const blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b), mime, 0.92)
      );
      out.push({ name: `page-${i}.${ext}`, blob });
    }
    return out;
  }

  async function extractImagesZip(file) {
    const images = await pdfToImages(file, "png", 2);
    const zip = new JSZip();
    images.forEach((img) => zip.file(img.name, img.blob));
    return zip.generateAsync({ type: "blob" });
  }

  async function compressPdf(file, quality = 0.7) {
    // Rasterize at reduced scale then rebuild — practical browser compression
    const images = await pdfToImages(file, "jpeg", quality < 0.5 ? 1 : 1.2);
    const files = images.map(
      (img) => new File([img.blob], img.name, { type: "image/jpeg" })
    );
    return imagesToPdf(files);
  }

  async function rasterizePdf(file, scale = 1.5) {
    return compressPdf(file, scale > 1.2 ? 0.85 : 0.6);
  }

  async function setDocInfo(file, info) {
    const src = await loadPdf(file);
    if (info.title != null) src.setTitle(info.title);
    if (info.author != null) src.setAuthor(info.author);
    if (info.subject != null) src.setSubject(info.subject);
    if (info.keywords != null) src.setKeywords(String(info.keywords).split(",").map((s) => s.trim()));
    if (info.creator != null) src.setCreator(info.creator);
    return src.save();
  }

  async function removeMeta(file) {
    const src = await loadPdf(file);
    src.setTitle("");
    src.setAuthor("");
    src.setSubject("");
    src.setKeywords([]);
    src.setCreator("");
    src.setProducer("");
    return src.save();
  }

  async function overlayPdfs(baseFile, overlayFile, opacity = 0.5) {
    const base = await loadPdf(baseFile);
    const over = await loadPdf(overlayFile);
    const overPages = over.getPages();
    const out = await PDFDocument.create();
    const baseCount = base.getPageCount();
    const n = Math.min(baseCount, overPages.length);
    for (let i = 0; i < baseCount; i++) {
      const [bp] = await out.copyPages(base, [i]);
      out.addPage(bp);
      if (i < n) {
        const [embedded] = await out.embedPages([overPages[i]]);
        const { width, height } = bp.getSize();
        bp.drawPage(embedded, {
          x: 0,
          y: 0,
          width,
          height,
          opacity,
        });
      }
    }
    return out.save();
  }

  async function cropPdf(file, margins) {
    const src = await loadPdf(file);
    const { top = 20, right = 20, bottom = 20, left = 20 } = margins;
    src.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      page.setCropBox(left, bottom, width - left - right, height - top - bottom);
    });
    return src.save();
  }

  async function changePageSize(file, sizeName) {
    const sizes = {
      A4: PageSizes.A4,
      Letter: PageSizes.Letter,
      A3: PageSizes.A3,
      Legal: PageSizes.Legal,
    };
    const target = sizes[sizeName] || PageSizes.A4;
    const src = await loadPdf(file);
    const out = await PDFDocument.create();
    const pages = src.getPages();
    for (let i = 0; i < pages.length; i++) {
      const [embedded] = await out.embedPages([pages[i]]);
      const page = out.addPage(target);
      const [tw, th] = target;
      const scale = Math.min(tw / embedded.width, th / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawPage(embedded, {
        x: (tw - w) / 2,
        y: (th - h) / 2,
        width: w,
        height: h,
      });
    }
    return out.save();
  }

  async function nUp(file, cols = 2, rows = 2) {
    const src = await loadPdf(file);
    const out = await PDFDocument.create();
    const pages = src.getPages();
    const per = cols * rows;
    for (let i = 0; i < pages.length; i += per) {
      const sheet = out.addPage(PageSizes.A4);
      const [sw, sh] = PageSizes.A4;
      const cellW = sw / cols;
      const cellH = sh / rows;
      for (let j = 0; j < per && i + j < pages.length; j++) {
        const [emb] = await out.embedPages([pages[i + j]]);
        const col = j % cols;
        const row = Math.floor(j / cols);
        const scale = Math.min(cellW / emb.width, cellH / emb.height) * 0.92;
        const w = emb.width * scale;
        const h = emb.height * scale;
        const x = col * cellW + (cellW - w) / 2;
        const y = sh - (row + 1) * cellH + (cellH - h) / 2;
        sheet.drawPage(emb, { x, y, width: w, height: h });
      }
    }
    return out.save();
  }

  async function splitHalf(file, direction = "vertical") {
    const src = await loadPdf(file);
    const out = await PDFDocument.create();
    for (const page of src.getPages()) {
      const { width, height } = page.getSize();
      const [emb] = await out.embedPages([page]);
      if (direction === "vertical") {
        const p1 = out.addPage([width / 2, height]);
        p1.drawPage(emb, { x: 0, y: 0, width, height });
        const p2 = out.addPage([width / 2, height]);
        p2.drawPage(emb, { x: -width / 2, y: 0, width, height });
      } else {
        const p1 = out.addPage([width, height / 2]);
        p1.drawPage(emb, { x: 0, y: -height / 2, width, height });
        const p2 = out.addPage([width, height / 2]);
        p2.drawPage(emb, { x: 0, y: 0, width, height });
      }
    }
    return out.save();
  }

  function wrapTextSimple(text, maxChars) {
    const paragraphs = String(text || "").replace(/\r/g, "").split("\n");
    const lines = [];
    for (const para of paragraphs) {
      if (!para) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const ch of para) {
        if (current.length >= maxChars) {
          lines.push(current);
          current = ch;
        } else {
          current += ch;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  async function drawUnicodeText(doc, page, text, x, y, size, color = "#1a1a1a") {
    if (!text) return size * 1.4;
    const png = await canvasTextPng(String(text), size, color);
    const img = await doc.embedPng(png);
    page.drawImage(img, { x, y: y - size * 0.15, width: img.width, height: img.height });
    return img.height;
  }

  async function createTextPdf(text, title = "Document") {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    const fontSize = 14;
    const margin = 50;
    const pageWidth = PageSizes.A4[0];
    const pageHeight = PageSizes.A4[1];
    const maxChars = 42;
    const lines = wrapTextSimple(text, maxChars);
    let page = doc.addPage(PageSizes.A4);
    let y = pageHeight - margin;
    for (const line of lines) {
      if (y < margin + fontSize * 2) {
        page = doc.addPage(PageSizes.A4);
        y = pageHeight - margin;
      }
      if (line) {
        const h = await drawUnicodeText(doc, page, line, margin, y, fontSize);
        y -= h + 4;
      } else {
        y -= fontSize * 1.2;
      }
    }
    return doc.save();
  }

  async function createFormPdf(fields) {
    const doc = await PDFDocument.create();
    const page = doc.addPage(PageSizes.A4);
    const form = doc.getForm();
    await drawUnicodeText(doc, page, fields.title || "可填写表单", 50, 780, 18);
    let y = 730;
    const items = fields.items || ["姓名", "邮箱", "电话", "备注"];
    for (let i = 0; i < items.length; i++) {
      await drawUnicodeText(doc, page, items[i] + ":", 50, y, 12);
      const field = form.createTextField(`field_${i}`);
      field.setText("");
      field.addToPage(page, { x: 140, y: y - 5, width: 350, height: 22 });
      y -= 40;
    }
    return doc.save();
  }

  async function createInvoice(data) {
    const doc = await PDFDocument.create();
    const page = doc.addPage(PageSizes.A4);
    await drawUnicodeText(doc, page, data.title || "发票 / INVOICE", 50, 780, 22);
    await drawUnicodeText(doc, page, `发票号: ${data.no || "INV-001"}`, 50, 750, 12);
    await drawUnicodeText(
      doc,
      page,
      `日期: ${data.date || new Date().toLocaleDateString()}`,
      50,
      728,
      12
    );
    await drawUnicodeText(doc, page, `收款方: ${data.seller || ""}`, 50, 700, 12);
    await drawUnicodeText(doc, page, `付款方: ${data.buyer || ""}`, 50, 678, 12);
    await drawUnicodeText(doc, page, "项目", 50, 640, 13);
    await drawUnicodeText(doc, page, "金额", 400, 640, 13);
    let y = 615;
    for (const it of data.items || [{ name: "服务费", amount: "100.00" }]) {
      await drawUnicodeText(doc, page, String(it.name), 50, y, 12);
      await drawUnicodeText(doc, page, String(it.amount), 400, y, 12);
      y -= 24;
    }
    await drawUnicodeText(doc, page, `合计: ${data.total || ""}`, 350, y - 20, 14);
    return doc.save();
  }

  async function createJobApp(data) {
    const text = [
      "求职申请书",
      "",
      `姓名: ${data.name || ""}`,
      `电话: ${data.phone || ""}`,
      `邮箱: ${data.email || ""}`,
      `应聘岗位: ${data.position || ""}`,
      "",
      "自我介绍:",
      data.intro || "",
      "",
      "工作经历:",
      data.experience || "",
      "",
      "教育背景:",
      data.education || "",
    ].join("\n");
    return createTextPdf(text, "求职申请书");
  }

  async function addTextOverlay(file, text, x, y, pageIndex = 0, size = 14) {
    const src = await loadPdf(file);
    const pages = src.getPages();
    const page = pages[Math.min(pageIndex, pages.length - 1)];
    await drawUnicodeText(
      src,
      page,
      text || "",
      Number(x) || 50,
      Number(y) || 50,
      Number(size) || 14
    );
    return src.save();
  }

  async function redactArea(file, pageIndex, x, y, w, h) {
    const src = await loadPdf(file);
    const page = src.getPages()[pageIndex || 0];
    page.drawRectangle({
      x: Number(x) || 50,
      y: Number(y) || 50,
      width: Number(w) || 120,
      height: Number(h) || 20,
      color: rgb(0, 0, 0),
    });
    return src.save();
  }

  async function addSignatureImage(file, dataUrl, pageIndex, x, y, w, h) {
    const src = await loadPdf(file);
    const pngBytes = dataUrlToBytes(dataUrl);
    const img = await src.embedPng(pngBytes);
    const page = src.getPages()[pageIndex || 0];
    page.drawImage(img, {
      x: Number(x) || 50,
      y: Number(y) || 50,
      width: Number(w) || 150,
      height: Number(h) || 60,
    });
    return src.save();
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function extractText(file) {
    await ensurePdfJs();
    const data = await fileToBytes(file);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n\n";
    }
    return text;
  }

  /** 按 Y 坐标把文本项归并为行 */
  function groupTextItemsIntoLines(items, yTolerance = 3) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !String(it.str).trim()) continue;
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const x = it.transform ? it.transform[4] : 0;
      const y = it.transform ? it.transform[5] : 0;
      const fontSize = it.transform
        ? Math.hypot(it.transform[0], it.transform[1]) || 12
        : 12;
      let row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str: it.str, fontSize, width: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let prevRight = null;
      for (const it of row.items) {
        if (prevRight != null && it.x - prevRight > Math.max(it.fontSize * 0.35, 2)) {
          line += " ";
        }
        line += it.str;
        prevRight = it.x + (it.width || it.str.length * it.fontSize * 0.5);
      }
      const avgSize =
        row.items.reduce((s, it) => s + it.fontSize, 0) / (row.items.length || 1);
      return { text: line.trim(), fontSize: avgSize };
    }).filter((l) => l.text);
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function wPara(text, opts = {}) {
    const size = Math.round((opts.fontSize || 12) * 2); // half-points
    const bold = opts.bold ? "<w:b/>" : "";
    const font = opts.font || "Microsoft YaHei";
    const align = opts.align ? `<w:jc w:val="${opts.align}"/>` : "";
    const before = opts.pageBreakBefore
      ? "<w:pPr><w:pageBreakBefore/>" + align + "</w:pPr>"
      : align
        ? `<w:pPr>${align}</w:pPr>`
        : "";
    if (!text) {
      return `<w:p>${before}</w:p>`;
    }
    return `<w:p>${before}<w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:eastAsia="${escapeXml(font)}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }

  function wImagePara(relId, cxEmu, cyEmu, docPrId) {
    return `<w:p><w:pPr>
  <w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="exact"/>
  <w:ind w:left="0" w:right="0" w:firstLine="0"/>
  <w:jc w:val="left"/>
</w:pPr><w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <wp:extent cx="${cxEmu}" cy="${cyEmu}"/>
  <wp:effectExtent l="0" t="0" r="0" b="0"/>
  <wp:docPr id="${docPrId}" name="Picture ${docPrId}"/>
  <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
  <a:graphic>
    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <pic:pic>
        <pic:nvPicPr>
          <pic:cNvPr id="0" name="image${docPrId}.png"/>
          <pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr>
        </pic:nvPicPr>
        <pic:blipFill>
          <a:blip r:embed="${relId}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </pic:blipFill>
        <pic:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </pic:spPr>
      </pic:pic>
    </a:graphicData>
  </a:graphic>
</wp:inline>
</w:drawing></w:r></w:p>`;
  }

  /**
   * PDF → DOCX（对齐 PDF24：默认精确还原排版与字体）
   * mode: exact | text
   */
  async function pdfToDocx(file, options = {}) {
    const mode = options.mode === "text" ? "text" : "exact";
    await ensurePdfJs();
    const data = await fileToBytes(file);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    if (mode === "text") return pdfToDocxEditableText(pdf);
    return pdfToDocxExactLayout(pdf, options);
  }

  /** 高清整页图 + 与 PDF 一致的纸张尺寸/零边距 → 排版与字体视觉不变 */
  async function pdfToDocxExactLayout(pdf, options = {}) {
    const scale = options.imageScale || 2.5;
    const bodyParts = [];
    const media = [];
    let relIdSeq = 1;
    let imgDocPrId = 1;
    const pageSizes = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const wTwip = Math.round(base.width * 20);
      const hTwip = Math.round(base.height * 20);
      pageSizes.push({ w: wTwip, h: hTwip });

      const canvas = await renderPageToCanvas(pdf, i, scale);
      const blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png")
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const relId = `rIdImg${relIdSeq++}`;
      media.push({ name: `media/page-${i}.png`, bytes, relId });

      const cx = Math.round(base.width * (914400 / 72));
      const cy = Math.round(base.height * (914400 / 72));
      bodyParts.push(wImagePara(relId, cx, cy, imgDocPrId++));

      if (i < pdf.numPages) {
        bodyParts.push(`<w:p><w:pPr><w:sectPr>
          <w:pgSz w:w="${wTwip}" w:h="${hTwip}"/>
          <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/>
        </w:sectPr></w:pPr></w:p>`);
      }
    }

    const last = pageSizes[pageSizes.length - 1] || { w: 11906, h: 16838 };
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="${last.w}" w:h="${last.h}"/>
      <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    return packDocx(documentXml, media);
  }

  async function pdfToDocxEditableText(pdf) {
    const bodyParts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = groupTextItemsIntoLinesWithFont(content.items);
      if (i > 1) bodyParts.push(wPara("", { pageBreakBefore: true }));
      if (!lines.length) {
        bodyParts.push(
          wPara("（本页无可提取文字。请使用「精确还原」模式以保持排版与字体。）", {
            fontSize: 11,
          })
        );
        continue;
      }
      for (const line of lines) {
        bodyParts.push(
          wPara(line.text, {
            fontSize: Math.min(Math.max(Math.round(line.fontSize), 9), 36),
            bold: line.fontSize >= 16,
            font: mapPdfFontName(line.fontName),
          })
        );
      }
    }
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
    return packDocx(documentXml, []);
  }

  function groupTextItemsIntoLinesWithFont(items, yTolerance = 3) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !String(it.str).trim()) continue;
      const x = it.transform ? it.transform[4] : 0;
      const y = it.transform ? it.transform[5] : 0;
      const fontSize = it.transform
        ? Math.hypot(it.transform[0], it.transform[1]) || 12
        : 12;
      let row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({
        x,
        str: it.str,
        fontSize,
        width: it.width || 0,
        fontName: it.fontName || "",
      });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows
      .map((row) => {
        row.items.sort((a, b) => a.x - b.x);
        let line = "";
        let prevRight = null;
        const fonts = {};
        for (const it of row.items) {
          if (
            prevRight != null &&
            it.x - prevRight > Math.max(it.fontSize * 0.35, 2)
          ) {
            line += " ";
          }
          line += it.str;
          prevRight = it.x + (it.width || it.str.length * it.fontSize * 0.5);
          fonts[it.fontName] = (fonts[it.fontName] || 0) + it.str.length;
        }
        const fontName = Object.keys(fonts).sort(
          (a, b) => fonts[b] - fonts[a]
        )[0];
        const avgSize =
          row.items.reduce((s, it) => s + it.fontSize, 0) /
          (row.items.length || 1);
        return { text: line.trim(), fontSize: avgSize, fontName };
      })
      .filter((l) => l.text);
  }

  function mapPdfFontName(raw) {
    const n = String(raw || "").toLowerCase();
    if (!n) return "Microsoft YaHei";
    if (n.includes("simsun") || n.includes("song")) return "SimSun";
    if (n.includes("simhei") || n.includes("hei")) return "SimHei";
    if (n.includes("kaiti") || n.includes("kai")) return "KaiTi";
    if (n.includes("fangsong")) return "FangSong";
    if (n.includes("yahei")) return "Microsoft YaHei";
    if (n.includes("arial")) return "Arial";
    if (n.includes("times")) return "Times New Roman";
    if (n.includes("courier")) return "Courier New";
    if (n.includes("calibri")) return "Calibri";
    if (n.includes("helvetica")) return "Arial";
    return "Microsoft YaHei";
  }

  async function packDocx(documentXml, media) {
    const hasPng = media.some((m) => m.name.endsWith(".png"));
    const hasJpg = media.some(
      (m) => m.name.endsWith(".jpg") || m.name.endsWith(".jpeg")
    );
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasJpg ? '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/>' : ""}
  ${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const docRelsItems = media
      .map(
        (m) =>
          `<Relationship Id="${m.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name}"/>`
      )
      .join("\n");
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${docRelsItems}
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes);
    zip.folder("_rels").file(".rels", rels);
    const word = zip.folder("word");
    word.file("document.xml", documentXml);
    word.folder("_rels").file("document.xml.rels", docRels);
    for (const m of media) word.file(m.name, m.bytes);

    return zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  /**
   * Word → PDF：docx-preview 按原排版/字体渲染后截图写入 PDF
   */
  async function docxToPdf(file, options = {}) {
    if (!global.docx || typeof docx.renderAsync !== "function") {
      throw new Error("docx-preview 未加载，无法按原排版转换");
    }
    if (!global.html2canvas) {
      throw new Error("html2canvas 未加载");
    }

    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-14000px;top:0;background:#fff;z-index:-1;pointer-events:none;";
    const styleBox = document.createElement("div");
    const bodyBox = document.createElement("div");
    host.appendChild(styleBox);
    host.appendChild(bodyBox);
    document.body.appendChild(host);

    try {
      await docx.renderAsync(await file.arrayBuffer(), bodyBox, styleBox, {
        className: "docx",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        useBase64URL: true,
      });

      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 150));

      let pages = [...bodyBox.querySelectorAll("section.docx")];
      if (!pages.length) {
        pages = [...bodyBox.querySelectorAll(".docx-wrapper > section")];
      }
      if (!pages.length) {
        const wrap = bodyBox.querySelector(".docx-wrapper") || bodyBox;
        pages = [wrap];
      }

      const out = await PDFDocument.create();
      const scale = options.scale || 2;

      for (const pageEl of pages) {
        const canvas = await html2canvas(pageEl, {
          scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const blob = await new Promise((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", 0.95)
        );
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const cssW = pageEl.offsetWidth || canvas.width / scale;
        const cssH = pageEl.offsetHeight || canvas.height / scale;
        const pageW = (cssW * 72) / 96;
        const pageH = (cssH * 72) / 96;
        const pdfPage = out.addPage([pageW, pageH]);
        pdfPage.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
      }
      return out.save();
    } finally {
      host.remove();
    }
  }

  async function pdfToHtml(file) {
    const text = await extractText(file);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PDF</title></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
  }

  async function pdfToMarkdown(file) {
    const text = await extractText(file);
    return "# 从 PDF 提取\n\n" + text;
  }

  async function pdfToCsv(file) {
    const text = await extractText(file);
    return text
      .split(/\n+/)
      .map((line) =>
        line
          .split(/\s{2,}|\t/)
          .map((c) => `"${c.replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function officeToPdf(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".docx")) {
      return docxToPdf(file);
    }
    if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".md")) {
      const text = await file.text();
      return createTextPdf(text, file.name);
    }
    throw new Error("仅支持 DOCX / CSV / TXT。");
  }

  async function mdToPdf(md) {
    const plain = String(md || "")
      .replace(/^#+\s*/gm, "")
      .replace(/[*_`]/g, "");
    return createTextPdf(plain, "Markdown");
  }

  async function convertImage(files, mime) {
    const out = [];
    for (const f of files) {
      const bitmap = await createImageBitmap(f);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b), mime, 0.92)
      );
      const ext = mime.includes("png") ? "png" : "jpg";
      out.push({
        name: (f.name.replace(/\.[^.]+$/, "") || "image") + "." + ext,
        blob,
      });
    }
    return out;
  }

  async function pdfToSvg(file) {
    const images = await pdfToImages(file, "png", 1.5);
    const svgs = [];
    for (const img of images) {
      const url = URL.createObjectURL(img.blob);
      const dim = await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve({ w: i.width, h: i.height });
        i.src = url;
      });
      const b64 = await blobToDataUrl(img.blob);
      URL.revokeObjectURL(url);
      const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${dim.w}" height="${dim.h}"><image href="${b64}" width="${dim.w}" height="${dim.h}"/></svg>`;
      svgs.push({
        name: img.name.replace(/\.png$/, ".svg"),
        blob: new Blob([svg], { type: "image/svg+xml" }),
      });
    }
    return svgs;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  async function flattenViaRaster(file) {
    return rasterizePdf(file, 1.5);
  }

  async function repairPdf(file) {
    const src = await loadPdf(file);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    try {
      out.setTitle(src.getTitle() || "");
      out.setAuthor(src.getAuthor() || "");
    } catch (_) {}
    return out.save();
  }

  function genPassword(len = 16, opts = {}) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const nums = "23456789";
    const syms = "!@#$%^&*-_=+";
    let chars = "";
    if (opts.upper !== false) chars += upper;
    if (opts.lower !== false) chars += lower;
    if (opts.nums !== false) chars += nums;
    if (opts.syms) chars += syms;
    if (!chars) chars = upper + lower + nums;
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => chars[n % chars.length]).join("");
  }

  async function zipFiles(items) {
    const zip = new JSZip();
    for (const it of items) {
      zip.file(it.name, it.bytes || it.blob);
    }
    return zip.generateAsync({ type: "blob" });
  }

  async function makeQrPdf(text) {
    const canvas = document.createElement("canvas");
    const content = text || "https://example.com";
    if (global.QRCode && typeof QRCode.toCanvas === "function") {
      await QRCode.toCanvas(canvas, content, { width: 256, margin: 2 });
    } else {
      // fallback: draw placeholder text box
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#111";
      ctx.font = "14px sans-serif";
      ctx.fillText("QR: " + content.slice(0, 28), 12, 128);
    }
    const blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
    const pdfBytes = await imagesToPdf([
      new File([blob], "qr.png", { type: "image/png" }),
    ]);
    return { pdfBytes, pngBlob: blob };
  }

  global.PdfOps = {
    downloadBlob,
    downloadBytes,
    loadPdf,
    parsePageRanges,
    mergePdfs,
    splitPdf,
    extractPages,
    deletePages,
    rotatePages,
    reorderPages,
    addWatermark,
    addPageNumbers,
    imagesToPdf,
    svgToPdf,
    pdfToImages,
    extractImagesZip,
    compressPdf,
    rasterizePdf,
    setDocInfo,
    removeMeta,
    overlayPdfs,
    cropPdf,
    changePageSize,
    nUp,
    splitHalf,
    createTextPdf,
    createFormPdf,
    createInvoice,
    createJobApp,
    addTextOverlay,
    redactArea,
    addSignatureImage,
    extractText,
    pdfToDocx,
    docxToPdf,
    pdfToHtml,
    pdfToMarkdown,
    pdfToCsv,
    officeToPdf,
    mdToPdf,
    convertImage,
    pdfToSvg,
    flattenViaRaster,
    repairPdf,
    genPassword,
    zipFiles,
    makeQrPdf,
    renderPageToCanvas,
    ensurePdfJs,
    fileToBytes,
  };
})(window);
