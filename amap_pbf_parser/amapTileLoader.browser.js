/**
 * 高德 Nebula 矢量瓦片加载器（浏览器 UMD）
 * 对齐 amap.js FlyDataAuthTask：分路 type1/type2 鉴权、TagMap contain_range、PBF 合并与叠加层。
 *
 * 依赖：ol、AMapTileConfig、AMapPbf；样式 API（AMapOlStyle）通过 options.styleApi 传入。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.AMapTileLoader = factory(root);
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var GET_TILE_DEFAULT = "https://jsapi.amap.com/web_map/get_tile";
  var KEY_DEFAULT = "27cb354aa8ab3fd1e8cace8e3afbae39";
  var PBF_VERSION = "v2";
  var TILE_TYPE_BUILDING = 1;
  var TILE_TYPE_POI = 2;
  var TILE_TYPES = [TILE_TYPE_BUILDING, TILE_TYPE_POI];

  /** 默认直连 jsapi.amap.com；需代理时传 useProxy: true */
  function defaultUseProxy() {
    return false;
  }

  function defaultProxyBase() {
    if (typeof location === "undefined") return "";
    return location.origin || "";
  }

  function isAmapDataUrl(url) {
    return /^https:\/\/jsapi-data\d*\.amap\.com\//i.test(String(url || ""));
  }

  function tileId(x, y, z) {
    return x + "_" + y + "_" + z;
  }

  function parseTileId(id) {
    var p = String(id || "").split("_");
    return { x: +p[0] || 0, y: +p[1] || 0, z: +p[2] || 0 };
  }

  function pbfToFeatures(api, buf, fallbackTile) {
    if (!buf || !api || !api.toGeoJSONFeatures) return [];
    return api.toGeoJSONFeatures(api.unzipAndDecodeTiles(buf), fallbackTile || null);
  }

  function cacheKey(id, type) {
    return id + "|" + type;
  }

  function createAmapResolutions(maxZoom) {
    var resolutions = [];
    for (var z = 0; z <= maxZoom; z++) {
      resolutions[z] = 360 / Math.pow(2, z) / 512;
    }
    return resolutions;
  }

  function featureKey(f) {
    var p = f.properties || {};
    var g = f.geometry || {};
    var c0 = (g.coordinates && g.coordinates[0]) || [];
    var tip = Array.isArray(c0) ? (Array.isArray(c0[0]) ? c0[0] : c0) : [];
    return [
      p.layer, p.mainKey, p.subKey, p.name || "", g.type,
      tip[0] != null ? Number(tip[0]).toFixed(5) : "",
      tip[1] != null ? Number(tip[1]).toFixed(5) : "",
    ].join("|");
  }

  function buildingPositionKey(f) {
    var p = f.properties || {};
    var g = f.geometry || {};
    var c0 = (g.coordinates && g.coordinates[0]) || [];
    var tip = Array.isArray(c0) ? (Array.isArray(c0[0]) ? c0[0] : c0) : [];
    return [
      p.layer, p.mainKey, p.subKey, g.type,
      tip[0] != null ? Number(tip[0]).toFixed(5) : "",
      tip[1] != null ? Number(tip[1]).toFixed(5) : "",
    ].join("|");
  }

  function hasFeatureName(f) {
    var p = f && f.properties;
    return !!(p && p.name && String(p.name).trim());
  }

  function linkMetroCorridorSubKeys(features) {
    var subwayLines = [];
    features.forEach(function (f) {
      var p = f.properties || {};
      var mk = Number(p.mainKey);
      if ((p.layer === "road" || p.layer === "transit") && (mk === 20015 || mk === 20019)) {
        var g = f.geometry || {};
        if (g.type === "LineString" && g.coordinates && g.coordinates.length >= 2) {
          subwayLines.push({ subKey: p.subKey, coords: g.coordinates });
        } else if (g.type === "MultiLineString" && g.coordinates) {
          g.coordinates.forEach(function (line) {
            if (line && line.length >= 2) subwayLines.push({ subKey: p.subKey, coords: line });
          });
        }
      }
    });
    if (!subwayLines.length) return;

    function ringOf(f) {
      var g = f.geometry || {};
      if (g.type === "Polygon") return g.coordinates && g.coordinates[0];
      if (g.type === "MultiPolygon") return g.coordinates && g.coordinates[0] && g.coordinates[0][0];
      return null;
    }

    function centroid(ring) {
      var x = 0, y = 0, n = ring.length;
      if (!n) return null;
      for (var i = 0; i < n; i++) {
        x += ring[i][0];
        y += ring[i][1];
      }
      return [x / n, y / n];
    }

    function distPointSeg(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      if (dx === 0 && dy === 0) {
        dx = px - x1;
        dy = py - y1;
        return Math.sqrt(dx * dx + dy * dy);
      }
      var t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      dx = px - (x1 + t * dx);
      dy = py - (y1 + t * dy);
      return Math.sqrt(dx * dx + dy * dy);
    }

    function distToLine(pt, coords) {
      var min = Infinity;
      for (var i = 0; i < coords.length - 1; i++) {
        var d = distPointSeg(
          pt[0], pt[1],
          coords[i][0], coords[i][1],
          coords[i + 1][0], coords[i + 1][1]
        );
        if (d < min) min = d;
      }
      return min;
    }

    features.forEach(function (f) {
      var p = f.properties || {};
      var mk = Number(p.mainKey);
      var g = f.geometry || {};
      var isCorridorPoly =
        (g.type === "Polygon" || g.type === "MultiPolygon") &&
        ((mk === 30003 && p.layer === "region") ||
          (p.layer === "transit" && mk !== 20015 && mk !== 20019));
      var isCorridorLine =
        (g.type === "LineString" || g.type === "MultiLineString") &&
        p.layer === "transit" &&
        mk !== 20015 &&
        mk !== 20019;
      if (!isCorridorPoly && !isCorridorLine) return;

      var pt = null;
      if (isCorridorPoly) {
        var ring = ringOf(f);
        if (!ring || ring.length < 3) return;
        pt = centroid(ring);
      } else if (g.type === "LineString") {
        pt = centroid(g.coordinates);
      } else if (g.coordinates && g.coordinates[0]) {
        pt = centroid(g.coordinates[0]);
      }
      if (!pt) return;

      var bestSk = null, bestD = Infinity;
      subwayLines.forEach(function (sl) {
        var d = distToLine(pt, sl.coords);
        if (d < bestD) {
          bestD = d;
          bestSk = sl.subKey;
        }
      });
      if (bestSk != null && bestD < 0.004) p.corridorSubKey = bestSk;
    });
  }

  function mergeFeatures(gj1, gj2, styleApi) {
    var out = [];
    var seen = new Set();
    var buildings = [];
    function stampGeometryType(f) {
      if (f && f.properties && f.geometry && f.geometry.type) {
        f.properties._geometryType = f.geometry.type;
      }
    }
    function add(f, allow) {
      if (!f || !f.properties) return;
      if (allow.indexOf(f.properties.layer) < 0) return;
      if (f.properties.layer === "building") {
        buildings.push(f);
        return;
      }
      var k = featureKey(f);
      if (seen.has(k)) return;
      seen.add(k);
      stampGeometryType(f);
      out.push(f);
    }
    (gj2 || []).forEach(function (f) {
      add(f, ["region", "road", "boundary", "waterline", "poi", "transit"]);
    });
    (gj1 || []).forEach(function (f) {
      add(f, ["building", "region", "road", "boundary", "waterline", "transit"]);
    });
    var buildingByPos = new Map();
    buildings.forEach(function (f) {
      var posK = buildingPositionKey(f);
      var prev = buildingByPos.get(posK);
      if (!prev || (!hasFeatureName(prev) && hasFeatureName(f))) {
        buildingByPos.set(posK, f);
      }
    });
    buildingByPos.forEach(function (f) {
      var k = featureKey(f);
      if (seen.has(k)) return;
      seen.add(k);
      stampGeometryType(f);
      out.push(f);
    });
    linkMetroCorridorSubKeys(out);
    if (styleApi && styleApi.sortFeaturesByPaintOrder) {
      return styleApi.sortFeaturesByPaintOrder(out);
    }
    return out;
  }

  function AMapTileLoader(options) {
    options = options || {};
    if (!options.pbfApi && !root.AMapPbf) {
      throw new Error("AMapTileLoader: pbfApi or window.AMapPbf required");
    }
    if (!root.ol) throw new Error("AMapTileLoader: OpenLayers (ol) required");
    if (!root.AMapTileConfig) throw new Error("AMapTileLoader: AMapTileConfig required");

    this.ol = root.ol;
    this.tileCfg = root.AMapTileConfig;
    this.pbfApi = options.pbfApi || root.AMapPbf;
    this.styleApi = options.styleApi || root.AMapOlStyle || null;
    this.getKey = options.getKey || function () { return options.key || KEY_DEFAULT; };
    this.getVersion = options.getVersion || function () { return options.version || "26_07_27_00"; };
    this.useProxy = options.useProxy != null ? !!options.useProxy : defaultUseProxy();
    this.proxyBase = options.proxyBase != null ? String(options.proxyBase) : defaultProxyBase();
    this.getTileUrl = options.getTileUrl || (this.useProxy
      ? this.proxyBase + "/amap/get_tile"
      : GET_TILE_DEFAULT);
    this.fetchPbfUrl = options.fetchPbfUrl || function (url) {
      if (this.useProxy && isAmapDataUrl(url)) {
        return this.proxyBase + "/amap/fetch?url=" + encodeURIComponent(url);
      }
      return url;
    }.bind(this);
    this.accessOversea = options.accessOversea != null ? String(options.accessOversea) : "0";
    this.dataSource = options.dataSource != null ? options.dataSource : 1;
    this.multiLang = !!options.multiLang;

    this.MIN_Z = this.tileCfg.MIN_Z;
    this.MAX_Z = this.tileCfg.MAX_Z;
    this.containRangeForZoom = this.tileCfg.containRangeForZoom;
    this.isValidTileZ = this.tileCfg.isValidTileZ;
    this.isValidPoiOverlayZ = this.tileCfg.isValidPoiOverlayZ;
    this.tileZForVisual = this.tileCfg.tileZForVisual;

    this.amapResolutions = createAmapResolutions(this.MAX_Z);
    this.viewResolutions = [];
    for (var vz = this.MIN_Z; vz <= this.MAX_Z; vz++) {
      this.viewResolutions.push(this.amapResolutions[vz]);
    }
    this.tileGrid = new this.ol.tilegrid.TileGrid({
      extent: [-180, -90, 180, 90],
      origin: [-180, 90],
      resolutions: this.amapResolutions,
      tileSize: [512, 256],
    });
    var self = this;
    this.tileGrid.getZForResolution = function (resolution) {
      return self.tileZForVisual(self.visualZFromResolution(resolution));
    };

    this.geojsonFormat = new this.ol.format.GeoJSON();
    this.map = null;
    this.vectorSource = null;
    this.vectorLayer = null;
    this.adminOverlayLayer = null;

    this.urlCache = new Map();
    this.featureCache = new Map();
    this.loadPromises = new Map();
    this.authWaiters = new Map();
    this.authPending = new Set();
    this.authRunning = false;
    this.authFlushTimer = null;
    this.authAbortController = null;
    this.moveTimer = null;
    this.lastTileZ = 6;
    this.lastPoiOverlayZ = null;
    this.lastDetailOverlayZ = null;
    this.lastViewZoomIndex = null;

    this._onMove = function () { self.scheduleAuth(); };
    this._onResolutionChange = function () { self.onViewResolutionChange(); };

    if (options.map) this.attach(options.map);
  }

  AMapTileLoader.getViewResolutions = function () {
    var cfg = root.AMapTileConfig;
    var maxZ = cfg.MAX_Z;
    var minZ = cfg.MIN_Z;
    var res = createAmapResolutions(maxZ);
    var viewRes = [];
    for (var z = minZ; z <= maxZ; z++) viewRes.push(res[z]);
    return viewRes;
  };

  /** 高德级别 z → OL View zoom 索引（0 起） */
  AMapTileLoader.zToZoomIndex = function (z) {
    var cfg = root.AMapTileConfig;
    z = Math.round(Number(z));
    return Math.max(0, Math.min(cfg.MAX_Z - cfg.MIN_Z, z - cfg.MIN_Z));
  };

  AMapTileLoader.prototype.zoomIndexToZ = function (idx) {
    idx = Math.round(Number(idx));
    return Math.max(this.MIN_Z, Math.min(this.MAX_Z, idx + this.MIN_Z));
  };

  AMapTileLoader.prototype.zToZoomIndex = function (z) {
    return AMapTileLoader.zToZoomIndex(z);
  };

  AMapTileLoader.prototype.visualZFromResolution = function (resolution) {
    var best = this.MIN_Z;
    var bestDiff = Infinity;
    for (var z = this.MIN_Z; z <= this.MAX_Z; z++) {
      var d = Math.abs(this.amapResolutions[z] - resolution);
      if (d < bestDiff) {
        bestDiff = d;
        best = z;
      }
    }
    return best;
  };

  AMapTileLoader.prototype.getViewVisualZ = function () {
    if (!this.map) return this.MIN_Z;
    var view = this.map.getView();
    var idx = view.getZoom();
    if (idx == null || isNaN(idx)) return this.visualZFromResolution(view.getResolution());
    return this.zoomIndexToZ(idx);
  };

  AMapTileLoader.prototype.getViewTileZ = function () {
    return this.tileZForVisual(this.getViewVisualZ());
  };

  AMapTileLoader.prototype.isPoiOverlayOnlyTile = function (id) {
    var z = Number(String(id).split("_")[2]);
    return this.isValidPoiOverlayZ(z);
  };

  AMapTileLoader.prototype.poiOverlayTileZ = function () {
    if (!this.map) return null;
    return this.tileCfg.poiOverlayTileZ(this.getViewVisualZ());
  };

  AMapTileLoader.prototype.detailOverlayTileZ = function () {
    if (!this.map) return null;
    return this.tileCfg.detailOverlayTileZ(this.getViewVisualZ());
  };

  AMapTileLoader.prototype.childTileIds = function (tx, ty, zFrom, zTo) {
    var scale = Math.pow(2, zTo - zFrom);
    var out = [];
    for (var dx = 0; dx < scale; dx++) {
      for (var dy = 0; dy < scale; dy++) {
        var x = tx * scale + dx;
        var y = ty * scale + dy;
        out.push({ x: x, y: y, z: zTo, id: tileId(x, y, zTo) });
      }
    }
    return out;
  };

  AMapTileLoader.prototype.poiOverlayChildIds = function (id) {
    var p = id.split("_");
    var tx = +p[0], ty = +p[1], tz = +p[2];
    var oz = this.poiOverlayTileZ();
    if (!oz || oz <= tz || !this.isValidTileZ(tz)) return [];
    return this.childTileIds(tx, ty, tz, oz);
  };

  AMapTileLoader.prototype.detailOverlayChildIds = function (id) {
    var p = id.split("_");
    var tx = +p[0], ty = +p[1], tz = +p[2];
    var oz = this.detailOverlayTileZ();
    if (!oz || oz <= tz || !this.isValidTileZ(tz)) return [];
    return this.childTileIds(tx, ty, tz, oz);
  };

  AMapTileLoader.prototype.authDone = function (id) {
    if (this.isPoiOverlayOnlyTile(id)) {
      return TILE_TYPES.every(function (t) {
        return this.urlCache.has(cacheKey(id, t));
      }, this);
    }
    return TILE_TYPES.every(function (t) {
      return this.urlCache.has(cacheKey(id, t));
    }, this);
  };

  AMapTileLoader.prototype.normalizeTileX = function (x, z) {
    if (this.tileCfg.normalizeTileX) return this.tileCfg.normalizeTileX(x, z);
    var n = 1 << z;
    var s = x;
    while (s < 0 || n <= s) {
      s = n <= s ? s - n : s < 0 ? n + s : s;
    }
    return s;
  };

  /** 对齐 amap.js FlyDataAuthTask.cancel */
  AMapTileLoader.prototype.cancelAuthRequests = function () {
    if (this.authAbortController) {
      try { this.authAbortController.abort(); } catch (e) { /* ignore */ }
      this.authAbortController = null;
    }
  };

  AMapTileLoader.prototype.notifyWaiters = function (id) {
    if (!this.authDone(id)) return;
    var list = this.authWaiters.get(id);
    if (!list) return;
    this.authWaiters.delete(id);
    list.forEach(function (fn) { fn(); });
  };

  AMapTileLoader.prototype.waitForUrls = function (id) {
    var self = this;
    if (this.authDone(id)) return Promise.resolve();
    return new Promise(function (resolve) {
      if (!self.authWaiters.has(id)) self.authWaiters.set(id, []);
      self.authWaiters.get(id).push(resolve);
      self.authPending.add(id);
      self.scheduleAuthFlush();
      setTimeout(function () {
        var list = self.authWaiters.get(id);
        if (list) {
          self.authWaiters.delete(id);
          list.forEach(function (fn) { fn(); });
        }
      }, 8000);
    });
  };

  AMapTileLoader.prototype.collectTilesAtZoom = function (z, extent) {
    z = Math.round(Number(z));
    if (!this.isValidTileZ(z)) return [];
    var range = this.tileGrid.getTileRangeForExtentAndZ(extent, z);
    var list = [];
    for (var x = range.minX; x <= range.maxX; x++) {
      for (var y = range.minY; y <= range.maxY; y++) {
        var nx = this.normalizeTileX(x, z);
        list.push({ x: nx, y: y, z: z, id: tileId(nx, y, z) });
      }
    }
    return list;
  };

  AMapTileLoader.prototype.getViewTiles = function () {
    if (!this.map) return [];
    var view = this.map.getView();
    var size = this.map.getSize();
    if (!size) return [];
    return this.collectTilesAtZoom(this.getViewTileZ(), view.calculateExtent(size));
  };

  AMapTileLoader.prototype.enqueueTilesForAuth = function (tiles) {
    var self = this;
    tiles.forEach(function (t) {
      if (!self.authDone(t.id)) self.authPending.add(t.id);
    });
    this.scheduleAuthFlush();
  };

  AMapTileLoader.prototype.scheduleAuthFlush = function () {
    if (this.authFlushTimer) return;
    var self = this;
    this.authFlushTimer = setTimeout(function () { self.flushAuthQueue(); }, 30);
  };

  AMapTileLoader.prototype.buildAuthTileEntry = function (id, type, z) {
    return {
      id: id,
      type: type,
      contain_range: this.containRangeForZoom(z),
    };
  };

  /** amap.js FlyDataAuthTask.play POST body */
  AMapTileLoader.prototype.requestTileUrls = function (entries) {
    var self = this;
    var signal = this.authAbortController ? this.authAbortController.signal : undefined;
    var body = new URLSearchParams({
      version: this.getVersion(),
      pbf_version: PBF_VERSION,
      access_oversea: this.accessOversea,
      data_source: String(this.dataSource),
      multi_lang: this.multiLang ? "1" : "0",
      tiles: JSON.stringify(entries.map(function (t) {
        var z = t.z != null ? t.z : Number(String(t.id).split("_")[2]);
        return self.buildAuthTileEntry(t.id, t.type, z);
      })),
    }).toString();

    return fetch(this.getTileUrl + "?key=" + encodeURIComponent(this.getKey()), {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      signal: signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
      },
      body: body,
    })
      .then(function (r) {
        if (!r.ok) throw new Error("get_tile HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        if (String(json.status) !== "1") {
          var errCode = json.info || json.infocode;
          if (errCode === "TILE_ACCESS_OVERSEA_FORBIDDEN" && self.accessOversea === "0") {
            return [];
          }
          throw new Error(errCode || "get_tile failed");
        }
        var urls = json.tile_urls || [];
        if (!urls.length && entries.length) {
          console.warn("[AMapTileLoader] get_tile 返回空 tile_urls", entries.length, "tiles");
        }
        return urls;
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return [];
        throw err;
      });
  };

  /** 单批：type1(fbt) 与 type2(vbt) 分路鉴权，对齐 amap.js */
  AMapTileLoader.prototype.processAuthBatch = function (batch) {
    var self = this;
    var type1 = batch.filter(function (t) { return t.type === TILE_TYPE_BUILDING; });
    var type2 = batch.filter(function (t) { return t.type === TILE_TYPE_POI; });
    var jobs = [];
    if (type1.length) {
      jobs.push(
        this.requestTileUrls(type1).then(function (urls) {
          type1.forEach(function (t, idx) {
            self.urlCache.set(cacheKey(t.id, t.type), urls[idx] || "");
          });
        })
      );
    }
    if (type2.length) {
      jobs.push(
        this.requestTileUrls(type2).then(function (urls) {
          type2.forEach(function (t, idx) {
            self.urlCache.set(cacheKey(t.id, t.type), urls[idx] || "");
          });
        })
      );
    }
    return Promise.all(jobs);
  };

  AMapTileLoader.prototype.flushAuthQueue = function () {
    var self = this;
    this.authFlushTimer = null;
    if (this.authRunning) {
      this.cancelAuthRequests();
      this.authRunning = false;
    }

    var mapById = new Map();
    this.getViewTiles().forEach(function (t) { mapById.set(t.id, t); });
    this.authPending.forEach(function (id) {
      if (self.authDone(id)) {
        self.authPending.delete(id);
        self.notifyWaiters(id);
        return;
      }
      var p = id.split("_");
      var zz = +p[2];
      if (!self.isValidTileZ(zz) && !self.isValidPoiOverlayZ(zz)) {
        self.authPending.delete(id);
        return;
      }
      mapById.set(id, { x: +p[0], y: +p[1], z: zz, id: id });
    });

    var need = [];
    mapById.forEach(function (t) {
      if (self.isValidPoiOverlayZ(t.z)) {
        TILE_TYPES.forEach(function (type) {
          if (!self.urlCache.has(cacheKey(t.id, type))) {
            need.push({ id: t.id, type: type, x: t.x, y: t.y, z: t.z });
          }
        });
        return;
      }
      if (!self.isValidTileZ(t.z)) {
        TILE_TYPES.forEach(function (type) {
          if (!self.urlCache.has(cacheKey(t.id, type))) {
            self.urlCache.set(cacheKey(t.id, type), "");
          }
        });
        self.notifyWaiters(t.id);
        return;
      }
      TILE_TYPES.forEach(function (type) {
        if (self.isPoiOverlayOnlyTile(t.id) && type === TILE_TYPE_BUILDING) return;
        if (!self.urlCache.has(cacheKey(t.id, type))) {
          need.push({ id: t.id, type: type, x: t.x, y: t.y, z: t.z });
        }
      });
    });

    if (!need.length) {
      this.authPending.forEach(function (id) { self.notifyWaiters(id); });
      this.authPending.clear();
      return;
    }

    this.authRunning = true;
    this.authAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    var batches = [];
    for (var i = 0; i < need.length; i += 40) {
      batches.push(need.slice(i, i + 40));
    }

    var chain = Promise.resolve();
    batches.forEach(function (batch) {
      chain = chain.then(function () { return self.processAuthBatch(batch); });
    });

    chain
      .then(function () {
        self.authRunning = false;
        self.authAbortController = null;
        var still = new Set();
        mapById.forEach(function (t) {
          if (self.authDone(t.id)) self.notifyWaiters(t.id);
          else still.add(t.id);
        });
        self.authPending.forEach(function (id) {
          if (self.authDone(id)) self.notifyWaiters(id);
          else still.add(id);
        });
        self.authPending = still;
        if (self.vectorSource) self.vectorSource.changed();
        if (still.size) self.scheduleAuthFlush();
      })
      .catch(function () {
        self.authRunning = false;
        self.authAbortController = null;
        self.scheduleAuthFlush();
      });
  };

  AMapTileLoader.prototype.authViewTiles = function () {
    var self = this;
    this.enqueueTilesForAuth(this.getViewTiles());
    return new Promise(function (resolve) {
      setTimeout(function () {
        self.flushAuthQueue();
        resolve(self.getViewTiles());
      }, 40);
    });
  };

  AMapTileLoader.prototype.ensureTileUrls = function (id) {
    var self = this;
    var ids = [id];
    this.detailOverlayChildIds(id).forEach(function (t) { ids.push(t.id); });
    this.poiOverlayChildIds(id).forEach(function (t) { ids.push(t.id); });
    ids.forEach(function (tid) {
      if (!self.authDone(tid)) self.authPending.add(tid);
    });
    this.scheduleAuthFlush();
    return Promise.all(
      ids.map(function (tid) {
        if (self.authDone(tid)) return Promise.resolve();
        return self.waitForUrls(tid);
      })
    ).then(function () {});
  };

  AMapTileLoader.prototype.fetchPbf = function (url) {
    if (!url) return Promise.reject(new Error("empty pbf url"));
    var fetchUrl = this.fetchPbfUrl(url);
    return fetch(fetchUrl, { mode: "cors", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("PBF HTTP " + r.status);
      return r.arrayBuffer();
    });
  };

  AMapTileLoader.prototype.appendPoiOverlayPoints = function (gj2, overlayBufs) {
    var api = this.pbfApi;
    var out = gj2 ? gj2.slice() : [];
    (overlayBufs || []).forEach(function (entry) {
      if (!entry) return;
      var buf = entry.buf || entry;
      var fb = entry._tileFallback || null;
      pbfToFeatures(api, buf, fb).forEach(function (f) {
        if (!f || !f.geometry || f.geometry.type !== "Point") return;
        var ly = f.properties && f.properties.layer;
        if (ly !== "poi" && ly !== "transit") return;
        out.push(f);
      });
    });
    return out;
  };

  /** z15/z16 子瓦片 building 面（A座/B座 等）合并进 type1 */
  AMapTileLoader.prototype.appendBuildingOverlay = function (gj1, overlayType1Bufs) {
    var api = this.pbfApi;
    var out = gj1 ? gj1.slice() : [];
    (overlayType1Bufs || []).forEach(function (entry) {
      if (!entry) return;
      var buf = entry.buf || entry;
      var fb = entry._tileFallback || null;
      pbfToFeatures(api, buf, fb).forEach(function (f) {
        if (!f || !f.properties || f.properties.layer !== "building") return;
        if (f.geometry && f.geometry.type) f.properties._geometryType = f.geometry.type;
        out.push(f);
      });
    });
    return out;
  };

  AMapTileLoader.prototype.appendDetailOverlay = function (gj1, gj2, overlayType1Bufs, overlayType2Bufs) {
    var api = this.pbfApi;
    var out1 = gj1 ? gj1.slice() : [];
    var out2 = gj2 ? gj2.slice() : [];

    function addLines(bufs, target) {
      (bufs || []).forEach(function (entry) {
        if (!entry) return;
        var buf = entry.buf || entry;
        var fb = entry._tileFallback || null;
        pbfToFeatures(api, buf, fb).forEach(function (f) {
          if (!f || !f.geometry) return;
          var gt = f.geometry.type;
          if (gt !== "LineString" && gt !== "MultiLineString") return;
          var ly = f.properties && f.properties.layer;
          if (ly === "road" || ly === "waterline" || ly === "transit") target.push(f);
        });
      });
    }

    addLines(overlayType1Bufs, out1);
    addLines(overlayType2Bufs, out2);

    (overlayType2Bufs || []).forEach(function (entry) {
      if (!entry) return;
      var buf = entry.buf || entry;
      var fb = entry._tileFallback || null;
      pbfToFeatures(api, buf, fb).forEach(function (f) {
        if (!f || !f.geometry || f.geometry.type !== "Point") return;
        var ly = f.properties && f.properties.layer;
        if (ly !== "poi" && ly !== "transit") return;
        out2.push(f);
      });
    });

    return { gj1: out1, gj2: out2 };
  };

  AMapTileLoader.prototype.parseTilePbf = function (bufs, overlayPoiBufs, detailOverlay, overlayBuildingBufs, parentId) {
    var api = this.pbfApi;
    var parentFb = parentId ? parseTileId(parentId) : null;
    var gj1 = [], gj2 = [];
    if (bufs[0]) gj1 = pbfToFeatures(api, bufs[0], parentFb);
    if (bufs[1]) gj2 = pbfToFeatures(api, bufs[1], parentFb);
    if (detailOverlay) {
      var merged = this.appendDetailOverlay(
        gj1, gj2, detailOverlay.type1, detailOverlay.type2
      );
      gj1 = merged.gj1;
      gj2 = merged.gj2;
    }
    gj1 = this.appendBuildingOverlay(gj1, overlayBuildingBufs);
    gj2 = this.appendPoiOverlayPoints(gj2, overlayPoiBufs);
    return mergeFeatures(gj1, gj2, this.styleApi);
  };

  AMapTileLoader.prototype.fetchDetailOverlayPair = function (childId) {
    var self = this;
    var u1 = this.urlCache.get(cacheKey(childId, TILE_TYPE_BUILDING));
    var u2 = this.urlCache.get(cacheKey(childId, TILE_TYPE_POI));
    if (!u1 && !u2) return Promise.resolve(null);
    var fb = parseTileId(childId);
    return Promise.all([
      u1 ? this.fetchPbf(u1).catch(function () { return null; }) : Promise.resolve(null),
      u2 ? this.fetchPbf(u2).catch(function () { return null; }) : Promise.resolve(null),
    ]).then(function (pair) {
      if (!pair[0] && !pair[1]) return null;
      return {
        type1: pair[0] ? { buf: pair[0], _tileFallback: fb } : null,
        type2: pair[1] ? { buf: pair[1], _tileFallback: fb } : null,
        tileFallback: fb,
      };
    });
  };

  AMapTileLoader.prototype.loadTilePbf = function (id, attempt) {
    var self = this;
    attempt = attempt || 0;
    var u1 = this.urlCache.get(cacheKey(id, TILE_TYPE_BUILDING));
    var u2 = this.urlCache.get(cacheKey(id, TILE_TYPE_POI));
    var detailChildren = this.detailOverlayChildIds(id);
    var overlayChildren = this.poiOverlayChildIds(id);
    var detailFetches = detailChildren.map(function (t) {
      return self.fetchDetailOverlayPair(t.id);
    });
    var overlayFetches = overlayChildren.map(function (t) {
      return self.fetchDetailOverlayPair(t.id);
    });
    var hasOverlay = overlayFetches.length > 0 || detailFetches.length > 0;
    if (!u1 && !u2 && !hasOverlay) {
      return Promise.reject(new Error("无 tile_urls: " + id));
    }
    return Promise.all([
      u1 ? this.fetchPbf(u1).catch(function () { return null; }) : Promise.resolve(null),
      u2 ? this.fetchPbf(u2).catch(function () { return null; }) : Promise.resolve(null),
      Promise.all(overlayFetches),
      Promise.all(detailFetches),
    ]).then(function (res) {
      var bufs = [res[0], res[1]];
      var overlayPairs = res[2] || [];
      var overlayPoiBufs = [];
      var overlayBuildingBufs = [];
      overlayPairs.forEach(function (pair) {
        if (!pair) return;
        if (pair.type2) overlayPoiBufs.push(pair.type2);
        if (pair.type1) overlayBuildingBufs.push(pair.type1);
      });
      var detailPairs = res[3] || [];
      var detailOverlay = null;
      if (detailPairs.length) {
        var type1 = [];
        var type2 = [];
        detailPairs.forEach(function (pair) {
          if (!pair) return;
          if (pair.type1) type1.push(pair.type1);
          if (pair.type2) type2.push(pair.type2);
        });
        if (type1.length || type2.length) detailOverlay = { type1: type1, type2: type2 };
      }
      if (!bufs[0] && !bufs[1] && !overlayPoiBufs.some(Boolean) && !overlayBuildingBufs.some(Boolean) && !detailOverlay) {
        if (attempt < 5) {
          return new Promise(function (r) { setTimeout(r, 150 * (attempt + 1)); })
            .then(function () { return self.loadTilePbf(id, attempt + 1); });
        }
        throw new Error("PBF 均为空: " + id);
      }
      return self.parseTilePbf(bufs, overlayPoiBufs, detailOverlay, overlayBuildingBufs, id);
    });
  };

  AMapTileLoader.prototype.getViewZoomIndex = function () {
    if (!this.map) return null;
    var view = this.map.getView();
    var idx = view.getZoom();
    if (idx == null || isNaN(idx)) {
      var vz = this.visualZFromResolution(view.getResolution());
      return vz != null && !isNaN(vz) ? vz - this.MIN_Z : null;
    }
    return Math.round(Number(idx));
  };

  AMapTileLoader.prototype.styleFn = function (feature, resolution) {
    var api = this.styleApi;
    var z = this.visualZFromResolution(resolution);
    var tileAttrZoom = this.getViewZoomIndex();
    var extent = this.map && this.map.getSize()
      ? this.map.getView().calculateExtent(this.map.getSize())
      : null;
    if (api && api.styleFeature) return api.styleFeature(feature, resolution, this.ol, z, extent, tileAttrZoom);
    return null;
  };

  AMapTileLoader.prototype.featureRenderPriority = function (feature) {
    if (!feature || !feature.getGeometry) return 0;
    var gt = feature.getGeometry().getType();
    var geomClass =
      gt === "Point" || gt === "MultiPoint" ? 2 : gt.indexOf("Line") >= 0 ? 1 : 0;
    var layer = feature.get("layer");
    var band = 9;
    if (layer === "boundary") band = 0;
    else if (layer === "region") band = geomClass === 1 ? 3 : 1;
    else if (layer === "building") band = 2;
    else if (layer === "road" || layer === "waterline") band = 4;
    else if (layer === "transit") band = 5;
    var d = feature.get("drawOrder");
    var n = d == null || d === "" ? 0 : Number(d);
    if (isNaN(n)) n = 0;
    return geomClass * 1e8 + band * 1e6 + n;
  };

  AMapTileLoader.prototype.createAdminOverlayLayer = function () {
    var api = this.styleApi;
    if (!api || !api.buildAdminOverlayGeoJSON) return null;
    var self = this;
    var src = new this.ol.source.Vector({
      features: new this.ol.format.GeoJSON().readFeatures(api.buildAdminOverlayGeoJSON(), {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:4326",
      }),
    });
    return new this.ol.layer.Vector({
      source: src,
      declutter: true,
      zIndex: 10,
      style: function (feature, resolution) {
        var styleApi = self.styleApi;
        if (!styleApi || !styleApi.styleAdminOverlay) return null;
        return styleApi.styleAdminOverlay(feature, self.visualZFromResolution(resolution), self.ol);
      },
    });
  };

  AMapTileLoader.prototype.createVectorSource = function () {
    var self = this;
    return new this.ol.source.VectorTile({
      projection: "EPSG:4326",
      tileGrid: this.tileGrid,
      wrapX: false,
      cacheSize: 1024,
      transition: 250,
      tileUrlFunction: function (tileCoord) {
        return "amap://" + tileId(tileCoord[1], tileCoord[2], tileCoord[0]);
      },
      format: this.geojsonFormat,
      tileLoadFunction: function (tile, url) {
        tile.setLoader(function (extent, resolution, projection) {
          var id = url.replace("amap://", "");
          var parts = id.split("_");
          var zz = +parts[2];
          if (!self.isValidTileZ(zz)) {
            tile.setFeatures([]);
            return;
          }

          function applyFeatures(merged) {
            self.featureCache.set(id, merged);
            tile.setFeatures(
              self.geojsonFormat.readFeatures(
                { type: "FeatureCollection", features: merged },
                { dataProjection: "EPSG:4326", featureProjection: projection }
              )
            );
          }

          if (self.featureCache.has(id)) {
            try { applyFeatures(self.featureCache.get(id)); return; }
            catch (e) { self.featureCache.delete(id); }
          }

          if (self.loadPromises.has(id)) {
            self.loadPromises.get(id).then(applyFeatures).catch(function () {});
            return;
          }

          var loadPromise = self.ensureTileUrls(id)
            .then(function () { return self.loadTilePbf(id, 0); })
            .catch(function (err) {
              function retry(n) {
                if (n > 5) throw err;
                self.authPending.add(id);
                self.scheduleAuthFlush();
                return new Promise(function (r) { setTimeout(r, 200 * n); })
                  .then(function () {
                    return self.ensureTileUrls(id)
                      .then(function () { return self.loadTilePbf(id, n); })
                      .catch(function () { return retry(n + 1); });
                  });
              }
              return retry(1);
            });

          self.loadPromises.set(id, loadPromise);
          loadPromise
            .then(function (merged) {
              self.loadPromises.delete(id);
              applyFeatures(merged);
            })
            .catch(function () {
              self.loadPromises.delete(id);
              if (self.featureCache.has(id)) {
                try { applyFeatures(self.featureCache.get(id)); return; }
                catch (e) { /* ignore */ }
              }
              self.authPending.add(id);
              self.scheduleAuthFlush();
            });
        });
      },
    });
  };

  AMapTileLoader.prototype.clearCaches = function () {
    this.cancelAuthRequests();
    this.urlCache.clear();
    this.featureCache.clear();
    this.loadPromises.clear();
    this.authPending.clear();
    this.authWaiters.clear();
    this.authRunning = false;
  };

  AMapTileLoader.prototype.reload = function () {
    var self = this;
    if (!this.map) return Promise.resolve();
    this.lastViewZoomIndex = null;
    this.clearCaches();
    if (this.vectorLayer) {
      this.map.removeLayer(this.vectorLayer);
      this.vectorLayer = null;
    }
    this.vectorSource = this.createVectorSource();
    this.vectorLayer = new this.ol.layer.VectorTile({
      declutter: true,
      source: this.vectorSource,
      style: function (f, r) { return self.styleFn(f, r); },
      renderMode: "hybrid",
      renderOrder: function (f1, f2) {
        return self.featureRenderPriority(f1) - self.featureRenderPriority(f2);
      },
      preload: 2,
      useInterimTilesOnError: true,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      zIndex: 1,
    });
    this.map.addLayer(this.vectorLayer);
    return this.authViewTiles().then(function () {
      if (self.vectorSource) self.vectorSource.changed();
    });
  };

  AMapTileLoader.prototype.onViewResolutionChange = function () {
    var viewZoom = this.getViewZoomIndex();
    if (viewZoom !== this.lastViewZoomIndex) {
      this.lastViewZoomIndex = viewZoom;
      if (this.vectorSource) this.vectorSource.changed();
      if (this.vectorLayer) this.vectorLayer.changed();
    }
    var z = this.getViewTileZ();
    if (z !== this.lastTileZ) {
      this.lastTileZ = z;
      this.scheduleAuth();
    }
    var oz = this.poiOverlayTileZ();
    if (oz !== this.lastPoiOverlayZ) {
      this.lastPoiOverlayZ = oz;
      this.featureCache.clear();
      if (this.vectorSource) this.vectorSource.changed();
    }
    var dz = this.detailOverlayTileZ();
    if (dz !== this.lastDetailOverlayZ) {
      this.lastDetailOverlayZ = dz;
      this.featureCache.clear();
      if (this.vectorSource) this.vectorSource.changed();
    }
    var api = this.styleApi;
    var vz = this.getViewVisualZ();
    var mapEl = this.map && this.map.getTargetElement && this.map.getTargetElement();
    if (mapEl && api) {
      var parkish =
        (api.isParkDetailZoom && api.isParkDetailZoom(vz)) ||
        (api.isUrbanDetailZoom && api.isUrbanDetailZoom(vz)) ||
        (api.isRegionalZoom && api.isRegionalZoom(vz));
      mapEl.style.background = parkish
        ? api.urbanBackground || "#f2f3f7"
        : api.background || "#f7f7f7";
    }
  };

  AMapTileLoader.prototype.scheduleAuth = function () {
    var self = this;
    clearTimeout(this.moveTimer);
    this.enqueueTilesForAuth(this.getViewTiles());
    this.moveTimer = setTimeout(function () { self.flushAuthQueue(); }, 50);
  };

  AMapTileLoader.prototype.attach = function (map) {
    this.detach();
    this.map = map;
    if (!this.adminOverlayLayer) {
      this.adminOverlayLayer = this.createAdminOverlayLayer();
    }
    if (this.adminOverlayLayer && map.getLayers().getArray().indexOf(this.adminOverlayLayer) < 0) {
      map.addLayer(this.adminOverlayLayer);
    }
    map.getView().on("change:resolution", this._onResolutionChange);
    map.on("movestart", this._onMove);
    map.on("moveend", this._onMove);
    this.lastTileZ = this.getViewTileZ();
    this.onViewResolutionChange();
    return this.reload();
  };

  AMapTileLoader.prototype.detach = function () {
    if (!this.map) return;
    this.cancelAuthRequests();
    this.map.getView().un("change:resolution", this._onResolutionChange);
    this.map.off("movestart", this._onMove);
    this.map.off("moveend", this._onMove);
    if (this.vectorLayer) {
      this.map.removeLayer(this.vectorLayer);
      this.vectorLayer = null;
    }
    this.vectorSource = null;
    clearTimeout(this.moveTimer);
    clearTimeout(this.authFlushTimer);
  };

  AMapTileLoader.prototype.featureIntersectsExtent = function (geojsonFeature, extent) {
    if (!geojsonFeature || !geojsonFeature.geometry) return false;
    try {
      var olFeature = this.geojsonFormat.readFeature(geojsonFeature, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:4326",
      });
      var geom = olFeature.getGeometry();
      if (!geom) return false;
      return this.ol.extent.intersects(extent, geom.getExtent());
    } catch (e) {
      return true;
    }
  };

  AMapTileLoader.prototype.isGeoFeatureVisibleAtView = function (geojsonFeature) {
    var api = this.styleApi;
    if (!api || !api.featureVisibleAtView) {
      if (!api || !api.featureZoomVisible) return true;
      return api.featureZoomVisible(
        this.geojsonFormat.readFeature(geojsonFeature, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:4326",
        }),
        this.getViewVisualZ()
      );
    }
    try {
      var olF = this.geojsonFormat.readFeature(geojsonFeature, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:4326",
      });
      return api.featureVisibleAtView(olF, this.getViewVisualZ(), this.getViewZoomIndex());
    } catch (e) {
      return true;
    }
  };

  AMapTileLoader.prototype.collectViewLayerFeatures = function (opts) {
    opts = opts || {};
    var onlyVisible = opts.onlyVisible !== false;
    if (!this.map) return { features: [], tileIds: [], missingTiles: [] };
    var size = this.map.getSize();
    if (!size) return { features: [], tileIds: [], missingTiles: [] };
    var extent = this.map.getView().calculateExtent(size);
    var viewTiles = this.getViewTiles();
    var tileIdSet = {};
    viewTiles.forEach(function (t) { tileIdSet[t.id] = true; });

    var out = [];
    var seen = new Set();
    var missingTiles = [];
    var self = this;

    viewTiles.forEach(function (t) {
      if (!self.featureCache.has(t.id)) missingTiles.push(t.id);
    });

    this.featureCache.forEach(function (features, id) {
      if (!tileIdSet[id]) return;
      (features || []).forEach(function (f) {
        if (!f || !f.properties) return;
        if (!self.featureIntersectsExtent(f, extent)) return;
        if (onlyVisible && !self.isGeoFeatureVisibleAtView(f)) return;
        var k = featureKey(f);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(f);
      });
    });

    if (this.adminOverlayLayer) {
      var adminSrc = this.adminOverlayLayer.getSource();
      if (adminSrc && adminSrc.getFeatures) {
        adminSrc.getFeatures().forEach(function (olF) {
          if (!olF.getGeometry || !olF.getGeometry()) return;
          if (!self.ol.extent.intersects(extent, olF.getGeometry().getExtent())) return;
          var gj = self.geojsonFormat.writeFeatureObject(olF, {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:4326",
          });
          gj.properties = gj.properties || {};
          gj.properties.layer = gj.properties.layer || "adminOverlay";
          var k = featureKey(gj);
          if (seen.has(k)) return;
          seen.add(k);
          out.push(gj);
        });
      }
    }

    return {
      features: out,
      tileIds: Object.keys(tileIdSet),
      missingTiles: missingTiles,
    };
  };

  AMapTileLoader.GET_TILE_DEFAULT = GET_TILE_DEFAULT;
  AMapTileLoader.defaultUseProxy = defaultUseProxy;

  return AMapTileLoader;
});
