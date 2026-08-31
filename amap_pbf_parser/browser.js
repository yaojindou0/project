/**
 * Browser build of AMap Nebula PBF parser (no Node zlib).
 * Depends on global `pako` (CDN) for inflate.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("pako"));
  } else {
    root.AMapPbf = factory(root.pako);
  }
})(typeof self !== "undefined" ? self : this, function (pako) {
  "use strict";

  function readVarintRemainder(low, isSigned, pbf) {
    const buf = pbf.buf;
    let b = buf[pbf.pos++];
    let hi = (b & 0x70) >> 4;
    if (b < 0x80) return toNum(low, hi, isSigned);
    hi |= (b = buf[pbf.pos++]) & 0x7f;
    if (b < 0x80) return toNum(low, hi, isSigned);
    hi |= ((b = buf[pbf.pos++]) & 0x7f) << 7;
    if (b < 0x80) return toNum(low, hi, isSigned);
    hi |= ((b = buf[pbf.pos++]) & 0x7f) << 14;
    if (b < 0x80) return toNum(low, hi, isSigned);
    hi |= ((b = buf[pbf.pos++]) & 0x7f) << 21;
    if (b < 0x80) return toNum(low, hi, isSigned);
    hi |= ((b = buf[pbf.pos++]) & 0x01) << 28;
    if (b < 0x80) return toNum(low, hi, isSigned);
    throw new Error("varint too long");
  }
  function toNum(low, high, isSigned) {
    return isSigned
      ? high * 0x100000000 + (low >>> 0)
      : (high >>> 0) * 0x100000000 + (low >>> 0);
  }
  function readUtf8(buf, start, end) {
    return new TextDecoder("utf-8").decode(buf.subarray(start, end));
  }

  function Pbf(buf) {
    this.buf = buf ? (buf instanceof Uint8Array ? buf : new Uint8Array(buf)) : new Uint8Array(0);
    this.pos = 0;
    this.type = 0;
    this.length = this.buf.length;
  }
  Pbf.Bytes = 2;
  Pbf.prototype.readFields = function (fn, result, end) {
    end = end === undefined ? this.length : end;
    while (this.pos < end) {
      const val = this.readVarint();
      const tag = val >> 3;
      const start = this.pos;
      this.type = val & 7;
      fn(tag, result, this);
      if (this.pos === start) this.skip(val);
    }
    return result;
  };
  Pbf.prototype.readVarint = function (isSigned) {
    const buf = this.buf;
    let b = buf[this.pos++],
      val = b & 0x7f;
    if (b < 0x80) return val;
    b = buf[this.pos++];
    val |= (b & 0x7f) << 7;
    if (b < 0x80) return val;
    b = buf[this.pos++];
    val |= (b & 0x7f) << 14;
    if (b < 0x80) return val;
    b = buf[this.pos++];
    val |= (b & 0x7f) << 21;
    if (b < 0x80) return val;
    b = buf[this.pos];
    val |= (b & 0x0f) << 28;
    return readVarintRemainder(val, isSigned, this);
  };
  Pbf.prototype.readSVarint = function () {
    const n = this.readVarint();
    return n % 2 === 1 ? (n + 1) / -2 : n / 2;
  };
  Pbf.prototype.readBoolean = function () {
    return Boolean(this.readVarint());
  };
  Pbf.prototype.readString = function () {
    const end = this.readVarint() + this.pos;
    const s = readUtf8(this.buf, this.pos, end);
    this.pos = end;
    return s;
  };
  Pbf.prototype.readBytes = function () {
    const end = this.readVarint() + this.pos;
    const b = this.buf.subarray(this.pos, end);
    this.pos = end;
    return b;
  };
  Pbf.prototype.readPackedVarint = function (arr) {
    const end = this.type === Pbf.Bytes ? this.readVarint() + this.pos : this.pos + 1;
    arr = arr || [];
    while (this.pos < end) arr.push(this.readVarint());
    return arr;
  };
  Pbf.prototype.readPackedSVarint = function (arr) {
    const end = this.type === Pbf.Bytes ? this.readVarint() + this.pos : this.pos + 1;
    arr = arr || [];
    while (this.pos < end) arr.push(this.readSVarint());
    return arr;
  };
  Pbf.prototype.skip = function (val) {
    const t = val & 7;
    if (t === 2) this.pos = this.readVarint() + this.pos;
    else if (t === 5) this.pos += 4;
    else if (t === 1) this.pos += 8;
    else if (t === 0) this.readVarint();
  };

  function readLanguage(tag, obj, pbf) {
    if (tag === 1) obj.name = pbf.readString();
    else if (tag === 2) obj.lang = pbf.readString();
    else if (tag === 3) pbf.readPackedVarint(obj.nameBreaks);
    else if (tag === 4) pbf.readPackedVarint(obj.subNameBreaks);
  }
  function Language() {
    return { name: "", lang: "", nameBreaks: [], subNameBreaks: [] };
  }
  function readLang(pbf, end) {
    return pbf.readFields(readLanguage, Language(), end);
  }

  function decodeDelta(packed) {
    const pts = [];
    let x = 0,
      y = 0;
    for (let i = 0; i + 1 < packed.length; i += 2) {
      if (i === 0) {
        x = packed[0];
        y = packed[1];
      } else {
        x += packed[i];
        y += packed[i + 1];
      }
      pts.push([x, y]);
    }
    return pts;
  }

  // --- layers (subset used for rendering) ---
  function readRoadLine(tag, o, p) {
    if (tag === 1) o.nameLoc.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 2) o.rank = p.readVarint();
    else if (tag === 3) o.shield = p.readString();
    else if (tag === 4) o.shieldType = p.readVarint();
    else if (tag === 5) p.readPackedSVarint(o.line);
    else if (tag === 6) o.nameEng.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 7) o.uid = p.readVarint();
    else if (tag === 8) o.nameMulti.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 9) o.nameZh.push(readLang(p, p.readVarint() + p.pos));
  }
  function RoadLine() {
    return { nameLoc: [], rank: 0, shield: "", shieldType: 0, line: [], nameEng: [], uid: 1, nameMulti: [], nameZh: [] };
  }
  function readRoadLineMulti(tag, o, p) {
    if (tag === 1) o.minZoom = p.readVarint();
    else if (tag === 2) o.maxZoom = p.readVarint();
    else if (tag === 3) o.drawOrder = p.readVarint();
    else if (tag === 4) o.roadLines.push(p.readFields(readRoadLine, RoadLine(), p.readVarint() + p.pos));
  }
  function RoadLineMulti() {
    return { minZoom: 2, maxZoom: 30, drawOrder: 0, roadLines: [] };
  }
  function readRoadSame(tag, o, p) {
    if (tag === 1) o.mainKey = p.readVarint();
    else if (tag === 2) o.subKey = p.readVarint();
    else if (tag === 3) o.resolution = p.readVarint();
    else if (tag === 4) o.items.push(p.readFields(readRoadLineMulti, RoadLineMulti(), p.readVarint() + p.pos));
  }
  function RoadSame() {
    return { mainKey: 20004, subKey: 1, resolution: 12, items: [] };
  }
  function readRoadLayer(tag, o, p) {
    if (tag === 1) o.roadLines.push(p.readFields(readRoadSame, RoadSame(), p.readVarint() + p.pos));
    else if (tag === 2) o.tileId = p.readString();
    else if (tag === 3) o.tileRegion = p.readString();
  }
  function RoadLayer() {
    return { roadLines: [], tileId: "", tileRegion: "" };
  }

  function readLineFeature(tag, o, p) {
    if (tag === 1) o.nameLoc.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 2) o.rank = p.readVarint();
    else if (tag === 3) p.readPackedSVarint(o.line);
    else if (tag === 4) o.nameEng.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 5) o.uid = p.readVarint();
    else if (tag === 6) o.nameMulti.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 7) o.nameZh.push(readLang(p, p.readVarint() + p.pos));
  }
  function LineFeature() {
    return { nameLoc: [], rank: 0, line: [], nameEng: [], uid: 1, nameMulti: [], nameZh: [] };
  }
  function readLineMulti(tag, o, p) {
    if (tag === 1) o.minZoom = p.readVarint();
    else if (tag === 2) o.maxZoom = p.readVarint();
    else if (tag === 3) o.drawOrder = p.readVarint();
    else if (tag === 4) o.lineFeatures.push(p.readFields(readLineFeature, LineFeature(), p.readVarint() + p.pos));
  }
  function LineMulti() {
    return { minZoom: 2, maxZoom: 30, drawOrder: 0, lineFeatures: [] };
  }
  function readGeomPoly(tag, o, p) {
    if (tag === 1) p.readPackedSVarint(o.polygon);
  }
  function GeomPoly() {
    return { polygon: [] };
  }
  function readPolyFeature(tag, o, p) {
    if (tag === 1) o.minZoom = p.readVarint();
    else if (tag === 2) o.maxZoom = p.readVarint();
    else if (tag === 3) o.names.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 4) o.drawOrder = p.readVarint();
    else if (tag === 5) o.rank = p.readVarint();
    else if (tag === 6) o.polygons.push(p.readFields(readGeomPoly, GeomPoly(), p.readVarint() + p.pos));
    else if (tag === 7) o.nameEng.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 8) o.uid = p.readVarint();
  }
  function PolyFeature() {
    return { minZoom: 2, maxZoom: 30, names: [], drawOrder: 0, rank: 0, polygons: [], nameEng: [], uid: 1 };
  }
  function readPolySame(tag, o, p) {
    if (tag === 1) o.mainKey = p.readVarint();
    else if (tag === 2) o.subKey = p.readVarint();
    else if (tag === 3) o.resolution = p.readVarint();
    else if (tag === 4) o.items.push(p.readFields(readPolyFeature, PolyFeature(), p.readVarint() + p.pos));
  }
  function PolySame() {
    return { mainKey: 30001, subKey: 1, resolution: 12, items: [] };
  }
  function readLineSame(tag, o, p) {
    if (tag === 1) o.mainKey = p.readVarint();
    else if (tag === 2) o.subKey = p.readVarint();
    else if (tag === 3) o.resolution = p.readVarint();
    else if (tag === 4) o.items.push(p.readFields(readLineMulti, LineMulti(), p.readVarint() + p.pos));
  }
  function LineSame() {
    return { mainKey: 20016, subKey: 1, resolution: 12, items: [] };
  }
  function readRegionLayer(tag, o, p) {
    if (tag === 1) o.polygons.push(p.readFields(readPolySame, PolySame(), p.readVarint() + p.pos));
    else if (tag === 2) o.lines.push(p.readFields(readLineSame, LineSame(), p.readVarint() + p.pos));
    else if (tag === 3) o.tileId = p.readString();
    else if (tag === 4) o.tileRegion = p.readString();
  }
  function RegionLayer() {
    return { polygons: [], lines: [], tileId: "", tileRegion: "" };
  }

  function readPointFeature(tag, o, p) {
    if (tag === 1) o.nameLoc.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 2) o.drawOrder = p.readVarint();
    else if (tag === 3) o.rti = p.readString();
    else if (tag === 4) p.readPackedVarint(o.pos);
    else if (tag === 5) o.nameEng.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 6) o.uid = p.readVarint();
    else if (tag === 7) o.nameMulti.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 8) o.nameZh.push(readLang(p, p.readVarint() + p.pos));
  }
  function PointFeature() {
    return { nameLoc: [], drawOrder: 0, rti: "", pos: [], nameEng: [], uid: 1, nameMulti: [], nameZh: [] };
  }
  function readPointMulti(tag, o, p) {
    if (tag === 1) o.minZoom = p.readVarint();
    else if (tag === 2) o.maxZoom = p.readVarint();
    else if (tag === 3) o.rank = p.readVarint();
    else if (tag === 4) o.features.push(p.readFields(readPointFeature, PointFeature(), p.readVarint() + p.pos));
  }
  function PointMulti() {
    return { minZoom: 2, maxZoom: 30, rank: 0, features: [] };
  }
  function readPointSame(tag, o, p) {
    if (tag === 1) o.mainKey = p.readVarint();
    else if (tag === 2) o.subKey = p.readVarint();
    else if (tag === 3) o.resolution = p.readVarint();
    else if (tag === 4) o.items.push(p.readFields(readPointMulti, PointMulti(), p.readVarint() + p.pos));
  }
  function PointSame() {
    return { mainKey: 12024, subKey: 1, resolution: 12, items: [] };
  }
  function readPoiLayer(tag, o, p) {
    if (tag === 1) o.points.push(p.readFields(readPointSame, PointSame(), p.readVarint() + p.pos));
    else if (tag === 2) o.tileId = p.readString();
    else if (tag === 3) o.tileRegion = p.readString();
  }
  function PoiLayer() {
    return { points: [], tileId: "", tileRegion: "" };
  }

  function readShapeFeature(tag, o, p) {
    if (tag === 1) o.nameLoc.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 2) o.rank = p.readVarint();
    else if (tag === 3) p.readPackedSVarint(o.polygon);
    else if (tag === 4) o.uid = p.readVarint();
    else if (tag === 5) o.height = p.readVarint(true);
    else if (tag === 6) o.bz = p.readString();
    else if (tag === 7) o.nameEng.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 8) o.nameMulti.push(readLang(p, p.readVarint() + p.pos));
    else if (tag === 9) o.nameZh.push(readLang(p, p.readVarint() + p.pos));
  }
  function ShapeFeature() {
    return { nameLoc: [], rank: 0, polygon: [], uid: 1, height: 6, bz: "", nameEng: [], nameMulti: [], nameZh: [] };
  }
  function readShapeMulti(tag, o, p) {
    if (tag === 1) o.minZoom = p.readVarint();
    else if (tag === 2) o.maxZoom = p.readVarint();
    else if (tag === 3) o.drawOrder = p.readVarint();
    else if (tag === 4) o.shapeFeatures.push(p.readFields(readShapeFeature, ShapeFeature(), p.readVarint() + p.pos));
  }
  function ShapeMulti() {
    return { minZoom: 15, maxZoom: 30, drawOrder: 0, shapeFeatures: [] };
  }
  function readBuildingSame(tag, o, p) {
    if (tag === 1) o.mainKey = p.readVarint();
    else if (tag === 2) o.subKey = p.readVarint();
    else if (tag === 3) o.resolution = p.readVarint();
    else if (tag === 4) o.items.push(p.readFields(readShapeMulti, ShapeMulti(), p.readVarint() + p.pos));
  }
  function BuildingSame() {
    return { mainKey: 55001, subKey: 1, resolution: 12, items: [] };
  }
  function readBuildingLayer(tag, o, p) {
    if (tag === 1) o.buildings.push(p.readFields(readBuildingSame, BuildingSame(), p.readVarint() + p.pos));
    else if (tag === 2) o.tileId = p.readString();
    else if (tag === 3) o.tileRegion = p.readString();
  }
  function BuildingLayer() {
    return { buildings: [], tileId: "", tileRegion: "" };
  }

  function readTransitLayer(tag, o, p) {
    if (tag === 1) o.lines.push(p.readFields(readLineSame, LineSame(), p.readVarint() + p.pos));
    else if (tag === 2) o.points.push(p.readFields(readPointSame, PointSame(), p.readVarint() + p.pos));
    else if (tag === 3) o.polygons.push(p.readFields(readPolySame, PolySame(), p.readVarint() + p.pos));
    else if (tag === 4) o.tileId = p.readString();
    else if (tag === 5) o.tileRegion = p.readString();
  }
  function TransitLayer() {
    return { lines: [], points: [], polygons: [], tileId: "", tileRegion: "" };
  }

  function decodeLayer(type, bytes) {
    if (!bytes || !bytes.length) return null;
    const pbf = new Pbf(bytes);
    if (type === 0) return pbf.readFields(readPoiLayer, PoiLayer());
    if (type === 1) return pbf.readFields(readRoadLayer, RoadLayer());
    if (type === 2) return pbf.readFields(readRegionLayer, RegionLayer());
    if (type === 3) return pbf.readFields(readBuildingLayer, BuildingLayer());
    if (type === 4) return pbf.readFields(readTransitLayer, TransitLayer());
    return null;
  }

  function readLayer(tag, o, p) {
    if (tag === 1) o.z = p.readVarint();
    else if (tag === 2) o.x = p.readVarint();
    else if (tag === 3) o.y = p.readVarint();
    else if (tag === 4) o.type = p.readVarint();
    else if (tag === 5) o.data = p.readBytes();
  }
  function Layer() {
    return { z: 0, x: 0, y: 0, type: 0, data: null };
  }
  function readTile(tag, o, p) {
    if (tag === 1) o.z = p.readVarint();
    else if (tag === 2) o.x = p.readVarint();
    else if (tag === 3) o.y = p.readVarint();
    else if (tag === 4) o.layers.push(p.readFields(readLayer, Layer(), p.readVarint() + p.pos));
  }
  function Tile() {
    return { z: 0, x: 0, y: 0, layers: [] };
  }
  function readResult(tag, o, p) {
    if (tag === 1) o.tiles.push(p.readFields(readTile, Tile(), p.readVarint() + p.pos));
    else if (tag === 2) o.version = p.readString();
    else if (tag === 3) o.status = p.readBoolean();
  }
  function Result() {
    return { tiles: [], version: "", status: false };
  }

  function inflatePacket(chunk) {
    if (!pako || !pako.inflate) throw new Error("pako is required");
    try {
      return pako.inflate(chunk);
    } catch (e1) {
      try {
        return pako.ungzip(chunk);
      } catch (e2) {
        return pako.inflateRaw(chunk);
      }
    }
  }

  function decodeTiles(bytes) {
    const result = new Pbf(bytes).readFields(readResult, Result());
    for (const tile of result.tiles) {
      for (const layer of tile.layers) {
        layer.decoded = decodeLayer(layer.type, layer.data);
        delete layer.data;
      }
    }
    return result;
  }

  function unzipAndDecodeTiles(input) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = 0;
    let merged = null;
    while (offset + 4 <= buf.byteLength) {
      const len = view.getUint32(offset, false);
      offset += 4;
      if (len <= 0 || len > buf.byteLength - offset) break;
      const chunk = buf.subarray(offset, offset + len);
      offset += len;
      let inflated;
      try {
        inflated = inflatePacket(chunk);
      } catch (_) {
        break;
      }
      const part = decodeTiles(inflated);
      if (!merged) merged = part;
      else if (part.tiles && part.tiles.length) merged.tiles.push.apply(merged.tiles, part.tiles);
    }
    if (!merged) {
      try {
        merged = decodeTiles(inflatePacket(buf));
      } catch (_) {
        merged = decodeTiles(buf);
      }
    }
    return merged;
  }

  const DEF_NDS = 2147483648;
  const DEF_DEG = 180;
  function degree2Coord(d) {
    return Math.floor((d * DEF_NDS) / DEF_DEG + 0.5);
  }
  function coord2Degree(c) {
    return (c * DEF_DEG) / DEF_NDS;
  }
  function getCoordShift(z, res) {
    return 33 - res - z;
  }
  const worldCache = {};
  function getWorldSize(z, res) {
    const level = z + res;
    if (worldCache[level]) return worldCache[level];
    const shift = 33 - level;
    let e = degree2Coord(180) / (1 << shift);
    let r = degree2Coord(90) / (1 << shift);
    e = e > 0 ? Math.floor(0.5 + e) : Math.floor(e - 0.5);
    r = r > 0 ? Math.floor(0.5 + r) : Math.floor(r - 0.5);
    return (worldCache[level] = [2 * e, 2 * r]);
  }
  function getTileSW(tile, res) {
    const w = getWorldSize(tile.z, res);
    const n = 1 << tile.z;
    return [-w[0] / 2 + (tile.x * w[0]) / n, w[1] / 2 - ((tile.y + 1) * w[1]) / n];
  }
  function tileInnerCoord2LngLat(tile, res, lx, ly) {
    const sw = getTileSW(tile, res);
    const a = lx + sw[0];
    const b = ly + sw[1];
    const shift = getCoordShift(tile.z, res);
    /* 与 amap.js 一致：用 <<；shift 非法时退回乘幂避免错位 */
    let rx, ry;
    if (shift >= 0 && shift < 32) {
      rx = (a << shift) | 0;
      ry = (b << shift) | 0;
    } else {
      const mul = Math.pow(2, shift);
      rx = (a * mul) | 0;
      ry = (b * mul) | 0;
    }
    if (a > 0 && rx < 0) rx = DEF_NDS - 1;
    return [coord2Degree(rx), coord2Degree(ry)];
  }

  /**
   * 对齐 amap.js handlerTile：优先 Layer.z/x/y，其次 Tile，再回退请求瓦片号。
   * 叠瓦（z15/z16）若误用父级 z14，POI/建筑会整体错位。
   */
  function resolveNebulaTileKey(tile, layer, fallback) {
    const lz = layer && layer.z != null ? Number(layer.z) : 0;
    const lx = layer && layer.x != null ? Number(layer.x) : 0;
    const ly = layer && layer.y != null ? Number(layer.y) : 0;
    if (lz > 0 || lx > 0 || ly > 0) return { z: lz, x: lx, y: ly };

    const tz = tile && tile.z != null ? Number(tile.z) : 0;
    const tx = tile && tile.x != null ? Number(tile.x) : 0;
    const ty = tile && tile.y != null ? Number(tile.y) : 0;
    if (tz > 0 || tx > 0 || ty > 0) return { z: tz, x: tx, y: ty };

    if (fallback && (fallback.z > 0 || fallback.x > 0 || fallback.y > 0)) {
      return {
        z: Number(fallback.z) || 0,
        x: Number(fallback.x) || 0,
        y: Number(fallback.y) || 0,
      };
    }
    return { z: tz, x: tx, y: ty };
  }

  function pickName(f) {
    for (const k of ["nameZh", "nameLoc", "nameMulti", "nameEng"]) {
      for (const n of f[k] || []) if (n && n.name) return n.name;
    }
    return "";
  }

  function pickNames(f) {
    const names = [];
    for (const k of ["nameZh", "nameLoc", "nameMulti", "nameEng"]) {
      for (const n of f[k] || []) if (n && n.name) names.push(n.name);
    }
    return names;
  }

  function serializeLangList(list) {
    return (list || []).map(function (n) {
      return {
        name: n.name || "",
        lang: n.lang || "",
        nameBreaks: n.nameBreaks || [],
        subNameBreaks: n.subNameBreaks || [],
      };
    });
  }

  function buildGroupItemProps(g, item, layerName, tile) {
    return {
      layer: layerName,
      tile: tile,
      mainKey: g.mainKey,
      subKey: g.subKey,
      resolution: g.resolution,
      minZoom: item.minZoom,
      maxZoom: item.maxZoom,
      drawOrder: item.drawOrder != null ? item.drawOrder : 0,
      crsNote: "GCJ-02 (AMap Nebula)",
    };
  }

  function buildNamedFeatureProps(f, extra) {
    return Object.assign(
      {
        name: pickName(f),
        names: pickNames(f),
        uid: f.uid != null ? f.uid : 1,
        rank: f.rank != null ? f.rank : 0,
        nameLoc: serializeLangList(f.nameLoc),
        nameEng: serializeLangList(f.nameEng),
        nameMulti: serializeLangList(f.nameMulti),
        nameZh: serializeLangList(f.nameZh),
      },
      extra || {}
    );
  }

  function buildPointProperties(f, g, item, layerName, tile) {
    const rti = f.rti || "";
    const subKey = g.subKey;
    const pos = f.pos && f.pos.length >= 2 ? [f.pos[0], f.pos[1]] : f.pos || [];
    return Object.assign(buildGroupItemProps(g, item, layerName, tile), buildNamedFeatureProps(f, {
      rti: rti,
      poiId: rti,
      id: rti ? String(rti) + String(subKey != null ? subKey : "") : "",
      drawOrder: f.drawOrder != null ? f.drawOrder : item.drawOrder != null ? item.drawOrder : 0,
      rank: item.rank != null ? item.rank : f.rank != null ? f.rank : 0,
      pos: pos,
    }));
  }

  function buildLineFeatureProperties(f, g, item, layerName, tile) {
    return Object.assign(buildGroupItemProps(g, item, layerName, tile), buildNamedFeatureProps(f));
  }

  function buildRoadLineProperties(line, g, item, layerName, tile) {
    return Object.assign(buildLineFeatureProperties(line, g, item, layerName, tile), {
      shield: line.shield || "",
      shieldType: line.shieldType != null ? line.shieldType : 0,
    });
  }

  function buildPolyItemProperties(item, g, layerName, tile) {
    const namesLang = serializeLangList(item.names);
    const names = namesLang.map(function (n) { return n.name; }).filter(Boolean);
    return Object.assign(buildGroupItemProps(g, item, layerName, tile), {
      name: names[0] || "",
      names: names.length ? names : pickNames(item),
      rank: item.rank != null ? item.rank : 0,
      uid: item.uid != null ? item.uid : 1,
      namesLang: namesLang,
      nameEng: serializeLangList(item.nameEng),
    });
  }

  function buildShapeProperties(sf, g, item, layerName, tile) {
    var props = Object.assign(buildGroupItemProps(g, item, layerName, tile), buildNamedFeatureProps(sf, {
      height: sf.height != null ? sf.height : 6,
      bz: sf.bz || "",
    }));
    if (!props.name) {
      var itemName = pickName(item);
      if (!itemName && item.names && item.names.length) itemName = item.names[0];
      if (itemName) props.name = itemName;
    }
    return props;
  }

  /** region.lines：20016 界 · 20010/20015 轨交 · 3000x 区域面线 */
  function regionLineLayerName(mainKey) {
    const mk = Number(mainKey);
    if (mk === 20014) return "waterline";
    if (mk === 20016) return "boundary";
    if (mk === 20010 || mk === 20015 || mk === 20019) return "road";
    if (mk >= 30001 && mk <= 30005) return "region";
    return "region";
  }

  /** Flatten to GeoJSON-like features with lng/lat (GCJ-02).
   * @param {object} result
   * @param {{z:number,x:number,y:number}|null} [fallbackTile] 请求瓦片号回退
   */
  function toGeoJSONFeatures(result, fallbackTile) {
    const out = [];
    if (!result || !result.tiles) return out;
    for (const tile of result.tiles) {
      for (const layer of tile.layers) {
        const t = resolveNebulaTileKey(tile, layer, fallbackTile);
        const d = layer.decoded;
        if (!d) continue;
        if (layer.type === 1 && d.roadLines) {
          for (const g of d.roadLines) {
            const res = g.resolution || 12;
            const mk = Number(g.mainKey);
            let layerName = "road";
            if (mk === 20016) layerName = "boundary";
            else if (mk === 20014) layerName = "waterline";
            for (const item of g.items || []) {
              for (const line of item.roadLines || []) {
                const coords = decodeDelta(line.line).map(([ix, iy]) => tileInnerCoord2LngLat(t, res, ix, iy));
                if (coords.length >= 2)
                  out.push({
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords },
                    properties: buildRoadLineProperties(line, g, item, layerName, t),
                  });
              }
            }
          }
        }
        if (layer.type === 2) {
          if (d.polygons) {
            for (const g of d.polygons) {
              const res = g.resolution || 12;
              for (const item of g.items || []) {
                for (const poly of item.polygons || []) {
                  let ring = decodeDelta(poly.polygon).map(([ix, iy]) => tileInnerCoord2LngLat(t, res, ix, iy));
                  if (ring.length < 3) continue;
                  const a = ring[0],
                    b = ring[ring.length - 1];
                  if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a.slice());
                  out.push({
                    type: "Feature",
                    geometry: { type: "Polygon", coordinates: [ring] },
                    properties: buildPolyItemProperties(item, g, "region", t),
                  });
                }
              }
            }
          }
          // region.lines：20014 水系 / 20016 行政界 / 3000x 区域面线（含运动场）
          if (d.lines) {
            for (const g of d.lines) {
              const res = g.resolution || 12;
              const layerName = regionLineLayerName(g.mainKey);
              for (const item of g.items || []) {
                for (const lf of item.lineFeatures || []) {
                  const coords = decodeDelta(lf.line).map(([ix, iy]) => tileInnerCoord2LngLat(t, res, ix, iy));
                  if (coords.length < 2) continue;
                  out.push({
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords },
                    properties: buildLineFeatureProperties(lf, g, item, layerName, t),
                  });
                }
              }
            }
          }
        }
        if (layer.type === 3 && d.buildings) {
          for (const g of d.buildings) {
            const res = g.resolution || 12;
            for (const item of g.items || []) {
              for (const sf of item.shapeFeatures || []) {
                let ring = decodeDelta(sf.polygon).map(([ix, iy]) => tileInnerCoord2LngLat(t, res, ix, iy));
                if (ring.length < 3) continue;
                const a = ring[0],
                  b = ring[ring.length - 1];
                if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a.slice());
                out.push({
                  type: "Feature",
                  geometry: { type: "Polygon", coordinates: [ring] },
                  properties: buildShapeProperties(sf, g, item, "building", t),
                });
              }
            }
          }
        }
        if (layer.type === 0 && d.points) {
          for (const g of d.points) {
            const res = g.resolution || 12;
            for (const item of g.items || []) {
              for (const f of item.features || []) {
                if (!f.pos || f.pos.length < 2) continue;
                out.push({
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: tileInnerCoord2LngLat(t, res, f.pos[0], f.pos[1]),
                  },
                  properties: buildPointProperties(f, g, item, "poi", t),
                });
              }
            }
          }
        }
        // transit（地铁等，若瓦片含 type=4）
        if (layer.type === 4) {
          if (d.lines) {
            for (const g of d.lines) {
              const res = g.resolution || 12;
              for (const item of g.items || []) {
                for (const lf of item.lineFeatures || []) {
                  const coords = decodeDelta(lf.line).map(([ix, iy]) => tileInnerCoord2LngLat(t, res, ix, iy));
                  if (coords.length < 2) continue;
                  out.push({
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords },
                    properties: buildLineFeatureProperties(lf, g, item, "transit", t),
                  });
                }
              }
            }
          }
          if (d.points) {
            for (const g of d.points) {
              const res = g.resolution || 12;
              for (const item of g.items || []) {
                for (const f of item.features || []) {
                  if (!f.pos || f.pos.length < 2) continue;
                  out.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: tileInnerCoord2LngLat(t, res, f.pos[0], f.pos[1]),
                    },
                    properties: buildPointProperties(f, g, item, "transit", t),
                  });
                }
              }
            }
          }
          if (d.polygons) {
            for (const g of d.polygons) {
              const res = g.resolution || 12;
              for (const item of g.items || []) {
                for (const poly of item.polygons || []) {
                  let ring = decodeDelta(poly.polygon).map(([ix, iy]) =>
                    tileInnerCoord2LngLat(t, res, ix, iy)
                  );
                  if (ring.length < 3) continue;
                  const a = ring[0],
                    b = ring[ring.length - 1];
                  if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a.slice());
                  out.push({
                    type: "Feature",
                    geometry: { type: "Polygon", coordinates: [ring] },
                    properties: buildPolyItemProperties(item, g, "transit", t),
                  });
                }
              }
            }
          }
        }
      }
    }
    return out;
  }

  /** MapStyle PBF 解码（对齐 amap.js MapStyle.read / decode-style.js） */
  Pbf.prototype.readInt64 = function () {
    var buf = this.buf;
    var b = buf[this.pos++];
    var val = b & 0x7f;
    if (b < 0x80) return toNum(val, 0, true);
    b = buf[this.pos++];
    val |= (b & 0x7f) << 7;
    if (b < 0x80) return toNum(val, 0, true);
    b = buf[this.pos++];
    val |= (b & 0x7f) << 14;
    if (b < 0x80) return toNum(val, 0, true);
    b = buf[this.pos++];
    val |= (b & 0x7f) << 21;
    if (b < 0x80) return toNum(val, 0, true);
    b = buf[this.pos];
    val |= (b & 0x0f) << 28;
    return readVarintRemainder(val, true, this);
  };

  function readStylePoi(tag, obj, pbf) {
    var v = function () { return pbf.readInt64(); };
    if (tag === 1) obj.f7t = v();
    else if (tag === 2) obj.styleColor = v();
    else if (tag === 3) obj.styleTextStrokeColor = v();
    else if (tag === 4) obj.W9t = v();
    else if (tag === 5) obj.iconIndex = v();
    else if (tag === 6) obj.d7t = v();
    else if (tag === 7) obj.g7t = v();
    else if (tag === 8) obj.v7t = v();
    else if (tag === 9) obj.styleHeight = v();
    else if (tag === 10) obj.styleWidth = v();
    else if (tag === 11) obj.q9t = v();
    else if (tag === 12) obj.y7t = v();
    else if (tag === 13) obj.m7t = v();
    else if (tag === 14) obj.p7t = v();
    else if (tag === 15) obj.b7t = v();
    else if (tag === 16) obj.w7t = v();
    else if (tag === 17) obj.flags = v();
    else if (tag === 18) obj.styleBackgroundColor = v();
    else if (tag === 19) obj.G7t = v();
    else if (tag === 20) obj._7t = v();
    else if (tag === 21) obj.M7t = v();
    else if (tag === 22) obj.Sgt = v();
    else if (tag === 23) obj.Agt = v();
    else if (tag === 24) obj.Dgt = v();
    else if (tag === 25) obj.Rgt = v();
    else if (tag === 26) obj.Pgt = v();
    else if (tag === 27) obj.Bgt = v();
    else if (tag === 28) obj.Ggt = v();
    else if (tag === 29) obj.$gt = v();
    else if (tag === 30) obj.Cgt = v();
    else if (tag === 31) obj.Lgt = v();
    else if (tag === 32) obj._gt = v();
    else if (tag === 33) obj.Ngt = v();
    else if (tag === 34) obj.Fgt = v();
    else if (tag === 35) obj.Ogt = v();
    else if (tag === 36) obj.Ugt = v();
    else if (tag === 37) obj.Egt = v();
    else if (tag === 38) obj.jgt = v();
  }

  function readStyleRoad(tag, obj, pbf) {
    var v = function () { return pbf.readInt64(); };
    if (tag === 1) obj.T7t = v();
    else if (tag === 2) obj.P7t = v();
    else if (tag === 3) obj.fillColor = v();
    else if (tag === 4) obj.strokeWidth = v();
    else if (tag === 5) obj.lineWidth = v();
    else if (tag === 6) obj.strokeColor = v();
    else if (tag === 7) obj.fontSize = v();
    else if (tag === 8) obj.Y9t = v();
    else if (tag === 9) obj.Z9t = v();
  }

  function readStyleRegion(tag, obj, pbf) {
    if (tag === 1) obj.fillColor = pbf.readInt64();
    else if (tag === 2) obj.f5t = pbf.readInt64();
    else if (tag === 3) obj.texture = pbf.readString();
  }

  function readStyleBuilding(tag, obj, pbf) {
    if (tag === 1) obj.roofColor = pbf.readInt64();
    else if (tag === 2) obj.wallColor = pbf.readInt64();
    else if (tag === 3) obj.f5t = pbf.readInt64();
    else if (tag === 4) obj.texture = pbf.readString();
  }

  function readStyleGuide(tag, obj, pbf) {
    var v = function () { return pbf.readInt64(); };
    if (tag === 1) obj.styleColor = v();
    else if (tag === 2) obj.f7t = v();
    else if (tag === 3) obj.q9t = v();
    else if (tag === 4) obj.y7t = v();
    else if (tag === 5) obj.m7t = v();
    else if (tag === 6) obj.p7t = v();
    else if (tag === 7) obj.b7t = v();
    else if (tag === 8) obj.M7t = v();
    else if (tag === 9) obj.Dgt = v();
    else if (tag === 10) obj.Rgt = v();
    else if (tag === 11) obj.Bgt = v();
  }

  function readStyleEntry(tag, obj, pbf) {
    if (tag === 1) obj.mainKey = pbf.readInt64();
    else if (tag === 2) obj.subKey = pbf.readInt64();
    else if (tag === 3) obj.minZoom = pbf.readVarint();
    else if (tag === 4) obj.maxZoom = pbf.readVarint();
    else if (tag === 5) obj.poi = pbf.readFields(readStylePoi, {}, pbf.readVarint() + pbf.pos);
    else if (tag === 6) obj.road = pbf.readFields(readStyleRoad, {}, pbf.readVarint() + pbf.pos);
    else if (tag === 7) obj.region = pbf.readFields(readStyleRegion, {}, pbf.readVarint() + pbf.pos);
    else if (tag === 8) obj.guide = pbf.readFields(readStyleGuide, {}, pbf.readVarint() + pbf.pos);
    else if (tag === 9) obj.building = pbf.readFields(readStyleBuilding, {}, pbf.readVarint() + pbf.pos);
    else if (tag === 10) obj.fresh = pbf.readBoolean();
    else if (tag === 11) obj.kyt = pbf.readBoolean();
  }

  function readMapStyleRoot(tag, obj, pbf) {
    if (tag === 1) obj.styles.push(pbf.readFields(readStyleEntry, {}, pbf.readVarint() + pbf.pos));
    else if (tag === 2) obj.version = pbf.readString();
    else if (tag === 3) obj.N9t = pbf.readString();
  }

  function decodeStyleBytes(bytes) {
    var buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var pbf = new Pbf(buf);
    return pbf.readFields(readMapStyleRoot, { styles: [], version: "", N9t: "" });
  }

  function decodeStyle(input) {
    var buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    try {
      return decodeStyleBytes(buf);
    } catch (e1) {
      if (!pako) throw e1;
      try {
        return decodeStyleBytes(pako.inflate(buf));
      } catch (e2) {
        try {
          return decodeStyleBytes(pako.ungzip(buf));
        } catch (e3) {
          throw e1;
        }
      }
    }
  }

  return {
    unzipAndDecodeTiles: unzipAndDecodeTiles,
    toGeoJSONFeatures: toGeoJSONFeatures,
    tileInnerCoord2LngLat: tileInnerCoord2LngLat,
    resolveNebulaTileKey: resolveNebulaTileKey,
    decodeStyle: decodeStyle,
  };
});
