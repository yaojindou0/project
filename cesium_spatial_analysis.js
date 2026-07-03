/**
 * Cesium 空间分析
 * 填挖方、淹没、热力图、坡度坡向、通视/视域等
 */
const CesiumSpatialAnalysis = (function () {
    'use strict';

    let viewer = null;
    let handler = null;
    let analysisEntities = [];
    let floodEntity = null;
    let floodTimer = null;
    let heatmapPrimitive = null;
    let heatmapImageryLayer = null;

    const HEAT_COLOR_STOPS = [
        { t: 0.0, r: 0, g: 0, b: 255 },
        { t: 0.25, r: 0, g: 255, b: 255 },
        { t: 0.5, r: 0, g: 255, b: 0 },
        { t: 0.75, r: 255, g: 255, b: 0 },
        { t: 1.0, r: 255, g: 0, b: 0 }
    ];

    function init(viewerInstance) {
        viewer = viewerInstance;
    }

    function clearHandler() {
        if (handler) { handler.destroy(); handler = null; }
    }

    function clearAll() {
        clearHandler();
        stopFloodAnimation();
        analysisEntities.forEach(function (e) {
            if (e instanceof Cesium.Entity) viewer.entities.remove(e);
        });
        analysisEntities = [];
        clearHeatmap();
        if (floodEntity) { viewer.entities.remove(floodEntity); floodEntity = null; }
        const legend = document.getElementById('spatial-legend');
        if (legend) legend.innerHTML = '';
        const result = document.getElementById('spatial-result');
        if (result) result.textContent = '';
    }

    function pickPolygon(onComplete) {
        clearHandler();
        const positions = [];
        handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        viewer.canvas.style.cursor = 'crosshair';

        handler.setInputAction(function (click) {
            let cart = viewer.scene.pickPosition(click.position);
            if (!cart) cart = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (!cart) return;
            positions.push(cart);
            const pt = viewer.entities.add({
                position: cart,
                point: { pixelSize: 8, color: Cesium.Color.ORANGE, outlineWidth: 1, outlineColor: Cesium.Color.WHITE, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
            });
            analysisEntities.push(pt);
            if (positions.length >= 3) {
                const poly = viewer.entities.add({
                    polygon: {
                        hierarchy: new Cesium.PolygonHierarchy(positions.slice()),
                        material: Cesium.Color.ORANGE.withAlpha(0.25),
                        outline: true, outlineColor: Cesium.Color.ORANGE,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                    }
                });
                analysisEntities.push(poly);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(function () {
            clearHandler();
            viewer.canvas.style.cursor = 'default';
            if (positions.length >= 3) onComplete(positions);
            else alert('请至少绘制 3 个顶点');
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    async function sampleTerrainHeights(positions, gridSize) {
        gridSize = gridSize || 20;
        const cartographics = positions.map(function (p) { return Cesium.Cartographic.fromCartesian(p); });
        const lons = cartographics.map(function (c) { return Cesium.Math.toDegrees(c.longitude); });
        const lats = cartographics.map(function (c) { return Cesium.Math.toDegrees(c.latitude); });
        const minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
        const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
        const samples = [];
        for (let i = 0; i <= gridSize; i++) {
            for (let j = 0; j <= gridSize; j++) {
                const lon = minLon + (maxLon - minLon) * i / gridSize;
                const lat = minLat + (maxLat - minLat) * j / gridSize;
                if (!pointInPolygon(lon, lat, lons, lats)) continue;
                samples.push(Cesium.Cartographic.fromDegrees(lon, lat));
            }
        }
        if (!samples.length) throw new Error('分析区域内无采样点');
        const updated = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, samples);
        return updated;
    }

    function pointInPolygon(x, y, xs, ys) {
        let inside = false;
        for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
            const xi = xs[i], yi = ys[i], xj = xs[j], yj = ys[j];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    async function runCutFill() {
        const designHeight = parseFloat(document.getElementById('cutfill-design-height').value);
        const gridSize = parseInt(document.getElementById('cutfill-grid').value, 10) || 25;
        if (isNaN(designHeight)) { alert('请输入设计标高'); return; }

        pickPolygon(async function (positions) {
            try {
                const samples = await sampleTerrainHeights(positions, gridSize);
                let cutVol = 0, fillVol = 0, cellArea = estimateCellArea(samples);
                samples.forEach(function (s) {
                    const diff = designHeight - s.height;
                    if (diff > 0) fillVol += diff * cellArea;
                    else cutVol += Math.abs(diff) * cellArea;
                });
                const text = '填方量: ' + fillVol.toFixed(2) + ' m³\n挖方量: ' + cutVol.toFixed(2) + ' m³\n设计标高: ' + designHeight + ' m';
                document.getElementById('spatial-result').textContent = text;
                showCutFillVisualization(positions, designHeight);
            } catch (e) {
                alert('填挖方分析失败: ' + e.message + '\n请确保已加载地形服务');
            }
        });
    }

    function estimateCellArea(samples) {
        if (samples.length < 2) return 100;
        const lons = samples.map(function (s) { return s.longitude; });
        const lats = samples.map(function (s) { return s.latitude; });
        const dLon = (Math.max.apply(null, lons) - Math.min.apply(null, lons)) / Math.sqrt(samples.length);
        const dLat = (Math.max.apply(null, lats) - Math.min.apply(null, lats)) / Math.sqrt(samples.length);
        const midLat = (Math.max.apply(null, lats) + Math.min.apply(null, lats)) / 2;
        const mPerDegLon = 111319.9 * Math.cos(midLat);
        const mPerDegLat = 111319.9;
        return dLon * mPerDegLon * dLat * mPerDegLat;
    }

    function showCutFillVisualization(positions, designHeight) {
        const entity = viewer.entities.add({
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(positions),
                material: Cesium.Color.CYAN.withAlpha(0.3),
                outline: true, outlineColor: Cesium.Color.CYAN,
                height: designHeight,
                extrudedHeight: designHeight + 1
            }
        });
        analysisEntities.push(entity);
    }

    function runFloodAnalysis() {
        const startLevel = parseFloat(document.getElementById('flood-start-level').value) || 0;
        const targetLevel = parseFloat(document.getElementById('flood-target-level').value) || 50;
        const speed = parseFloat(document.getElementById('flood-speed').value) || 1;

        pickPolygon(function (positions) {
            stopFloodAnimation();
            if (floodEntity) viewer.entities.remove(floodEntity);
            let currentLevel = startLevel;
            floodEntity = viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(positions),
                    material: Cesium.Color.fromCssColorString('#409eff').withAlpha(0.55),
                    outline: true, outlineColor: Cesium.Color.fromCssColorString('#337ecc'),
                    height: startLevel,
                    extrudedHeight: startLevel + 0.5,
                    perPositionHeight: false
                }
            });
            document.getElementById('spatial-result').textContent = '淹没水位: ' + currentLevel.toFixed(1) + ' m';

            floodTimer = setInterval(function () {
                currentLevel += speed;
                if (currentLevel >= targetLevel) {
                    currentLevel = targetLevel;
                    stopFloodAnimation();
                }
                floodEntity.polygon.height = currentLevel;
                floodEntity.polygon.extrudedHeight = currentLevel + 0.5;
                document.getElementById('spatial-result').textContent = '淹没水位: ' + currentLevel.toFixed(1) + ' m (目标 ' + targetLevel + ' m)';
            }, 200);
        });
    }

    function stopFloodAnimation() {
        if (floodTimer) { clearInterval(floodTimer); floodTimer = null; }
    }

    function clearHeatmap() {
        if (heatmapPrimitive) {
            viewer.scene.primitives.remove(heatmapPrimitive);
            heatmapPrimitive = null;
        }
        if (heatmapImageryLayer) {
            viewer.imageryLayers.remove(heatmapImageryLayer, true);
            heatmapImageryLayer = null;
        }
    }

    function getHeatmapRenderOptions() {
        return {
            gridCols: parseInt(document.getElementById('heatmap-cols').value, 10) || 80,
            radius: parseFloat(document.getElementById('heatmap-radius').value) || 18,
            blur: parseInt(document.getElementById('heatmap-blur').value, 10) || 4,
            maxHeight: parseFloat(document.getElementById('heatmap-height').value) || 800,
            padding: 0.12
        };
    }

    function expandBounds(minLng, maxLng, minLat, maxLat, ratio) {
        const padLng = Math.max((maxLng - minLng) * ratio, 0.001);
        const padLat = Math.max((maxLat - minLat) * ratio, 0.001);
        return {
            minLng: minLng - padLng,
            maxLng: maxLng + padLng,
            minLat: minLat - padLat,
            maxLat: maxLat + padLat
        };
    }

    function computeHeatGrid(points, cols, rows, minLng, maxLng, minLat, maxLat, radiusCells) {
        const grid = new Float32Array(cols * rows);
        const cellLng = (maxLng - minLng) / cols;
        const cellLat = (maxLat - minLat) / rows;
        const sigma = Math.max(radiusCells / 3, 0.5);
        const sigma2 = sigma * sigma;
        const influence = Math.ceil(radiusCells * 3);

        points.forEach(function (p) {
            const cx = (p.lng - minLng) / cellLng;
            const cy = (p.lat - minLat) / cellLat;
            const i0 = Math.max(0, Math.floor(cx - influence));
            const i1 = Math.min(cols - 1, Math.ceil(cx + influence));
            const j0 = Math.max(0, Math.floor(cy - influence));
            const j1 = Math.min(rows - 1, Math.ceil(cy + influence));
            for (let j = j0; j <= j1; j++) {
                for (let i = i0; i <= i1; i++) {
                    const dx = i + 0.5 - cx;
                    const dy = j + 0.5 - cy;
                    const d2 = dx * dx + dy * dy;
                    const w = Math.exp(-d2 / (2 * sigma2));
                    grid[j * cols + i] += p.value * w;
                }
            }
        });

        let max = 0;
        for (let k = 0; k < grid.length; k++) max = Math.max(max, grid[k]);
        if (max > 0) {
            for (let k = 0; k < grid.length; k++) grid[k] /= max;
        }
        return grid;
    }

    function blurGrid(src, cols, rows, radius) {
        const tmp = new Float32Array(cols * rows);
        const dst = new Float32Array(cols * rows);
        const kernelSize = radius * 2 + 1;
        const kernel = new Float32Array(kernelSize);
        let kSum = 0;
        for (let i = -radius; i <= radius; i++) {
            const w = Math.exp(-(i * i) / (2 * (radius / 2 + 0.5) * (radius / 2 + 0.5)));
            kernel[i + radius] = w;
            kSum += w;
        }
        for (let i = 0; i < kernelSize; i++) kernel[i] /= kSum;

        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const ii = Math.min(cols - 1, Math.max(0, i + k));
                    sum += src[j * cols + ii] * kernel[k + radius];
                }
                tmp[j * cols + i] = sum;
            }
        }
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const jj = Math.min(rows - 1, Math.max(0, j + k));
                    sum += tmp[jj * cols + i] * kernel[k + radius];
                }
                dst[j * cols + i] = sum;
            }
        }
        let max = 0;
        for (let n = 0; n < dst.length; n++) max = Math.max(max, dst[n]);
        if (max > 0) {
            for (let n = 0; n < dst.length; n++) dst[n] /= max;
        }
        return dst;
    }

    function heatColorAt(t) {
        t = Cesium.Math.clamp(t, 0, 1);
        for (let i = 0; i < HEAT_COLOR_STOPS.length - 1; i++) {
            const a = HEAT_COLOR_STOPS[i];
            const b = HEAT_COLOR_STOPS[i + 1];
            if (t >= a.t && t <= b.t) {
                const f = (t - a.t) / (b.t - a.t || 1);
                return {
                    r: Math.round(a.r + (b.r - a.r) * f),
                    g: Math.round(a.g + (b.g - a.g) * f),
                    b: Math.round(a.b + (b.b - a.b) * f)
                };
            }
        }
        const last = HEAT_COLOR_STOPS[HEAT_COLOR_STOPS.length - 1];
        return { r: last.r, g: last.g, b: last.b };
    }

    function gridToHeatCanvas(grid, cols, rows, minAlpha) {
        minAlpha = minAlpha == null ? 0.04 : minAlpha;
        const canvas = document.createElement('canvas');
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(cols, rows);
        const data = img.data;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const v = grid[j * cols + i];
                const dstJ = rows - 1 - j;
                const idx = (dstJ * cols + i) * 4;
                if (v < minAlpha) {
                    data[idx] = data[idx + 1] = data[idx + 2] = data[idx + 3] = 0;
                } else {
                    const c = heatColorAt(v);
                    data[idx] = c.r;
                    data[idx + 1] = c.g;
                    data[idx + 2] = c.b;
                    data[idx + 3] = Math.round(Cesium.Math.lerp(0, 220, v));
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
    }

    function sampleGridBilinear(grid, cols, rows, u, v) {
        u = Cesium.Math.clamp(u, 0, 1);
        v = Cesium.Math.clamp(v, 0, 1);
        const x = u * (cols - 1);
        const y = v * (rows - 1);
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(cols - 1, x0 + 1);
        const y1 = Math.min(rows - 1, y0 + 1);
        const fx = x - x0;
        const fy = y - y0;
        const v00 = grid[y0 * cols + x0];
        const v10 = grid[y0 * cols + x1];
        const v01 = grid[y1 * cols + x0];
        const v11 = grid[y1 * cols + x1];
        return (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 + (1 - fx) * fy * v01 + fx * fy * v11;
    }

    function buildHeatGridFromPoints(points, opts) {
        const lngs = points.map(function (p) { return p.lng; });
        const lats = points.map(function (p) { return p.lat; });
        const bounds = expandBounds(
            Math.min.apply(null, lngs), Math.max.apply(null, lngs),
            Math.min.apply(null, lats), Math.max.apply(null, lats),
            opts.padding
        );
        const rows = Math.max(10, Math.ceil(opts.gridCols * (bounds.maxLat - bounds.minLat) / (bounds.maxLng - bounds.minLng || 0.01)));
        let grid = computeHeatGrid(points, opts.gridCols, rows, bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat, opts.radius);
        for (let p = 0; p < opts.blur; p++) {
            grid = blurGrid(grid, opts.gridCols, rows, 2);
        }
        return { grid: grid, cols: opts.gridCols, rows: rows, bounds: bounds };
    }

    async function runHeatmap(mode) {
        const fileInput = document.getElementById('heatmap-file');
        if (!fileInput.files || !fileInput.files[0]) { alert('请上传热力数据 CSV/JSON'); return; }
        const fieldName = document.getElementById('heatmap-field').value.trim() || 'value';
        const opts = getHeatmapRenderOptions();
        const text = await fileInput.files[0].text();
        let points;
        try {
            points = parseHeatPoints(text, fieldName);
        } catch (e) {
            alert(e.message || '热力数据解析失败');
            return;
        }
        if (points.length < 3) {
            alert('至少需要 3 个有效点。支持 CSV、GeoJSON（FeatureCollection/Feature/Point）、JSON 数组或 {"data":[{lng,lat,value}]}');
            return;
        }

        const minVal = Math.min.apply(null, points.map(function (p) { return p.value; }));
        const maxVal = Math.max.apply(null, points.map(function (p) { return p.value; }));
        const pack = buildHeatGridFromPoints(points, opts);

        clearHeatmap();

        if (mode === 'planar') {
            renderPlanarHeatmap(pack);
        } else {
            await renderSurfaceHeatmap(pack, opts.maxHeight);
        }
        renderLegend(minVal, maxVal);
        document.getElementById('spatial-result').textContent =
            '热力图已生成 (' + (mode === 'planar' ? '平面叠加' : '立体曲面') + ')，共 ' + points.length + ' 个采样点';
    }

    function isJsonLikeText(text) {
        const trimmed = (text || '').trim();
        return trimmed.startsWith('{') || trimmed.startsWith('[');
    }

    function detectHeatDataFormat(data) {
        if (!data || typeof data !== 'object') return 'unknown';
        if (data.type === 'FeatureCollection' || data.type === 'Feature') return 'geojson';
        if (data.type && data.coordinates) return 'geojson';
        if (Array.isArray(data)) return 'json';
        const wrapKeys = ['data', 'records', 'list', 'items', 'rows', 'result', 'stations', 'points'];
        for (let i = 0; i < wrapKeys.length; i++) {
            if (Array.isArray(data[wrapKeys[i]])) return 'json';
        }
        return 'unknown';
    }

    function extractHeatValue(props, fieldName) {
        if (!props || typeof props !== 'object') return NaN;
        const keys = [fieldName, 'value', 'val', '值', 'count', 'weight', 'intensity'];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!key) continue;
            if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
                const v = parseFloat(props[key]);
                if (!isNaN(v)) return v;
            }
            const lower = String(key).toLowerCase();
            const matched = Object.keys(props).find(function (k) { return k.toLowerCase() === lower; });
            if (matched != null && props[matched] !== undefined && props[matched] !== null && props[matched] !== '') {
                const v = parseFloat(props[matched]);
                if (!isNaN(v)) return v;
            }
        }
        return NaN;
    }

    function featuresToHeatPoints(features, fieldName) {
        const points = [];
        (features || []).forEach(function (f) {
            if (!f) return;
            const props = f.properties || {};
            const g = f.geometry;
            let lng, lat;
            if (g && g.type === 'Point' && g.coordinates && g.coordinates.length >= 2) {
                lng = parseFloat(g.coordinates[0]);
                lat = parseFloat(g.coordinates[1]);
            } else {
                lng = parseFloat(props.lng ?? props.lon ?? props.longitude ?? props.x ?? props['经度']);
                lat = parseFloat(props.lat ?? props.latitude ?? props.y ?? props['纬度']);
            }
            const val = extractHeatValue(props, fieldName);
            if (!isNaN(lng) && !isNaN(lat) && !isNaN(val)) {
                points.push({ lng: lng, lat: lat, value: val });
            }
        });
        return points;
    }

    function parseHeatPointsFromJsonData(data, fieldName) {
        const format = detectHeatDataFormat(data);
        if (typeof CoordFileConverter !== 'undefined' && CoordFileConverter.normalizeToFeatureCollection) {
            let fc;
            try {
                fc = CoordFileConverter.normalizeToFeatureCollection(data);
            } catch (e) {
                throw new Error((format === 'geojson' ? 'GeoJSON' : 'JSON') + ' 解析失败：' + e.message);
            }
            const points = featuresToHeatPoints(fc.features, fieldName);
            if (!points.length) {
                throw new Error(
                    (format === 'geojson' ? 'GeoJSON' : 'JSON') +
                    ' 中未找到有效热力点。请确认含 Point 坐标及数值字段「' + fieldName + '」'
                );
            }
            return points;
        }

        if (format === 'geojson') {
            const features = data.type === 'FeatureCollection' ? data.features
                : (data.type === 'Feature' ? [data] : []);
            const points = featuresToHeatPoints(features, fieldName);
            if (!points.length) throw new Error('GeoJSON 中未找到有效 Point 要素或数值字段「' + fieldName + '」');
            return points;
        }

        const list = Array.isArray(data) ? data : null;
        if (!list) throw new Error('无法识别的 JSON 结构，需为坐标数组或 {"data":[...]} 格式');
        const pseudoFeatures = list.map(function (item) {
            return {
                properties: item,
                geometry: {
                    type: 'Point',
                    coordinates: [
                        item.lng ?? item.lon ?? item.longitude ?? item.x,
                        item.lat ?? item.latitude ?? item.y
                    ]
                }
            };
        });
        const points = featuresToHeatPoints(pseudoFeatures, fieldName);
        if (!points.length) throw new Error('JSON 数组中未找到有效经纬度或数值字段「' + fieldName + '」');
        return points;
    }

    function parseHeatPointsFromCsv(text, fieldName) {
        const points = [];
        const lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (lines.length < 2) return points;
        const header = lines[0].split(/[,，\t]/).map(function (h) { return h.trim(); });
        const lngIdx = header.findIndex(function (h) { return /^(lng|lon|longitude|x|经度)$/i.test(h); });
        const latIdx = header.findIndex(function (h) { return /^(lat|latitude|y|纬度)$/i.test(h); });
        const valIdx = header.findIndex(function (h) {
            return h.toLowerCase() === fieldName.toLowerCase() || /^(value|val|值|count|weight)$/i.test(h);
        });
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/[,，\t]/);
            const lng = parseFloat(cols[lngIdx >= 0 ? lngIdx : 0]);
            const lat = parseFloat(cols[latIdx >= 0 ? latIdx : 1]);
            const val = parseFloat(cols[valIdx >= 0 ? valIdx : 2]);
            if (!isNaN(lng) && !isNaN(lat) && !isNaN(val)) points.push({ lng: lng, lat: lat, value: val });
        }
        return points;
    }

    function parseHeatPoints(text, fieldName) {
        const trimmed = (text || '').trim();
        if (!trimmed) return [];

        if (isJsonLikeText(trimmed)) {
            let data;
            try {
                data = JSON.parse(trimmed);
            } catch (e) {
                throw new Error('JSON 语法错误：' + e.message);
            }
            return parseHeatPointsFromJsonData(data, fieldName);
        }

        return parseHeatPointsFromCsv(trimmed, fieldName);
    }

    function upscaleCanvas(srcCanvas, targetWidth) {
        const scale = targetWidth / srcCanvas.width;
        const targetHeight = Math.max(1, Math.round(srcCanvas.height * scale));
        const out = document.createElement('canvas');
        out.width = targetWidth;
        out.height = targetHeight;
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
        return out;
    }

    function renderPlanarHeatmap(pack) {
        const b = pack.bounds;
        const small = gridToHeatCanvas(pack.grid, pack.cols, pack.rows, 0.03);
        const canvas = upscaleCanvas(small, Math.max(512, pack.cols));
        const provider = new Cesium.SingleTileImageryProvider({
            url: canvas.toDataURL('image/png'),
            rectangle: Cesium.Rectangle.fromDegrees(b.minLng, b.minLat, b.maxLng, b.maxLat),
            tileWidth: pack.cols,
            tileHeight: pack.rows
        });
        heatmapImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
        heatmapImageryLayer.alpha = 0.92;
        viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(b.minLng, b.minLat, b.maxLng, b.maxLat) });
    }

    async function renderSurfaceHeatmap(pack, maxHeight) {
        const b = pack.bounds;
        const cols = pack.cols;
        const rows = pack.rows;
        const meshCols = Math.min(cols, 120);
        const meshRows = Math.min(rows, 120);
        const heatCanvas = upscaleCanvas(gridToHeatCanvas(pack.grid, cols, rows, 0.02), Math.max(512, cols));

        const cartographics = [];
        for (let j = 0; j <= meshRows; j++) {
            for (let i = 0; i <= meshCols; i++) {
                const lng = b.minLng + (b.maxLng - b.minLng) * i / meshCols;
                const lat = b.minLat + (b.maxLat - b.minLat) * j / meshRows;
                cartographics.push(Cesium.Cartographic.fromDegrees(lng, lat));
            }
        }

        let terrainHeights = cartographics.map(function (c) { return 0; });
        try {
            const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics);
            terrainHeights = sampled.map(function (s) { return s.height || 0; });
        } catch (e) { /* 无地形时使用椭球高度 0 */ }

        const vertexCount = (meshCols + 1) * (meshRows + 1);
        const positions = new Float64Array(vertexCount * 3);
        const sts = new Float32Array(vertexCount * 2);
        const indices = [];

        for (let j = 0; j <= meshRows; j++) {
            for (let i = 0; i <= meshCols; i++) {
                const vi = j * (meshCols + 1) + i;
                const u = i / meshCols;
                const v = j / meshRows;
                const lng = b.minLng + (b.maxLng - b.minLng) * u;
                const lat = b.minLat + (b.maxLat - b.minLat) * v;
                const intensity = sampleGridBilinear(pack.grid, cols, rows, u, v);
                const h = terrainHeights[vi] + intensity * maxHeight;
                const cart = Cesium.Cartesian3.fromDegrees(lng, lat, h);
                positions[vi * 3] = cart.x;
                positions[vi * 3 + 1] = cart.y;
                positions[vi * 3 + 2] = cart.z;
                sts[vi * 2] = u;
                sts[vi * 2 + 1] = v;
            }
        }

        for (let j = 0; j < meshRows; j++) {
            for (let i = 0; i < meshCols; i++) {
                const a = j * (meshCols + 1) + i;
                const bIdx = a + 1;
                const c = a + (meshCols + 1);
                const d = c + 1;
                indices.push(a, bIdx, c, bIdx, d, c);
            }
        }

        const geometry = new Cesium.Geometry({
            attributes: {
                position: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                    componentsPerAttribute: 3,
                    values: positions
                }),
                st: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: sts
                })
            },
            indices: new Uint16Array(indices),
            primitiveType: Cesium.PrimitiveType.TRIANGLES,
            boundingSphere: Cesium.BoundingSphere.fromVertices(positions)
        });

        heatmapPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: new Cesium.GeometryInstance({ geometry: geometry }),
            appearance: new Cesium.MaterialAppearance({
                material: Cesium.Material.fromType('Image', {
                    image: heatCanvas,
                    transparent: true
                }),
                faceForward: true,
                translucent: true,
                flat: false,
                closed: false
            }),
            asynchronous: false
        }));

        viewer.camera.flyTo({
            destination: Cesium.Rectangle.fromDegrees(b.minLng, b.minLat, b.maxLng, b.maxLat),
            duration: 1.5,
            orientation: {
                pitch: Cesium.Math.toRadians(-50),
                heading: 0,
                roll: 0
            }
        });
    }

    function renderLegend(minVal, maxVal) {
        const el = document.getElementById('spatial-legend');
        if (!el) return;
        el.innerHTML = HEAT_COLOR_STOPS.map(function (stop) {
            const v = minVal + (maxVal - minVal) * stop.t;
            const css = 'rgb(' + stop.r + ',' + stop.g + ',' + stop.b + ')';
            return '<div class="interp-legend-item"><span class="interp-legend-color" style="background:' + css + '"></span><span>' + v.toFixed(1) + '</span></div>';
        }).join('');
    }

    async function runSlopeAspect() {
        const gridSize = parseInt(document.getElementById('slope-grid').value, 10) || 30;
        pickPolygon(async function (positions) {
            try {
                const samples = await sampleTerrainHeights(positions, gridSize);
                if (samples.length < 4) throw new Error('采样点不足');
                let slopeSum = 0, aspectCounts = { N: 0, E: 0, S: 0, W: 0 };
                const lons = samples.map(function (s) { return s.longitude; });
                const lats = samples.map(function (s) { return s.latitude; });
                const minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
                const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
                const stepLon = (maxLon - minLon) / gridSize;
                const stepLat = (maxLat - minLat) / gridSize;

                const heightMap = {};
                samples.forEach(function (s) {
                    const key = s.longitude.toFixed(8) + ',' + s.latitude.toFixed(8);
                    heightMap[key] = s.height;
                });

                let count = 0;
                samples.forEach(function (s) {
                    const eKey = (s.longitude + stepLon).toFixed(8) + ',' + s.latitude.toFixed(8);
                    const nKey = s.longitude.toFixed(8) + ',' + (s.latitude + stepLat).toFixed(8);
                    const hE = heightMap[eKey], hN = heightMap[nKey];
                    if (hE == null || hN == null) return;
                    const dzdx = (hE - s.height) / (stepLon * 111319.9 * Math.cos(s.latitude));
                    const dzdy = (hN - s.height) / (stepLat * 111319.9);
                    const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI;
                    slopeSum += slope;
                    const aspect = Math.atan2(dzdy, -dzdx) * 180 / Math.PI;
                    const dir = aspect < -135 || aspect >= 135 ? 'W' : aspect < -45 ? 'S' : aspect < 45 ? 'E' : 'N';
                    aspectCounts[dir]++;
                    count++;
                    const color = slopeToColor(slope);
                    const entity = viewer.entities.add({
                        position: Cesium.Cartesian3.fromRadians(s.longitude, s.latitude, s.height + 5),
                        point: { pixelSize: 6, color: color, heightReference: Cesium.HeightReference.NONE }
                    });
                    analysisEntities.push(entity);
                });

                const avgSlope = count > 0 ? slopeSum / count : 0;
                const dominant = Object.keys(aspectCounts).reduce(function (a, b) { return aspectCounts[a] > aspectCounts[b] ? a : b; });
                document.getElementById('spatial-result').textContent =
                    '平均坡度: ' + avgSlope.toFixed(2) + '°\n主坡向: ' + { N: '北', E: '东', S: '南', W: '西' }[dominant] +
                    '\n采样点数: ' + count;
            } catch (e) {
                alert('坡度坡向分析失败: ' + e.message);
            }
        });
    }

    function slopeToColor(deg) {
        if (deg < 5) return Cesium.Color.GREEN;
        if (deg < 15) return Cesium.Color.YELLOW;
        if (deg < 30) return Cesium.Color.ORANGE;
        return Cesium.Color.RED;
    }

    function runViewshed() {
        const observerHeight = parseFloat(document.getElementById('viewshed-observer-height').value) || 2;
        const radius = parseFloat(document.getElementById('viewshed-radius').value) || 1000;
        alert('请在地图上点击观察者位置');
        clearHandler();
        handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction(function (click) {
            clearHandler();
            let cart = viewer.scene.pickPosition(click.position);
            if (!cart) cart = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (!cart) return;
            const deg = Cesium.Cartographic.fromCartesian(cart);
            const observer = Cesium.Cartesian3.fromRadians(deg.longitude, deg.latitude, deg.height + observerHeight);

            const entity = viewer.entities.add({
                position: observer,
                ellipsoid: {
                    radii: new Cesium.Cartesian3(radius, radius, radius * 0.3),
                    material: Cesium.Color.GREEN.withAlpha(0.15),
                    outline: true, outlineColor: Cesium.Color.GREEN
                },
                point: { pixelSize: 10, color: Cesium.Color.GREEN }
            });
            analysisEntities.push(entity);
            document.getElementById('spatial-result').textContent = '视域分析（示意）\n观察点高程+' + observerHeight + 'm\n分析半径: ' + radius + 'm';
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function runProfile() {
        alert('请在地图上点击两点绘制剖面线');
        clearHandler();
        const positions = [];
        handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction(function (click) {
            let cart = viewer.scene.pickPosition(click.position);
            if (!cart) cart = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (!cart) return;
            positions.push(cart);
            const pt = viewer.entities.add({ position: cart, point: { pixelSize: 8, color: Cesium.Color.PURPLE } });
            analysisEntities.push(pt);
            if (positions.length === 2) {
                clearHandler();
                const line = viewer.entities.add({
                    polyline: { positions: positions, width: 3, material: Cesium.Color.PURPLE, clampToGround: true }
                });
                analysisEntities.push(line);
                sampleProfile(positions[0], positions[1]);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    async function sampleProfile(start, end) {
        const count = 50;
        const cartographics = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const cart = Cesium.Cartesian3.lerp(start, end, t, new Cesium.Cartesian3());
            cartographics.push(Cesium.Cartographic.fromCartesian(cart));
        }
        try {
            const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics);
            const minH = Math.min.apply(null, sampled.map(function (s) { return s.height; }));
            const maxH = Math.max.apply(null, sampled.map(function (s) { return s.height; }));
            document.getElementById('spatial-result').textContent = '地形剖面\n最低: ' + minH.toFixed(1) + 'm\n最高: ' + maxH.toFixed(1) + 'm\n高差: ' + (maxH - minH).toFixed(1) + 'm';
        } catch (e) {
            document.getElementById('spatial-result').textContent = '剖面分析完成（无地形数据）';
        }
    }

    function runShadowAnalysis() {
        const hour = parseInt(document.getElementById('shadow-hour').value, 10) || 12;
        const julian = Cesium.JulianDate.fromDate(new Date(2024, 5, 21, hour, 0, 0));
        viewer.clock.currentTime = julian;
        viewer.shadows = true;
        viewer.terrainShadows = Cesium.ShadowMode.ENABLED;
        document.getElementById('spatial-result').textContent = '阴影分析\n模拟时间: ' + hour + ':00\n已启用场景阴影';
    }

    return {
        init: init,
        clearAll: clearAll,
        runCutFill: runCutFill,
        runFloodAnalysis: runFloodAnalysis,
        stopFloodAnimation: stopFloodAnimation,
        runHeatmap: runHeatmap,
        runSlopeAspect: runSlopeAspect,
        runViewshed: runViewshed,
        runProfile: runProfile,
        runShadowAnalysis: runShadowAnalysis
    };
})();
