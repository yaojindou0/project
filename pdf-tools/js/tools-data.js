/**
 * 仅保留浏览器本地可真实完成的工具
 */
window.PDF24_TOOLS = [
  // —— 编辑 ——
  { id: "edit-pdf", name: "PDF添加文字", desc: "在页面上叠加文字", cat: "edit", icon: "✏️", kind: "single", impl: "edit" },
  { id: "create-form", name: "创建可填写PDF表单", desc: "创建 PDF 表单", cat: "edit", icon: "📋", kind: "generate", impl: "create-form" },
  { id: "watermark", name: "添加水印", desc: "添加文字水印", cat: "edit", icon: "💧", kind: "single", impl: "watermark" },
  { id: "page-numbers", name: "添加页码", desc: "为每一页添加页码", cat: "edit", icon: "🔢", kind: "single", impl: "page-numbers" },
  { id: "overlay", name: "PDF叠加", desc: "将两个 PDF 页面叠加", cat: "edit", icon: "📚", kind: "multi", impl: "overlay" },
  { id: "crop-pdf", name: "裁剪PDF", desc: "裁剪 PDF 页面边距", cat: "edit", icon: "✂️", kind: "single", impl: "crop" },
  { id: "page-size", name: "更改页面大小", desc: "调整为 A4 / Letter 等", cat: "edit", icon: "📐", kind: "single", impl: "page-size" },
  { id: "doc-info", name: "修改文档信息", desc: "编辑标题、作者等元数据", cat: "edit", icon: "ℹ️", kind: "single", impl: "doc-info" },
  { id: "job-application", name: "创建求职申请书", desc: "填写信息生成求职 PDF", cat: "edit", icon: "💼", kind: "generate", impl: "job-app" },
  { id: "create-invoice", name: "创建发票", desc: "填写信息生成发票 PDF", cat: "edit", icon: "🧾", kind: "generate", impl: "invoice" },
  { id: "qrcode", name: "生成二维码", desc: "生成二维码并导出 PDF/PNG", cat: "edit", icon: "⬛", kind: "generate", impl: "qrcode" },

  // —— 整理 ——
  { id: "merge-pdf", name: "PDF合并", desc: "合并多个 PDF", cat: "organize", icon: "📑", kind: "multi", impl: "merge" },
  { id: "split-pdf", name: "PDF拆分", desc: "拆分 PDF", cat: "organize", icon: "✂️", kind: "single", impl: "split" },
  { id: "reorder", name: "页面重排", desc: "拖拽调整页面顺序", cat: "organize", icon: "🔀", kind: "single", impl: "reorder" },
  { id: "delete-pages", name: "删除页面", desc: "删除指定页面", cat: "organize", icon: "🗑️", kind: "single", impl: "delete-pages" },
  { id: "extract-pages", name: "提取页面", desc: "提取指定页面", cat: "organize", icon: "📌", kind: "single", impl: "extract-pages" },
  { id: "rotate", name: "旋转页面", desc: "旋转全部或指定页面", cat: "organize", icon: "🔄", kind: "single", impl: "rotate" },
  { id: "n-up", name: "多页合一", desc: "多页拼到一页（N-up）", cat: "organize", icon: "▦", kind: "single", impl: "n-up" },
  { id: "split-half", name: "页面裁切为两半", desc: "左右或上下对半切开", cat: "organize", icon: "⏸️", kind: "single", impl: "split-half" },

  // —— 优化 ——
  { id: "compress-pdf", name: "PDF压缩", desc: "压缩 PDF", cat: "optimize", icon: "🗜️", kind: "single", impl: "compress" },
  { id: "rasterize", name: "栅格化PDF", desc: "将页面转为图像再生成 PDF", cat: "optimize", icon: "🖨️", kind: "single", impl: "rasterize" },

  // —— 安全 ——
  { id: "sign-pdf", name: "PDF签署", desc: "添加手写签名", cat: "security", icon: "✍️", kind: "single", impl: "sign" },
  { id: "redact", name: "PDF涂黑", desc: "涂黑指定区域", cat: "security", icon: "⬛", kind: "single", impl: "redact" },
  { id: "remove-meta", name: "移除元数据", desc: "清除标题、作者等信息", cat: "security", icon: "🧹", kind: "single", impl: "remove-meta" },
  { id: "gen-password", name: "生成密码", desc: "生成安全随机密码", cat: "security", icon: "🔑", kind: "generate", impl: "gen-password" },

  // —— 转为 PDF ——
  { id: "images-to-pdf", name: "图片转PDF", desc: "图片转 PDF", cat: "to-pdf", icon: "🖼️", kind: "images", impl: "images-to-pdf" },
  { id: "jpg-to-pdf", name: "JPG转PDF", desc: "JPG 转 PDF", cat: "to-pdf", icon: "📷", kind: "images", impl: "images-to-pdf", accept: "image/jpeg,.jpg,.jpeg" },
  { id: "png-to-pdf", name: "PNG转PDF", desc: "PNG 转 PDF", cat: "to-pdf", icon: "🖼️", kind: "images", impl: "images-to-pdf", accept: "image/png,.png" },
  { id: "webp-to-pdf", name: "WEBP转PDF", desc: "WEBP 转 PDF", cat: "to-pdf", icon: "🌐", kind: "images", impl: "images-to-pdf", accept: "image/webp,.webp" },
  { id: "svg-to-pdf", name: "SVG转PDF", desc: "SVG 转 PDF", cat: "to-pdf", icon: "🖋️", kind: "images", impl: "svg-to-pdf", accept: "image/svg+xml,.svg" },
  { id: "camera-to-pdf", name: "用摄像头创建PDF", desc: "拍照并生成 PDF", cat: "to-pdf", icon: "📷", kind: "camera", impl: "camera" },
  { id: "docx-to-pdf", name: "Word转PDF", desc: "按原排版与字体导出 PDF", cat: "to-pdf", icon: "📘", kind: "single", impl: "docx-to-pdf", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { id: "text-to-pdf", name: "文本转PDF", desc: "纯文本转 PDF", cat: "to-pdf", icon: "📃", kind: "text", impl: "create-text" },
  { id: "md-to-pdf", name: "Markdown转PDF", desc: "Markdown 转 PDF", cat: "to-pdf", icon: "⬇️", kind: "text", impl: "md-to-pdf" },
  { id: "csv-to-pdf", name: "CSV转PDF", desc: "CSV 文本转 PDF", cat: "to-pdf", icon: "📗", kind: "single", impl: "office-to-pdf", accept: ".csv,text/csv,text/plain" },

  // —— 从 PDF 转换 ——
  { id: "pdf-to-word", name: "PDF转Word", desc: "精确还原排版与字体", cat: "from-pdf", icon: "📘", kind: "single", impl: "pdf-to-docx" },
  { id: "pdf-to-image", name: "PDF转图像", desc: "导出为图片", cat: "from-pdf", icon: "🎨", kind: "single", impl: "pdf-to-images" },
  { id: "pdf-to-jpg", name: "PDF转JPG", desc: "导出为 JPG", cat: "from-pdf", icon: "📷", kind: "single", impl: "pdf-to-images", format: "jpeg" },
  { id: "pdf-to-png", name: "PDF转PNG", desc: "导出为 PNG", cat: "from-pdf", icon: "🖼️", kind: "single", impl: "pdf-to-images", format: "png" },
  { id: "pdf-to-svg", name: "PDF转SVG", desc: "页面图包装为 SVG", cat: "from-pdf", icon: "🖋️", kind: "single", impl: "pdf-to-svg" },
  { id: "pdf-to-text", name: "PDF转文本", desc: "提取已有文字层", cat: "from-pdf", icon: "📃", kind: "single", impl: "pdf-to-text" },
  { id: "pdf-to-html", name: "PDF转HTML", desc: "导出为 HTML", cat: "from-pdf", icon: "🌐", kind: "single", impl: "pdf-to-html" },
  { id: "pdf-to-md", name: "PDF转Markdown", desc: "导出为 Markdown", cat: "from-pdf", icon: "⬇️", kind: "single", impl: "pdf-to-md" },
  { id: "pdf-to-csv", name: "PDF转CSV", desc: "按行导出为 CSV", cat: "from-pdf", icon: "📗", kind: "single", impl: "pdf-to-csv" },

  // —— 转换图像 ——
  { id: "webp-jpg", name: "WEBP转JPG", desc: "WEBP → JPG", cat: "image-convert", icon: "🌐", kind: "images", impl: "img-convert", to: "image/jpeg" },
  { id: "webp-png", name: "WEBP转PNG", desc: "WEBP → PNG", cat: "image-convert", icon: "🌐", kind: "images", impl: "img-convert", to: "image/png" },
];

window.PDF24_CATEGORIES = [
  { id: "from-pdf", name: "从PDF转换", dynamic: false },
  { id: "to-pdf", name: "转换为PDF", dynamic: false },
  { id: "edit", name: "编辑", dynamic: false },
  { id: "organize", name: "整理", dynamic: false },
  { id: "optimize", name: "优化", dynamic: false },
  { id: "security", name: "安全与隐私", dynamic: false },
  { id: "image-convert", name: "转换图像", dynamic: false },
];
