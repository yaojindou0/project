/**
 * 高德矢量瓦片加载常量（对齐 amap.js FlyDataAuthTask / gaode_style ZOOM）
 * 供 amap_ol_vectortile.html 等页面引用，避免与样式模块重复维护。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AMapTileConfig = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** amap.js TagMap（Util.kD / Util.SD → contain_range） */
  var TAG_MAP = {
    1: "all",
    2: "all", 3: "all", 4: "all", 5: "all",
    6: "lite", 7: "all", 8: "lite", 9: "all",
    10: "lite", 11: "lite", 12: "all",
    13: "all", 14: "all", 15: "lite", 16: "lite",
    17: "all", 18: "all", 19: "all", 20: "all",
    21: "all", 22: "all",
  };

  /** amap.js FlyDataAuthTask：type1=building 层 flds */
  var FLDS_BUILDING = "transit,road,region,building";
  /** type2=poi 层 flds */
  var FLDS_POI = "transit,road,region,poi";

  /** 底图瓦片换片档：3/6/8/10/12/14；≥14 底图不换片 */
  var TILE_ZS = [3, 6, 8, 10, 12, 14];

  /** z15–17 视图叠加高 zoom POI/楼栋（z14 底图缺细节） */
  var POI_OVERLAY_ZS = [15, 16, 17];

  var MAX_TILE_Z = 14;
  var MIN_Z = 1;
  var MAX_Z = 22;

  function tagToContainRange(tag) {
    if (tag === "lite") return 0;
    if (tag === "left") return 1;
    return 2;
  }

  /** 按 zoom 取 TagMap 标签（对齐 amap.js Util.kD） */
  function tagForZoom(z) {
    z = Math.round(Number(z));
    return TAG_MAP[z] || "all";
  }

  function containRangeForZoom(z) {
    return tagToContainRange(tagForZoom(z));
  }

  /** amap.js TileCoord + Util.SD：鉴权队列去重键 "x_y_z,0|1|2" */
  function authTileKey(id, z) {
    return id + "," + containRangeForZoom(z);
  }

  /** amap.js 矢量源 fa(t,i)：瓦片 X 归一化到 [0, 2^z) */
  function normalizeTileX(x, z) {
    var n = 1 << z;
    var s = x;
    while (s < 0 || n <= s) {
      s = n <= s ? s - n : s < 0 ? n + s : s;
    }
    return s;
  }

  function isValidTileZ(z) {
    return TILE_ZS.indexOf(Math.round(Number(z))) >= 0;
  }

  function isValidPoiOverlayZ(z) {
    return POI_OVERLAY_ZS.indexOf(Math.round(Number(z))) >= 0;
  }

  /** 视觉级别 → 实际请求的瓦片级（≥14 固定 14） */
  function tileZForVisual(visualZ) {
    visualZ = Math.round(Number(visualZ));
    if (visualZ >= MAX_TILE_Z) return MAX_TILE_Z;
    if (visualZ < 3) return 3;
    if (visualZ >= 4 && visualZ < 6) return 6;
    var best = TILE_ZS[0];
    for (var i = 0; i < TILE_ZS.length; i++) {
      if (TILE_ZS[i] <= visualZ) best = TILE_ZS[i];
      else break;
    }
    return best;
  }

  /** z8–9 视图叠加 z10 路网及高铁/机场 POI */
  function detailOverlayTileZ(viewVisualZ) {
    var vz = Math.round(Number(viewVisualZ));
    if (vz >= 8 && vz <= 9) return 10;
    return null;
  }

  /** z15/z16 视图叠加 POI 点瓦片级 */
  function poiOverlayTileZ(viewVisualZ) {
    var vz = Math.round(Number(viewVisualZ));
    if (vz >= 17) return 17;
    if (vz >= 16) return 16;
    if (vz >= 15) return 15;
    return null;
  }

  return {
    TAG_MAP: TAG_MAP,
    FLDS_BUILDING: FLDS_BUILDING,
    FLDS_POI: FLDS_POI,
    TILE_ZS: TILE_ZS,
    POI_OVERLAY_ZS: POI_OVERLAY_ZS,
    MAX_TILE_Z: MAX_TILE_Z,
    MIN_Z: MIN_Z,
    MAX_Z: MAX_Z,
    tagForZoom: tagForZoom,
    tagToContainRange: tagToContainRange,
    containRangeForZoom: containRangeForZoom,
    authTileKey: authTileKey,
    normalizeTileX: normalizeTileX,
    isValidTileZ: isValidTileZ,
    isValidPoiOverlayZ: isValidPoiOverlayZ,
    tileZForVisual: tileZForVisual,
    detailOverlayTileZ: detailOverlayTileZ,
    poiOverlayTileZ: poiOverlayTileZ,
  };
});
