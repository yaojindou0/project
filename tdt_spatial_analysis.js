/**
 * 空间分析 - 插值（克里金 / IDW）
 * 依赖: ol, kriging, CoordFileConverter(可选)
 */
const TdtSpatialAnalysis = (function () {
    'use strict';

    let map = null;
    let interpLayer = null;
    let sampleLayer = null;
    let boundaryFetcher = null;

    const COLOR_RAMP = [
        '#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8',
        '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'
    ];

    function init(mapInstance, fetchBoundaryFn) {
        map = mapInstance;
        boundaryFetcher = fetchBoundaryFn;
    }

    function createPolygonRing(coords) {
        const ring = coords.map(function (c) { return [c[0], c[1]]; });
        ring.pip = function (x, y) {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const xi = ring[i][0], yi = ring[i][1];
                const xj = ring[j][0], yj = ring[j][1];
                if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
            }
            return inside;
        };
        return ring;
    }

    function getField(obj, keys) {
        for (let i = 0; i < keys.length; i++) {
            const v = obj[keys[i]];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return null;
    }

    function extractPointsFromFC(fc, fieldName) {
        const points = [];
        const fieldKeys = [fieldName, fieldName.toLowerCase(), fieldName.toUpperCase()];
        fc.features.forEach(function (f, idx) {
            const g = f.geometry;
            if (!g) return;
            const props = f.properties || {};
            let val = getField(props, fieldKeys);
            if (val == null && fieldName) {
                Object.keys(props).forEach(function (k) {
                    if (k.toLowerCase() === fieldName.toLowerCase()) val = props[k];
                });
            }
            val = parseFloat(val);
            if (isNaN(val)) return;

            function addPoint(lng, lat) {
                points.push({ lng: lng, lat: lat, value: val, name: getField(props, ['name', '名称']) || ('点' + (idx + 1)) });
            }

            if (g.type === 'Point') addPoint(g.coordinates[0], g.coordinates[1]);
            else if (g.type === 'MultiPoint') {
                g.coordinates.forEach(function (c) { addPoint(c[0], c[1]); });
            } else {
                const c = g.coordinates;
                if (c && c.length) {
                    const first = typeof c[0][0] === 'number' ? c[0] : (c[0][0] || c[0]);
                    if (first && first.length >= 2) addPoint(first[0], first[1]);
                }
            }
        });
        return points;
    }

    async function loadPointsFromFile(file, fieldName) {
        if (!file) throw new Error('请选择数据文件');
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        let fc;
        if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');

        if (ext === 'csv' || ext === 'txt') {
            fc = CoordFileConverter.parseCSVToFeatureCollection(await file.text());
        } else if (ext === 'zip' || ext === 'shp') {
            fc = await CoordFileConverter.loadShapefile(file);
        } else {
            fc = CoordFileConverter.normalizeToFeatureCollection(JSON.parse(await file.text()));
        }
        const points = extractPointsFromFC(fc, fieldName);
        if (points.length < 3) throw new Error('至少需要 3 个含有效插值字段的点');
        return points;
    }

    function getDataBounds(points) {
        const lngs = points.map(function (p) { return p.lng; });
        const lats = points.map(function (p) { return p.lat; });
        return {
            minLon: Math.min.apply(null, lngs),
            maxLon: Math.max.apply(null, lngs),
            minLat: Math.min.apply(null, lats),
            maxLat: Math.max.apply(null, lats)
        };
    }

    async function getClipRings(provinceSelectId, citySelectId) {
        if (typeof RegionData === 'undefined') return null;
        const region = RegionData.getSelectedRegion(provinceSelectId, citySelectId);
        if (!region || !region.adcode) return null;

        const url = `https://yaojindou0.github.io/geojsons/bound/${region.adcode}.json`;
        let geojson = null;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`获取边界数据失败: ${response.status} ${response.statusText}`);
                return null;
            }
            geojson = await response.json();
        } catch (error) {
            console.warn('获取边界数据异常:', error.message);
            return null;
        }

        if (!geojson) return null;

        const rings = [];
        function collectRings(geom) {
            if (!geom) return;
            if (geom.type === 'Polygon') rings.push(createPolygonRing(geom.coordinates[0]));
            else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(function (poly) { rings.push(createPolygonRing(poly[0])); });
            }
        }
        if (geojson.type === 'FeatureCollection') {
            geojson.features.forEach(function (f) { collectRings(f.geometry); });
        } else if (geojson.type === 'Feature') {
            collectRings(geojson.geometry);
        } else {
            collectRings(geojson);
        }
        return rings.length ? rings : null;
    }

    function getExtentFromRings(rings) {
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        rings.forEach(function (ring) {
            ring.forEach(function (c) {
                if (c[0] < minLon) minLon = c[0];
                if (c[0] > maxLon) maxLon = c[0];
                if (c[1] < minLat) minLat = c[1];
                if (c[1] > maxLat) maxLat = c[1];
            });
        });
        return { minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat };
    }

    function isInsideClip(lng, lat, clipRings) {
        if (!clipRings || !clipRings.length) return true;
        for (let i = 0; i < clipRings.length; i++) {
            if (clipRings[i].pip(lng, lat)) return true;
        }
        return false;
    }

    function autoBreaks(values, count) {
        count = count || 5;
        const min = Math.min.apply(null, values);
        const max = Math.max.apply(null, values);
        if (min === max) return [min, max + 1];
        const step = (max - min) / count;
        const breaks = [];
        for (let i = 0; i <= count; i++) breaks.push(+(min + step * i).toFixed(4));
        return breaks;
    }

    function parseBreaks(str, values) {
        if (!str || !str.trim()) return autoBreaks(values, 5);
        const parts = str.split(/[,，\s]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
        if (parts.length < 2) return autoBreaks(values, 5);
        parts.sort(function (a, b) { return a - b; });
        return parts;
    }

    function valueToColor(value, breaks, colors) {
        colors = colors || COLOR_RAMP;
        if (value <= breaks[0]) return colors[0];
        for (let i = 1; i < breaks.length; i++) {
            if (value <= breaks[i]) {
                const t = (value - breaks[i - 1]) / (breaks[i] - breaks[i - 1] || 1);
                const c1 = colors[Math.min(i - 1, colors.length - 1)];
                const c2 = colors[Math.min(i, colors.length - 1)];
                return interpolateColor(c1, c2, t);
            }
        }
        return colors[colors.length - 1];
    }

    function interpolateColor(c1, c2, t) {
        function parse(c) {
            const h = c.replace('#', '');
            return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        }
        const a = parse(c1), b = parse(c2);
        const r = Math.round(a[0] + (b[0] - a[0]) * t);
        const g = Math.round(a[1] + (b[1] - a[1]) * t);
        const bl = Math.round(a[2] + (b[2] - a[2]) * t);
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    function hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substr(0, 2), 16);
        const g = parseInt(h.substr(2, 2), 16);
        const b = parseInt(h.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    /** 按列数构建正方形格网：cellSize = 经度跨度/列数，行数按纬度跨度自动推算 */
    function buildGridModel(bounds, cols, clipRings) {
        cols = Math.max(1, parseInt(cols, 10) || 50);
        const lonSpan = bounds.maxLon - bounds.minLon;
        const latSpan = bounds.maxLat - bounds.minLat;
        const cellSize = lonSpan / cols;
        const rows = Math.max(1, Math.ceil(latSpan / cellSize));
        const cellW = cellSize;
        const cellH = cellSize;
        const cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const minLon = bounds.minLon + c * cellW;
                const minLat = bounds.minLat + r * cellH;
                const maxLon = minLon + cellW;
                const maxLat = minLat + cellH;
                const cx = (minLon + maxLon) / 2;
                const cy = (minLat + maxLat) / 2;
                if (!isInsideClip(cx, cy, clipRings)) continue;
                cells.push({
                    row: r, col: c,
                    minLon: minLon, minLat: minLat, maxLon: maxLon, maxLat: maxLat,
                    cx: cx, cy: cy, value: null
                });
            }
        }
        return { cells: cells, rows: rows, cols: cols, bounds: bounds, cellW: cellW, cellH: cellH, cellSize: cellSize };
    }

    function idwInterpolate(points, gridModel, power) {
        power = power != null ? power : 2;
        gridModel.cells.forEach(function (cell) {
            let wSum = 0, vSum = 0;
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                let dist = Math.sqrt(Math.pow(p.lng - cell.cx, 2) + Math.pow(p.lat - cell.cy, 2));
                if (dist < 1e-12) { vSum = p.value; wSum = 1; break; }
                const w = 1 / Math.pow(dist, power);
                wSum += w;
                vSum += w * p.value;
            }
            cell.value = wSum ? vSum / wSum : null;
        });
        return gridModel;
    }

    function krigingInterpolate(points, gridModel, clipRings, options) {
        if (typeof kriging === 'undefined') throw new Error('kriging.js 未加载');
        const t = [], x = [], y = [];
        points.forEach(function (p) { t.push(p.value); x.push(p.lng); y.push(p.lat); });
        const variogram = kriging.train(t, x, y, options.model || 'exponential', options.sigma2 || 0, options.alpha || 100);

        const polygons = clipRings && clipRings.length
            ? clipRings
            : [createPolygonRing([
                [gridModel.bounds.minLon, gridModel.bounds.minLat],
                [gridModel.bounds.maxLon, gridModel.bounds.minLat],
                [gridModel.bounds.maxLon, gridModel.bounds.maxLat],
                [gridModel.bounds.minLon, gridModel.bounds.maxLat],
                [gridModel.bounds.minLon, gridModel.bounds.minLat]
            ])];

        const width = Math.max(gridModel.cellW, gridModel.cellH);
        const kGrid = kriging.grid(polygons, variogram, width);

        gridModel.cells.forEach(function (cell) {
            const j = Math.round((cell.cx - kGrid.xlim[0]) / kGrid.width);
            const k = Math.round((cell.cy - kGrid.ylim[0]) / kGrid.width);
            cell.value = (kGrid[j] && kGrid[j][k] !== undefined) ? kGrid[j][k] : null;
        });

        gridModel.krigingGrid = kGrid;
        return gridModel;
    }

    function createRasterLayer(gridModel, breaks, colors) {
        const source = new ol.source.ImageCanvas({
            canvasFunction: function (extent, resolution, pixelRatio, size) {
                const canvas = document.createElement('canvas');
                canvas.width = size[0];
                canvas.height = size[1];
                drawGridCanvas(canvas, gridModel, breaks, colors, extent, size);
                return canvas;
            },
            projection: 'EPSG:4326',
            ratio: 1
        });

        return new ol.layer.Image({ source: source, opacity: 0.85, zIndex: 25 });
    }

    function drawGridCanvas(canvas, gridModel, breaks, colors, extent, size) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const xRange = extent[2] - extent[0];
        const yRange = extent[3] - extent[1];
        if (xRange <= 0 || yRange <= 0) return;

        gridModel.cells.forEach(function (cell) {
            if (cell.value == null) return;
            const x1 = (cell.minLon - extent[0]) / xRange * size[0];
            const x2 = (cell.maxLon - extent[0]) / xRange * size[0];
            const y1 = (1 - (cell.maxLat - extent[1]) / yRange) * size[1];
            const y2 = (1 - (cell.minLat - extent[1]) / yRange) * size[1];
            const left = Math.floor(x1);
            const top = Math.floor(y1);
            const w = Math.max(1, Math.ceil(x2) - left);
            const h = Math.max(1, Math.ceil(y2) - top);
            ctx.fillStyle = valueToColor(cell.value, breaks, colors);
            ctx.fillRect(left, top, w, h);
        });
    }

    function createVectorLayer(gridModel, breaks, colors) {
        const features = [];
        gridModel.cells.forEach(function (cell) {
            if (cell.value == null) return;
            const color = valueToColor(cell.value, breaks, colors);
            features.push(new ol.Feature({
                geometry: ol.geom.Polygon.fromExtent([cell.minLon, cell.minLat, cell.maxLon, cell.maxLat]),
                value: cell.value,
                color: color
            }));
        });
        return new ol.layer.Vector({
            source: new ol.source.Vector({ features: features }),
            zIndex: 25,
            style: function (f) {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.3)', width: 0.5 }),
                    fill: new ol.style.Fill({ color: f.get('color') })
                });
            }
        });
    }

    function cellsToTurfPoints(gridModel) {
        if (typeof turf === 'undefined') return null;
        const pts = gridModel.cells
            .filter(function (c) { return c.value != null; })
            .map(function (c) { return turf.point([c.cx, c.cy], { value: c.value }); });
        return pts.length ? turf.featureCollection(pts) : null;
    }

    function colorFromBandLabel(label, breaks, colors) {
        if (label == null) return colors[0];
        if (typeof label === 'number') return valueToColor(label, breaks, colors);
        const text = String(label).replace(/[\[\]]/g, '');
        const parts = text.split('-').map(parseFloat).filter(function (n) { return !isNaN(n); });
        if (parts.length >= 2) {
            return valueToColor((parts[0] + parts[1]) / 2, breaks, colors);
        }
        const v = parseFloat(text);
        return isNaN(v) ? colors[0] : valueToColor(v, breaks, colors);
    }

    function createContourLayer(gridModel, breaks, colors, clipRings) {
        const pointCollection = cellsToTurfPoints(gridModel);
        if (pointCollection && typeof turf !== 'undefined') {
            try {
                const levels = breaks.slice(1, breaks.length - 1);
                if (levels.length) {
                    const isolines = turf.isolines(pointCollection, levels, { zProperty: 'value' });
                    const contourFeatures = [];
                    isolines.features.forEach(function (feature) {
                        const level = parseFloat(feature.properties.value);
                        const color = valueToColor(level, breaks, colors);
                        const lines = feature.geometry.type === 'MultiLineString'
                            ? feature.geometry.coordinates.map(function (c) { return turf.lineString(c); })
                            : [turf.lineString(feature.geometry.coordinates)];
                        lines.forEach(function (lineFeature) {
                            clipLineByRegion(lineFeature, clipRings).forEach(function (clipped) {
                                contourFeatures.push(new ol.Feature({
                                    geometry: new ol.geom.LineString(clipped.geometry.coordinates),
                                    level: level,
                                    color: color
                                }));
                            });
                        });
                    });
                    if (contourFeatures.length) {
                        return new ol.layer.Vector({
                            source: new ol.source.Vector({ features: contourFeatures }),
                            zIndex: 25,
                            style: function (f) {
                                return new ol.style.Style({
                                    stroke: new ol.style.Stroke({ color: f.get('color'), width: 2 })
                                });
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn('Turf isolines 失败，使用格网等值线:', e.message);
            }
        }
        return createGridContourLayer(gridModel, breaks, colors, clipRings);
    }

    /** 格网等值线：在相邻单元值跨越分段值处，沿格网边绘制（与栅格数据一致） */
    function createGridContourLayer(gridModel, breaks, colors, clipRings) {
        const contourFeatures = [];
        const cellMap = {};
        gridModel.cells.forEach(function (c) {
            cellMap[c.row + ',' + c.col] = c;
        });

        const levels = breaks.length > 2
            ? breaks.slice(1, breaks.length - 1)
            : [(breaks[0] + breaks[breaks.length - 1]) / 2];

        levels.forEach(function (level) {
            const color = valueToColor(level, breaks, colors);
            const segments = [];

            gridModel.cells.forEach(function (cell) {
                if (cell.value == null) return;

                const right = cellMap[cell.row + ',' + (cell.col + 1)];
                if (right && right.value != null && (cell.value < level) !== (right.value < level)) {
                    segments.push([
                        [cell.maxLon, cell.minLat],
                        [cell.maxLon, cell.maxLat]
                    ]);
                }

                const up = cellMap[(cell.row + 1) + ',' + cell.col];
                if (up && up.value != null && (cell.value < level) !== (up.value < level)) {
                    segments.push([
                        [cell.minLon, cell.maxLat],
                        [cell.maxLon, cell.maxLat]
                    ]);
                }
            });

            segments.forEach(function (coords) {
                const lineFeature = {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: {}
                };
                clipLineByRegion(lineFeature, clipRings).forEach(function (clipped) {
                    contourFeatures.push(new ol.Feature({
                        geometry: new ol.geom.LineString(clipped.geometry.coordinates),
                        level: level,
                        color: color
                    }));
                });
            });
        });

        return new ol.layer.Vector({
            source: new ol.source.Vector({ features: contourFeatures }),
            zIndex: 25,
            style: function (f) {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: f.get('color'), width: 2 })
                });
            }
        });
    }

    function clipLineByRegion(lineFeature, clipRings) {
        if (!clipRings || clipRings.length === 0) {
            return [lineFeature];
        }

        const regionPolygon = createTurfPolygonFromRings(clipRings);
        if (!regionPolygon) {
            return [lineFeature];
        }

        try {
            const clipped = turf.intersect(lineFeature, regionPolygon);
            if (!clipped) {
                return [];
            }

            if (clipped.geometry.type === 'LineString') {
                return [clipped];
            } else if (clipped.geometry.type === 'MultiLineString') {
                const result = [];
                clipped.geometry.coordinates.forEach(function (coords) {
                    result.push(turf.lineString(coords));
                });
                return result;
            }
        } catch (e) {
            console.warn('裁剪线失败:', e.message);
        }

        return [lineFeature];
    }

    function clipPolygonByRegion(polyFeature, clipRings) {
        if (!clipRings || clipRings.length === 0) {
            return [polyFeature];
        }

        const regionPolygon = createTurfPolygonFromRings(clipRings);
        if (!regionPolygon) {
            return [polyFeature];
        }

        try {
            const clipped = turf.intersect(polyFeature, regionPolygon);
            if (!clipped) {
                return [];
            }

            if (clipped.geometry.type === 'Polygon') {
                return [clipped];
            } else if (clipped.geometry.type === 'MultiPolygon') {
                const result = [];
                clipped.geometry.coordinates.forEach(function (coords) {
                    result.push(turf.polygon(coords));
                });
                return result;
            }
        } catch (e) {
            console.warn('裁剪多边形失败:', e.message);
        }

        return [polyFeature];
    }

    function createTurfPolygonFromRings(clipRings) {
        if (!clipRings || clipRings.length === 0) {
            return null;
        }

        try {
            if (clipRings.length === 1) {
                return turf.polygon([clipRings[0]]);
            } else {
                const coordinates = clipRings.map(function (ring) {
                    return [ring];
                });
                return turf.multiPolygon(coordinates);
            }
        } catch (e) {
            console.warn('创建裁剪多边形失败:', e.message);
            return null;
        }
    }

    function createContourfLayer(gridModel, breaks, colors, clipRings) {
        const pointCollection = cellsToTurfPoints(gridModel);
        if (pointCollection && typeof turf !== 'undefined') {
            try {
                const isobands = turf.isobands(pointCollection, breaks, { zProperty: 'value' });
                const olFeatures = [];
                isobands.features.forEach(function (feature) {
                    const label = feature.properties.value;
                    const color = colorFromBandLabel(label, breaks, colors);
                    const fillColor = colorWithAlpha(color, 0.55);
                    let geoms = [];
                    if (feature.geometry.type === 'Polygon') geoms = [feature.geometry.coordinates];
                    else if (feature.geometry.type === 'MultiPolygon') geoms = feature.geometry.coordinates;

                    geoms.forEach(function (coords) {
                        const poly = turf.polygon(coords);
                        clipPolygonByRegion(poly, clipRings).forEach(function (cf) {
                            olFeatures.push(new ol.Feature({
                                geometry: cf.geometry.type === 'Polygon'
                                    ? new ol.geom.Polygon(cf.geometry.coordinates)
                                    : new ol.geom.MultiPolygon(cf.geometry.coordinates),
                                band: label,
                                color: fillColor
                            }));
                        });
                    });
                });
                if (olFeatures.length) {
                    return new ol.layer.Vector({
                        source: new ol.source.Vector({ features: olFeatures }),
                        zIndex: 25,
                        style: function (f) {
                            return new ol.style.Style({
                                stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.4)', width: 0.8 }),
                                fill: new ol.style.Fill({ color: f.get('color') })
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn('Turf isobands 失败，使用格网等值面:', e.message);
            }
        }
        return createGridContourfLayer(gridModel, breaks, colors, clipRings);
    }

    /** 格网等值面：逐格网单元填色，配色与栅格 valueToColor 完全一致 */
    function createGridContourfLayer(gridModel, breaks, colors, clipRings) {
        const features = [];

        gridModel.cells.forEach(function (cell) {
            if (cell.value == null) return;
            const fillColor = colorWithAlpha(valueToColor(cell.value, breaks, colors), 0.55);
            const polyFeature = {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [cell.minLon, cell.minLat],
                        [cell.maxLon, cell.minLat],
                        [cell.maxLon, cell.maxLat],
                        [cell.minLon, cell.maxLat],
                        [cell.minLon, cell.minLat]
                    ]]
                },
                properties: { value: cell.value }
            };

            clipPolygonByRegion(polyFeature, clipRings).forEach(function (clippedPoly) {
                if (clippedPoly.geometry.type === 'Polygon') {
                    features.push(new ol.Feature({
                        geometry: new ol.geom.Polygon(clippedPoly.geometry.coordinates),
                        value: cell.value,
                        color: fillColor
                    }));
                } else if (clippedPoly.geometry.type === 'MultiPolygon') {
                    features.push(new ol.Feature({
                        geometry: new ol.geom.MultiPolygon(clippedPoly.geometry.coordinates),
                        value: cell.value,
                        color: fillColor
                    }));
                }
            });
        });

        return new ol.layer.Vector({
            source: new ol.source.Vector({ features: features }),
            zIndex: 25,
            style: function (f) {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.25)', width: 0.5 }),
                    fill: new ol.style.Fill({ color: f.get('color') })
                });
            }
        });
    }

    function createSampleLayer(points) {
        return new ol.layer.Vector({
            source: new ol.source.Vector({
                features: points.map(function (p) {
                    return new ol.Feature({
                        geometry: new ol.geom.Point([p.lng, p.lat]),
                        value: p.value,
                        name: p.name
                    });
                })
            }),
            zIndex: 26,
            style: function (f) {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 5,
                        fill: new ol.style.Fill({ color: '#303133' }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                    }),
                    text: new ol.style.Text({
                        text: String(f.get('value')),
                        font: '11px Microsoft YaHei',
                        fill: new ol.style.Fill({ color: '#333' }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                        offsetY: -12
                    })
                });
            }
        });
    }

    function clearLayers() {
        if (!map) return;
        [interpLayer, sampleLayer].forEach(function (layer) {
            if (layer) map.removeLayer(layer);
        });
        interpLayer = null;
        sampleLayer = null;
    }

    function renderLegend(container, breaks, colors) {
        if (!container) return;
        colors = colors || COLOR_RAMP;
        let html = '';
        for (let i = 1; i < breaks.length; i++) {
            const c = valueToColor((breaks[i - 1] + breaks[i]) / 2, breaks, colors);
            html += '<div class="interp-legend-item"><span class="interp-legend-color" style="background:' + c + '"></span>' +
                breaks[i - 1].toFixed(2) + ' - ' + breaks[i].toFixed(2) + '</div>';
        }
        container.innerHTML = html;
    }

    async function runAnalysis(options) {
        if (!map) throw new Error('地图未初始化');
        clearLayers();

        const points = await loadPointsFromFile(options.file, options.fieldName || 'value');
        const cols = parseInt(options.cols, 10) || 50;
        const method = options.method || 'idw';
        const display = options.display || 'raster';
        const useClip = options.useClip !== false;

        let clipRings = null;
        let bounds = getDataBounds(points);
        if (useClip && options.provinceSelectId) {
            clipRings = await getClipRings(options.provinceSelectId, options.citySelectId);
            if (clipRings) bounds = getExtentFromRings(clipRings);
        }

//      const padLon = (bounds.maxLon - bounds.minLon) * 0.02 || 0.01;
//      const padLat = (bounds.maxLat - bounds.minLat) * 0.02 || 0.01;
        bounds = {
            minLon: bounds.minLon ,
            maxLon: bounds.maxLon,
            minLat: bounds.minLat,
            maxLat: bounds.maxLat 
        };

        let gridModel = buildGridModel(bounds, cols, clipRings);
        if (method === 'kriging') {
            gridModel = krigingInterpolate(points, gridModel, clipRings, {
                model: options.krigingModel || 'exponential',
                sigma2: parseFloat(options.sigma2) || 0,
                alpha: parseFloat(options.alpha) || 100
            });
        } else {
            gridModel = idwInterpolate(points, gridModel, parseFloat(options.idwPower) || 2);
        }

        const values = gridModel.cells.map(function (c) { return c.value; }).filter(function (v) { return v != null; });
        if (!values.length) throw new Error('插值结果为空，请检查裁剪区域或格网参数');

        const breaks = parseBreaks(options.breaks, values);
        const colors = COLOR_RAMP;

        if (display === 'contour') {
            interpLayer = createContourLayer(gridModel, breaks, colors, clipRings);
        } else if (display === 'contourf') {
            interpLayer = createContourfLayer(gridModel, breaks, colors, clipRings);
        } else if (display === 'vector') {
            interpLayer = createVectorLayer(gridModel, breaks, colors);
        } else {
            interpLayer = createRasterLayer(gridModel, breaks, colors);
        }

        sampleLayer = createSampleLayer(points);
        map.addLayer(interpLayer);
        map.addLayer(sampleLayer);

        map.getView().fit([bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat], {
            padding: typeof getMapFitPadding === 'function' ? getMapFitPadding() : [50, 50, 50, 50],
            duration: 500,
            maxZoom: 14
        });

        renderLegend(document.getElementById('interp-legend'), breaks, colors);
        return { points: points, gridModel: gridModel, breaks: breaks };
    }

    function toggleMethodParams(method) {
        const krigingEl = document.getElementById('interp-kriging-params');
        const idwEl = document.getElementById('interp-idw-params');
        if (krigingEl) krigingEl.style.display = method === 'kriging' ? 'block' : 'none';
        if (idwEl) idwEl.style.display = method === 'idw' ? 'block' : 'none';
    }

    function colorWithAlpha(color, alpha) {
        if (color.indexOf('rgb(') === 0) {
            return color.replace('rgb(', 'rgba(').replace(')', ',' + alpha + ')');
        }
        return hexToRgba(color, alpha);
    }

    return {
        init: init,
        runAnalysis: runAnalysis,
        clearLayers: clearLayers,
        toggleMethodParams: toggleMethodParams,
        extractPointsFromFC: extractPointsFromFC,
        COLOR_RAMP: COLOR_RAMP
    };
})();
