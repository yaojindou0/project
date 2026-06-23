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

    const COLOR_RAMP = ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#d73027'];

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
        if (heatmapPrimitive) {
            viewer.scene.primitives.remove(heatmapPrimitive);
            heatmapPrimitive = null;
        }
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

    async function runHeatmap(mode) {
        const fileInput = document.getElementById('heatmap-file');
        if (!fileInput.files || !fileInput.files[0]) { alert('请上传热力数据 CSV/JSON'); return; }
        const fieldName = document.getElementById('heatmap-field').value.trim() || 'value';
        const gridCols = parseInt(document.getElementById('heatmap-cols').value, 10) || 40;
        const text = await fileInput.files[0].text();
        const points = parseHeatPoints(text, fieldName);
        if (points.length < 3) { alert('至少需要 3 个有效点'); return; }

        const lngs = points.map(function (p) { return p.lng; });
        const lats = points.map(function (p) { return p.lat; });
        const minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
        const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
        const minVal = Math.min.apply(null, points.map(function (p) { return p.value; }));
        const maxVal = Math.max.apply(null, points.map(function (p) { return p.value; }));
        const rows = Math.ceil(gridCols * (maxLat - minLat) / (maxLng - minLng || 1));

        if (heatmapPrimitive) viewer.scene.primitives.remove(heatmapPrimitive);

        if (mode === 'planar') {
            await renderPlanarHeatmap(points, minLng, maxLng, minLat, maxLat, gridCols, rows, minVal, maxVal);
        } else {
            await renderSurfaceHeatmap(points, minLng, maxLng, minLat, maxLat, gridCols, rows, minVal, maxVal);
        }
        renderLegend(minVal, maxVal);
        document.getElementById('spatial-result').textContent = '热力图已生成 (' + (mode === 'planar' ? '平面' : '曲面贴地') + ')，共 ' + points.length + ' 个采样点';
    }

    function parseHeatPoints(text, fieldName) {
        const points = [];
        try {
            const json = JSON.parse(text);
            const features = json.features || (Array.isArray(json) ? json.map(function (p) { return { properties: p, geometry: { type: 'Point', coordinates: [p.lng || p.lon || p.x, p.lat || p.y] } }; }) : []);
            features.forEach(function (f) {
                const props = f.properties || f;
                const g = f.geometry;
                let lng, lat, val;
                if (g && g.type === 'Point') { lng = g.coordinates[0]; lat = g.coordinates[1]; }
                else { lng = props.lng || props.lon || props.x; lat = props.lat || props.y; }
                val = parseFloat(props[fieldName] || props.value);
                if (!isNaN(lng) && !isNaN(lat) && !isNaN(val)) points.push({ lng: lng, lat: lat, value: val });
            });
        } catch (e) {
            const lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
            const header = lines[0].split(/[,，\t]/);
            const lngIdx = header.findIndex(function (h) { return /lng|lon|经度|x/i.test(h); });
            const latIdx = header.findIndex(function (h) { return /lat|纬度|y/i.test(h); });
            const valIdx = header.findIndex(function (h) { return h.toLowerCase() === fieldName.toLowerCase() || /value|值/i.test(h); });
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(/[,，\t]/);
                const lng = parseFloat(cols[lngIdx >= 0 ? lngIdx : 0]);
                const lat = parseFloat(cols[latIdx >= 0 ? latIdx : 1]);
                const val = parseFloat(cols[valIdx >= 0 ? valIdx : 2]);
                if (!isNaN(lng) && !isNaN(lat) && !isNaN(val)) points.push({ lng: lng, lat: lat, value: val });
            }
        }
        return points;
    }

    function idw(x, y, points, power) {
        power = power || 2;
        let num = 0, den = 0;
        points.forEach(function (p) {
            const d = Math.sqrt(Math.pow(p.lng - x, 2) + Math.pow(p.lat - y, 2));
            if (d < 1e-10) return p.value;
            const w = 1 / Math.pow(d, power);
            num += w * p.value;
            den += w;
        });
        return den > 0 ? num / den : 0;
    }

    function valueToColor(val, minVal, maxVal) {
        const t = maxVal > minVal ? (val - minVal) / (maxVal - minVal) : 0.5;
        const idx = Math.min(COLOR_RAMP.length - 1, Math.floor(t * (COLOR_RAMP.length - 1)));
        return Cesium.Color.fromCssColorString(COLOR_RAMP[idx]).withAlpha(0.65);
    }

    async function renderPlanarHeatmap(points, minLng, maxLng, minLat, maxLat, cols, rows, minVal, maxVal) {
        const instances = [];
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const lng0 = minLng + (maxLng - minLng) * i / cols;
                const lat0 = minLat + (maxLat - minLat) * j / rows;
                const lng1 = minLng + (maxLng - minLng) * (i + 1) / cols;
                const lat1 = minLat + (maxLat - minLat) * (j + 1) / rows;
                const cx = (lng0 + lng1) / 2, cy = (lat0 + lat1) / 2;
                const val = idw(cx, cy, points);
                const color = valueToColor(val, minVal, maxVal);
                instances.push(new Cesium.GeometryInstance({
                    geometry: new Cesium.RectangleGeometry({
                        rectangle: Cesium.Rectangle.fromDegrees(lng0, lat0, lng1, lat1),
                        height: 100
                    }),
                    attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) }
                }));
            }
        }
        heatmapPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: instances,
            appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true })
        }));
        viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat) });
    }

    async function renderSurfaceHeatmap(points, minLng, maxLng, minLat, maxLat, cols, rows, minVal, maxVal) {
        const cells = [];
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const lng0 = minLng + (maxLng - minLng) * i / cols;
                const lat0 = minLat + (maxLat - minLat) * j / rows;
                const lng1 = minLng + (maxLng - minLng) * (i + 1) / cols;
                const lat1 = minLat + (maxLat - minLat) * (j + 1) / rows;
                const cx = (lng0 + lng1) / 2, cy = (lat0 + lat1) / 2;
                cells.push({ lng0: lng0, lat0: lat0, lng1: lng1, lat1: lat1, val: idw(cx, cy, points) });
            }
        }

        const cartographics = cells.map(function (c) {
            return Cesium.Cartographic.fromDegrees((c.lng0 + c.lng1) / 2, (c.lat0 + c.lat1) / 2);
        });
        let sampled = cartographics;
        try {
            sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics);
        } catch (e) { /* 无地形时使用默认高度 */ }

        cells.forEach(function (cell, idx) {
            const h = (sampled[idx] && sampled[idx].height != null ? sampled[idx].height : 0) + 1;
            const color = valueToColor(cell.val, minVal, maxVal);
            const entity = viewer.entities.add({
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray([
                        cell.lng0, cell.lat0, cell.lng1, cell.lat0, cell.lng1, cell.lat1, cell.lng0, cell.lat1
                    ]),
                    material: color,
                    height: h,
                    outline: false
                }
            });
            analysisEntities.push(entity);
        });
        viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat) });
    }

    function renderLegend(minVal, maxVal) {
        const el = document.getElementById('spatial-legend');
        if (!el) return;
        el.innerHTML = COLOR_RAMP.map(function (c, i) {
            const v = minVal + (maxVal - minVal) * i / (COLOR_RAMP.length - 1);
            return '<div class="interp-legend-item"><span class="interp-legend-color" style="background:' + c + '"></span><span>' + v.toFixed(1) + '</span></div>';
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
