/**
 * 高德标准日间样式（严格对齐参考截图）
 * - z10–12 区域图：#f7f7f7 底 · #c5e1f5 水系 · #c8e6c9 绿地 · 橙高速白边 · 灰虚线铁路 · 彩标 POI
 * - z14–15 城区详图：#f2f2f2 底 · 白路网灰边 · 地铁白边分色 · 建筑灰面 · POI 彩标+#2c3e6b 标注
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    var api = factory();
    root.AMapGaodeStyle = api;
    root.AMapOlStyle = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var COLORS = {
    land: "#f7f7f7",
    urbanLand: "#f2f3f7",
    water: "#c5e1f5",
    waterUrban: "#a3c6ff",
    waterStroke: "#93b8f5",
    waterLine: "#a8cce8",
    green: "#c8e6c9",
    greenPark: "#b6eba3",
    greenDeep: "#66bb6a",
    greenStroke: "#a5d6a7",
    urban: "#f2f3f7",
    urbanStroke: "#e8eaed",
    scenic: "#b6eba3",
    edu: "#e3eaf6",
    business: "#e5dcf5",
    health: "#fce4ec",
    parking: "#e4e8eb",
    sportPad: "#79d5c0",
    sportBorder: "#79d5c0",
    sportTrack: "#79d5c0",
    sportCourt: "#fbaa8f",
    sportField: "#b6eba3",
    poiBlue: "#448aff",
    poiNature: "#43a047",
    labelGate: "#448aff",
    wall: "#d8c4a0",
    wallStroke: "#c4ae88",
    buildingFill: "#e4e8eb",
    buildingStroke: "#d0d4d8",
    buildingLabel: "#555555",
    buildingLabelMuted: "#888888",
    /* 道路：对齐截图橙/黄/白层级 */
    highway: "#ff9e3d",
    highwayCasing: "#d88830",
    national: "#ffe082",
    nationalCasing: "#e0c070",
    provincial: "#fff6c9",
    provincialCasing: "#e8d890",
    secondary: "#ffe5a3",
    secondaryCasing: "#e0d090",
    tertiary: "#ffffff",
    tertiaryCasing: "#d1d1d1",
    local: "#ffffff",
    localCasing: "#d1d1d1",
    path: "#f0f0ee",
    pathCasing: "#d8d8d4",
    subway: "#00c2d3",
    metroCorridor: "#7bc5cd",
    metroCorridorFill: "rgba(123,197,205,0.38)",
    metroExit: "#f5c842",
    metroExitText: "#333333",
    metroStationIcon: "#1e88e5",
    railway: "#888888",
    railwayCasing: "rgba(255,255,255,0.92)",
    hsr: "#c0b8b8",
    hsrCasing: "#c0b8b8",
    hsrFill: "#ffffff",
    trainStation: "#3b79c4",
    metroStation: "#c8102e",
    metroStationOuter: "#ffffff",
    borderNation: "#e53935",
    borderForeign: "#a0a0a0",
    borderProvince: "#8a8a8a",
    borderCity: "#cccccc",
    borderCounty: "#d8c0c8",
    borderTown: "#dcc8d0",
    label: "#37474f",
    labelUrban: "#37474f",
    labelMuted: "#666666",
    labelRoad: "#555555",
    labelHalo: "#ffffff",
    labelGreen: "#2e7d32",
    adminLabel: "#333333",
    chinaLabel: "#e53935",
    waterLabel: "#6eb5e0",
    cityDot: "#e53935",
    shieldGreen: "#4caf50",
    shieldRed: "#ef7777",
    shieldYellow: "#fbdc80",
  };

  /** 地铁线分色（西安线网：1红 2橙 3粉 4青 5浅绿 6蓝） */
  var SUBWAY_PALETTE = [
    "#c8102e",
    "#ef8200",
    "#ce70cc",
    "#2ccaa0",
    "#afcb37",
    "#6cbede",
    "#007aff",
    "#a64d9b",
    "#66bb6a",
    "#ef5350",
    "#5c6bc0",
    "#26c6da",
  ];

  var XIAN_SUBWAY = {
    1: "#c8102e",
    2: "#f6c344",
    3: "#ce70cc",
    4: "#4cd1c3",
    5: "#afcb37",
    6: "#6cbede",
  };

  /** POI：公园/运动/大门/停车等（对齐高德参考图色板） */
  var POI = {
    nature: { bg: "#43a047", glyph: "tree", text: "#2e7d32", size: 11 },
    culture: { bg: "#9e7b6b", glyph: "temple", text: "#6d4c41", size: 11 },
    amusement: { bg: "#ec407a", glyph: "star", text: "#c2185b", size: 11 },
    transport: { bg: "#3b79c4", glyph: "bus", text: "#1565c0", size: 11 },
    busstop: { bg: "#26a69a", glyph: "bus", text: "#333333", size: 10 },
    trafficlight: { bg: "#ffffff", glyph: "trafficlight", text: "#333333", size: 9 },
    train: { bg: "#3b79c4", glyph: "train", text: "#1565c0", size: 12 },
    airport: { bg: "#3b79c4", glyph: "airport", text: "#1565c0", size: 12 },
    edu: { bg: "#448aff", glyph: "edu", text: "#333333", size: 11 },
    shop: { bg: "#ab47bc", glyph: "bag", text: "#333333", size: 11 },
    food: { bg: "#ff8f45", glyph: "food", text: "#ef6c00", size: 11 },
    health: { bg: "#ef5350", glyph: "cross", text: "#e53935", size: 11 },
    charging: { bg: "#43a047", glyph: "charging", text: "#2e7d32", size: 10 },
    carwash: { bg: "#78909c", glyph: "carwash", text: "#333333", size: 10 },
    restroom: { bg: "#9c27b0", glyph: "restroom", text: "#666666", size: 9 },
    sport: { bg: "#448aff", glyph: "sport", text: "#448aff", size: 10 },
    stadium: { bg: "#448aff", glyph: "stadium", text: "#448aff", size: 11 },
    soccer: { bg: "#448aff", glyph: "soccer", text: "#448aff", size: 11 },
    basketball: { bg: "#448aff", glyph: "basketball", text: "#448aff", size: 11 },
    tennis: { bg: "#448aff", glyph: "tennis", text: "#448aff", size: 11 },
    swim: { bg: "#448aff", glyph: "swim", text: "#448aff", size: 11 },
    gate: { bg: "#448aff", glyph: "gate", text: "#333333", size: 10 },
    toll: { bg: "#ff8f45", glyph: "gate", text: "#333333", size: 10 },
    parking: { bg: "#448aff", glyph: "parking", text: "#448aff", size: 10 },
    hotel: { bg: "#5c6bc0", glyph: "bed", text: "#333333", size: 11 },
    gov: { bg: "#e53935", glyph: "star", text: "#e53935", size: 11 },
    residential: { bg: "#ef9a9a", glyph: "house", text: "#555555", size: 11 },
    bank: { bg: "#546e7a", glyph: "bank", text: "#333333", size: 10 },
    metro: { bg: "#ffffff", glyph: "metro", text: "#333333", size: 11 },
    default: { bg: "#90a4ae", glyph: "dot", text: "#333333", size: 10 },
  };

  /** 12024 瓦片 POI：subKey 与名称互补分类 */
  function matchPoi12024SubKey(subKey, name) {
    var sk = Number(subKey);
    var nm = String(name || "").trim();
    if ([1372, 1373, 1374, 1375].indexOf(sk) >= 0) return "parking";
    if ([850, 71, 72].indexOf(sk) >= 0) return "carwash";
    if ([26, 27, 28, 1250].indexOf(sk) >= 0) return "gate";
    if ([8, 9].indexOf(sk) >= 0) return "nature";
    if ([1114, 1074, 704, 1188].indexOf(sk) >= 0) return "health";
    if ([1363, 39, 40, 41].indexOf(sk) >= 0) return "charging";
    if ([1210, 1191, 1420, 1421].indexOf(sk) >= 0) return "gov";
    if ([672, 675, 676, 1260, 1262, 561, 1210].indexOf(sk) >= 0) return "edu";
    if ([340, 412].indexOf(sk) >= 0) return "food";
    if ([846, 340].indexOf(sk) >= 0) return "shop";
    if ([63, 66].indexOf(sk) >= 0 && /酒店|宾馆|客栈/.test(nm)) return "hotel";
    if (/网球|体育馆|运动馆|体育场/.test(nm)) return "stadium";
    return null;
  }

  var iconCache = {};
  var spriteImageCache = {};

  /** 屏幕 POI 图标尺寸（px，比参考图略大） */
  var POI_ICON_SCALE = 1.18;

  function scalePoiIconSize(size) {
    if (size == null || size === "") return size;
    var n = Number(size);
    if (isNaN(n)) return size;
    return Math.max(10, Math.round(n * POI_ICON_SCALE));
  }

  /** POI 雪碧图（对齐 style.json：64px→512 宽；128px→icons_64） */
  var SPRITE_BASE = "";
  var SPRITE_SHEETS = {
    icons_9: {
      file: "icons_9.png",
      columns: 8,
      cell: 64,
      cellH: 64,
      width: 512,
      height: 1024,
      /* 高德 icons_9：bottom-center 锚点，塔类底部对准坐标 */
      anchor: [0.5, 1],
      display: 42,
    },
    icons_poi: {
      file: "icons_poi.png",
      columns: 8,
      cell: 64,
      width: 512,
      height: 1024,
      anchor: [0.5, 0.5],
    },
    icons_brand: {
      file: "icons_brand.png",
      columns: 8,
      cell: 64,
      width: 512,
      height: 1024,
      anchor: [0.5, 0.5],
    },
    icons_64: {
      file: "icons_64.png",
      columns: 4,
      cell: 128,
      width: 512,
      height: 1024,
      anchor: [0.5, 0.5],
      minZoom: 16,
    },
  };

  /** 名胜地标 → icons_9 格子序号（1 起，高德 aA 算法） */
  var LANDMARK_ICON_9 = [
    [/故宫|紫禁城|天安门/, 1],
    [/鸟巢|国家体育场/, 2],
    [/央视|中央电视台|大裤衩/, 3],
    [/东方明珠/, 4],
    [/天坛/, 5],
    [/上海中心|环球金融中心|金茂大厦/, 6],
    [/广州塔|小蛮腰/, 7],
    [/水立方|国家游泳中心/, 9],
    [/兵马俑|秦始皇陵|秦始皇帝陵/, 10],
    [/黄鹤楼/, 12],
    [/迪士尼|欢乐谷|世界公园|主题乐园|方特/, 14],
    [/熊猫基地|大熊猫/, 23],
    [/动物园/, 23],
    [/大雁塔/, 25],
    [/小雁塔/, 25],
    [/大唐芙蓉园/, 27],
    [/大唐不夜城|不夜城/, 27],
    [/陕西历史博物馆|历史博物馆/, 27],
    [/青龙寺$/, 27],
    [/世博园|世博会|世博/, 26],
    [/华清池|大明宫|钟楼|鼓楼|法门寺|碑林|城墙/, 27],
    [/张家界|天门山/, 28],
    [/清真寺|清真大寺/, 29],
    [/布达拉宫/, 30],
  ];

  /** 连锁品牌 → icons_brand 格子序号 */
  var BRAND_ICON = [
    [/7-?11|Seven.?Eleven|便利蜂/, 2],
    [/肯德基|KFC/, 3],
    [/麦当劳|McDonald/, 4],
    [/屈臣氏|Watsons/, 5],
    [/苹果|Apple Store|Apple零售|Apple$/, 6],
    [/必胜客|Pizza Hut/, 7],
    [/星巴克|Starbucks/, 8],
    [/工商银行|ICBC/, 9],
    [/中国银行/, 10],
    [/建设银行|CCB/, 11],
    [/农业银行|ABC/, 12],
    [/邮政储蓄|邮储银行/, 13],
    [/中石化|Sinopec/, 17],
    [/中石油|PetroChina|昆仑好客|中国石油/, 18],
    [/壳牌|Shell/, 19],
    [/中国联通|Unicom/, 20],
    [/中国电信|Telecom/, 21],
    [/中国移动|China Mobile/, 22],
    [/延长石油/, 18],
  ];

  /** 无 brand 格时的 icons_poi 回退（如华为） */
  var BRAND_POI_FALLBACK = [[/华为|Huawei|HUAWEI/, 23]];

  /** POI 分类 → icons_poi 格子序号 */
  var POI_KIND_ICON = {
    culture: 1,
    edu: 2,
    nature: 43,
    amusement: 14,
    train: 91,
    airport: 90,
    transport: 95,
    busstop: 95,
    food: 35,
    shop: 27,
    health: 59,
    charging: 99,
    carwash: 84,
    restroom: 80,
    sport: 14,
    stadium: 11,
    soccer: 10,
    basketball: 14,
    tennis: 7,
    swim: 9,
    gate: 81,
    toll: 110,
    parking: 85,
    hotel: 26,
    gov: 63,
    bank: 57,
    residential: 51,
    default: 51,
  };

  /** 高德 aA 雪碧图坐标（与 icons_9 一致，修正 id 为列数倍时的行号） */
  function iconClipOriginAmap(iconId, columnNum, cellW, cellH) {
    var id = Math.max(1, parseInt(iconId, 10) || 1);
    var cols = columnNum || 8;
    var cw = cellW || 64;
    var ch = cellH != null ? cellH : cw;
    var row = Math.floor(id / cols);
    if (id % cols === 0) row--;
    var col = id - cols * row - 1;
    return [col * cw, row * ch];
  }

  function iconClipOrigin(iconId, columns, cellSize) {
    return iconClipOriginAmap(iconId, columns, cellSize, cellSize);
  }

  function matchLandmarkIcon9(name) {
    var nm = String(name || "").trim();
    if (!nm) return 0;
    for (var i = 0; i < LANDMARK_ICON_9.length; i++) {
      if (LANDMARK_ICON_9[i][0].test(nm)) return LANDMARK_ICON_9[i][1];
    }
    return 0;
  }

  /** 仅真正名胜用 icons_9；街道/社区/公园等名称排除 */
  function shouldUseLandmarkIcon9(name, kind) {
    var nm = String(name || "").trim();
    var id = matchLandmarkIcon9(nm);
    if (!id) return false;
    if (
      /街道|社区|居委会|村委会|委员会|服务站|办事处|分院|门诊|校区|分校|支行|营业厅|停车场|出入口|民宿|酒店|宾馆|超市|便利店/.test(
        nm
      )
    )
      return false;
    if (/^西安市/.test(nm) && nm.length > 14 && !/(景区|公园|博物|遗址|塔|寺|庙|陵|城墙)/.test(nm))
      return false;
    if (kind === "gov" || kind === "edu" || kind === "health" || kind === "residential") return false;
    if (kind === "nature" && !/(景区|遗址|博物|塔|寺|庙|陵|城墙|不夜城|芙蓉园|兵马俑|故宫|天坛)/.test(nm))
      return false;
    return true;
  }

  function matchBrandIcon(name, kind) {
    var nm = String(name || "").trim();
    if (!nm) return 0;
    for (var i = 0; i < BRAND_ICON.length; i++) {
      if (BRAND_ICON[i][0].test(nm)) return BRAND_ICON[i][1];
    }
    return 0;
  }

  function matchBrandPoiFallback(name) {
    var nm = String(name || "").trim();
    if (!nm) return 0;
    for (var i = 0; i < BRAND_POI_FALLBACK.length; i++) {
      if (BRAND_POI_FALLBACK[i][0].test(nm)) return BRAND_POI_FALLBACK[i][1];
    }
    return 0;
  }

  /** 医院（z13 起） vs 诊所/药店（z15 起） */
  function isHospitalPoi(name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (/诊所|卫生所|卫生服务|门诊|医务|药房|药店|医生|卫生站|社区卫生|服务站/.test(nm)) return false;
    return /医院|附院|医科|妇幼|儿童医学|中心医|人民医|协和|肿瘤|胸科|骨伤|眼科|口腔/.test(nm);
  }

  function isClinicPoi(name) {
    var nm = String(name || "").trim();
    return /诊所|卫生所|卫生服务|门诊|医务|药房|药店|医生|卫生站|社区卫生/.test(nm);
  }

  /** 大型商场/连锁（z14 起）；小商铺 z15+ */
  function isMajorShop(name) {
    var nm = String(name || "").trim();
    if (matchBrandIcon(nm) || matchBrandPoiFallback(nm)) return true;
    return /商场|购物|万达|SKP|大悦城|万象城|百货|购物中心|天街|赛格|奥特莱斯|商业广场|永辉|沃尔玛|家乐福|专卖|银泰/.test(
      nm
    );
  }

  /** POI 显示优先级：1 核心 → 4 最迟 */
  function poiDisplayTier(category, name) {
    var nm = String(name || "").trim();
    if (matchLandmarkIcon9(nm)) return 2;
    if (category === "train" || category === "airport" || category === "metro") return 1;
    if (category === "gov" || category === "edu") return 1;
    if (category === "health" && isHospitalPoi(nm)) return 1;
    if (category === "nature" || category === "culture" || category === "amusement") {
      if (isImportantLandmark(category === "amusement" ? "nature" : category, nm)) return 1;
      return 2;
    }
    if (category === "shop" && isMajorShop(nm)) return 2;
    if (category === "stadium") return 2;
    if (category === "shop" || category === "hotel" || category === "health") return 3;
    if (
      category === "food" ||
      category === "charging" ||
      category === "bank" ||
      category === "residential" ||
      category === "sport"
    )
      return 4;
    return 3;
  }

  /** 枢纽/一级政府：提前显示，不受密度抽稀 */
  function poiEarlyCivic(category, name) {
    return (
      category === "train" ||
      category === "airport" ||
      (category === "gov" && isMajorGovPoi(name))
    );
  }

  /** 学校/医院/酒店：仅按瓦片 minZoom/maxZoom，不做样式分级 */
  function isTileMinZoomCategory(category) {
    return category === "edu" || category === "health" || category === "hotel";
  }

  function poiFollowsTileMinZoom(category, feature) {
    return isTileMinZoomCategory(category) || featureHasTileZoomAttrs(feature);
  }

  /** 一级政府/公检法（z12+） */
  function isMajorGovPoi(name) {
    var nm = String(name || "").trim();
    if (!nm || isMinorGovPoi(nm)) return false;
    if (/人民政府|区政府|市政府|县政府|镇政府|公安厅|公安局$|法院|检察院|税务局|政务大厅|政务服务中心$/.test(nm))
      return true;
    if (/政府/.test(nm) && nm.length <= 12) return true;
    return false;
  }

  /** 街道服务中心/项目部等细政务（z18+） */
  function isMinorGovPoi(name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    return /服务中心|党群|项目部|改造办公室|事务所|执法队|保障中心|服务点|便民|管理所|工作站|联络站|调解委员会|退役军人/.test(
      nm
    );
  }

  /** 店铺/小公司/学生公寓等（仅最大级别） */
  function isDeferredMiscPoi(category, name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (category === "gov" && isMinorGovPoi(nm)) return true;
    if (isCompanyPoi(nm)) return true;
    if (category === "edu" && /公寓|宿舍|住宅楼|研究生楼|博士生/.test(nm)) return true;
    if (category === "shop" || category === "food" || category === "hotel") return true;
    if (category === "health" && (isClinicPoi(nm) || !isHospitalPoi(nm))) return true;
    return false;
  }

  function poiTierMinZoom(tier, category, name) {
    var cat = category || "";
    var nm = String(name || "").trim();
    if (tier === 1) {
      if (cat === "train" || cat === "airport") return MIN_HUB_POI_Z;
      if (cat === "gov") return 12;
      return MIN_SCENIC_LABEL_Z;
    }
    if (tier === 2) {
      if (cat === "nature" || cat === "culture" || cat === "amusement") return MIN_SCENIC_LABEL_Z;
      return 14;
    }
    if (tier === 3) return 15;
    return 16;
  }

  /** 公司/厂矿等：图中不显示（图标+标注一并隐藏） */
  function isCompanyPoi(name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (matchBrandIcon(nm) || matchBrandPoiFallback(nm)) return false;
    if (
      /加油站|银行|酒店|宾馆|超市|商场|医院|学校|诊所|药店|公园|景区|派出所|公安|村民委员会|居委会|电信|移动|联通|石油|石化/.test(
        nm
      )
    )
      return false;
    if (/有限公司|有限责任|股份有限|集团有限|科技有限|实业|制造厂|制衣厂|电缆/.test(nm)) return true;
    if (/厂$/.test(nm) && !/电厂|水厂|垃圾厂|处理厂/.test(nm)) return true;
    if (/公司/.test(nm)) return true;
    if (/葡萄园|种植基地|养殖场/.test(nm)) return true;
    return false;
  }

  /** 公交站/停车/出入口/收费站：仅图标、无标注 */
  function isIconOnlyPoi(category, name) {
    if (
      category === "parking" ||
      category === "busstop" ||
      category === "gate" ||
      category === "toll"
    )
      return true;
    var nm = String(name || "");
    if (/收费站|收费站出入口/.test(nm)) return true;
    if (
      category === "transport" &&
      (/出入口/.test(nm) ||
        /^\d+号门$/.test(nm) ||
        /^[东南西北]{1,2}\d*门$/.test(nm) ||
        /^(正|大|侧)?门$/.test(nm))
    )
      return true;
    return false;
  }

  /** 仅图标类 POI 的渲染分类（用于 icons_poi 取图） */
  function iconOnlyRenderKind(category, name) {
    var nm = String(name || "");
    if (/收费站/.test(nm) || category === "toll") return "toll";
    if (/停车/.test(nm) || category === "parking") return "parking";
    if (/公交/.test(nm) || category === "busstop") return "busstop";
    if (
      category === "gate" ||
      /出入口/.test(nm) ||
      /^\d+号门$/.test(nm) ||
      /^[东南西北]{1,2}\d*门$/.test(nm) ||
      /^(正|大|侧)?门$/.test(nm)
    )
      return "gate";
    return category;
  }

  function matchPoiKindIcon(kind, name) {
    var nm = String(name || "").trim();
    if (/收费站|收费/.test(nm)) return 110;
    if (/入口/.test(nm) && !/出入口/.test(nm)) return 113;
    if (/出口/.test(nm) && !/出入口/.test(nm)) return 112;
    if (/出入口|门$|大门/.test(nm)) return 81;
    if (/博物馆|博物院|纪念馆|文物|遗址博物馆/.test(nm)) return 57;
    if (/大雁塔|小雁塔|钟楼|鼓楼|兵马俑|故宫|天坛/.test(nm)) return 52;
    if (/寺|庙|祠|庵|观$|青龙寺|清真/.test(nm)) return 52;
    if (/动物园|海洋馆|水族/.test(nm)) return 46;
    if (/公园|景区|森林|湿地|遗址|名胜|乐游原/.test(nm)) return 43;
    if (/欢乐谷|欢乐世界|游乐园|主题乐园/.test(nm)) return 14;
    if (/加油|加油站|油气/.test(nm)) return 97;
    if (/停车/.test(nm)) return 85;
    if (/公交/.test(nm)) return 95;
    if (/ATM/i.test(nm)) return 74;
    if (/影剧院|电影|影院|影城/.test(nm)) return 29;
    if (/咖啡|茶馆/.test(nm)) return 37;
    return POI_KIND_ICON[kind] || POI_KIND_ICON.default;
  }

  function resolvePoiSpriteRef(mainKey, subKey, name, kind) {
    var brandId = matchBrandIcon(name, kind);
    if (brandId) return { sheet: "icons_brand", iconId: brandId };

    var brandPoi = matchBrandPoiFallback(name);
    if (brandPoi) return { sheet: "icons_poi", iconId: brandPoi };

    return { sheet: "icons_poi", iconId: matchPoiKindIcon(kind, name) };
  }

  function getSpriteIcon(sheetKey, iconId, displaySize, ol) {
    var sheet = SPRITE_SHEETS[sheetKey];
    if (!sheet) return null;
    var id = Math.max(1, parseInt(iconId, 10) || 1);
    var cacheKey = "spr_" + sheetKey + "_" + id + "_" + displaySize;
    if (iconCache[cacheKey]) return iconCache[cacheKey];

    var cell = sheet.cell;
    var offset = iconClipOriginAmap(id, sheet.columns, cell, sheet.cellH || cell);
    var scale = displaySize / cell;
    var icon = new ol.style.Icon({
      src: SPRITE_BASE + sheet.file,
      size: [cell, sheet.cellH || cell],
      offset: offset,
      imgSize: [sheet.width, sheet.height],
      scale: scale,
      anchor: sheet.anchor || [0.5, 0.5],
    });
    iconCache[cacheKey] = icon;
    return icon;
  }

  /** icons_9 大图标：独立裁剪/锚点（bottom-center，canvas 绘制避免 OL 裁切） */
  function getLandmarkIcon9(iconId, displaySize, ol) {
    var sheet = SPRITE_SHEETS.icons_9;
    if (!sheet) return null;
    var id = Math.max(1, parseInt(iconId, 10) || 1);
    var disp = displaySize != null ? displaySize : sheet.display || 42;
    var cacheKey = "lm9c_" + id + "_" + disp;
    if (iconCache[cacheKey]) return iconCache[cacheKey];

    var img = spriteImageCache.icons_9;
    if (!img || !img.complete || !img.naturalWidth) {
      return getSpriteIcon("icons_poi", matchPoiKindIcon("culture", ""), Math.min(disp, 16), ol);
    }

    var cellW = sheet.cell;
    var cellH = sheet.cellH || cellW;
    var off = iconClipOriginAmap(id, sheet.columns, cellW, cellH);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var canvas = document.createElement("canvas");
    canvas.width = Math.ceil(disp * dpr);
    canvas.height = Math.ceil(disp * dpr);
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, off[0], off[1], cellW, cellH, 0, 0, disp * dpr, disp * dpr);
    var icon = canvasToIcon(canvas, ol, 1 / dpr, sheet.anchor);
    iconCache[cacheKey] = icon;
    return icon;
  }

  function resolvePoiSpriteIcon(mainKey, subKey, name, kind, size, ol, zoom) {
    /* 全部小图标：icons_poi / icons_brand，不使用 icons_9 / icons_64 */

    /* 肯德基/麦当劳/苹果等 → icons_brand */
    var brandId = matchBrandIcon(name, kind);
    if (brandId) return getSpriteIcon("icons_brand", brandId, size, ol);
    var brandPoi = matchBrandPoiFallback(name);
    if (brandPoi) return getSpriteIcon("icons_poi", brandPoi, size, ol);

    /* 公交站/停车/出入口/收费站：固定 icons_poi，仅图标 */
    var iconOnlyKind = iconOnlyRenderKind(kind, name);
    if (
      kind === "parking" ||
      kind === "busstop" ||
      kind === "gate" ||
      kind === "toll" ||
      isIconOnlyPoi(kind, name)
    ) {
      return getSpriteIcon("icons_poi", matchPoiKindIcon(iconOnlyKind, name), size, ol);
    }

    if (
      kind === "trafficlight" ||
      kind === "amusement" ||
      kind === "airport" ||
      kind === "edu" ||
      kind === "health" ||
      kind === "gov" ||
      kind === "metro"
    )
      return null;
    var ref = resolvePoiSpriteRef(mainKey, subKey, name, kind);
    return getSpriteIcon("icons_poi", ref.iconId, size, ol);
  }

  /** 预加载雪碧图并缓存 Image，供 icons_9 canvas 裁剪 */
  function preloadSpriteSheets(base) {
    var prefix = base != null ? base : SPRITE_BASE;
    Object.keys(SPRITE_SHEETS).forEach(function (key) {
      var sheet = SPRITE_SHEETS[key];
      if (!sheet || !sheet.file) return;
      if (spriteImageCache[key] && spriteImageCache[key].src) return;
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.src = prefix + sheet.file;
      spriteImageCache[key] = img;
    });
  }

  /**
   * canvas → Icon。必须用 dataURL 作 src：
   * OL8 在仅传 img:canvas 时会把 getUid(canvas) 当成 src，clone 时会请求 /project/28266 等 404。
   */
  function canvasToIcon(canvas, ol, scale, anchor) {
    return new ol.style.Icon({
      src: canvas.toDataURL(),
      scale: scale != null ? scale : 1,
      anchor: anchor || [0.5, 0.5],
    });
  }

  /** 高德：公园/绿地由 region 面标注，10008 等点状 POI 不单独打点 */
  function isRegionBackedParkPoi(mainKey, subKey, name, category) {
    var mk = Number(mainKey);
    var sk = Number(subKey);
    var nm = String(name || "");
    if (mk === 10008) return true;
    if (category !== "nature" && category !== "culture") return false;
    if (!/公园|湿地|森林|绿地|风景区|遗址公园|生态园|郊野公园/.test(nm)) return false;
    if (mk === 10007 && hasSub(sk, [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62]))
      return true;
    if (mk === 10001 || mk === 10010) {
      if (hasSub(sk, [14, 69, 100, 101, 102, 4, 12, 38, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 120, 167, 171, 188, 189, 190, 191, 192]))
        return true;
    }
    return false;
  }

  /** 高 zoom 叠加瓦片 POI（12024）：按分级门槛，非白名单默认不显示 */
  function isOverlayDetailPoiBlocked(feature, zoom) {
    var mk = Number(feature.get ? feature.get("mainKey") : feature.mainKey);
    if (mk !== 12024) return false;
    if (zoom == null) return false;
    var name = feature.get ? feature.get("name") : feature.name;
    var subKey = feature.get ? feature.get("subKey") : feature.subKey;
    var cat = matchPoi(mk, subKey, name || "");
    var nm = String(name || "").trim();

    if (isCommunityOrCampusPoi(cat, nm) || isMallNamePoi(cat, nm))
      return zoom < MIN_POI_COMMUNITY_Z;

    if (poiFollowsTileMinZoom(cat, feature)) return !poiTileZoomVisible(feature, cat);

    if (poiEarlyCivic(cat, nm)) {
      var gmin = poiCategoryMinZoom(cat);
      return gmin != null && zoom < gmin;
    }
    if (cat === "metro") return zoom < MIN_METRO_STATION_Z;
    if (isMajorScenicPoi(cat, nm)) return zoom < MIN_SCENIC_LABEL_Z;
    if (isTileZoomGatedPoi(cat, nm)) return !poiTileZoomVisible(feature, cat);
    return true;
  }

  function hasSub(subKey, list) {
    if (!list || !list.length) return true;
    return list.indexOf(Number(subKey)) !== -1;
  }

  function subwayColor(subKey) {
    var sk = Math.abs(Number(subKey) || 0);
    if (XIAN_SUBWAY[sk]) return XIAN_SUBWAY[sk];
    return SUBWAY_PALETTE[sk % SUBWAY_PALETTE.length];
  }

  /** z10–12 区域图（咸阳/泾阳级：橙高速白边 · 浅蓝河名 · 彩标 POI） */
  function isRegionalZoom(zoom) {
    return zoom != null && zoom >= 10 && zoom <= 12;
  }

  /** z14–15 城区详图（运动公园/行政中心级） */
  function isUrbanDetailZoom(zoom) {
    return zoom != null && zoom >= 14 && zoom <= 15;
  }

  /** z14–17 公园详图：湖泊/运动场/大门/停车等 */
  function isParkDetailZoom(zoom) {
    return zoom != null && zoom >= 14 && zoom <= 17;
  }

  function subwayCorridorFill(subKey, alpha) {
    var hex = subwayColor(subKey);
    if (hex.charAt(0) === "#" && hex.length >= 7) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return "rgba(" + r + "," + g + "," + b + "," + (alpha != null ? alpha : 0.22) + ")";
    }
    return "rgba(0,194,211,0.38)";
  }

  /** 出口通道 subKey：优先瓦片合并时关联的最近地铁线 */
  function metroCorridorSubKey(feature, subKey) {
    if (feature && feature.get) {
      var linked = feature.get("corridorSubKey");
      if (linked != null && linked !== "") return linked;
    }
    return subKey;
  }

  function styleMetroCorridor(subKey, zoom, ol, mode, feature) {
    var color = subwayColor(subKey);
    var Style = ol.style.Style;
    var Fill = ol.style.Fill;
    var Stroke = ol.style.Stroke;
    var zFill = featureDrawZIndex(feature, 34);
    var zLine = featureLineZIndex(feature, 36);
    if (mode === "polygon") {
      return new Style({
        zIndex: zFill,
        fill: new Fill({ color: subwayCorridorFill(subKey) }),
        stroke: new Stroke({
          color: color,
          width: 0.6,
          lineJoin: "round",
        }),
      });
    }
    var corridorW = scaleByZoom(5.0, zoom, 14);
    return new Style({
      zIndex: zLine,
      stroke: new Stroke({
        color: color,
        width: corridorW,
        lineCap: "round",
        lineJoin: "round",
      }),
    });
  }

  function matchRegion(mainKey, subKey) {
    var mk = Number(mainKey),
      sk = Number(subKey);
    if (mk === 30001) {
      if (hasSub(sk, [6, 2, 11, 13])) return "water";
      if (hasSub(sk, [3, 7, 8, 9, 10, 12, 37])) return "green";
      return "land";
    }
    if (mk === 30002) {
      if (hasSub(sk, [3, 31])) return "edu";
      if (hasSub(sk, [9, 10, 13, 19, 20, 21, 34, 37, 39])) return "sport";
      if (hasSub(sk, [5, 33, 41])) return "scenic";
      if (hasSub(sk, [7, 35])) return "culture";
      if (hasSub(sk, [8, 36])) return "health";
      if (hasSub(sk, [11, 23, 24, 25, 26, 27, 28, 29, 30, 38])) return "business";
      if (hasSub(sk, [1])) return "parking";
      if (hasSub(sk, [6, 14, 40])) return "transportHub";
      if (hasSub(sk, [4, 12, 22, 32, 42, 43])) return "public";
      return "urban";
    }
    if (mk === 30003) return "subwayYard";
    if (mk === 30004) return "urban";
    if (mk === 30005) return "edu";
    return "land";
  }

  function matchRoad(mainKey, subKey) {
    var mk = Number(mainKey),
      sk = Number(subKey);
    if (mk === 20014) return "waterline";
    if (mk === 20001) return "highway";
    if (mk === 20002) return "ring";
    if (mk === 20003) return "national";
    if (mk === 20004) return "provincial";
    if (mk === 20005 || mk === 20006 || mk === 20007 || mk === 20031 || mk === 20032)
      return "secondary";
    if (mk === 20008) return "tertiary";
    if (mk === 20009 || mk === 20026) return "local";
    if (mk === 20010) return hasSub(sk, [2]) ? "hsr" : "railway";
    if (mk === 20015 || mk === 20019) return "subway";
    if (mk === 20012 || mk === 20013) return "link";
    if (mk === 20018 || mk === 20023) return "buildingRoad";
    if (mk === 20011 || mk === 20017 || mk === 20020 || mk === 20024 || mk === 20028)
      return "path";
    return "local";
  }

  function matchBoundary(subKey) {
    var sk = Number(subKey);
    if (hasSub(sk, [1, 2, 9])) return "nation";
    if (hasSub(sk, [3, 4, 8, 10, 11, 14, 16])) return "foreign";
    if (hasSub(sk, [5, 6, 7, 12])) return "province";
    if (hasSub(sk, [13, 15, 17, 18])) return "city";
    if (hasSub(sk, [19, 20, 21, 22])) return "county";
    /* 未识别的 20016 按省界显示，保证国/省级可见 */
    return "province";
  }

  /**
   * 行政区名 10002（合并 amap.js districtsname 两处 styleMap）
   * 国 18/19/20/29 · 省 1/3/4/22/26/30/32/33/34
   * 省会 2/31 · 地级市 5/7/24/25/27/35 · 区县 6/8/37 · 乡镇 9 · 村 17
   */
  function matchAdminLabel(subKey) {
    var sk = Number(subKey);
    if (hasSub(sk, [20])) return "continent";
    if (hasSub(sk, [18, 19, 29])) return "country";
    if (hasSub(sk, [1, 3, 4, 22, 26, 30, 32, 33, 34])) return "province";
    if (hasSub(sk, [2, 31, 24, 35])) return "capital";
    if (hasSub(sk, [5, 7, 25, 27])) return "city";
    if (hasSub(sk, [6, 8, 37])) return "county";
    if (hasSub(sk, [9])) return "town";
    if (hasSub(sk, [17])) return "village";
    if (hasSub(sk, [13, 38])) return "waterName";
    return "city";
  }

  function matchPoi(mainKey, subKey, name) {
    var mk = Number(mainKey),
      sk = Number(subKey);
    var nm = String(name || "").trim();

    function fromName() {
      if (!nm) return null;
      if (
        /^[东南西北]{1,2}\d*门$|^\d+号门$|出入口|^(正|大|侧)?门$/.test(nm)
      )
        return "gate";
      if (/收费站/.test(nm)) return "toll";
      if (/停车/.test(nm)) return "parking";
      if (/机场|航站楼|飞机场|国际机场/.test(nm)) return "airport";
      if (/高铁站|火车站|动车站|客运站|北站|南站|东站|西站|[东西南北]站$|高铁|火车/.test(nm)) return "train";
      if (/公交站|公交|巴士站|巴士/.test(nm)) return "busstop";
      if (/红绿灯|信号灯/.test(nm)) return "trafficlight";
      if (/充电|充电桩/.test(nm)) return "charging";
      if (/洗车/.test(nm)) return "carwash";
      if (/卫生间|厕所|公厕|WC/i.test(nm)) return "restroom";
      if (/酒店|宾馆|客栈|民宿|旅馆|全季/.test(nm)) return "hotel";
      if (/银行|ATM/i.test(nm)) return "bank";
      if (/大学|学院|中学|小学|学校|幼儿园|附中|党校|研究院|国际课程|托育/.test(nm)) return "edu";
      if (/医院|诊所|卫生院|卫生服务|门诊|医务|医生|药房|药店/.test(nm)) return "health";
      if (/科技园|产业园|工业园|物流园|创意园|软件园|创业园|孵化器|示范基地/.test(nm)) return "residential";
      if (/小区|家属院|安置小区|生活小区|城中村|社区$/.test(nm)) return "residential";
      if (
        /景园|林语|九里|花苑|御园|馨园|融园|麓园|溪园|海棠|橡树|华润|金地|保利|万科|碧桂园|恒大|绿地|中海|龙湖|融创|阳光城|曲江|雁翔|海伦|逸园|别苑|佳苑|雅苑|名苑|锦园|翠园|香榭|澜山|国际城|缇香|风笛|等驾坡|千户|国风/.test(
          nm
        ) &&
        !/公园|商场|广场|酒店|医院|学校|大学|幼儿园|服务中心|项目部/.test(nm)
      )
        return "residential";
      if (/[·・]/.test(nm) && nm.length <= 18 && !/酒店|医院|学校|商场|超市|餐厅|火锅|银行|公园|景区/.test(nm))
        return "residential";
      if (
        /政府|居委会|村委会|村民委员会|街道办|派出所|公安|法院|检察院|管理局|事务中心|服务中心|教育厅|公路局|交警|交通警察|交通管理/.test(
          nm
        )
      )
        return "gov";
      if (/商场|购物|万达|SKP|大悦城|万象城|百货|超市|便利店|商城|购物中心|天街|赛格|专卖|美容|快递|速运/.test(nm))
        return "shop";
      if (/加油站|加油/.test(nm)) return "shop";
      if (/肯德基|麦当劳|星巴克|必胜客|华为|Apple|苹果/.test(nm)) return "shop";
      if (/欢乐谷|欢乐世界|游乐园|主题乐园|迪士尼|方特|海昌|水上乐园|不夜城/.test(nm)) return "amusement";
      if (/书店|图书/.test(nm)) return "culture";
      if (/体育馆|体育场|运动馆|网球俱乐部|场馆/.test(nm)) return "stadium";
      if (/足球/.test(nm)) return "soccer";
      if (/篮球/.test(nm)) return "basketball";
      if (/网球/.test(nm)) return "tennis";
      if (/游泳/.test(nm)) return "swim";
      if (/动物园|植物园|海洋馆|水族/.test(nm)) return "nature";
      if (/景区|旅游|名胜|遗址|文旅|公园|森林公园|湿地公园|沙苑|猿人|芙蓉园|亲水|步道/.test(nm))
        return "nature";
      if (/博物馆|博物院|纪念馆|文物|大雁塔|小雁塔|钟楼|鼓楼|城墙|庙$|寺$/.test(nm)) return "culture";
      if (/餐厅|饭店|火锅|烧烤|面馆|小吃|美食|咖啡|茶/.test(nm)) return "food";
      /* 小区名靠后，避免误伤「不夜城/商场」等 */
      if (
        /小区|公寓|公馆|家园|印象|丽兹|融创|阳光城|生活小区/.test(nm) ||
        (/苑$|邸$|花园$|府$|湾$|里$|庭$|居$|第$/.test(nm) &&
          !/公园|商场|广场|乐园|植物园|动物园/.test(nm))
      )
        return "residential";
      return null;
    }

    if (mk === 10002) return "admin";
    if (mk === 10005 || mk === 10006) return "metro";
    if (mk >= 11000 && mk < 12000) return "transport";
    if (mk === 10009) return "transport";
    if (mk === 10008) return "nature";
    if (mk === 10004) {
      if ([3, 9, 13, 19, 21, 22, 23].indexOf(sk) >= 0) return "parking";
      if ([6, 16].indexOf(sk) >= 0) return "health";
      if ([8, 18].indexOf(sk) >= 0) return "shop";
      if ([1, 5, 11, 15].indexOf(sk) >= 0) return "culture";
      if ([12].indexOf(sk) >= 0) return "gov";
      if ([7, 17].indexOf(sk) >= 0) return "sport";
      if ([4, 10, 14, 20].indexOf(sk) >= 0) return "transport";
      return fromName() || "default";
    }
    if (mk === 10007) {
      if (sk === 174) return "tennis";
      if (sk === 171) return "swim";
      if (sk === 172 || sk === 173) return "stadium";
      if ([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62].indexOf(sk) >= 0) return "nature";
    }
    if (mk === 10001 || mk === 10010) {
      if (sk === 2) return "trafficlight";
      if (sk === 24) return "busstop";
      if (sk === 26) return "train";
      if ([23, 176, 177, 178].indexOf(sk) >= 0) return "transport";
      if (sk === 25) return "transport";
      if ([27, 28, 149, 150].indexOf(sk) >= 0) return "gate";
      if (sk === 59) return "restroom";
      if ([9, 133, 134, 135, 136].indexOf(sk) >= 0) return "hotel";
      if ([39, 40, 41, 151, 152, 153].indexOf(sk) >= 0) {
        if (/洗车/.test(nm)) return "carwash";
        if (/充电|充电桩|超级充电|能源|电动/.test(nm)) return "charging";
        return "charging";
      }
      if ([71, 72].indexOf(sk) >= 0) return "carwash";
      if ([42, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].indexOf(sk) >= 0) return "bank";
      if ([14, 69, 100, 101, 102, 4, 12, 38, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 120, 167, 171, 188, 189, 190, 191, 192].indexOf(sk) >= 0)
        return "nature";
      if ([15, 16, 17, 124, 125, 126, 127, 128].indexOf(sk) >= 0) return "stadium";
      if (sk === 129) return "basketball";
      if (sk === 130) return "soccer";
      if ([70, 1114, 1074].indexOf(sk) >= 0) return "health";
      if ([19, 20, 22, 114, 115, 116, 117, 118, 119].indexOf(sk) >= 0) return "food";
      if ([7, 68, 82, 83, 84, 85, 93, 94, 98].indexOf(sk) >= 0) return "shop";
      if ([10, 11, 13, 35, 138, 139, 140, 141, 142, 143, 163, 164, 165, 166, 170].indexOf(sk) >= 0)
        return "culture";
      if ([5, 74, 75, 76, 77, 78, 79].indexOf(sk) >= 0) return "gov";
      if ([672, 675, 676, 1260, 1262, 561].indexOf(sk) >= 0) return "edu";
      if ([63, 66, 1372].indexOf(sk) >= 0) return /酒店|宾馆/.test(nm) ? "hotel" : fromName() || "residential";
      if ([37, 60, 61, 62, 73, 180, 181, 182, 184, 185, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 213, 214].indexOf(sk) >= 0)
        return "sport";
      var named = fromName();
      if (named) return named;
    }
    if (mk >= 12000 && mk < 13000) {
      if (mk === 12024) {
        var hit24 = fromName() || matchPoi12024SubKey(sk, nm);
        if (hit24) return hit24;
        return "default";
      }
      var byName = fromName();
      if (byName) return byName;
      if (sk <= 20) return "gov";
      if (sk <= 40) return "food";
      if (sk <= 60) return "shop";
      if (sk <= 80) return "edu";
      if (sk <= 100) return "nature";
      if (sk <= 120) return "culture";
      if (sk <= 140) return "health";
      if (sk <= 160) return "transport";
      if (sk <= 180) return "sport";
      if (sk <= 200) return "hotel";
      if (sk <= 220) return "bank";
    }
    return fromName() || "default";
  }

  function matchSportRegion(subKey) {
    var sk = Number(subKey);
    /* 外圈青蓝底（跑道/场区垫层） */
    if (hasSub(sk, [19, 20, 21, 37, 39])) return "sportTrack";
    /* 内圈珊瑚色（篮球/网球场等） */
    if (hasSub(sk, [9, 10, 34])) return "sportCourt";
    /* 足球场草绿（含 subKey 13 等） */
    if (hasSub(sk, [13])) return "sportField";
    return "sportField";
  }

  var REGION_STYLE = {
    land: { fill: COLORS.land, stroke: null, width: 0, z: 0 },
    green: { fill: COLORS.green, stroke: COLORS.greenStroke, width: 0.3, z: 1 },
    scenic: { fill: COLORS.scenic, stroke: COLORS.greenStroke, width: 0.3, z: 1 },
    edu: { fill: COLORS.edu, stroke: null, width: 0, z: 2 },
    culture: { fill: "#efe0f5", stroke: null, width: 0, z: 2 },
    health: { fill: COLORS.health, stroke: null, width: 0, z: 2 },
    business: { fill: COLORS.business, stroke: null, width: 0, z: 2 },
    parking: { fill: COLORS.parking, stroke: "#cfd8dc", width: 0.35, z: 2 },
    transportHub: { fill: "#eef1f5", stroke: null, width: 0, z: 2 },
    public: { fill: COLORS.edu, stroke: null, width: 0, z: 2 },
    urban: { fill: COLORS.urban, stroke: null, width: 0, z: 2 },
    subwayYard: { fill: "#dceeea", stroke: null, width: 0, z: 2 },
    /* 水系必须在绿地之上，否则公园大绿面会盖住湖泊 */
    water: { fill: COLORS.water, stroke: COLORS.waterStroke, width: 0.5, z: 6 },
    sportTrack: { fill: COLORS.sportTrack, stroke: null, width: 0, z: 7 },
    sportCourt: { fill: COLORS.sportCourt, stroke: COLORS.sportBorder, width: 0.8, z: 9 },
    sportField: { fill: COLORS.sportField, stroke: COLORS.sportBorder, width: 0.6, z: 8 },
    wall: { fill: COLORS.wall, stroke: COLORS.wallStroke, width: 0.8, z: 8 },
  };

  var ROAD_STYLE = {
    highway: { casing: COLORS.highwayCasing, fill: COLORS.highway, cw: 6.4, fw: 4.8, z: 40 },
    ring: { casing: COLORS.highwayCasing, fill: COLORS.highway, cw: 5.8, fw: 4.2, z: 38 },
    national: { casing: COLORS.nationalCasing, fill: COLORS.national, cw: 5.0, fw: 3.6, z: 36 },
    provincial: { casing: COLORS.provincialCasing, fill: COLORS.provincial, cw: 4.4, fw: 3.2, z: 34 },
    secondary: { casing: COLORS.secondaryCasing, fill: COLORS.secondary, cw: 3.6, fw: 2.6, z: 30 },
    tertiary: { casing: COLORS.tertiaryCasing, fill: COLORS.tertiary, cw: 2.6, fw: 1.8, z: 28 },
    local: { casing: COLORS.localCasing, fill: COLORS.local, cw: 2.0, fw: 1.4, z: 26 },
    path: { casing: null, fill: COLORS.path, cw: 0, fw: 0.8, z: 24 },
    link: { casing: COLORS.localCasing, fill: "#fafafa", cw: 1.5, fw: 1.0, z: 25 },
    buildingRoad: { casing: "#e8eaed", fill: "#ffffff", cw: 1.6, fw: 1.0, z: 22 },
    subway: { casing: null, fill: COLORS.subway, cw: 2.2, fw: 2.0, z: 35 },
    railway: { casing: COLORS.railwayCasing, fill: COLORS.railway, cw: 1.8, fw: 0.85, z: 31 },
    hsr: { casing: COLORS.hsrCasing, fill: COLORS.hsrFill, cw: 2.0, fw: 1.1, z: 32 },
    waterline: { casing: null, fill: COLORS.waterLine, cw: 0, fw: 1.4, z: 8 },
  };

  /**
   * 六档参考图可见性（瓦片级仅 3/6/8/10/12/14）
   * z3  国省市界、省会红点、水系；无道路
   * z6  +高速/国省道橙黄网、地市名
   * z8  +次干道、铁路、区县名
   * z9  +稀疏景点/博物馆/学校；高铁/机场
   * z10 +地铁线、景点增密
   * z11 +高速/国道路名、地铁线名、火车站/机场
   * z12 +地铁站、省道名
   * z13 +次干路名、地铁/学校 POI
   * z14 +文化/运动类
   * z15 +酒店
   * z16 +商铺/餐饮/一般 POI
   * z17 +密集小 POI 名称
   */
  var ZOOM = {
    provinceBorder: 3,
    cityBorder: 6,
    countyBorder: 8,
    townBorder: 10,
    highway: 6,
    national: 6,
    provincial: 6,
    secondary: 6,
    tertiary: 8,
    local: 9,
    path: 14,
    subway: 10,
    railway: 6,
    waterline: 3,
    green: 8,
    urban: 10,
    building: 14,
    buildingLabel: 17,
    poi: 12,
    countryLabel: [2, 6],
    provinceLabel: [4, 8],
    capitalLabel: [5, 14],
    cityLabel: [6, 14],
    countyLabel: [8, 14],
    townLabel: [10, 14],
    villageLabel: [11, 20],
    waterLabel: [3, 20],
  };

  /** 防碰撞优先级：数值越大越不易被隐藏 */
  var LABEL_PRIO = {
    continent: 90,
    country: 88,
    capital: 86,
    province: 84,
    city: 82,
    waterName: 80,
    county: 78,
    town: 76,
    village: 74,
    poiTransport: 72,
    poiGov: 70,
    poiLandmark: 68,
    poiDefault: 60,
    roadMajor: 58,
    roadMinor: 52,
    subway: 56,
  };

  /** 洲/国/省/海域标注：仅按瓦片 minZoom（getZoom()+1 >= minZoom） */
  function isMacroAdminLabelKind(adminKind) {
    return adminKind === "continent" || adminKind === "country" || adminKind === "province" || adminKind === "waterName";
  }

  /** 洲/国/省/海域面线：仅 minZoom，忽略 maxZoom */
  function macroGeoMinZoomVisible(feature) {
    var minZ = featureTileMinZoom(feature);
    if (minZ != null && !tileMinZoomVisible(minZ)) return false;
    return true;
  }

  function isMacroGeoLayer(layer, mainKey, subKey) {
    if (layer === "waterline") return true;
    if (layer === "boundary") return isMacroBoundaryKind(matchBoundary(subKey));
    if (layer === "region") {
      if (Number(mainKey) === 20016) return true;
      var rk = matchRegion(mainKey, subKey);
      return rk === "land" || rk === "water";
    }
    return false;
  }

  /** minZoom=2 占位：普通 POI / 楼号 → 17（洲/国/省/海域行政标注保留 2） */
  var POI_MINZ2_DEFAULT = 17;
  var MIN_BUILDING_LABEL_Z = 17;
  var MIN_POI_DETAIL_Z = 17;

  /** 洲/国/省/海域行政标注：minZoom 原样（含 2） */
  function macroAdminEffectiveMinZoom(feature, adminKind) {
    return featureTileRawMinZoom(feature);
  }

  function macroAdminMinZoomVisible(feature, adminKind) {
    var minZ = macroAdminEffectiveMinZoom(feature, adminKind);
    if (minZ != null && !tileMinZoomVisible(minZ)) return false;
    /* z2 仅显示「中华人民共和国」，他国名 z3+ */
    if (adminKind === "country") {
      var level = tileAttrZoomLevel();
      if (level != null && level <= 2) {
        var subKey = feature.get("subKey");
        var nm = String(feature.get("name") || "").trim();
        if (!hasSub(subKey, [18]) && nm !== "中华人民共和国") return false;
      }
    }
    return true;
  }

  /** 国/省界：仅按瓦片 minZoom（同 macroGeoMinZoomVisible） */
  function isMacroBoundaryKind(boundaryKind) {
    return boundaryKind === "nation" || boundaryKind === "province" || boundaryKind === "foreign";
  }

  function macroBoundaryMinZoomVisible(feature) {
    return macroGeoMinZoomVisible(feature);
  }

  /** 市/县/镇等行政标注：样式分级门槛 */
  function adminShowAtZoom(adminKind, zoom) {
    if (zoom == null) return true;
    var gates = {
      capital: 5,
      city: 6,
      county: 8,
      /* 镇名不显示；村名 z11+（图1） */
      town: 99,
      village: 11,
    };
    return zoom >= (gates[adminKind] != null ? gates[adminKind] : 6);
  }

  /** z8–12 城市/区域概览（道路样式与 z10–12 一致） */
  function isOverviewZoom(zoom) {
    return zoom != null && zoom >= 8 && zoom <= 12;
  }

  /** 村名（不含村委会/居委会） */
  function isVillageCommitteeName(name) {
    return /村委会|村民委员会/.test(String(name || "").trim());
  }

  function isVillageNameOnly(name) {
    var nm = String(name || "").trim();
    if (!nm || isVillageCommitteeName(nm)) return false;
    if (/居委会|社区/.test(nm)) return false;
    return /村$/.test(nm);
  }

  /** 村名：z11 起显示（行政标注） */
  function isVillageAdminName(name) {
    return isVillageNameOnly(name);
  }

  function villageLabelAtZoom(zoom, name) {
    if (zoom == null) return true;
    if (!isVillageAdminName(name)) return true;
    return zoom >= 11;
  }

  /** 村名：有瓦片 minZoom 时与 getZoom() 对齐；否则保留 z11+ */
  function villageAdminLabelVisible(feature, visualZoom, name) {
    if (isTileMinZoomSuppressed(feature)) return false;
    if (featureHasTileZoomAttrs(feature)) return poiTileZoomVisible(feature, null);
    if (visualZoom != null && visualZoom < 11) return false;
    return villageLabelAtZoom(visualZoom, name);
  }

  /** 镇名：各级别均隐藏（图1–3） */
  function isTownshipAdminName(name) {
    return /^[\u4e00-\u9fff]{1,12}(镇|乡)$/.test(String(name || "").trim());
  }

  function townshipLabelAtZoom(zoom, name) {
    if (!isTownshipAdminName(name)) return true;
    return false;
  }

  /** OL map.getView().getZoom()（0 起索引） */
  function getTileAttrZoom() {
    if (currentTileAttrZoom != null && !isNaN(currentTileAttrZoom)) return currentTileAttrZoom;
    return null;
  }

  /** 瓦片 maxZoom 对齐级别：getZoom() + 1（仅 maxZoom 使用） */
  function tileAttrZoomLevel() {
    var idx = getTileAttrZoom();
    if (idx == null) return null;
    return idx + 1;
  }

  /** getZoom()+1 >= minZoom 时显示 */
  function tileMinZoomVisible(minZ) {
    if (minZ == null || minZ === "" || isNaN(Number(minZ))) return true;
    var idx = getTileAttrZoom();
    if (idx == null) return false;
    return idx + 1 >= Number(minZ);
  }

  /** maxZoom >= getZoom()+1 时仍显示 */
  function tileMaxZoomVisible(maxZ) {
    if (maxZ == null || maxZ === "" || isNaN(Number(maxZ))) return true;
    var level = tileAttrZoomLevel();
    if (level == null) return false;
    return Number(maxZ) >= level;
  }

  /** building：minZoom=2/18–20 → 17 */
  function featureBuildingEffectiveMinZoom(feature) {
    var raw = featureTileRawMinZoom(feature);
    if (raw == null) return null;
    if (raw === 2 || raw === 20 || raw === 18 || raw === 19) return POI_MINZ2_DEFAULT;
    return raw;
  }

  /** building：getZoom()+1 >= minZoom */
  function featureBuildingMinZoomOk(feature) {
    if (!feature) return true;
    var minZ = featureBuildingEffectiveMinZoom(feature);
    if (minZ == null) return true;
    return tileMinZoomVisible(minZ);
  }

  function featureHasTileZoomAttrs(feature) {
    var ly = feature && feature.get ? feature.get("layer") : feature && feature.layer;
    if (ly === "poi" || ly === "transit") {
      return featurePoiEffectiveMinZoom(feature, ly) != null || featureTileMaxZoom(feature) != null;
    }
    return featureTileMinZoom(feature) != null || featureTileMaxZoom(feature) != null;
  }

  /** POI 严格 minZoom：getZoom()+1 >= minZoom；无 minZoom 不限制 */
  function featurePoiMinZoomOk(feature, layer) {
    if (!feature) return true;
    if (isPoiTileMinZoomSuppressed(feature, layer)) return false;
    var minZ = featurePoiEffectiveMinZoom(feature, layer);
    if (minZ == null) return true;
    return tileMinZoomVisible(minZ);
  }

  /** 瓦片 minZoom 原始值（含默认占位 2） */
  function featureTileRawMinZoom(feature) {
    if (!feature) return null;
    var minZ = feature.get ? feature.get("minZoom") : feature.minZoom;
    if (minZ == null || minZ === "" || isNaN(Number(minZ))) return null;
    return Number(minZ);
  }

  /** POI 点：minZoom=2 → 17（洲/国/省/海域行政标注保留 2）；楼号 18–20 → 17 */
  function featurePoiEffectiveMinZoom(feature, layer) {
    var raw = featureTileRawMinZoom(feature);
    if (raw == null) return null;
    var ly = layer || (feature.get ? feature.get("layer") : feature.layer);
    if (ly === "poi" || ly === "transit") {
      var nm = String(feature.get ? feature.get("name") : feature.name || "").trim();
      if (isBuildingLabelName(nm) && (raw === 18 || raw === 19 || raw === 20)) {
        return POI_MINZ2_DEFAULT;
      }
      if (raw !== 2) return raw;
      var mk = Number(feature.get ? feature.get("mainKey") : feature.mainKey);
      var sk = feature.get ? feature.get("subKey") : feature.subKey;
      if (mk === 10002) {
        var ak = matchAdminLabel(sk);
        if (isMacroAdminLabelKind(ak)) return 2;
      }
      return POI_MINZ2_DEFAULT;
    }
    return raw;
  }

  /** 非 POI 要素（面/线/建筑等）直接读原始 minZoom */
  function featureTileMinZoom(feature) {
    return featureTileRawMinZoom(feature);
  }

  function featureTileMaxZoom(feature) {
    if (!feature) return null;
    var maxZ = feature.get ? feature.get("maxZoom") : feature.maxZoom;
    if (maxZ == null || maxZ === "" || isNaN(Number(maxZ))) return null;
    return Number(maxZ);
  }

  /** 普通 POI：minZoom=2 已在 featureTileMinZoom 中视为无约束，不再单独抑制 */
  function isPoiTileMinZoomSuppressed(feature, layer) {
    return false;
  }

  function isTileMinZoomSuppressed(feature) {
    return isPoiTileMinZoomSuppressed(feature);
  }

  /** 非 POI 要素：仍可读 min/max */
  function featureAttrZoomOk(feature) {
    if (!feature) return true;
    if (isTileMinZoomSuppressed(feature)) return false;
    var minZ = feature.get ? feature.get("minZoom") : feature.minZoom;
    var maxZ = feature.get ? feature.get("maxZoom") : feature.maxZoom;
    var level = tileAttrZoomLevel();
    if (level == null) return minZ == null && maxZ == null;
    if (!tileMinZoomVisible(minZ)) return false;
    if (!tileMaxZoomVisible(maxZ)) return false;
    return true;
  }

  function hasPoiStyleGate(category) {
    return !!category && category !== "default" && category !== "admin";
  }

  function featureStableHash(feature, salt) {
    var uid = feature && feature.get ? String(feature.get("uid") || feature.get("id") || "") : "";
    var s = uid + "|" + (salt || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  var currentViewExtent = null;
  var currentVisualZoom = null;
  /** map.getView().getZoom()（0 起）；getZoom()+1 >= minZoom 时显示 */
  var currentTileAttrZoom = null;
  var shieldViewState = { key: null, buckets: {} };
  var scenicViewState = { key: null, cells: {} };
  var poiThinViewState = { key: null, cells: {} };
  var adminLabelViewState = { key: null, provinces: {} };

  /** z4 及以前只出省名；z5+ 出省会/市，省名隐藏 */
  var ADMIN_PROVINCE_ONLY_MAX_Z = 4;

  function normalizeProvinceKey(name) {
    var nm = String(name || "").trim();
    if (!nm) return "";
    return nm
      .replace(/壮族自治区$|回族自治区$|维吾尔自治区$|特别行政区$|自治区$|省$|市$/g, "")
      .replace(/\s+/g, "");
  }

  /** 同省只保留一个标注：短名优先（陕西 > 陕西省） */
  function provinceLabelPickScore(name) {
    var nm = String(name || "").trim();
    if (!nm) return -999;
    var score = 0;
    if (/省$|自治区$|特别行政区$/.test(nm)) score -= 50;
    score -= nm.length;
    return score;
  }

  function adminProvinceLabelVisible(feature, name, visualZoom) {
    if (visualZoom != null && visualZoom > ADMIN_PROVINCE_ONLY_MAX_Z) return false;
    var key = normalizeProvinceKey(name);
    if (!key) return true;
    var uid = String(
      feature && feature.get ? feature.get("uid") || feature.get("id") || name : name
    );
    var score = provinceLabelPickScore(name);
    var prev = adminLabelViewState.provinces[key];
    if (!prev || score > prev.score || (score === prev.score && uid < prev.uid)) {
      adminLabelViewState.provinces[key] = { score: score, uid: uid };
    }
    return adminLabelViewState.provinces[key].uid === uid;
  }

  /** z4 及以前不出省会标注，避免与省名同屏 */
  function adminCapitalLabelVisible(adminKind, visualZoom) {
    if (visualZoom != null && visualZoom <= ADMIN_PROVINCE_ONLY_MAX_Z && adminKind === "capital")
      return false;
    return true;
  }

  function adminLabelExclusiveVisible(feature, adminKind, name, visualZoom) {
    if (adminKind === "province") return adminProvinceLabelVisible(feature, name, visualZoom);
    if (adminKind === "capital") return adminCapitalLabelVisible(adminKind, visualZoom);
    return true;
  }

  function setStyleViewContext(zoom, extent) {
    currentVisualZoom = zoom != null && !isNaN(Number(zoom)) ? Math.round(Number(zoom)) : null;
    if (!extent || extent.length < 4) {
      currentViewExtent = null;
      return;
    }
    currentViewExtent = extent;
    var key =
      Math.round(Number(zoom) * 10) +
      "|" +
      extent[0].toFixed(2) +
      "," +
      extent[1].toFixed(2) +
      "," +
      extent[2].toFixed(2) +
      "," +
      extent[3].toFixed(2);
    if (shieldViewState.key !== key) {
      shieldViewState.key = key;
      shieldViewState.buckets = {};
    }
    if (scenicViewState.key !== key) {
      scenicViewState.key = key;
      scenicViewState.cells = {};
    }
    if (poiThinViewState.key !== key) {
      poiThinViewState.key = key;
      poiThinViewState.cells = {};
    }
    if (adminLabelViewState.key !== key) {
      adminLabelViewState.key = key;
      adminLabelViewState.provinces = {};
    }
  }

  function lineMidpointCoord(feature) {
    var geom = feature && feature.getGeometry && feature.getGeometry();
    if (!geom) return null;
    var type = geom.getType ? geom.getType() : "";
    var coords;
    if (type === "LineString") coords = geom.getCoordinates();
    else if (type === "MultiLineString") {
      var lines = geom.getCoordinates();
      coords = lines && lines.length ? lines[0] : null;
    }
    if (!coords || !coords.length) return null;
    return coords[Math.floor(coords.length / 2)];
  }

  /** 视口横向三等分，各路号最多占一格 → 同名最多 3 个 */
  function roadShieldViewBucket(feature, extent) {
    var pt = lineMidpointCoord(feature);
    if (!pt) return 0;
    var w = extent[2] - extent[0];
    if (!w || w <= 0) return 0;
    var t = (pt[0] - extent[0]) / w;
    t = Math.max(0, Math.min(1, t));
    return Math.min(2, Math.floor(t * 3));
  }

  /** G 高速/国道 z9+（图2 无路牌 · 图3 起显示）· S 省道 z11+ · X 县道 z13+ */
  function roadShieldAtZoom(kind, zoom, shield, feature) {
    if (zoom == null || !shield) return false;
    if (zoom < 9) return false;
    var sk = String(shield).trim();
    if (/^S/i.test(sk) && zoom < 11) return false;
    if (/^X/i.test(sk) && zoom < 13) return false;
    var major =
      kind === "highway" ||
      kind === "ring" ||
      kind === "national" ||
      kind === "provincial";
    if (!major && !/^X/i.test(sk)) return false;

    var extent = currentViewExtent;
    if (!extent) {
      if (zoom >= 16) return true;
      return featureStableHash(feature, sk) % 4 === 0;
    }

    var name = sk.toUpperCase();
    if (!shieldViewState.buckets[name]) shieldViewState.buckets[name] = {};
    var buckets = shieldViewState.buckets[name];
    var b = roadShieldViewBucket(feature, extent);
    if (buckets[b]) return false;
    if (zoom >= 16) {
      buckets[b] = true;
      return true;
    }
    if (zoom >= 14) {
      if (featureStableHash(feature, name + "|" + b) % 3 !== 0) return false;
    } else if (featureStableHash(feature, name + "|" + b) % 2 !== 0) {
      return false;
    }
    buckets[b] = true;
    return true;
  }

  /** z8–9 城市概览：仅路网/行政，不出公园景区高铁机场 */
  function isCityOverviewZoom(zoom) {
    return zoom != null && zoom >= 8 && zoom <= 9;
  }

  /** z10–12 区域图；枢纽/景点 POI 从 z11 起（z10 仅路网行政） */
  var REGIONAL_LANDMARK_POI = { culture: 1, nature: 1, train: 1, airport: 1 };

  /** z14+ 城区/街道详图 */
  function isStreetDetailZoom(zoom) {
    return zoom != null && zoom >= 14;
  }

  /** 公园/古迹：z11 起；高铁/机场：z9 起 */
  var MIN_SCENIC_LABEL_Z = 11;
  var MIN_HUB_POI_Z = 9;
  /** 小区/园区/商场名 */
  var MIN_POI_COMMUNITY_Z = 14;
  /** 店铺/小政务/小公司等（最大级别） */
  var MIN_POI_MISC_Z = 18;
  var MIN_METRO_LINE_LABEL_Z = 11;
  /** 地铁站：原门槛 +1（对齐参考图更晚出现） */
  var MIN_METRO_STATION_Z = 13;
  var MIN_MAJOR_ROAD_LABEL_Z = 11;

  function isOverviewLabelZoom(zoom) {
    return zoom != null && zoom >= MIN_SCENIC_LABEL_Z;
  }

  /** 景区内部小地名（遗址殿宇/亭台等），仅 z17+ */
  function isScenicInteriorPoi(name) {
    var nm = String(name || "").trim();
    if (!nm || nm.length > 12) return false;
    if (/国家遗址公园|国家森林公园|风景名胜区|旅游景区|遗址公园/.test(nm)) return false;
    if (/殿遗址|门遗址|遗址$|纪念碑|陈列馆|展览馆/.test(nm)) return true;
    if (/^[一-龥]{1,6}(殿|亭|台|坊|堰|岛)$/.test(nm)) return true;
    if (/^[一-龥]{1,4}门$/.test(nm) && nm.length <= 5) return true;
    return false;
  }

  /** 景区/公园主体名（z11+） */
  function isMajorScenicPoi(category, name) {
    if (category !== "nature" && category !== "culture" && category !== "amusement") return false;
    var nm = String(name || "").trim();
    if (!nm || isScenicInteriorPoi(nm)) return false;
    return isImportantLandmark(category, nm);
  }

  /** 小区/园区（名称优先于政务细点） */
  function isCommunityOrCampusPoi(category, name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (category === "residential") return true;
    if (/科技园|产业园|工业园|物流园|创意园|文化园|孵化器|示范区|自贸|软件园|创业园|高新区|经开区|教育园|基地$/.test(nm))
      return true;
    if (/小区|家属院|安置小区|生活小区|城中村|社区$/.test(nm)) return true;
    if (/公寓$|公馆$|家园$|华府$|丽都$|首府$|世家$|国际$/.test(nm) && !/酒店|服务|研究生|留学生|机场|饭店/.test(nm))
      return true;
    /* 品牌·楼盘名：金业·缇香山、海伦堡·海伦国际 */
    if (/[·・]/.test(nm) && nm.length >= 3 && nm.length <= 18 && !/酒店|医院|学校|商场|超市|餐厅|火锅|银行|加油站|公园|景区/.test(nm))
      return true;
    if (
      /景园|林语|九里|花苑|御园|馨园|融园|麓园|溪园|海棠|橡树|华润|金地|保利|万科|碧桂园|恒大|绿地|中海|龙湖|融创|阳光城|曲江|雁翔|海伦|逸园|别苑|佳苑|雅苑|名苑|锦园|翠园|香榭|澜山|国际城|印象城|生活广场|缇香|风笛|等驾坡|千户|国风/.test(
        nm
      ) &&
      !/公园|商场|广场|酒店|医院|学校|大学|幼儿园|服务中心|项目部|改造|执法|管理/.test(nm)
    )
      return true;
    if (/苑$|邸$|花园$|府$|湾$|里$|庭$|居$|第$/.test(nm) && !/公园|商场|广场|乐园|植物园|动物园|图书|服务|政务/.test(nm))
      return true;
    if (/园$/.test(nm) && nm.length >= 3 && nm.length <= 8 && !/公园|商场|广场|乐园|植物园|动物园|幼儿园|小学|中学|大学|产业园|科技园|政务|服务/.test(nm))
      return true;
    /* 缇香山、香山里一类短名山/里（排除名山景区） */
    if (/山$/.test(nm) && nm.length >= 3 && nm.length <= 8 && !/华山|泰山|黄山|峨眉|庐山|景区|公园|庙|寺/.test(nm))
      return true;
    return false;
  }

  /** 商场/购物中心名（z15+） */
  function isMallNamePoi(category, name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (category === "shop" && isMajorShop(nm)) return true;
    return /商场|购物|万达|SKP|大悦城|万象城|百货|购物中心|天街|赛格|奥特莱斯|商业广场|银泰|创意谷|印象城|吾悦|龙湖天街/.test(nm);
  }

  /** 楼栋/座号/楼号（z18+，如旺座曲江F座、A座） */
  function isBuildingLabelName(name) {
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (/^[A-ZＡ-Ｚ]座$/.test(nm)) return true;
    if (/^\d+幢$/.test(nm)) return true;
    if (/^\d+号楼/.test(nm)) return true;
    if (/^[A-ZＡ-Ｚ]\d*栋/.test(nm)) return true;
    if (/^\d+号$/.test(nm)) return true;
    if (/^\d+栋$/.test(nm)) return true;
    if (/^\d+单元$/.test(nm)) return true;
    if (/[A-ZＡ-Ｚ0-9]座$/.test(nm) && nm.length >= 2 && nm.length <= 20) return true;
    if (/座$/.test(nm) && nm.length >= 3 && nm.length <= 20 && !/地铁|公交|公园|商场/.test(nm)) return true;
    return false;
  }

  /** @deprecated 使用 isBuildingLabelName */
  function isBuildingBlockPoi(name) {
    return isBuildingLabelName(name);
  }

  /** 商场内店铺/餐饮等（z17+） */
  function isShopDetailPoi(category, name) {
    var nm = String(name || "").trim();
    if (!nm || isMallNamePoi(category, nm)) return false;
    if (category === "food") return true;
    if (category === "hotel") return true;
    if (category === "shop") {
      if (isMajorShop(nm)) return false;
      if (matchBrandIcon(nm) || matchBrandPoiFallback(nm)) return true;
      if (/加油|加油站|油气|壳牌|石油|石化/.test(nm)) return false;
      return true;
    }
    return false;
  }

  /** 加油站/运动/银行等杂项：默认不显示 */
  function isMiscHiddenPoi(category, name) {
    var nm = String(name || "").trim();
    if (
      category === "charging" ||
      category === "bank" ||
      category === "sport" ||
      category === "stadium" ||
      category === "soccer" ||
      category === "basketball" ||
      category === "tennis" ||
      category === "swim" ||
      category === "carwash" ||
      category === "transport"
    )
      return true;
    if (category === "shop" && /加油|加油站|油气|壳牌|石油|石化/.test(nm)) return true;
    return false;
  }

  /**
   * 其余 POI（非枢纽/景区/小区/地铁等）：显示级别跟随瓦片 minZoom / maxZoom。
   * 学校/医院/酒店亦仅按瓦片属性：getZoom() 对齐 minZoom/maxZoom。
   */
  function isTileZoomGatedPoi(category, name) {
    if (isTileMinZoomCategory(category)) return true;
    if (isCommunityOrCampusPoi(category, name) || isMallNamePoi(category, name)) return false;
    if (poiEarlyCivic(category, name)) return false;
    if (category === "metro") return false;
    if (isMajorScenicPoi(category, name)) return false;
    return true;
  }

  function poiTileZoomVisible(feature, category) {
    if (tileAttrZoomLevel() == null) return false;
    if (isPoiTileMinZoomSuppressed(feature, "poi")) return false;
    var minZ = featurePoiEffectiveMinZoom(feature, "poi");
    if (category && isTileMinZoomCategory(category) && minZ == null) return false;
    return featurePoiMinZoomOk(feature, "poi");
  }

  /** 重要景点/公园/古迹（z9+ 显示） */
  function isImportantLandmark(category, name) {
    if (category !== "nature" && category !== "culture" && category !== "amusement") return false;
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (matchLandmarkIcon9(nm)) return true;
    if (
      /国家森林公园|森林公园|湿地公园|国家湿地公园|风景|名胜|旅游景区|文化旅游|文旅|景区|沙苑|猿人|老君山|亚武山|抚龙湖|博物馆|纪念馆|博物院|遗址|古城墙|城墙|大雁塔|小雁塔|兵马俑|钟楼|鼓楼|华清池|秦始皇|大明宫|碑林|法门寺|清真大寺|世博园|植物园|动物园|袁家村|华山|芙蓉园|不夜城|青龙寺|乐游原|纪念馆|纪念堂|遗址公园|海洋|极地|大唐/.test(
        nm
      )
    ) {
      return true;
    }
    if (/曲江/.test(nm) && /公园|景区|遗址|池|不夜城|芙蓉园|大唐|文旅|遗址公园/.test(nm)) return true;
    if (/公园$/.test(nm) && nm.length >= 4) return true;
    if (/(寺|庙|塔|陵|祠|关|观)$/.test(nm) && nm.length >= 2) return true;
    return false;
  }

  /** z8–9 概览：在 isImportantLandmark 基础上再筛，只留大图级景点 */
  function isSparseOverviewLandmark(category, name) {
    if (!isImportantLandmark(category, name)) return false;
    var nm = String(name || "").trim();
    if (/公园$/.test(nm) && !/国家|湿地|森林|世博|动物|植物|遗址|考古|运动|生态|文化|七夕|池|陵|宫|城墙|遗址/.test(nm))
      return false;
    if (/景区$/.test(nm) && nm.length < 5) return false;
    if (nm.length <= 2) return false;
    return true;
  }

  /** z9 概览：稀疏景点/博物馆/学校（z8 仍仅高铁/机场） */
  function overviewSparsePoiAtZ9(category, zoom, name, rank, feature) {
    if (zoom !== 9) return false;
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (category === "default" || category === "shop" || category === "health") {
      if (/博物馆|博物院|纪念馆|文物/.test(nm)) category = "culture";
      else if (/公园|景区|遗址|世博|动物园|植物园/.test(nm)) category = "nature";
      else if (/大学|学院|中学|学校/.test(nm)) category = "edu";
    }
    var r = Number(rank);
    var hasRank = !isNaN(r) && r > 0;

    if (category === "nature" || category === "culture") {
      var tier1 = /博物馆|博物院|纪念馆|世博|兵马俑|大雁塔|华山|城墙|国家森林公园|动物园|植物园/.test(nm);
      if (tier1) return true;
      var major =
        isImportantLandmark(category, nm) ||
        /遗址|风景|名胜|景区/.test(nm) ||
        (/公园/.test(nm) && nm.length >= 4);
      if (!major && !(hasRank && r <= 4)) return false;
      if (hasRank && r > 8) return false;
      if (!feature) return major || (hasRank && r <= 4);
      var hs = featureStableHash(feature, "z9sc|" + nm);
      if (major) return hs % 2 !== 0;
      if (hasRank && r <= 3) return hs % 2 === 0;
      return hs % 4 === 0;
    }
    if (category === "edu") {
      if (hasRank && r > 4) return false;
      if (!/大学|学院|研究院|附中|中学|学校/.test(nm)) return false;
      if (!feature) return true;
      return featureStableHash(feature, "z9edu|" + nm) % 3 !== 0;
    }
    return false;
  }

  /** 旅游景点 z11 起分级：刚进入时最稀，逐级增多 */
  function scenicLandmarkAtZoom(category, zoom, name, rank) {
    if (category !== "nature" && category !== "culture") return false;
    if (zoom == null || zoom < MIN_SCENIC_LABEL_Z) return false;
    var nm = String(name || "").trim();
    if (!nm) return false;
    var r = Number(rank);
    var hasRank = !isNaN(r) && r > 0;

    if (zoom === 11) {
      if (!isImportantLandmark(category, nm)) return false;
      if (hasRank) return r <= 3;
      if (/公园$/.test(nm) && nm.length >= 4) return true;
      return isSparseOverviewLandmark(category, nm);
    }
    if (zoom === 12) {
      if (isImportantLandmark(category, nm)) return hasRank ? r <= 6 : true;
      if (hasRank) return r <= 4;
      return /博物馆|遗址|世博|池|陵|宫|塔|寺|城墙|兵马俑|大雁塔|华山|古城|考古|生态|景观|欢乐谷|动物园|植物园/.test(nm);
    }
    if (zoom === 13) {
      if (hasRank) return r <= 10;
      return (
        isImportantLandmark(category, nm) ||
        (nm.length >= 4 && /公园|景区|博物|遗址|陵|寺|塔|园|谷|湖|山|滩|苑|关|谷/.test(nm))
      );
    }
    if (hasRank) {
      if (zoom === 14) return r <= 16;
      if (zoom === 15) return r <= 28;
      return true;
    }
    return zoom >= 14;
  }

  /** z10–15 视口网格抽稀（z13+ 逐步放宽） */
  function scenicLandmarkViewAtZoom(category, zoom, name, rank, feature) {
    if (!scenicLandmarkAtZoom(category, zoom, name, rank)) return false;
    if (zoom == null || zoom < MIN_SCENIC_LABEL_Z || zoom > 15) return true;
    var extent = currentViewExtent;
    if (!extent || !feature) return true;

    var pt = null;
    var geom = feature.getGeometry && feature.getGeometry();
    if (geom && geom.getType && geom.getType() === "Point") pt = geom.getCoordinates();
    if (!pt || pt.length < 2) return true;

    var cell =
      zoom === 11 ? 0.3 : zoom === 12 ? 0.22 : zoom === 13 ? 0.16 : zoom === 14 ? 0.12 : 0.09;
    var gx = Math.floor((pt[0] - extent[0]) / cell);
    var gy = Math.floor((pt[1] - extent[1]) / cell);
    var cellKey = gx + "," + gy;
    if (!scenicViewState.cells[cellKey]) scenicViewState.cells[cellKey] = 0;

    var maxPerCell =
      zoom === 10 ? 1 : zoom === 11 ? 2 : zoom === 12 ? 3 : zoom === 13 ? 4 : zoom === 14 ? 5 : 6;
    if (scenicViewState.cells[cellKey] >= maxPerCell) {
      var r = Number(rank);
      if (!isNaN(r) && r > 0 && r <= 3 && featureStableHash(feature, cellKey) % 3 === 0) {
        scenicViewState.cells[cellKey]++;
        return true;
      }
      return false;
    }

    var r2 = Number(rank);
    var h = featureStableHash(feature, cellKey + "|" + zoom);
    if (!isNaN(r2) && r2 > 0 && r2 <= 3) {
      scenicViewState.cells[cellKey]++;
      return true;
    }
    if (isImportantLandmark(category, name) && h % 3 !== 0) {
      scenicViewState.cells[cellKey]++;
      return true;
    }
    var mod = zoom <= 11 ? (zoom === 10 ? 5 : 4) : zoom <= 13 ? 3 : zoom <= 14 ? 2 : 1;
    if (mod > 1 && h % mod !== 0) return false;
    scenicViewState.cells[cellKey]++;
    return true;
  }

  /** 区域面（绿/景/水）名称：z10+ */
  function isRegionOverviewLabel(rk, zoom) {
    if (zoom == null || zoom < MIN_SCENIC_LABEL_Z) return rk === "water";
    if (isRegionalZoom(zoom)) return rk === "water";
    return rk === "water" || rk === "green" || rk === "scenic" || rk === "culture";
  }

  /** 各 zoom 分类门槛
   * z9  高铁/机场 · z11 景区 · z12 一级政府 · z13 地铁
   * z14 小区/园区/商场 · 学校/医院/酒店按瓦片 minZoom
   */
  function poiCategoryMinZoom(category) {
    var gates = {
      train: MIN_HUB_POI_Z,
      airport: MIN_HUB_POI_Z,
      nature: MIN_SCENIC_LABEL_Z,
      culture: MIN_SCENIC_LABEL_Z,
      amusement: MIN_SCENIC_LABEL_Z,
      stadium: 99,
      metro: MIN_METRO_STATION_Z,
      gov: 12,
      shop: MIN_POI_COMMUNITY_Z,
      soccer: 99,
      basketball: 99,
      tennis: 99,
      swim: 99,
      residential: MIN_POI_COMMUNITY_Z,
      sport: 99,
      bank: 99,
      charging: 99,
      parking: 15,
      busstop: 15,
      gate: 15,
      toll: 15,
      food: MIN_POI_MISC_Z,
      transport: 99,
      trafficlight: 99,
      restroom: 99,
      carwash: 99,
    };
    return gates[category] != null ? gates[category] : null;
  }

  function poiShowAtZoom(category, zoom, name, feature) {
    if (zoom == null) return true;
    var nm = String(name || "").trim();
    if (isVillageCommitteeName(nm)) return false;
    if (isTownshipAdminName(name)) return false;
    if (!featurePoiMinZoomOk(feature, "poi")) return false;

    if (!hasPoiStyleGate(category)) {
      return true;
    }

    /* z14+ 小区/园区/商场（优先于瓦片 minZoom 分类） */
    if (isCommunityOrCampusPoi(category, name) || isMallNamePoi(category, name))
      return zoom >= MIN_POI_COMMUNITY_Z;

    /* 学校/医院/酒店及带瓦片 minZoom 的 POI：仅按瓦片属性 */
    if (poiFollowsTileMinZoom(category, feature)) return poiTileZoomVisible(feature, category);

    /* 枢纽/一级政府 */
    if (poiEarlyCivic(category, name)) {
      var civicMin = poiCategoryMinZoom(category);
      if (civicMin != null && zoom < civicMin) return false;
      return true;
    }

    if (category === "metro") return zoom >= MIN_METRO_STATION_Z;

    if (isMiscHiddenPoi(category, name)) return false;

    if (isIconOnlyPoi(category, name)) return poiTileZoomVisible(feature, category);

    /* z11+ 景区/公园主体 */
    if (isMajorScenicPoi(category, name)) return zoom >= MIN_SCENIC_LABEL_Z;

    /* 其余 POI：遵循瓦片 minZoom / maxZoom */
    if (isTileZoomGatedPoi(category, name)) return poiTileZoomVisible(feature, category);

    if (zoom >= MIN_HUB_POI_Z && zoom < MIN_SCENIC_LABEL_Z) return false;

    return false;
  }

  /**
   * 稳定递增抽稀：z13–14 只留核心类；z15+ 逐步放开商铺/酒店/诊所。
   */
  function poiProgressiveDensity(category, zoom, rank, feature) {
    if (zoom == null) return true;
    if (
      category === "train" ||
      category === "airport" ||
      category === "metro" ||
      category === "gov" ||
      category === "trafficlight"
    ) {
      return true;
    }
    var nm = feature && feature.get ? feature.get("name") : "";
    if (matchLandmarkIcon9(nm)) return true;

    var tier = poiDisplayTier(category, nm);
    var r = Number(rank);
    var hasRank = !isNaN(r) && r > 0;

    function tierRankCap(t, z) {
      if (t === 1) return z >= 15 ? 120 : z >= 14 ? 45 : z >= 13 ? 28 : z >= 12 ? 18 : 10;
      if (t === 2) return z >= 16 ? 80 : z >= 15 ? 40 : z >= 14 ? 12 : 0;
      if (t === 3) return z >= 17 ? 100 : z >= 16 ? 55 : z >= 15 ? 22 : 0;
      return z >= 18 ? 90 : z >= 17 ? 60 : z >= 16 ? 35 : 0;
    }

    function tierHashPct(t, z) {
      if (t === 1) return z >= 15 ? 100 : z >= 14 ? 75 : z >= 13 ? 55 : z >= 12 ? 40 : 25;
      if (t === 2) return z >= 16 ? 85 : z >= 15 ? 60 : z >= 14 ? 30 : 0;
      if (t === 3) return z >= 17 ? 90 : z >= 16 ? 65 : z >= 15 ? 38 : 0;
      return z >= 18 ? 88 : z >= 17 ? 70 : z >= 16 ? 48 : 0;
    }

    if (hasRank) return r <= tierRankCap(tier, zoom);

    var h = featureStableHash(feature, "prog|" + tier + "|" + (category || "default")) % 100;
    return h < tierHashPct(tier, zoom);
  }

  function poiRankAtZoom(rank, zoom, category, name, feature) {
    if (zoom == null) return true;
    if (!featurePoiMinZoomOk(feature, "poi")) return false;
    if (!poiShowAtZoom(category, zoom, name, feature)) return false;
    if (poiEarlyCivic(category, name)) return true;
    if (poiFollowsTileMinZoom(category, feature)) return true;
    if (category === "train" || category === "airport" || category === "metro") return true;
    if (isMajorScenicPoi(category, name)) return true;
    if (isCommunityOrCampusPoi(category, name) || isMallNamePoi(category, name)) return true;
    if (isTileZoomGatedPoi(category, name)) return true;
    if (isIconOnlyPoi(category, name)) return true;
    return false;
  }
  function poiTextAtZoom(category, zoom, name, feature) {
    if (zoom == null) return true;
    if (category === "trafficlight") return false;
    if (isIconOnlyPoi(category, name)) return false;
    if (!String(name || "").trim()) return false;
    if (isTownshipAdminName(name)) return false;
    if (isCompanyPoi(name)) return false;
    if (!hasPoiStyleGate(category)) return false;
    return poiShowAtZoom(category, zoom, name, feature);
  }

  function poiLabelFontSize(kind, zoom) {
    var conf = POI[kind] || POI.default;
    var base = conf.size || 11;
    if (kind === "train" || kind === "airport" || kind === "transport") {
      if (zoom != null && zoom >= 12) return Math.max(base, 12);
      return 12;
    }
    if (kind === "metro") return 11;
    if (kind === "edu" || kind === "health" || kind === "nature" || kind === "culture") {
      if (zoom != null && zoom <= 13) return 12;
    }
    if (zoom != null && zoom >= 16) return base + 1;
    return base;
  }

  /** icons_9 名胜：对齐高德 styleWidth≈42 */
  function landmarkIconPixelSize(zoom) {
    if (zoom != null && zoom >= 16) return 46;
    if (zoom != null && zoom >= 14) return 44;
    return 42;
  }

  /** 屏幕像素：对齐参考图圆形图标直径约 16–18 */
  function poiIconPixelSize(kind, zoom, name) {
    if (kind === "train" || kind === "airport") {
      if (zoom != null && zoom >= 14) return 18;
      return 17;
    }
    if (kind === "metro") return 12;
    if (kind === "trafficlight") return 11;
    if (kind === "busstop") return 12;
    if (kind === "parking" || kind === "gate" || kind === "restroom") return 13;
    if (kind === "charging" || kind === "carwash") return 13;
    if (
      kind === "nature" ||
      kind === "culture" ||
      kind === "amusement" ||
      kind === "edu" ||
      kind === "health"
    ) {
      if (zoom != null && zoom >= 15) return 15;
      return 16;
    }
    if (kind === "shop" || kind === "hotel" || kind === "food" || kind === "gov" || kind === "bank")
      return 15;
    if (kind === "transport") return 16;
    if (
      kind === "stadium" ||
      kind === "soccer" ||
      kind === "basketball" ||
      kind === "tennis" ||
      kind === "swim" ||
      kind === "sport"
    )
      return 14;
    if (zoom != null && zoom >= 16) return 15;
    if (zoom != null && zoom >= 14) return 14;
    return 15;
  }

  /** 字色：枢纽/景点从出现起带分类色；其余 z14+ 着色 */
  function poiLabelColorForKind(kind, zoom) {
    if (kind === "gov") return "#e53935";
    if (kind === "parking") return "#448aff";
    if (kind === "nature") return "#2e7d32";
    if (kind === "culture") return "#6d4c41";
    if (kind === "amusement") return "#c2185b";
    if (kind === "health") return "#e53935";
    if (kind === "edu") return zoom != null && zoom >= 15 ? "#1565c0" : "#333333";
    if (kind === "shop") return zoom != null && zoom >= 15 ? "#8e24aa" : "#333333";
    if (kind === "food") return "#ef6c00";
    if (kind === "hotel") return "#5c6bc0";
    if (kind === "residential") return "#555555";
    if (
      kind === "basketball" ||
      kind === "tennis" ||
      kind === "soccer" ||
      kind === "stadium" ||
      kind === "swim" ||
      kind === "sport"
    ) {
      return "#448aff";
    }
    if (kind === "train" || kind === "airport" || kind === "transport") return "#1565c0";
    var tinted = zoom != null && zoom >= 14;
    if (!tinted) return "#333333";
    if (kind === "bank") return "#455a64";
    var conf = POI[kind] || POI.default;
    return conf.text || "#333333";
  }

  /** 标注在图标右侧：icons_9 为 bottom-center 锚点，文字垂直居中 */
  function poiLabelLayout(kind, iconSize, zoom, name) {
    var half = iconSize * 0.5;
    var gap = zoom != null && zoom >= 14 ? 4 : 3;
    return {
      offsetX: half + gap,
      offsetY: 0,
      textAlign: "left",
      textBaseline: "middle",
    };
  }

  function poiLabelBold(kind, name) {
    var nm = String(name || "");
    if ((kind === "nature" || kind === "culture") && isImportantLandmark(kind, nm)) return true;
    if (kind === "nature" && /公园$/.test(nm) && nm.length >= 4) return true;
    if (kind === "gov") return false;
    if (kind === "basketball" || kind === "tennis" || kind === "stadium") return false;
    return false;
  }

  function poiLabelColor(kind) {
    return COLORS.label;
  }

  /** 区域/城区：POI 标注在图标右侧、细白描边 */
  function makePoiLabelText(Text, Fill, Stroke, opts) {
    var iconSize = opts.iconSize || 16;
    var fs = opts.fontSize || 11;
    var kind = opts.kind || "";
    var regional = opts.zoom != null && opts.zoom >= 11 && opts.zoom < 14;
    var detail = opts.zoom != null && opts.zoom >= 14 && opts.zoom <= 17;
    var beside = regional || detail || opts.besideIcon !== false;
    var layout = beside ? poiLabelLayout(kind, iconSize, opts.zoom, opts.text) : null;
    return makeLabelText(Text, Fill, Stroke, {
      text: opts.text,
      font:
        (opts.bold ? "bold " : "") +
        fs +
        "px Microsoft YaHei, PingFang SC, sans-serif",
      offsetX: layout ? layout.offsetX : opts.offsetX,
      offsetY: layout ? layout.offsetY : opts.offsetY,
      textAlign: layout ? layout.textAlign : opts.textAlign || "center",
      textBaseline: layout ? layout.textBaseline : opts.textBaseline || "middle",
      color: opts.color || "#333333",
      halo: "#ffffff",
      haloWidth: opts.haloWidth != null ? opts.haloWidth : detail ? 2.5 : 2,
      overflow: opts.overflow,
    });
  }

  function regionScenicLabelAtZoom(rk, zoom, name) {
    if (rk !== "green" && rk !== "scenic" && rk !== "culture") return false;
    var cat = rk === "culture" ? "culture" : "nature";
    var nm = String(name || "").trim();
    if (!nm) return false;
    if (isScenicInteriorPoi(nm)) return zoom >= MIN_POI_DETAIL_Z;
    return isMajorScenicPoi(cat, nm) && zoom >= MIN_SCENIC_LABEL_Z;
  }

  function regionLabelAtZoom(rk, zoom, name) {
    if (zoom == null) return false;
    if (rk === "green" || rk === "scenic" || rk === "culture")
      return regionScenicLabelAtZoom(rk, zoom, name);
    if (isCityOverviewZoom(zoom)) {
      return rk === "water";
    }
    if (isRegionalZoom(zoom)) {
      if (rk === "water") return true;
      return false;
    }
    if (isRegionOverviewLabel(rk, zoom)) return true;
    if (zoom < 12) return false;
    if (zoom >= 16) {
      return (
        rk === "green" ||
        rk === "scenic" ||
        rk === "edu" ||
        rk === "sportField" ||
        rk === "sportTrack" ||
        rk === "sportCourt" ||
        rk === "culture" ||
        rk === "business" ||
        rk === "public" ||
        rk === "water"
      );
    }
    if (zoom >= 14) {
      if (rk === "urban" && isCommunityOrCampusPoi(null, name)) return true;
      return (
        rk === "green" ||
        rk === "scenic" ||
        rk === "edu" ||
        rk === "sportField" ||
        rk === "water" ||
        rk === "culture" ||
        rk === "urban" ||
        rk === "business" ||
        rk === "public"
      );
    }
    return rk === "edu" || rk === "scenic" || rk === "green";
  }

  /** z10–12 区域面：仅水系/绿地/景区/建成区/文保面；z14+ 含运动场/停车场 */
  function regionShowAtZoom(rk, zoom) {
    if (zoom == null || !isRegionalZoom(zoom)) {
      if (isParkDetailZoom(zoom) && (rk === "parking" || rk.indexOf("sport") === 0)) return true;
      return zoom == null || !isRegionalZoom(zoom);
    }
    return (
      rk === "water" ||
      rk === "green" ||
      rk === "scenic" ||
      rk === "culture" ||
      rk === "urban" ||
      rk === "land"
    );
  }

  function buildingLabelStyle(name, zoom) {
    if (!name || zoom == null || zoom < MIN_BUILDING_LABEL_Z) return null;
    var nm = String(name).trim();
    var isBlock = isBuildingLabelName(nm);
    var fontSize = isBlock ? (zoom >= 18 ? 10 : 9) : zoom >= 18 ? 11 : 10;
    return {
      text: String(name),
      font: fontSize + "px Microsoft YaHei, PingFang SC, sans-serif",
      color: isBlock ? COLORS.buildingLabelMuted : COLORS.buildingLabel,
      haloWidth: 2.5,
      overflow: isBlock,
    };
  }

  /** 楼号标注：略低于 POI 点，但高于普通面标注，减轻 declutter 被压 */
  function buildingLabelZIndex(feature, name) {
    var nm = String(name || "").trim();
    var base = isBuildingLabelName(nm) ? Z_POINT - 12000 : Z_LABEL + 50;
    return base + drawOrderBase(feature, 14);
  }

  /** 路名：z11 高速/国道/环线 + 地铁线名；z12 省道；z13 起次干… */
  function roadLabelAtZoom(kind, zoom) {
    if (zoom == null) return false;
    if (kind === "subway") return zoom >= MIN_METRO_LINE_LABEL_Z;
    if (
      zoom >= MIN_MAJOR_ROAD_LABEL_Z &&
      (kind === "highway" || kind === "ring" || kind === "national")
    ) {
      return true;
    }
    if (zoom >= 12 && kind === "provincial") return true;
    if (zoom < 13) return false;
    if (zoom >= 16) {
      return (
        kind === "highway" ||
        kind === "ring" ||
        kind === "national" ||
        kind === "provincial" ||
        kind === "secondary" ||
        kind === "tertiary" ||
        kind === "local" ||
        kind === "subway" ||
        kind === "buildingRoad"
      );
    }
    if (zoom >= 15) {
      return (
        kind === "highway" ||
        kind === "ring" ||
        kind === "national" ||
        kind === "provincial" ||
        kind === "secondary" ||
        kind === "tertiary" ||
        kind === "local" ||
        kind === "subway"
      );
    }
    if (zoom >= 14) {
      return (
        kind === "highway" ||
        kind === "ring" ||
        kind === "national" ||
        kind === "provincial" ||
        kind === "secondary" ||
        kind === "subway"
      );
    }
    return (
      kind === "highway" ||
      kind === "ring" ||
      kind === "national" ||
      kind === "provincial"
    );
  }

  function makeLabelText(Text, Fill, Stroke, opts) {
    return new Text({
      text: opts.text,
      font: opts.font,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      textAlign: opts.textAlign,
      textBaseline: opts.textBaseline || "middle",
      placement: opts.placement,
      fill: new Fill({ color: opts.color || COLORS.label }),
      stroke: new Stroke({
        color: opts.halo || COLORS.labelHalo,
        width: opts.haloWidth != null ? opts.haloWidth : 2,
      }),
      overflow: opts.overflow === true,
    });
  }

  function inRange(zoom, minZ, maxZ) {
    if (zoom == null) return true;
    if (minZ != null && zoom < minZ) return false;
    if (maxZ != null && zoom > maxZ) return false;
    return true;
  }

  /** 公园/绿地/水系/运动场/停车：overzoom 时忽略瓦片 maxZoom */
  function isParkWaterRegion(mainKey, subKey) {
    var rk = matchRegion(mainKey, subKey);
    if (rk === "sport") rk = matchSportRegion(subKey);
    return (
      rk === "water" ||
      rk === "green" ||
      rk === "scenic" ||
      rk.indexOf("sport") === 0 ||
      rk === "parking"
    );
  }

  /** zIndex 分层：面 < 建筑 < 线 < 标注 < 点 */
  var Z_POLY = 0;
  var Z_BUILDING = 80000;
  var Z_LINE = 100000;
  var Z_LABEL = 150000;
  var Z_POINT = 200000;

  /** 线/面 zIndex：优先瓦片 drawOrder（对齐 amap.js zIndex = drawOrder） */
  function featureDrawOrder(feature) {
    if (!feature || !feature.get) return null;
    var d = feature.get("drawOrder");
    if (d == null || d === "") return null;
    var n = Number(d);
    return isNaN(n) ? null : n;
  }

  function drawOrderBase(feature, fallback) {
    var d = featureDrawOrder(feature);
    if (d != null) return d;
    return fallback != null ? fallback : 0;
  }

  function featureDrawZIndex(feature, fallback) {
    return Z_POLY + Math.min(drawOrderBase(feature, fallback), Z_BUILDING - Z_POLY - 1);
  }

  /** 建筑面：压在 region 等面之上，仍低于道路/边界线 */
  function featureBuildingZIndex(feature, fallback) {
    return Z_BUILDING + drawOrderBase(feature, fallback);
  }

  /** 线要素 zIndex：独立层级，始终压在面之上 */
  function featureLineZIndex(feature, fallback) {
    return Z_LINE + drawOrderBase(feature, fallback);
  }

  function featureLabelZIndex(feature, fallback, extra) {
    return Z_LABEL + drawOrderBase(feature, fallback) + (extra || 0);
  }

  function fixedLabelZIndex(priority) {
    return Z_LABEL + (priority != null ? priority : 0);
  }

  function featurePointZIndex(feature, fallback, extra) {
    var base = Z_POINT + (fallback != null ? fallback : 0) + (extra || 0);
    var rank = feature && feature.get ? Number(feature.get("rank")) : NaN;
    /* rank 越小越重要，declutter 优先保留（抬高 zIndex） */
    if (!isNaN(rank) && rank > 0) {
      base += Math.max(0, 40 - Math.min(rank, 40));
    }
    var d = feature && feature.get ? feature.get("drawOrder") : null;
    var n = d == null || d === "" ? 0 : Number(d);
    if (!isNaN(n)) base += Math.min(n, 100);
    return base;
  }

  function propsDrawOrder(props) {
    if (!props) return 0;
    var d = props.drawOrder;
    if (d == null || d === "") return 0;
    var n = Number(d);
    return isNaN(n) ? 0 : n;
  }

  /** 同 drawOrder 时：面在下、线在上、点最上 */
  function geometryPaintClass(props) {
    if (!props) return 1;
    var gt = props._geometryType;
    if (gt === "Point") return 2;
    if (gt === "LineString" || gt === "MultiLineString") return 1;
    if (gt === "Polygon" || gt === "MultiPolygon") return 0;
    return 1;
  }

  function linePolySortBand(props) {
    if (!props) return 9;
    var layer = props.layer;
    if (layer === "boundary") return 0;
    if (layer === "region") {
      var gt = props._geometryType;
      return gt === "LineString" || gt === "MultiLineString" ? 3 : 1;
    }
    if (layer === "building") return 2;
    if (layer === "road" || layer === "waterline") return 4;
    if (layer === "transit") return 5;
    return 10;
  }

  function sortFeaturesByPaintOrder(features) {
    return (features || []).slice().sort(function (a, b) {
      var pa = (a && a.properties) || {};
      var pb = (b && b.properties) || {};
      var ga = geometryPaintClass(pa);
      var gb = geometryPaintClass(pb);
      if (ga !== gb) return ga - gb;
      var da = propsDrawOrder(pa);
      var db = propsDrawOrder(pb);
      if (da !== db) return da - db;
      var ba = linePolySortBand(pa);
      var bb = linePolySortBand(pb);
      if (ba !== bb) return ba - bb;
      return String(pa.uid || "") < String(pb.uid || "") ? -1 : String(pa.uid || "") > String(pb.uid || "") ? 1 : 0;
    });
  }

  var REGION_PARK_WATER_MAX_Z = 20;

  /** POI 仅用 minZoom；忽略 maxZoom。区域/道路 overzoom 仍可忽略 min */
  function featureZoomVisible(feature, zoom) {
    if (zoom == null) return true;
    var layer = feature.get("layer");
    var mainKey = Number(feature.get("mainKey"));
    var subKey = feature.get("subKey");
    var minZ = feature.get("minZoom");
    var maxZ = feature.get("maxZoom");
    var name = feature.get("name") || "";
    if (isMacroGeoLayer(layer, mainKey, subKey)) return macroGeoMinZoomVisible(feature);

    if (layer === "building" && !featureBuildingMinZoomOk(feature)) return false;

    var adminKind = layer === "poi" && mainKey === 10002 ? matchAdminLabel(subKey) : null;
    var isAdminLabel = adminKind != null;
    if (isAdminLabel && adminKind === "town") return false;
    if (isAdminLabel && isTownshipAdminName(name)) return false;
    if (isAdminLabel && adminKind === "village" && !isVillageNameOnly(name)) return false;
    if (isAdminLabel && adminKind === "village" && !villageAdminLabelVisible(feature, zoom, name)) return false;
    if (isAdminLabel && isMacroAdminLabelKind(adminKind)) {
      if (!macroAdminMinZoomVisible(feature, adminKind)) return false;
      if (!adminLabelExclusiveVisible(feature, adminKind, name, zoom)) return false;
      return true;
    }
    if (isAdminLabel && adminKind === "capital" && !adminCapitalLabelVisible(adminKind, zoom)) return false;
    if (isAdminLabel && !adminShowAtZoom(adminKind, zoom)) return false;
    if (isAdminLabel) return true;

    if (isPoiTileMinZoomSuppressed(feature, layer)) return false;
    var isPoiLike =
      (layer === "poi" || layer === "transit") && !isAdminLabel;
    if (isPoiLike && !featurePoiMinZoomOk(feature, layer)) return false;
    var poiCat = isPoiLike ? matchPoi(mainKey, subKey, name) : null;
    if (
      isPoiLike &&
      (isCommunityOrCampusPoi(poiCat, name) || isMallNamePoi(poiCat, name))
    ) {
      return zoom == null || zoom >= MIN_POI_COMMUNITY_Z;
    }
    if (isPoiLike && poiFollowsTileMinZoom(poiCat, feature)) return poiTileZoomVisible(feature, poiCat);
    var gatedPoi = hasPoiStyleGate(poiCat);
    var tileZoomGated = isPoiLike && gatedPoi && isTileZoomGatedPoi(poiCat, name);
    if (tileZoomGated) return poiTileZoomVisible(feature, poiCat);

    var ignoreMin =
      (layer === "region" && zoom >= 8) ||
      (layer === "road" && zoom >= 8) ||
      layer === "building";
    /* 非瓦片门槛 POI / 轨交：overzoom 不因 maxZoom 消失 */
    var ignoreMax =
      layer === "boundary" ||
      (isPoiLike && !tileZoomGated) ||
      (layer === "building" && zoom >= ZOOM.building && zoom <= 20) ||
      (layer === "road" && mainKey === 20016) ||
      (layer === "region" && mainKey === 20016) ||
      (layer === "region" && zoom >= 8 && zoom <= 20) ||
      (layer === "region" &&
        isParkWaterRegion(mainKey, subKey) &&
        zoom <= REGION_PARK_WATER_MAX_Z) ||
      (layer === "waterline" && zoom <= REGION_PARK_WATER_MAX_Z) ||
      (layer === "road" && zoom >= 8 && zoom <= 20);
    if (!ignoreMin && minZ != null && minZ !== "" && !isNaN(Number(minZ)) && !tileMinZoomVisible(minZ))
      return false;
    if (!ignoreMax && maxZ != null && maxZ !== "" && !isNaN(Number(maxZ)) && !tileMaxZoomVisible(maxZ))
      return false;
    return true;
  }

  /* 国界实心红；省界灰实线（截图）；市界细灰；区县粉虚线 */
  var BOUNDARY_STYLE = {
    nation: { color: COLORS.borderNation, width: 2.4, dash: null, z: 50, minZ: 2 },
    foreign: { color: COLORS.borderForeign, width: 0.9, dash: null, z: 49, minZ: 3 },
    province: { color: COLORS.borderProvince, width: 1.2, dash: [10, 6], z: 48, minZ: ZOOM.provinceBorder },
    city: { color: COLORS.borderCity, width: 0.75, dash: [5, 3], z: 47, minZ: ZOOM.cityBorder },
    county: { color: COLORS.borderCounty, width: 0.7, dash: [5, 4], z: 46, minZ: ZOOM.countyBorder },
    town: { color: COLORS.borderTown, width: 0.6, dash: [3, 3], z: 45, minZ: ZOOM.townBorder },
  };

  var ADMIN_LABEL = {
    continent: {
      size: 20,
      weight: "bold",
      z: 73,
      marker: false,
      color: "#222222",
      minZ: 2,
      maxZ: 3,
    },
    country: {
      size: 16,
      weight: "bold",
      z: 72,
      marker: false,
      color: COLORS.chinaLabel,
      minZ: ZOOM.countryLabel[0],
      maxZ: ZOOM.countryLabel[1],
    },
    province: {
      size: 15,
      weight: "bold",
      z: 71,
      marker: false,
      color: "#555555",
      minZ: ZOOM.provinceLabel[0],
      maxZ: ZOOM.provinceLabel[1],
    },
    capital: {
      size: 15,
      weight: "bold",
      z: 71,
      marker: "capital",
      color: "#222222",
      minZ: ZOOM.capitalLabel[0],
      maxZ: ZOOM.capitalLabel[1],
    },
    city: {
      size: 15,
      weight: "bold",
      z: 70,
      marker: "city",
      color: "#333333",
      minZ: ZOOM.cityLabel[0],
      maxZ: ZOOM.cityLabel[1],
    },
    county: {
      size: 12,
      weight: "normal",
      z: 69,
      marker: false,
      color: "#9a9a9a",
      minZ: ZOOM.countyLabel[0],
      maxZ: ZOOM.countyLabel[1],
    },
    town: {
      size: 11,
      weight: "bold",
      z: 68,
      marker: false,
      color: "#555555",
      minZ: ZOOM.townLabel[0],
      maxZ: ZOOM.townLabel[1],
    },
    village: {
      size: 10,
      weight: "normal",
      z: 67,
      marker: false,
      color: "#555555",
      minZ: ZOOM.villageLabel[0],
      maxZ: ZOOM.villageLabel[1],
    },
    waterName: {
      size: 12,
      weight: "normal",
      z: 64,
      marker: false,
      color: COLORS.waterLabel,
      minZ: ZOOM.waterLabel[0],
      maxZ: ZOOM.waterLabel[1],
    },
  };

  var ROAD_MIN_Z = {
    highway: ZOOM.highway,
    ring: ZOOM.highway,
    national: ZOOM.national,
    provincial: ZOOM.provincial,
    secondary: ZOOM.secondary,
    tertiary: ZOOM.tertiary,
    local: ZOOM.local,
    path: ZOOM.path,
    link: ZOOM.local,
    buildingRoad: 13,
    subway: ZOOM.subway,
    railway: ZOOM.railway,
    hsr: ZOOM.railway,
    waterline: ZOOM.waterline,
  };

  function roadZoomScale(zoom, kind) {
    if (zoom == null) return 1;
    var major =
      kind === "highway" ||
      kind === "ring" ||
      kind === "national" ||
      kind === "provincial" ||
      kind === "secondary";
    if (zoom <= 6) return major ? 0.34 : 0.28;
    if (zoom <= 7) return major ? 0.4 : 0.34;
    if (zoom <= 8) return major ? 0.46 : 0.38;
    if (zoom <= 9) return major ? 0.58 : 0.5;
    if (zoom <= 10) return 0.72;
    if (zoom >= 10 && zoom <= 12) {
      if (kind === "highway" || kind === "ring") return 1.18;
      if (kind === "national" || kind === "provincial") return 1.08;
      if (kind === "secondary") return 0.98;
    }
    if (zoom >= 16 && (kind === "local" || kind === "path" || kind === "buildingRoad" || kind === "link")) {
      return 0.85;
    }
    if (zoom >= 14 && zoom <= 15) {
      if (kind === "local" || kind === "link" || kind === "buildingRoad") return 0.78;
      if (kind === "tertiary" || kind === "secondary") return 0.88;
      if (kind === "subway") return 0.72;
    }
    return 1;
  }

  function isFlatMidZoomRoad(kind, zoom) {
    if (zoom == null || zoom < 6 || zoom > 8) return false;
    return (
      kind === "highway" ||
      kind === "ring" ||
      kind === "national" ||
      kind === "provincial" ||
      kind === "secondary" ||
      kind === "tertiary"
    );
  }

  function scaleByZoom(base, zoom, refZoom) {
    var z = zoom == null ? refZoom : zoom;
    var scaled = Math.max(0.5, base * Math.pow(1.1, z - refZoom));
    if (z > 14) scaled *= Math.pow(1.06, z - 14);
    return scaled;
  }

  function drawGlyph(ctx, glyph, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = Math.max(1.2, r * 0.14);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var s = r * 0.55;

    if (glyph === "star") {
      ctx.beginPath();
      for (var i = 0; i < 5; i++) {
        var a = ((i * 72 - 90) * Math.PI) / 180;
        var b = (((i * 72 - 90 + 36) * Math.PI) / 180);
        var x1 = Math.cos(a) * s,
          y1 = Math.sin(a) * s;
        var x2 = Math.cos(b) * s * 0.42,
          y2 = Math.sin(b) * s * 0.42;
        if (i === 0) ctx.moveTo(x1, y1);
        else ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fill();
    } else if (glyph === "cross") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s);
      ctx.lineTo(s * 0.2, -s);
      ctx.lineTo(s * 0.2, -s * 0.2);
      ctx.lineTo(s, -s * 0.2);
      ctx.lineTo(s, s * 0.2);
      ctx.lineTo(s * 0.2, s * 0.2);
      ctx.lineTo(s * 0.2, s);
      ctx.lineTo(-s * 0.2, s);
      ctx.lineTo(-s * 0.2, s * 0.2);
      ctx.lineTo(-s, s * 0.2);
      ctx.lineTo(-s, -s * 0.2);
      ctx.lineTo(-s * 0.2, -s * 0.2);
      ctx.closePath();
      ctx.fill();
    } else if (glyph === "tree") {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.75, s * 0.15);
      ctx.lineTo(s * 0.3, s * 0.15);
      ctx.lineTo(s * 0.55, s * 0.7);
      ctx.lineTo(-s * 0.55, s * 0.7);
      ctx.lineTo(-s * 0.3, s * 0.15);
      ctx.lineTo(-s * 0.75, s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.12, s * 0.55, s * 0.24, s * 0.45);
    } else if (glyph === "bag") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.15);
      ctx.lineTo(-s * 0.55, s * 0.75);
      ctx.lineTo(s * 0.55, s * 0.75);
      ctx.lineTo(s * 0.7, -s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.35, Math.PI, 0);
      ctx.stroke();
    } else if (glyph === "food") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s * 0.7);
      ctx.lineTo(-s * 0.45, s * 0.7);
      ctx.moveTo(-s * 0.7, -s * 0.7);
      ctx.lineTo(-s * 0.7, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.55, s * 0.1, -s * 0.45, -s * 0.1);
      ctx.moveTo(s * 0.35, -s * 0.7);
      ctx.lineTo(s * 0.35, s * 0.7);
      ctx.moveTo(s * 0.15, -s * 0.7);
      ctx.lineTo(s * 0.55, -s * 0.7);
      ctx.stroke();
    } else if (glyph === "edu") {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.lineTo(s * 0.85, -s * 0.15);
      ctx.lineTo(0, s * 0.25);
      ctx.lineTo(-s * 0.85, -s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.55, s * 0.05, s * 1.1, s * 0.35);
    } else if (glyph === "temple") {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.85, -s * 0.25);
      ctx.lineTo(-s * 0.85, -s * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.55, -s * 0.2, s * 1.1, s * 0.95);
    } else if (glyph === "bed") {
      ctx.fillRect(-s * 0.75, -s * 0.15, s * 1.5, s * 0.55);
      ctx.fillRect(-s * 0.75, -s * 0.55, s * 0.45, s * 0.4);
    } else if (glyph === "house") {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.75);
      ctx.lineTo(s * 0.8, -s * 0.1);
      ctx.lineTo(s * 0.8, s * 0.7);
      ctx.lineTo(-s * 0.8, s * 0.7);
      ctx.lineTo(-s * 0.8, -s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(-s * 0.18, s * 0.15, s * 0.36, s * 0.55);
      ctx.fillStyle = "#fff";
    } else if (glyph === "gov") {
      /* 柱廊/机关楼 */
      ctx.fillRect(-s * 0.75, -s * 0.15, s * 1.5, s * 0.85);
      ctx.fillRect(-s * 0.85, -s * 0.35, s * 1.7, s * 0.22);
      ctx.fillRect(-s * 0.55, -s * 0.75, s * 0.18, s * 0.45);
      ctx.fillRect(-s * 0.09, -s * 0.75, s * 0.18, s * 0.45);
      ctx.fillRect(s * 0.37, -s * 0.75, s * 0.18, s * 0.45);
    } else if (glyph === "bus") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.5);
      ctx.lineTo(s * 0.55, -s * 0.5);
      ctx.lineTo(s * 0.65, -s * 0.25);
      ctx.lineTo(s * 0.65, s * 0.4);
      ctx.lineTo(-s * 0.65, s * 0.4);
      ctx.lineTo(-s * 0.65, -s * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(-s * 0.4, -s * 0.35, s * 0.8, s * 0.28);
    } else if (glyph === "metro") {
      /* 地铁站 M 标识 */
      ctx.font = "bold " + Math.round(s * 1.35) + "px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("M", 0, 1);
    } else if (glyph === "train") {
      /* 火车站车头剪影 */
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.35);
      ctx.lineTo(s * 0.45, -s * 0.35);
      ctx.quadraticCurveTo(s * 0.75, -s * 0.35, s * 0.75, 0);
      ctx.lineTo(s * 0.75, s * 0.35);
      ctx.lineTo(-s * 0.55, s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(-s * 0.4, -s * 0.22, s * 0.85, s * 0.22);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-s * 0.25, s * 0.48, s * 0.16, 0, Math.PI * 2);
      ctx.arc(s * 0.35, s * 0.48, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else if (glyph === "airport") {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(s * 0.18, -s * 0.1);
      ctx.lineTo(s * 0.85, s * 0.15);
      ctx.lineTo(s * 0.7, s * 0.35);
      ctx.lineTo(s * 0.12, s * 0.15);
      ctx.lineTo(0, s * 0.75);
      ctx.lineTo(-s * 0.12, s * 0.15);
      ctx.lineTo(-s * 0.7, s * 0.35);
      ctx.lineTo(-s * 0.85, s * 0.15);
      ctx.lineTo(-s * 0.18, -s * 0.1);
      ctx.closePath();
      ctx.fill();
    } else if (glyph === "bank") {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.lineTo(s * 0.75, -s * 0.25);
      ctx.lineTo(-s * 0.75, -s * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.55, -s * 0.2, s * 0.22, s * 0.7);
      ctx.fillRect(-s * 0.11, -s * 0.2, s * 0.22, s * 0.7);
      ctx.fillRect(s * 0.33, -s * 0.2, s * 0.22, s * 0.7);
      ctx.fillRect(-s * 0.7, s * 0.45, s * 1.4, s * 0.2);
    } else if (glyph === "sport") {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, 0);
      ctx.quadraticCurveTo(0, -s * 0.5, s * 0.5, 0);
      ctx.quadraticCurveTo(0, s * 0.5, -s * 0.5, 0);
      ctx.stroke();
    } else if (glyph === "stadium") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.75, s * 0.35);
      ctx.lineTo(-s * 0.55, -s * 0.45);
      ctx.quadraticCurveTo(0, -s * 0.75, s * 0.55, -s * 0.45);
      ctx.lineTo(s * 0.75, s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.35);
    } else if (glyph === "soccer") {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (var si = 0; si < 5; si++) {
        var sa = ((si * 72 - 90) * Math.PI) / 180;
        var sx = Math.cos(sa) * s * 0.22;
        var sy = Math.sin(sa) * s * 0.22;
        if (si === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (glyph === "basketball") {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, 0);
      ctx.lineTo(s * 0.62, 0);
      ctx.moveTo(0, -s * 0.62);
      ctx.quadraticCurveTo(s * 0.35, 0, 0, s * 0.62);
      ctx.quadraticCurveTo(-s * 0.35, 0, 0, -s * 0.62);
      ctx.stroke();
    } else if (glyph === "tennis") {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.35, s * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.75);
      ctx.lineTo(0, -s * 0.2);
      ctx.stroke();
    } else if (glyph === "swim") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.65, s * 0.15);
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.35, s * 0.65, s * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s * 0.05);
      ctx.lineTo(-s * 0.15, s * 0.05);
      ctx.lineTo(s * 0.15, -s * 0.05);
      ctx.lineTo(s * 0.45, s * 0.05);
      ctx.stroke();
    } else if (glyph === "gate") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.45);
      ctx.lineTo(-s * 0.35, s * 0.45);
      ctx.lineTo(s * 0.15, s * 0.45);
      ctx.lineTo(s * 0.55, 0);
      ctx.lineTo(s * 0.15, -s * 0.45);
      ctx.closePath();
      ctx.fill();
    } else if (glyph === "parking") {
      ctx.font = "bold " + Math.round(s * 1.05) + "px Arial, Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", 0, s * 0.04);
    } else if (glyph === "trafficlight") {
      var bw = s * 0.42;
      var bh = s * 1.05;
      ctx.fillStyle = "#eceff1";
      ctx.strokeStyle = "#b0bec5";
      ctx.lineWidth = Math.max(0.8, r * 0.08);
      ctx.beginPath();
      ctx.rect(-bw / 2, -bh / 2, bw, bh);
      ctx.fill();
      ctx.stroke();
      var colors = ["#ef5350", "#ffca28", "#66bb6a"];
      for (var ti = 0; ti < 3; ti++) {
        ctx.beginPath();
        ctx.arc(0, -bh * 0.28 + ti * bh * 0.28, s * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = colors[ti];
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
    } else if (glyph === "charging") {
      ctx.beginPath();
      ctx.moveTo(s * 0.08, -s * 0.55);
      ctx.lineTo(-s * 0.28, s * 0.05);
      ctx.lineTo(-s * 0.02, s * 0.05);
      ctx.lineTo(-s * 0.12, s * 0.58);
      ctx.lineTo(s * 0.32, -s * 0.02);
      ctx.lineTo(s * 0.04, -s * 0.02);
      ctx.closePath();
      ctx.fill();
    } else if (glyph === "carwash") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, s * 0.15);
      ctx.lineTo(-s * 0.25, -s * 0.35);
      ctx.lineTo(s * 0.35, -s * 0.35);
      ctx.lineTo(s * 0.55, s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.55, s * 0.12, s * 1.1, s * 0.18);
      ctx.beginPath();
      ctx.arc(-s * 0.28, s * 0.42, s * 0.12, 0, Math.PI * 2);
      ctx.arc(s * 0.28, s * 0.42, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (glyph === "restroom") {
      ctx.font = "bold " + Math.round(s * 0.72) + "px Arial, Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("WC", 0, 1);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function getPoiIcon(kind, size, ol, zoom) {
    var compact = isUrbanDetailZoom(zoom) || isParkDetailZoom(zoom);
    var key = kind + "_" + size + (compact ? "_c" : "");
    if (iconCache[key]) return iconCache[key];
    var conf = POI[kind] || POI.default;
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = size * dpr;
    canvas.width = s;
    canvas.height = s;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, s, s);
    if (!compact) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2 + 0.6 * dpr, s * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fill();
    }
    var radius = compact ? s * 0.36 : s * 0.38;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = conf.bg;
    ctx.fill();
    ctx.lineWidth = (compact ? 0.9 : 1.1) * dpr;
    ctx.strokeStyle = compact ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.22)";
    ctx.stroke();
    drawGlyph(ctx, conf.glyph, s / 2, s / 2, radius);

    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  /** 公交站/停车/大门：蓝或青方标 */
  function getSquarePoiIcon(kind, size, ol) {
    var key = "sqpoi_" + kind + "_" + size;
    if (iconCache[key]) return iconCache[key];
    var conf = POI[kind] || POI.default;
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = size * dpr;
    canvas.width = s;
    canvas.height = s;
    var ctx = canvas.getContext("2d");
    var pad = s * 0.12;
    var side = s - pad * 2;
    var rad = side * 0.18;
    ctx.beginPath();
    ctx.moveTo(pad + rad, pad);
    ctx.lineTo(pad + side - rad, pad);
    ctx.quadraticCurveTo(pad + side, pad, pad + side, pad + rad);
    ctx.lineTo(pad + side, pad + side - rad);
    ctx.quadraticCurveTo(pad + side, pad + side, pad + side - rad, pad + side);
    ctx.lineTo(pad + rad, pad + side);
    ctx.quadraticCurveTo(pad, pad + side, pad, pad + side - rad);
    ctx.lineTo(pad, pad + rad);
    ctx.quadraticCurveTo(pad, pad, pad + rad, pad);
    ctx.closePath();
    ctx.fillStyle = conf.bg;
    ctx.fill();
    ctx.lineWidth = 0.8 * dpr;
    ctx.strokeStyle = kind === "busstop" ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.55)";
    ctx.stroke();
    drawGlyph(ctx, conf.glyph, s / 2, s / 2, side * 0.38);
    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  /** 红绿灯：竖条三色灯 */
  function getTrafficLightIcon(size, ol) {
    var key = "trafficlight_" + size;
    if (iconCache[key]) return iconCache[key];
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = size * dpr;
    canvas.width = s;
    canvas.height = s;
    var ctx = canvas.getContext("2d");
    drawGlyph(ctx, "trafficlight", s / 2, s / 2, s * 0.38);
    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  function resolvePoiIcon(kind, size, ol, zoom) {
    if (kind === "metro") return getMetroStationIcon(size, ol);
    /* 学校/医院/政府：方标（对齐参考图） */
    if (kind === "edu" || kind === "health" || kind === "gov") {
      return getSquarePoiIcon(kind, size, ol);
    }
    if (kind === "trafficlight") return getTrafficLightIcon(size, ol);
    return getPoiIcon(kind, size, ol, zoom);
  }

  function poiIconForLabel(kind, size, ol, zoom, hasLabel, mainKey, subKey, name) {
    var icon = resolvePoiSpriteIcon(mainKey, subKey, name, kind, size, ol, zoom);
    if (!icon) icon = resolvePoiIcon(kind, size, ol, zoom);
    return icon;
  }

  function parseMetroExitLetter(name) {
    var n = String(name || "").trim();
    if (/^[A-Z]$/.test(n)) return n;
    var m = n.match(/^([A-Z])口$/);
    if (m) return m[1];
    m = n.match(/([A-Z])(?:出口|口)/);
    if (m) return m[1];
    return "";
  }

  function isMetroExit(mainKey, subKey, name) {
    var mk = Number(mainKey),
      sk = Number(subKey);
    if (mk === 10006 && hasSub(sk, [1, 2])) return true;
    if (mk === 10005 && hasSub(sk, [41])) return true;
    return !!parseMetroExitLetter(name);
  }

  function isMetroStation(mainKey, subKey, name) {
    var mk = Number(mainKey);
    if (mk !== 10005 && mk !== 10006) return false;
    return !isMetroExit(mainKey, subKey, name);
  }

  /** 地铁站：白圆角方底 + 红圆角方 + 白 M（对齐高德截图） */
  function getMetroStationIcon(size, ol) {
    var key = "metro_station_sq_" + size;
    if (iconCache[key]) return iconCache[key];
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = size * dpr;
    canvas.width = s;
    canvas.height = s;
    var ctx = canvas.getContext("2d");

    function roundRect(x, y, w, h, rad) {
      var r = Math.min(rad, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    var outerPad = s * 0.05;
    var outerW = s - outerPad * 2;
    var outerR = outerW * 0.24;
    roundRect(outerPad, outerPad, outerW, outerW, outerR);
    ctx.fillStyle = COLORS.metroStationOuter;
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, 0.75 * dpr);
    ctx.strokeStyle = "#d0d0d0";
    ctx.stroke();

    var innerPad = s * 0.19;
    var innerW = s - innerPad * 2;
    var innerR = innerW * 0.2;
    roundRect(innerPad, innerPad, innerW, innerW, innerR);
    ctx.fillStyle = COLORS.metroStation;
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold " + Math.round(innerW * 0.58) + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("M", s / 2, s / 2 + innerW * 0.02);

    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  /** 地铁出口：黄底方标 + 黑字母（对齐高德截图） */
  function getMetroExitIcon(letter, size, ol) {
    var ch = String(letter || "A").charAt(0).toUpperCase();
    var key = "metro_exit_y_" + ch + "_" + size;
    if (iconCache[key]) return iconCache[key];
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = size * dpr;
    canvas.width = s;
    canvas.height = s;
    var ctx = canvas.getContext("2d");
    var pad = s * 0.1;
    ctx.fillStyle = COLORS.metroExit;
    ctx.fillRect(pad, pad, s - pad * 2, s - pad * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.7 * dpr;
    ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);
    ctx.fillStyle = COLORS.metroExitText;
    ctx.font = "bold " + Math.round(s * 0.48) + "px Arial, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, s / 2, s / 2 + 0.5 * dpr);

    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  /** 省会/地级市红靶心（截图） */
  function getCityMarker(kind, ol) {
    var key = "citymark_" + kind;
    if (iconCache[key]) return iconCache[key];
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var size = (kind === "capital" ? 12 : 9) * dpr;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    var c = size / 2;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 1.4 * dpr;
    ctx.strokeStyle = COLORS.cityDot;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, size * (kind === "capital" ? 0.18 : 0.16), 0, Math.PI * 2);
    ctx.fillStyle = COLORS.cityDot;
    ctx.fill();
    if (kind === "capital") {
      ctx.beginPath();
      ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.cityDot;
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();
    }
    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  function shieldColors(shield, kind) {
    var s = String(shield || "").trim();
    if (!s) return null;
    if (/^G/i.test(s)) {
      if (kind === "highway" || kind === "ring") {
        return { bg: COLORS.shieldGreen, text: "#ffffff", border: "#ffffff" };
      }
      return { bg: COLORS.shieldRed, text: "#ffffff", border: "#ffffff" };
    }
    if (/^S/i.test(s)) {
      return { bg: COLORS.shieldYellow, text: "#333333", border: "#e8c868" };
    }
    if (/^X/i.test(s)) {
      return { bg: COLORS.shieldYellow, text: "#333333", border: "#e8c868" };
    }
    return { bg: "#ffffff", text: "#333333", border: "#cccccc" };
  }

  function getRoadShieldIcon(shield, kind, ol) {
    var sc = shieldColors(shield, kind);
    if (!sc) return null;
    var key = "shield_" + shield + "_" + kind;
    if (iconCache[key]) return iconCache[key];
    var canvas = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var text = String(shield);
    var fs = text.length > 4 ? 8 : 9;
    var padX = 5;
    var w = Math.max(28, text.length * (fs * 0.62) + padX * 2);
    var h = 16;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    var r = 3;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = sc.bg;
    ctx.fill();
    ctx.strokeStyle = sc.border;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = sc.text;
    ctx.font = "bold " + fs + "px Arial, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 0.5);
    var icon = canvasToIcon(canvas, ol, 1 / dpr);
    iconCache[key] = icon;
    return icon;
  }

  function lineAnchorGeometry(feature, ol) {
    var geom = feature.getGeometry && feature.getGeometry();
    if (!geom) return geom;
    var type = geom.getType ? geom.getType() : "";
    var coords;
    if (type === "LineString") coords = geom.getCoordinates();
    else if (type === "MultiLineString") {
      var lines = geom.getCoordinates();
      coords = lines.length ? lines[0] : null;
    } else return geom;
    if (!coords || coords.length < 2) return geom;
    var mid = Math.floor(coords.length / 2);
    return new ol.geom.Point(coords[mid]);
  }

  function regionPolygonStroke(rk, rs, Stroke) {
    if (rk === "land") return undefined;
    if (rk.indexOf("sport") === 0 && rs.stroke && rs.width) {
      return new Stroke({ color: rs.stroke, width: rs.width, lineJoin: "round" });
    }
    if (rk.indexOf("sport") === 0) return undefined;
    if (!rs.stroke || !rs.width) return undefined;
    return new Stroke({ color: rs.stroke, width: rs.width });
  }

  function styleBoundaryStroke(subKey, zoom, ol) {
    var Style = ol.style.Style;
    var Stroke = ol.style.Stroke;
    var bk = matchBoundary(subKey);
    var bs = BOUNDARY_STYLE[bk] || BOUNDARY_STYLE.province;
    var baseW = bs.width;
    var dash = bs.dash;
    var color = bs.color;
    if (bk === "nation" && Number(subKey) === 9) {
      dash = [8, 6];
      color = COLORS.borderNation;
    }
    if (zoom != null) {
      if (bk === "nation") baseW = zoom <= 5 ? 3.0 : zoom <= 8 ? 2.4 : 2.0;
      else if (bk === "foreign") baseW = zoom <= 5 ? 1.2 : 0.9;
      else if (bk === "province") baseW = zoom <= 6 ? 1.6 : zoom <= 10 ? 1.3 : 1.1;
    }
    return new Style({
      zIndex: Z_LINE + bs.z,
      stroke: new Stroke({
        color: color,
        width: baseW,
        lineDash: dash || undefined,
        lineCap: "butt",
        lineJoin: "round",
      }),
    });
  }

  /** 区域面内线（跑道分道、球场白线等），不用行政界红线 */
  function styleRegionLine(mainKey, subKey, zoom, ol, feature) {
    var mk = Number(mainKey);
    if (mk === 20016) return styleBoundaryStroke(subKey, zoom, ol);
    if (mk === 20010 || mk === 20015 || mk === 20019) {
      var rk = matchRoad(mk, subKey);
      var nm = (feature && feature.get && feature.get("name")) || "";
      var sh = (feature && feature.get && feature.get("shield")) || "";
      return styleRoadLike(rk, nm, zoom, ol, subKey, sh, feature);
    }

    var Style = ol.style.Style;
    var Stroke = ol.style.Stroke;
    var rk = matchRegion(mainKey, subKey);
    if (rk === "sport") {
      var sk = matchSportRegion(subKey);
      var coreW = scaleByZoom(sk === "sportTrack" ? 1.15 : 0.9, zoom, 14);
      if (isParkDetailZoom(zoom)) coreW *= 1.3;
      var zLine = featureLineZIndex(feature, 8) + 2;
      return [
        new Style({
          zIndex: zLine,
          stroke: new Stroke({
            color: "rgba(255,255,255,0.92)",
            width: coreW + 1.4,
            lineCap: "round",
            lineJoin: "round",
          }),
        }),
        new Style({
          zIndex: zLine + 1,
          stroke: new Stroke({
            color: "#ffffff",
            width: coreW,
            lineCap: "round",
            lineJoin: "round",
          }),
        }),
      ];
    }
    if (rk === "green" || rk === "scenic" || rk === "edu") {
      var zGreen = featureLineZIndex(feature, 3);
      return new Style({
        zIndex: zGreen,
        stroke: new Stroke({
          color: COLORS.greenStroke,
          width: 0.35,
          lineCap: "round",
          lineJoin: "round",
        }),
      });
    }
    return new Style({
      zIndex: featureLineZIndex(feature, 3),
      stroke: new Stroke({
        color: COLORS.urbanStroke,
        width: 0.3,
        lineCap: "round",
        lineJoin: "round",
      }),
    });
  }

  function styleRoadLike(kind, name, zoom, ol, subKey, shield, feature) {
    var Style = ol.style.Style;
    var Fill = ol.style.Fill;
    var Stroke = ol.style.Stroke;
    var Text = ol.style.Text;
    var rd = ROAD_STYLE[kind] || ROAD_STYLE.local;
    shield = shield || "";

    if (zoom != null && ROAD_MIN_Z[kind] != null && zoom < ROAD_MIN_Z[kind]) return null;

    var fillColor = rd.fill;
    if (kind === "subway") fillColor = subwayColor(subKey);
    if (isParkDetailZoom(zoom)) {
      if (kind === "path" || kind === "buildingRoad") fillColor = "#ffffff";
      else if (kind === "national" || kind === "provincial" || kind === "secondary") fillColor = "#ffd478";
    }

    /* 参考 z6–8 区域图：路线更细；中级别主干/次干用单色线 */
    var ref = kind === "highway" || kind === "ring" ? 10 : 12;
    var styles = [];
    var cw = scaleByZoom(rd.cw, zoom, ref);
    var fw = scaleByZoom(rd.fw, zoom, ref);
    var zs = roadZoomScale(zoom, kind);
    cw *= zs;
    fw *= zs;
    var flatMid = isFlatMidZoomRoad(kind, zoom);
    var zBase = feature ? featureLineZIndex(feature, rd.z) : Z_LINE + rd.z;

    if (isParkDetailZoom(zoom) && (kind === "path" || kind === "buildingRoad")) {
      var parkPathW = scaleByZoom(kind === "path" ? 1.0 : 1.25, zoom, 14);
      return [
        new Style({
          zIndex: zBase,
          stroke: new Stroke({
            color: "#ffffff",
            width: parkPathW,
            lineCap: "round",
            lineJoin: "round",
          }),
        }),
      ];
    }

    if (kind === "hsr") {
      /* 高铁：淡红白轨，低级别更细淡 */
      var hsrRed = COLORS.hsr;
      var hsrW = zoom != null && zoom < 10 ? fw * 0.75 : fw;
      styles.push(
        new Style({
          zIndex: zBase,
          stroke: new Stroke({
            color: COLORS.railwayCasing,
            width: Math.max(hsrW + 0.8, cw * 0.7),
            lineCap: "butt",
            lineJoin: "round",
          }),
        })
      );
      styles.push(
        new Style({
          zIndex: zBase + 1,
          stroke: new Stroke({
            color: hsrRed,
            width: Math.max(0.7, hsrW * 0.55),
            lineCap: "butt",
            lineDash: [4, 5],
            lineJoin: "round",
          }),
        })
      );
    } else if (kind === "railway") {
      /* 普铁：区域图深灰虚线 */
      var regional = isRegionalZoom(zoom);
      var railW =
        zoom != null && zoom < 10
          ? Math.max(0.55, fw * 0.7)
          : regional
            ? Math.max(0.65, fw * 0.72)
            : fw;
      var railColor = regional ? "#888888" : COLORS.railway;
      var casingW = regional ? railW + 0.5 : railW + 0.7;
      styles.push(
        new Style({
          zIndex: zBase,
          stroke: new Stroke({
            color: COLORS.railwayCasing,
            width: casingW,
            lineCap: "butt",
            lineJoin: "round",
          }),
        })
      );
      styles.push(
        new Style({
          zIndex: zBase + 1,
          stroke: new Stroke({
            color: railColor,
            width: railW,
            lineCap: "butt",
            lineDash: [2.5, 4],
            lineJoin: "round",
          }),
        })
      );
    } else if (kind === "subway") {
      /* 地铁：分色线；z14–15 白边（对齐运动公园截图） */
      var sc = fillColor;
      var urbanSub = isUrbanDetailZoom(zoom);
      var sw = Math.max(urbanSub ? 2.4 : 1.4, fw * (urbanSub ? 0.72 : 1));
      if (urbanSub) {
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: "#ffffff",
              width: sw + 1.8,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      }
      styles.push(
        new Style({
          zIndex: zBase + 1,
          stroke: new Stroke({
            color: sc,
            width: sw,
            lineCap: "round",
            lineJoin: "round",
          }),
        })
      );
    } else if (
      isUrbanDetailZoom(zoom) &&
      kind !== "waterline" &&
      kind !== "path" &&
      kind !== "link" &&
      kind !== "buildingRoad" &&
      kind !== "railway" &&
      kind !== "hsr"
    ) {
      /* z14–15 城区详图：橙黄主干道白边 · 白次干道灰边 · 淡黄支路 */
      if (kind === "highway" || kind === "ring") {
        var hwUrban = Math.max(2.6, fw * 0.92);
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: "#ffffff",
              width: hwUrban + 2.0,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: COLORS.highway,
              width: hwUrban,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (kind === "national" || kind === "provincial") {
        var natW = Math.max(2.0, fw * 0.85);
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: "#ffffff",
              width: natW + 1.4,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: COLORS.national,
              width: natW,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (kind === "secondary") {
        var secW = Math.max(1.5, fw * 0.76);
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: "#ffe082",
              width: secW,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (kind === "tertiary" || kind === "local" || kind === "link") {
        var locW = Math.max(1.35, fw * 0.7);
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: COLORS.localCasing,
              width: locW + 0.9,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: "#ffffff",
              width: locW,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (rd.casing && rd.cw > 0) {
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: rd.casing,
              width: cw * 0.9,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: fillColor,
              width: fw * 0.9,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else {
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: fillColor,
              width: Math.max(0.8, fw * 0.82),
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      }
    } else if (
      (isRegionalZoom(zoom) || isOverviewZoom(zoom)) &&
      kind !== "waterline" &&
      kind !== "path" &&
      kind !== "link" &&
      kind !== "buildingRoad"
    ) {
      /* z8–12 区域/城市概览：高速白边橙芯 · 国道橙黄 · 次道浅橙 · 支路淡线 */
      if (kind === "highway" || kind === "ring") {
        var hwW = Math.max(2.6, fw * 1.05);
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: "#ffffff",
              width: hwW + 2.2,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: COLORS.highway,
              width: hwW,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (kind === "national" || kind === "provincial") {
        var nw = Math.max(1.8, fw * 0.9);
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: COLORS.national,
              width: nw,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (kind === "secondary") {
        var sw = Math.max(1.3, fw * 0.75);
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: "#ffd180",
              width: sw,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (kind === "tertiary" || kind === "local") {
        var lw = Math.max(0.85, fw * 0.62);
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: "#fff8ef",
              width: lw,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else if (rd.casing && rd.cw > 0) {
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: rd.casing,
              width: cw * 0.85,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: fillColor,
              width: fw * 0.85,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      } else {
        styles.push(
          new Style({
            zIndex: zBase + 1,
            stroke: new Stroke({
              color: fillColor,
              width: Math.max(0.7, fw * 0.8),
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      }
    } else if (flatMid) {
      /* z6–8：细单色路网（对齐区域截图，无宽边） */
      var midW =
        kind === "highway" || kind === "ring"
          ? Math.max(0.75, fw)
          : kind === "national" || kind === "provincial"
            ? Math.max(0.55, fw * 0.88)
            : Math.max(0.45, fw * 0.75);
      styles.push(
        new Style({
          zIndex: zBase + 1,
          stroke: new Stroke({
            color: fillColor,
            width: midW,
            lineCap: "round",
            lineJoin: "round",
          }),
        })
      );
    } else {
      if (rd.casing && rd.cw > 0) {
        styles.push(
          new Style({
            zIndex: zBase,
            stroke: new Stroke({
              color: rd.casing,
              width: cw,
              lineCap: "round",
              lineJoin: "round",
            }),
          })
        );
      }
      styles.push(
        new Style({
          zIndex: zBase + 1,
          stroke: new Stroke({
            color: fillColor,
            width: fw,
            lineCap: "round",
            lineJoin: "round",
            lineDash: kind === "buildingRoad" ? [5, 4] : undefined,
          }),
        })
      );
    }

    /* 国道/省道/高速路牌（G 绿/红 · S 黄 · X 黄）；视口同名最多 3 个 */
    if (shield && roadShieldAtZoom(kind, zoom, shield, feature)) {
      var shieldIcon = getRoadShieldIcon(shield, kind, ol);
      if (shieldIcon) {
        styles.push(
          new Style({
            zIndex: zBase + 3,
            geometry: function (f) {
              return lineAnchorGeometry(f, ol);
            },
            image: shieldIcon,
          })
        );
      }
    }

    /* 河名：浅蓝沿线标注（区域图 泾河 等） */
    if (kind === "waterline" && name && zoom != null && zoom >= 8) {
      styles.push(
        new Style({
          zIndex: fixedLabelZIndex(LABEL_PRIO.waterName),
          text: makeLabelText(Text, Fill, Stroke, {
            text: String(name),
            font:
              (isRegionalZoom(zoom) ? "11px " : "10px ") +
              "Microsoft YaHei, PingFang SC, sans-serif",
            placement: "line",
            color: COLORS.waterLabel,
            haloWidth: 1.5,
          }),
        })
      );
    }

    /* 路名：随级别逐步显示；密集时由图层 declutter 防碰撞 */
    if (name && roadLabelAtZoom(kind, zoom)) {
      var showMajor =
        zoom >= MIN_MAJOR_ROAD_LABEL_Z &&
        (kind === "highway" || kind === "national" || kind === "provincial" || kind === "ring");
      var showUrban =
        zoom >= 15 &&
        (kind === "secondary" || kind === "tertiary" || kind === "local" || kind === "buildingRoad");
      var showSubway = zoom >= MIN_METRO_LINE_LABEL_Z && kind === "subway";
      var showRegionalSecondary = zoom >= 14 && kind === "secondary";
      var roadLabelZ =
        kind === "highway" || kind === "ring" || kind === "national"
          ? LABEL_PRIO.roadMajor
          : LABEL_PRIO.roadMinor;
      var regionalRoad = isRegionalZoom(zoom);
      var labelColor = showSubway ? fillColor : COLORS.labelRoad;
      var labelHalo = COLORS.labelHalo;
      var urbanRoad = isUrbanDetailZoom(zoom);
      var roadLabelFs = showMajor
        ? regionalRoad
          ? "9px "
          : "bold 11px "
        : showUrban || showRegionalSecondary
          ? "9px "
          : urbanRoad
            ? "9px "
            : "10px ";
      styles.push(
        new Style({
          zIndex: fixedLabelZIndex(roadLabelZ),
          text: makeLabelText(Text, Fill, Stroke, {
            text: String(name),
            font: roadLabelFs + "Microsoft YaHei, PingFang SC, sans-serif",
            placement: "line",
            color: labelColor,
            halo: labelHalo,
            haloWidth: regionalRoad || showRegionalSecondary ? 1.5 : urbanRoad ? 1.5 : 2,
          }),
        })
      );
    }
    return styles;
  }

  /** 全国省级/省会标注（Zoom4 省名 · Zoom5 省会叠加；瓦片无省名 POI） */
  var CHINA_PROVINCE_LABELS = [
    ["黑龙江", 128.2, 48.5],
    ["吉林", 126.5, 43.8],
    ["辽宁", 122.6, 41.3],
    ["内蒙古", 111.5, 41.5],
    ["河北", 115.5, 39.0],
    ["北京", 116.4, 40.2],
    ["天津", 117.2, 39.1],
    ["山西", 112.5, 37.8],
    ["山东", 118.0, 36.5],
    ["河南", 113.6, 34.5],
    ["陕西", 108.5, 34.2],
    ["甘肃", 103.8, 36.0],
    ["宁夏", 106.2, 37.3],
    ["青海", 96.0, 35.5],
    ["新疆", 87.6, 41.8],
    ["西藏", 88.5, 31.5],
    ["四川", 102.5, 30.5],
    ["重庆", 107.5, 29.8],
    ["湖北", 112.2, 31.0],
    ["湖南", 111.5, 27.5],
    ["江苏", 119.5, 33.0],
    ["安徽", 117.2, 32.0],
    ["上海", 121.4, 31.2],
    ["浙江", 120.2, 29.2],
    ["江西", 115.5, 27.5],
    ["福建", 118.0, 26.2],
    ["广东", 113.5, 23.5],
    ["广西", 108.5, 23.5],
    ["海南", 109.8, 19.2],
    ["贵州", 106.7, 26.6],
    ["云南", 101.5, 25.0],
    ["台湾", 121.0, 23.8],
    ["香港", 114.1, 22.3],
    ["澳门", 113.5, 22.1],
  ];

  var CHINA_CAPITAL_LABELS = [
    ["哈尔滨", 126.63, 45.75],
    ["长春", 125.32, 43.88],
    ["沈阳", 123.43, 41.8],
    ["呼和浩特", 111.75, 40.84],
    ["石家庄", 114.48, 38.03],
    ["太原", 112.55, 37.87],
    ["济南", 117.0, 36.65],
    ["郑州", 113.65, 34.76],
    ["西安", 108.94, 34.34],
    ["兰州", 103.82, 36.06],
    ["西宁", 101.78, 36.62],
    ["银川", 106.23, 38.49],
    ["乌鲁木齐", 87.62, 43.82],
    ["拉萨", 91.11, 29.65],
    ["成都", 104.06, 30.67],
    ["武汉", 114.31, 30.59],
    ["长沙", 112.94, 28.23],
    ["南京", 118.8, 32.06],
    ["合肥", 117.28, 31.86],
    ["杭州", 120.15, 30.28],
    ["南昌", 115.89, 28.68],
    ["福州", 119.3, 26.08],
    ["广州", 113.26, 23.13],
    ["南宁", 108.37, 22.82],
    ["海口", 110.35, 20.02],
    ["贵阳", 106.63, 26.65],
    ["昆明", 102.73, 25.04],
  ];

  function buildAdminOverlayGeoJSON() {
    var features = [];
    CHINA_PROVINCE_LABELS.forEach(function (row, i) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row[1], row[2]] },
        properties: { layer: "adminOverlay", kind: "province", name: row[0], uid: "prov_" + i },
      });
    });
    CHINA_CAPITAL_LABELS.forEach(function (row, i) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row[1], row[2]] },
        properties: { layer: "adminOverlay", kind: "capital", name: row[0], uid: "cap_" + i },
      });
    });
    return { type: "FeatureCollection", features: features };
  }

  function styleAdminOverlay(feature, zoom, ol) {
    var kind = feature.get("kind");
    var name = feature.get("name") || "";
    if (!name || zoom == null) return null;
    var Style = ol.style.Style;
    var Fill = ol.style.Fill;
    var Stroke = ol.style.Stroke;
    var Text = ol.style.Text;

    if (kind === "province") {
      if (zoom < 4 || zoom > ADMIN_PROVINCE_ONLY_MAX_Z) return null;
      if (!adminProvinceLabelVisible(feature, name, zoom)) return null;
      return new Style({
        zIndex: fixedLabelZIndex(LABEL_PRIO.province + 2),
        text: makeLabelText(Text, Fill, Stroke, {
          text: String(name),
          font: "bold 15px Microsoft YaHei, PingFang SC, sans-serif",
          color: "#555555",
          haloWidth: 3,
        }),
      });
    }
    if (kind === "capital") {
      if (zoom < 5 || zoom >= 6) return null;
      return new Style({
        zIndex: fixedLabelZIndex(LABEL_PRIO.capital + 2),
        image: getCityMarker("capital", ol),
        text: makeLabelText(Text, Fill, Stroke, {
          text: String(name),
          font: "bold 15px Microsoft YaHei, PingFang SC, sans-serif",
          offsetX: 14,
          textAlign: "left",
          color: "#222222",
          haloWidth: 3,
        }),
      });
    }
    return null;
  }

  /** POI/轨交点：图标 + 右侧文字（poi 与 transit 共用） */
  function stylePoiPoint(feature, mainKey, subKey, name, zoom, ol) {
    var Style = ol.style.Style;
    var Fill = ol.style.Fill;
    var Stroke = ol.style.Stroke;
    var Text = ol.style.Text;

    var nm = String(name || "").trim();
    if (isCompanyPoi(nm)) return null;
    if (isVillageCommitteeName(nm)) return null;
    if (!featurePoiMinZoomOk(feature, feature.get("layer"))) return null;
    if (isOverlayDetailPoiBlocked(feature, zoom)) return null;

    /* 楼号 POI：纯文字、z17+（与 building 面标注一致） */
    if (isBuildingLabelName(nm)) {
      if (zoom != null && zoom < MIN_BUILDING_LABEL_Z) return null;
      return new Style({
        zIndex: buildingLabelZIndex(feature, nm),
        text: makeLabelText(Text, Fill, Stroke, {
          text: nm,
          font: (zoom >= 18 ? 10 : 9) + "px Microsoft YaHei, PingFang SC, sans-serif",
          color: COLORS.buildingLabelMuted,
          haloWidth: 2.5,
          overflow: true,
        }),
      });
    }

    var pk = matchPoi(mainKey, subKey, name);
    if (pk === "admin") return null;
    /* 图中未出现的未分类类型：先不显示 */
    if (pk === "default" || pk === "carwash" || pk === "restroom" || pk === "trafficlight")
      return null;

    if (pk === "metro" && isMetroExit(mainKey, subKey, name)) {
      if (zoom != null && zoom < 15) return null;
      return new Style({
        zIndex: featurePointZIndex(feature, LABEL_PRIO.poiTransport + 1),
        image: getMetroExitIcon(parseMetroExitLetter(name) || "A", scalePoiIconSize(zoom >= 16 ? 12 : 11), ol),
      });
    }

    var cat = pk;
    if (hasPoiStyleGate(cat)) {
      if (zoom != null && !poiShowAtZoom(cat, zoom, name, feature)) return null;
      if (zoom != null && !poiRankAtZoom(feature.get("rank"), zoom, cat, name, feature)) return null;
    } else {
      return null;
    }

    /* 仅图标类可无标注；其余必须有名称 */
    var iconOnly = isIconOnlyPoi(cat, nm);
    if (!nm && !iconOnly && cat !== "trafficlight") return null;

    var size = scalePoiIconSize(poiIconPixelSize(pk, zoom, nm));
    var poiZ =
      pk === "metro" || pk === "train" || pk === "airport" || pk === "transport" || pk === "busstop"
        ? LABEL_PRIO.poiTransport
        : pk === "gov"
          ? LABEL_PRIO.poiGov
          : pk === "edu" || pk === "culture" || pk === "nature" || pk === "amusement"
            ? LABEL_PRIO.poiLandmark
            : pk === "health" || pk === "shop" || pk === "hotel"
              ? LABEL_PRIO.poiDefault + 8
              : LABEL_PRIO.poiDefault;
    var iconKind = pk === "admin" ? "gov" : pk;
    var renderKind = iconOnly ? iconOnlyRenderKind(cat, nm) : iconKind;
    var labelFs = poiLabelFontSize(pk, zoom);
    var showPoiText = !!nm && !iconOnly && poiTextAtZoom(cat, zoom, name, feature);

    /* 小区名：参考图多为纯文字、无图标 */
    if (pk === "residential") {
      if (!nm || !showPoiText) return null;
      return new Style({
        zIndex: featurePointZIndex(feature, LABEL_PRIO.poiDefault),
        text: makeLabelText(Text, Fill, Stroke, {
          text: nm,
          font: labelFs + "px Microsoft YaHei, PingFang SC, sans-serif",
          color: "#555555",
          haloWidth: 2,
        }),
      });
    }

    if (pk === "metro") {
      return new Style({
        zIndex: featurePointZIndex(feature, poiZ),
        image: poiIconForLabel("metro", size, ol, zoom, showPoiText, mainKey, subKey, name),
        text: showPoiText
          ? makePoiLabelText(Text, Fill, Stroke, {
              text: nm,
              fontSize: 11,
              bold: false,
              kind: "metro",
              iconSize: size,
              zoom: zoom,
              color: "#333333",
              haloWidth: 2,
            })
          : undefined,
      });
    }

    return new Style({
      zIndex: featurePointZIndex(feature, poiZ),
      image: poiIconForLabel(renderKind, size, ol, zoom, showPoiText, mainKey, subKey, name),
      text: showPoiText
        ? makePoiLabelText(Text, Fill, Stroke, {
            text: nm,
            fontSize: labelFs,
            bold: poiLabelBold(iconKind, name),
            kind: iconKind,
            iconSize: size,
            zoom: zoom,
            color: poiLabelColorForKind(iconKind, zoom),
            haloWidth: zoom != null && zoom >= 14 ? 2.5 : 2,
            overflow: isParkDetailZoom(zoom),
          })
        : undefined,
    });
  }

  function styleFeature(feature, resolution, ol, zoom, extent, tileAttrZoom) {
    currentTileAttrZoom =
      tileAttrZoom != null && !isNaN(Number(tileAttrZoom)) ? Math.round(Number(tileAttrZoom)) : null;
    setStyleViewContext(zoom, extent);
    if (!featureZoomVisible(feature, zoom)) return null;

    var layer = feature.get("layer");
    var mainKey = feature.get("mainKey");
    var subKey = feature.get("subKey");
    var name = feature.get("name") || "";
    var shield = feature.get("shield") || "";
    var Style = ol.style.Style;
    var Fill = ol.style.Fill;
    var Stroke = ol.style.Stroke;
    var Text = ol.style.Text;
    var Circle = ol.style.Circle;

    if (layer === "region") {
      var geom = feature.getGeometry && feature.getGeometry();
      var gtype = geom && geom.getType ? geom.getType() : "";
      if (gtype === "LineString" || gtype === "MultiLineString") {
        return styleRegionLine(mainKey, subKey, zoom, ol, feature);
      }

      var rk = matchRegion(mainKey, subKey);
      if (rk === "sport") rk = matchSportRegion(subKey);
      if (rk === "subwayYard") {
        if (zoom != null && zoom < 14) return null;
        var yardSk = metroCorridorSubKey(feature, subKey);
        return styleMetroCorridor(yardSk, zoom, ol, "polygon", feature);
      }
      if (zoom != null && !regionShowAtZoom(rk, zoom)) return null;
      var rs = REGION_STYLE[rk] || REGION_STYLE.land;
      var fillColor = rs.fill;
      if (isParkDetailZoom(zoom) || isUrbanDetailZoom(zoom)) {
        if (rk === "water") fillColor = COLORS.waterUrban;
        else if (rk === "green" || rk === "scenic") fillColor = COLORS.greenPark;
        else if (rk === "land") fillColor = COLORS.urbanLand;
        else if (rk === "sportTrack") fillColor = COLORS.sportTrack;
        else if (rk === "sportCourt") fillColor = COLORS.sportCourt;
        else if (rk === "sportField") fillColor = COLORS.sportField;
      }
      var zPoly = featureDrawZIndex(feature, rs.z);
      var styles = [
        new Style({
          zIndex: zPoly,
          fill: new Fill({ color: fillColor }),
          stroke: regionPolygonStroke(rk, rs, Stroke),
        }),
      ];
      if (name && regionLabelAtZoom(rk, zoom, name)) {
        var regionColor;
        if (isParkDetailZoom(zoom)) {
          regionColor =
            rk === "water"
              ? COLORS.waterLabel
              : rk === "green" || rk === "scenic"
                ? "#333333"
                : "#333333";
        } else {
          regionColor =
            rk === "water"
              ? COLORS.waterLabel
              : rk === "green" || rk === "scenic" || rk.indexOf("sport") === 0
                ? COLORS.labelGreen
                : isUrbanDetailZoom(zoom)
                  ? COLORS.labelUrban
                  : rk === "edu"
                    ? COLORS.labelMuted
                    : COLORS.labelMuted;
        }
        var regionFs =
          isParkDetailZoom(zoom) ? 10 : isRegionalZoom(zoom) ? 11 : isUrbanDetailZoom(zoom) ? 10 : 11;
        var regionWeight =
          isRegionalZoom(zoom) && (rk === "green" || rk === "scenic" || rk === "water")
            ? "bold "
            : "";
        styles.push(
          new Style({
            zIndex: featureLabelZIndex(feature, rs.z, 50),
            text: makeLabelText(Text, Fill, Stroke, {
              text: String(name),
              font: regionWeight + regionFs + "px Microsoft YaHei, PingFang SC, sans-serif",
              color: regionColor,
              haloWidth: 1.5,
            }),
          })
        );
      }
      return styles;
    }

    if (layer === "building") {
      if (!featureBuildingMinZoomOk(feature)) return null;
      var parkB = isParkDetailZoom(zoom);
      var strokeW = parkB ? 0.2 : isUrbanDetailZoom(zoom) ? 0.25 : zoom != null && zoom >= 16 ? 0.35 : 0.3;
      var bFill = parkB || isUrbanDetailZoom(zoom) ? COLORS.buildingFill : COLORS.buildingFill;
      var zBuilding = featureBuildingZIndex(feature, 14);
      var bStyles = [
        new Style({
          zIndex: zBuilding,
          fill: new Fill({ color: bFill }),
          stroke: new Stroke({ color: COLORS.buildingStroke, width: strokeW }),
        }),
      ];
      var bl = buildingLabelStyle(name, zoom);
      if (bl) {
        bStyles.push(
          new Style({
            zIndex: buildingLabelZIndex(feature, name),
            text: makeLabelText(Text, Fill, Stroke, bl),
          })
        );
      }
      return bStyles;
    }

    if (layer === "boundary") {
      return styleBoundaryStroke(subKey, zoom, ol);
    }

    if (layer === "waterline") {
      return styleRoadLike("waterline", name, zoom, ol, subKey, shield, feature);
    }

    if (layer === "road" || layer === "transit") {
      var geom = feature.getGeometry && feature.getGeometry();
      var gtype = geom && geom.getType ? geom.getType() : "";

      if (gtype === "Polygon" || gtype === "MultiPolygon") {
        if (layer !== "transit" && Number(mainKey) !== 30003) return null;
        if (zoom != null && zoom < 14) return null;
        var polySk = metroCorridorSubKey(feature, subKey);
        return styleMetroCorridor(polySk, zoom, ol, "polygon", feature);
      }

      if (gtype === "Point") {
        var mkPt = Number(mainKey);
        if (isMetroExit(mkPt, subKey, name)) {
          if (zoom != null && zoom < 15) return null;
          var letter = parseMetroExitLetter(name) || "A";
          var exitSize = scalePoiIconSize(zoom >= 16 ? 12 : 11);
          return new Style({
            zIndex: featurePointZIndex(feature, 59),
            image: getMetroExitIcon(letter, exitSize, ol),
          });
        }
        var poiStyled = stylePoiPoint(feature, mainKey, subKey, name, zoom, ol);
        if (poiStyled) return poiStyled;

        if (isMetroStation(mkPt, subKey, name) && zoom != null && zoom >= MIN_METRO_STATION_Z) {
          return stylePoiPoint(feature, mainKey, subKey, name, zoom, ol);
        }

        var pkPt = matchPoi(mainKey, subKey, name);
        if (pkPt !== "train" && pkPt !== "transport" && pkPt !== "airport") return null;
        if (!poiShowAtZoom(pkPt, zoom, name, feature)) return null;
        if (!poiRankAtZoom(feature.get("rank"), zoom, pkPt, name, feature)) return null;

        var hubKind = pkPt === "airport" ? "airport" : "train";
        var hubName = String(name || "").trim();
        if (!hubName) return null;
        var hubSize = scalePoiIconSize(poiIconPixelSize(hubKind, zoom, hubName));
        return new Style({
          zIndex: featurePointZIndex(feature, 58),
          image: poiIconForLabel(hubKind, hubSize, ol, zoom, true, mainKey, subKey, name),
          text: makePoiLabelText(Text, Fill, Stroke, {
            text: hubName,
            fontSize: poiLabelFontSize(hubKind, zoom),
            kind: hubKind,
            iconSize: hubSize,
            zoom: zoom,
            color: poiLabelColorForKind(hubKind, zoom),
            haloWidth: 2,
          }),
        });
      }

      if (layer === "transit" && Number(mainKey) !== 20015 && Number(mainKey) !== 20019) {
        if (zoom != null && zoom < 14) return null;
        var lineSk = metroCorridorSubKey(feature, subKey);
        return styleMetroCorridor(lineSk, zoom, ol, "line", feature);
      }

      var kind = matchRoad(mainKey, subKey);
      if (layer === "transit" && kind === "local") kind = "subway";
      /* 在建地铁：虚线 */
      if (Number(mainKey) === 20019 || (Number(mainKey) === 20015 && hasSub(subKey, [1, 2]))) {
        var built = styleRoadLike("subway", name, zoom, ol, subKey, shield, feature);
        if (!built) return null;
        var arr = Array.isArray(built) ? built : [built];
        arr.forEach(function (st) {
          if (st.getStroke && st.getStroke()) {
            var s = st.getStroke();
            s.setLineDash([6, 5]);
          }
        });
        return arr;
      }
      return styleRoadLike(kind, name, zoom, ol, subKey, shield, feature);
    }

    if (layer === "poi") {
      var adminKind = Number(mainKey) === 10002 ? matchAdminLabel(subKey) : null;
      if (adminKind) {
        /* 镇名始终隐藏；村名不显示村委会 */
        if (adminKind === "town") return null;
        if (isTownshipAdminName(name)) return null;
        if (adminKind === "village" && !isVillageNameOnly(name)) return null;
        var al = ADMIN_LABEL[adminKind] || ADMIN_LABEL.city;
        if (!name) return null;
        if (adminKind === "village") {
          if (!villageAdminLabelVisible(feature, zoom, name)) return null;
        } else if (isMacroAdminLabelKind(adminKind)) {
          if (!macroAdminMinZoomVisible(feature, adminKind)) return null;
          if (!adminLabelExclusiveVisible(feature, adminKind, name, zoom)) return null;
        } else {
          if (!villageLabelAtZoom(zoom, name)) return null;
          if (adminKind === "capital" && !adminCapitalLabelVisible(adminKind, zoom)) return null;
          if (adminKind === "capital" && zoom === 5) return null;
          if (zoom != null && al.minZ != null && zoom < al.minZ) return null;
          if (zoom != null && al.maxZ != null && zoom > al.maxZ) return null;
        }

        var fontSize = al.size;
        if (zoom != null) {
          if (adminKind === "continent") fontSize = 20;
          else if (adminKind === "country") fontSize = zoom <= 3 ? 18 : 15;
          else if (adminKind === "capital") fontSize = zoom <= 6 ? 15 : 14;
          else if (adminKind === "city") fontSize = zoom <= 8 ? 15 : zoom <= 10 ? 14 : 13;
          else if (adminKind === "province") fontSize = zoom <= 6 ? 15 : 13;
          else if (adminKind === "county") fontSize = zoom <= 9 ? 12 : zoom <= 12 ? 13 : 12;
          else if (adminKind === "village") fontSize = 10;
        }
        var labelColor = al.color || COLORS.adminLabel;
        if (adminKind === "country" && hasSub(subKey, [18])) {
          labelColor = COLORS.chinaLabel;
        } else if (adminKind === "country" && !hasSub(subKey, [18])) {
          labelColor = "#333333";
        } else if (adminKind === "city" || adminKind === "capital") {
          labelColor = "#222222";
        } else if (adminKind === "county") {
          labelColor = zoom != null && zoom <= 9 ? "#666666" : "#888888";
        } else if (adminKind === "village") {
          labelColor = "#555555";
        }

        var labelZ = fixedLabelZIndex(LABEL_PRIO[adminKind] || LABEL_PRIO.city);

        var showMarker =
          !!al.marker &&
          (adminKind === "capital" || adminKind === "city") &&
          (zoom == null || zoom < 12);

        if (showMarker) {
          return new Style({
            zIndex: labelZ,
            image: getCityMarker(al.marker === "capital" ? "capital" : "city", ol),
            text: makeLabelText(Text, Fill, Stroke, {
              text: String(name),
              font: al.weight + " " + fontSize + "px Microsoft YaHei, PingFang SC, sans-serif",
              offsetX: fontSize * 0.55 + 8,
              textAlign: "left",
              color: labelColor,
              haloWidth: 4.5,
            }),
          });
        }
        return new Style({
          zIndex: labelZ,
          text: makeLabelText(Text, Fill, Stroke, {
            text: String(name),
            font: al.weight + " " + fontSize + "px Microsoft YaHei, PingFang SC, sans-serif",
            color: labelColor,
            haloWidth: 4.5,
          }),
        });
      }

      var poiStyle = stylePoiPoint(feature, mainKey, subKey, name, zoom, ol);
      if (poiStyle) return poiStyle;
      return null;
    }

    return null;
  }

  /** 带 getView().getZoom() 上下文的可见性判断（调试/拾取） */
  function featureVisibleAtView(feature, visualZoom, tileAttrZoom) {
    currentTileAttrZoom =
      tileAttrZoom != null && !isNaN(Number(tileAttrZoom)) ? Math.round(Number(tileAttrZoom)) : null;
    return featureZoomVisible(feature, visualZoom);
  }

  return {
    COLORS: COLORS,
    POI: POI,
    ZOOM: ZOOM,
    SPRITE_SHEETS: SPRITE_SHEETS,
    SUBWAY_PALETTE: SUBWAY_PALETTE,
    matchRegion: matchRegion,
    matchSportRegion: matchSportRegion,
    matchRoad: matchRoad,
    matchBoundary: matchBoundary,
    matchAdminLabel: matchAdminLabel,
    matchPoi: matchPoi,
    subwayColor: subwayColor,
    featureZoomVisible: featureZoomVisible,
    featureVisibleAtView: featureVisibleAtView,
    isRegionalZoom: isRegionalZoom,
    isUrbanDetailZoom: isUrbanDetailZoom,
    isParkDetailZoom: isParkDetailZoom,
    isCityOverviewZoom: isCityOverviewZoom,
    isStreetDetailZoom: isStreetDetailZoom,
    featureDrawZIndex: featureDrawZIndex,
    featureBuildingZIndex: featureBuildingZIndex,
    featureLineZIndex: featureLineZIndex,
    featureLabelZIndex: featureLabelZIndex,
    featurePointZIndex: featurePointZIndex,
    sortFeaturesByPaintOrder: sortFeaturesByPaintOrder,
    styleFeature: styleFeature,
    buildAdminOverlayGeoJSON: buildAdminOverlayGeoJSON,
    styleAdminOverlay: styleAdminOverlay,
    preloadSpriteSheets: preloadSpriteSheets,
    background: COLORS.land,
    urbanBackground: COLORS.urbanLand,
  };
});
