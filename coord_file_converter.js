/**
 * 坐标文件转换工具
 * 依赖: gcoord, shpjs(可选), wellknown(可选), @nickrsan/shp-write(可选)
 */
const CoordFileConverter = (function () {
    'use strict';

    function walkCoordinates(coords, visitor) {
        if (typeof coords[0] === 'number') {
            visitor(coords);
            return;
        }
        for (let i = 0; i < coords.length; i++) {
            walkCoordinates(coords[i], visitor);
        }
    }

    function roundCoord(val, precision) {
        if (precision == null) return val;
        return +Number(val).toFixed(precision);
    }

    function transformCoordPair(lng, lat, fromCrs, toCrs, precision) {
        const out = gcoord.transform([Number(lng), Number(lat)], fromCrs, toCrs);
        return [roundCoord(out[0], precision), roundCoord(out[1], precision)];
    }

    const LNG_KEYS = ['lng', 'lon', 'longitude', 'x', '经度', 'LNG', 'LON', 'Longitude', 'LONGITUDE'];
    const LAT_KEYS = ['lat', 'latitude', 'y', '纬度', 'LAT', 'Latitude', 'LATITUDE'];

    function getObjField(obj, keys) {
        if (!obj || typeof obj !== 'object') return null;
        for (let i = 0; i < keys.length; i++) {
            const v = obj[keys[i]];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        const lowerMap = {};
        Object.keys(obj).forEach(function (k) { lowerMap[k.toLowerCase()] = k; });
        for (let j = 0; j < keys.length; j++) {
            const lk = keys[j].toLowerCase();
            if (lowerMap[lk] != null) {
                const v = obj[lowerMap[lk]];
                if (v !== undefined && v !== null && v !== '') return v;
            }
        }
        return null;
    }

    function extractLngLat(item) {
        if (!item || typeof item !== 'object') return null;

        let lng = getObjField(item, LNG_KEYS);
        let lat = getObjField(item, LAT_KEYS);
        if (lng != null && lat != null) {
            return [Number(lng), Number(lat)];
        }

        const nested = item.location || item.coord || item.coordinate || item.point ||
            (item.geometry && item.geometry.type === 'Point' ? item.geometry : null) ||
            item.position;
        if (nested) {
            if (Array.isArray(nested) && nested.length >= 2) {
                return [Number(nested[0]), Number(nested[1])];
            }
            if (nested.coordinates && nested.coordinates.length >= 2) {
                return [Number(nested.coordinates[0]), Number(nested.coordinates[1])];
            }
            lng = getObjField(nested, LNG_KEYS);
            lat = getObjField(nested, LAT_KEYS);
            if (lng != null && lat != null) {
                return [Number(lng), Number(lat)];
            }
        }
        return null;
    }

    function unwrapRecordList(data) {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return null;

        const wrapKeys = ['data', 'records', 'list', 'items', 'rows', 'result', 'stations', 'points'];
        for (let i = 0; i < wrapKeys.length; i++) {
            const key = wrapKeys[i];
            if (Array.isArray(data[key])) return data[key];
        }
        return null;
    }

    function recordsToFeatures(list) {
        if (!list.length) throw new Error('JSON 数据列表为空');
        if (list[0] && list[0].type === 'Feature') {
            return { type: 'FeatureCollection', features: list };
        }
        const features = list.map(function (item, idx) {
            const coord = extractLngLat(item);
            if (!coord || isNaN(coord[0]) || isNaN(coord[1])) {
                throw new Error('第 ' + (idx + 1) + ' 条记录缺少有效经纬度（支持 lng/lon/latitude/longitude/经度/纬度 等）');
            }
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coord },
                properties: Object.assign({}, item)
            };
        });
        return { type: 'FeatureCollection', features: features };
    }

    function normalizeToFeatureCollection(data) {
        if (!data) throw new Error('数据为空');
        if (data.type === 'FeatureCollection') return data;
        if (data.type === 'Feature') {
            return { type: 'FeatureCollection', features: [data] };
        }
        if (data.type && data.coordinates) {
            return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: data, properties: {} }] };
        }

        const list = unwrapRecordList(data);
        if (list) return recordsToFeatures(list);

        throw new Error('无法识别的 JSON 结构，需为 GeoJSON、坐标数组或 {"data":[...]} 格式');
    }

    function transformGeoJSON(geojson, fromCrs, toCrs, precision) {
        const fc = normalizeToFeatureCollection(JSON.parse(JSON.stringify(geojson)));
        fc.features.forEach(function (feature) {
            const geom = feature.geometry;
            if (!geom || !geom.coordinates) return;
            walkCoordinates(geom.coordinates, function (coord) {
                const t = transformCoordPair(coord[0], coord[1], fromCrs, toCrs, precision);
                coord[0] = t[0];
                coord[1] = t[1];
            });
        });
        return fc;
    }

    function getFirstCoordinate(coords) {
        if (!coords || !coords.length) return null;
        if (typeof coords[0] === 'number') return [coords[0], coords[1]];
        return getFirstCoordinate(coords[0]);
    }

    function stripZ(coords) {
        if (typeof coords[0] === 'number') {
            return [Number(coords[0]), Number(coords[1])];
        }
        return coords.map(stripZ);
    }

    function sanitizeProperties(props) {
        const out = {};
        if (!props || typeof props !== 'object') return out;
        Object.keys(props).forEach(function (key) {
            const name = String(key).slice(0, 10);
            let val = props[key];
            if (val == null) val = '';
            else if (typeof val === 'object') val = JSON.stringify(val);
            else val = String(val);
            if (val.length > 254) val = val.slice(0, 254);
            out[name] = val;
        });
        return out;
    }

    function flattenFeature(feature) {
        const geom = feature.geometry;
        if (!geom) return [];
        const props = feature.properties || {};

        switch (geom.type) {
            case 'Point':
                return [{ type: 'Feature', geometry: { type: 'Point', coordinates: stripZ(geom.coordinates) }, properties: props }];
            case 'LineString':
                return [{ type: 'Feature', geometry: { type: 'LineString', coordinates: stripZ(geom.coordinates) }, properties: props }];
            case 'Polygon':
                return [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: stripZ(geom.coordinates) }, properties: props }];
            case 'MultiPoint':
                return geom.coordinates.map(function (c, idx) {
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: stripZ(c) },
                        properties: Object.assign({}, props, { part_idx: idx + 1 })
                    };
                });
            case 'MultiLineString':
                return geom.coordinates.map(function (c, idx) {
                    return {
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: stripZ(c) },
                        properties: Object.assign({}, props, { part_idx: idx + 1 })
                    };
                });
            case 'MultiPolygon':
                return geom.coordinates.map(function (c, idx) {
                    return {
                        type: 'Feature',
                        geometry: { type: 'Polygon', coordinates: stripZ(c) },
                        properties: Object.assign({}, props, { part_idx: idx + 1 })
                    };
                });
            case 'GeometryCollection':
                return geom.geometries.flatMap(function (g) {
                    return flattenFeature({ type: 'Feature', geometry: g, properties: props });
                });
            default:
                return [];
        }
    }

    function prepareForShpExport(fc) {
        const features = [];
        fc.features.forEach(function (f) {
            flattenFeature(f).forEach(function (ff) {
                features.push({
                    type: 'Feature',
                    geometry: ff.geometry,
                    properties: sanitizeProperties(ff.properties)
                });
            });
        });

        const supported = features.filter(function (f) {
            const t = f.geometry && f.geometry.type;
            return t === 'Point' || t === 'LineString' || t === 'Polygon';
        });

        if (!supported.length) {
            throw new Error('Shapefile 导出需要 Point / LineString / Polygon 几何（Multi* 会自动拆分）');
        }

        return { type: 'FeatureCollection', features: supported };
    }

    function geoJSONToCsv(fc) {
        const hasWkt = typeof wellknown !== 'undefined';
        const header = ['序号', '类型', '经度', '纬度'];
        if (hasWkt) header.push('WKT');
        header.push('属性(JSON)');
        const rows = [header];

        fc.features.forEach(function (f, i) {
            const g = f.geometry;
            let lng = '', lat = '', type = g ? g.type : '';
            if (g && g.coordinates) {
                const first = getFirstCoordinate(g.coordinates);
                if (first) {
                    lng = first[0];
                    lat = first[1];
                }
            }
            const row = [i + 1, type, lng, lat];
            if (hasWkt) row.push(g ? wellknown.stringify(g) : '');
            row.push(JSON.stringify(f.properties || {}));
            rows.push(row);
        });

        return rows.map(function (row) {
            return row.map(function (cell) {
                const s = String(cell ?? '');
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? '"' + s.replace(/"/g, '""') + '"' : s;
            }).join(',');
        }).join('\n');
    }

    function parseCSVToFeatureCollection(text) {
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) throw new Error('CSV 为空');

        const delimiter = lines[0].includes('\t') ? '\t'
            : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');

        function parseLine(line) {
            const result = [];
            let cur = '', inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') inQuote = !inQuote;
                else if (ch === delimiter && !inQuote) { result.push(cur.trim()); cur = ''; }
                else cur += ch;
            }
            result.push(cur.trim());
            return result;
        }

        const LNG_KEYS = ['lng', 'lon', 'longitude', 'x', '经度'];
        const LAT_KEYS = ['lat', 'latitude', 'y', '纬度'];
        const WKT_KEYS = ['wkt', 'geom', 'geometry'];

        function findIdx(headers, keys) {
            for (let i = 0; i < headers.length; i++) {
                const n = String(headers[i]).trim().toLowerCase();
                if (keys.some(function (k) { return n === k || n.includes(k); })) return i;
            }
            return -1;
        }

        const header = parseLine(lines[0]);
        const hasHeader = header.some(function (c) { return isNaN(parseFloat(c)) && c !== ''; });
        let start = 0;
        let lngIdx = 0, latIdx = 1, wktIdx = -1;
        const propsIdx = [];

        if (hasHeader) {
            lngIdx = findIdx(header, LNG_KEYS);
            latIdx = findIdx(header, LAT_KEYS);
            wktIdx = findIdx(header, WKT_KEYS);
            header.forEach(function (h, i) {
                if (i !== lngIdx && i !== latIdx && i !== wktIdx) propsIdx.push({ i: i, key: h });
            });
            start = 1;
            if (lngIdx === -1 && latIdx === -1 && wktIdx === -1) {
                lngIdx = 0; latIdx = 1;
            }
        }

        const features = [];
        for (let li = start; li < lines.length; li++) {
            const cells = parseLine(lines[li]);
            if (!cells.length) continue;
            const props = {};
            propsIdx.forEach(function (p) { props[p.key] = cells[p.i]; });

            if (wktIdx >= 0 && cells[wktIdx] && typeof wellknown !== 'undefined') {
                const geom = wellknown.parse(cells[wktIdx]);
                if (geom) {
                    features.push({ type: 'Feature', geometry: geom, properties: props });
                    continue;
                }
            }

            const lng = parseFloat(cells[lngIdx]);
            const lat = parseFloat(cells[latIdx]);
            if (isNaN(lng) || isNaN(lat)) continue;
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: props
            });
        }

        if (!features.length) throw new Error('CSV 中未识别到有效坐标或 WKT');
        return { type: 'FeatureCollection', features: features };
    }

    function parseWKT(text) {
        if (typeof wellknown === 'undefined') throw new Error('WKT 解析库 wellknown 未加载');
        const trimmed = text.trim();
        if (!trimmed) throw new Error('WKT 为空');
        const blocks = trimmed.split(/;\s*(?=POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)/i);
        const features = [];
        blocks.forEach(function (block) {
            const b = block.trim();
            if (!b) return;
            const geom = wellknown.parse(b);
            if (geom) features.push({ type: 'Feature', geometry: geom, properties: {} });
        });
        if (!features.length) throw new Error('WKT 解析失败');
        return features.length === 1
            ? { type: 'FeatureCollection', features: features }
            : { type: 'FeatureCollection', features: features };
    }

    async function fetchJsonFromUrl(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('URL 请求失败: HTTP ' + resp.status);
        return resp.json();
    }

    async function loadShapefile(file) {
        if (typeof shp === 'undefined') throw new Error('Shapefile 解析库 shpjs 未加载');
        const buffer = await file.arrayBuffer();
        const result = await shp(buffer);
        if (result.type === 'FeatureCollection') return result;
        if (Array.isArray(result)) return { type: 'FeatureCollection', features: result };
        return normalizeToFeatureCollection(result);
    }

    async function loadInput(options) {
        const type = options.type;
        let fc;

        if (type === 'wkt') {
            fc = parseWKT(options.text);
        } else if (type === 'csv') {
            fc = parseCSVToFeatureCollection(options.text);
        } else if (type === 'geojson' || type === 'json') {
            let data;
            if (options.url) {
                data = await fetchJsonFromUrl(options.url);
            } else if (options.text) {
                data = JSON.parse(options.text);
            } else if (options.file) {
                const text = await options.file.text();
                data = JSON.parse(text);
            } else {
                throw new Error('请提供 URL、文件或文本内容');
            }
            fc = normalizeToFeatureCollection(data);
        } else if (type === 'shp') {
            if (!options.file) throw new Error('请上传 Shapefile（.zip 或 .shp）');
            fc = await loadShapefile(options.file);
        } else {
            throw new Error('不支持的输入类型: ' + type);
        }

        return transformGeoJSON(fc, options.fromCrs, options.toCrs, options.precision);
    }

    function toWKT(fc) {
        if (typeof wellknown === 'undefined') throw new Error('WKT 库 wellknown 未加载');
        return fc.features.map(function (f) {
            if (!f.geometry) return '';
            return wellknown.stringify(f.geometry);
        }).filter(Boolean).join(';\n');
    }

    function downloadBlob(content, filename, mime) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportGeoJSON(fc, filename) {
        downloadBlob(JSON.stringify(fc, null, 2), filename || 'converted.geojson', 'application/geo+json');
    }

    function exportJSON(fc, filename) {
        downloadBlob(JSON.stringify(fc, null, 2), filename || 'converted.json', 'application/json');
    }

    function exportCSV(fc, filename) {
        downloadBlob('\uFEFF' + geoJSONToCsv(fc), filename || 'converted.csv', 'text/csv;charset=utf-8');
    }

    function exportWKT(fc, filename) {
        downloadBlob(toWKT(fc), filename || 'converted.wkt', 'text/plain');
    }

    function zipToBlob(zipContent) {
        if (zipContent instanceof Blob) return zipContent;
        if (typeof zipContent === 'string') {
            const bin = atob(zipContent);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: 'application/zip' });
        }
        if (zipContent instanceof ArrayBuffer) {
            return new Blob([zipContent], { type: 'application/zip' });
        }
        if (ArrayBuffer.isView(zipContent)) {
            return new Blob([zipContent], { type: 'application/zip' });
        }
        return null;
    }

    async function exportShapefile(fc, filename) {
        if (typeof shpwrite === 'undefined') throw new Error('Shapefile 导出库 shpwrite 未加载');
        const prepared = prepareForShpExport(fc);
        const folder = (filename || 'converted').replace(/\.zip$/i, '');
        const options = {
            folder: folder,
            file: folder,
            types: { point: 'points', polyline: 'lines', polygon: 'polygons' }
        };

        if (typeof shpwrite.zip !== 'function') {
            shpwrite.download(prepared, options);
            return;
        }

        const zipResult = shpwrite.zip(prepared, options);
        const zipContent = zipResult && typeof zipResult.then === 'function'
            ? await zipResult
            : zipResult;
        const blob = zipToBlob(zipContent);

        if (!blob) {
            shpwrite.download(prepared, options);
            return;
        }

        downloadBlob(blob, folder + '.zip', 'application/zip');
    }

    return {
        transformGeoJSON: transformGeoJSON,
        normalizeToFeatureCollection: normalizeToFeatureCollection,
        parseCSVToFeatureCollection: parseCSVToFeatureCollection,
        parseWKT: parseWKT,
        loadInput: loadInput,
        fetchJsonFromUrl: fetchJsonFromUrl,
        loadShapefile: loadShapefile,
        toWKT: toWKT,
        geoJSONToCsv: geoJSONToCsv,
        prepareForShpExport: prepareForShpExport,
        exportGeoJSON: exportGeoJSON,
        exportJSON: exportJSON,
        exportCSV: exportCSV,
        exportWKT: exportWKT,
        exportShapefile: exportShapefile,
        downloadBlob: downloadBlob
    };
})();
