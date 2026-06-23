/**
 * Cesium 轨迹模拟 - 车辆、无人机、人物行走
 */
const CesiumTrajectory = (function () {
    'use strict';

    let viewer = null;
    let animationEntity = null;
    let pathEntity = null;
    let tickListener = null;
    let isPlaying = false;
    let trackPoints = [];
    let currentIndex = 0;
    let startTime = null;
    let mode = 'vehicle';
    let drawHandler = null;
    let isDrawing = false;
    let drawCartesians = [];
    let drawMarkerEntities = [];
    let drawPreviewLine = null;
    let pathMarkerEntities = [];
    let roamEntity = null;
    let roamTickListener = null;
    let isRoaming = false;
    let localModelObjectUrl = null;
    let localModelFileName = '';

    const MODE_CONFIG = {
        vehicle: { label: '车辆', color: Cesium.Color.ORANGE, modelScale: 2, speed: 1, height: 0, icon: '🚗' },
        drone: { label: '无人机', color: Cesium.Color.CYAN, modelScale: 1, speed: 2, height: 80, icon: '🚁' },
        pedestrian: { label: '人物', color: Cesium.Color.LIME, modelScale: 1, speed: 0.5, height: 0, icon: '🚶' }
    };

    const IMPORT_CRS = 'WGS84';
    const IMPORT_EPSG = 'EPSG:4326';

    function init(viewerInstance) {
        viewer = viewerInstance;
    }

    function setTrackInfo(text) {
        const el = document.getElementById('track-info');
        if (el) el.textContent = text || '';
    }

    function setModelFileInfo(text) {
        const el = document.getElementById('track-model-file-info');
        if (el) el.textContent = text || '';
    }

    function revokeLocalModelUrl() {
        if (localModelObjectUrl) {
            URL.revokeObjectURL(localModelObjectUrl);
            localModelObjectUrl = null;
        }
        localModelFileName = '';
    }

    function onModelFileChange() {
        revokeLocalModelUrl();
        const fileInput = document.getElementById('track-model-file');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) {
            setModelFileInfo('未选择本地模型，可使用 URL 或默认图标。推荐 .glb 单文件。');
            return;
        }
        if (!/\.(gltf|glb)$/i.test(file.name)) {
            alert('请选择 glTF / GLB 模型文件');
            fileInput.value = '';
            setModelFileInfo('未选择本地模型，可使用 URL 或默认图标。推荐 .glb 单文件。');
            return;
        }
        localModelObjectUrl = URL.createObjectURL(file);
        localModelFileName = file.name;
        setModelFileInfo('已选择本地模型：' + file.name);
        const urlInput = document.getElementById('track-model-url');
        if (urlInput) urlInput.value = '';
    }

    function clearLocalModel() {
        revokeLocalModelUrl();
        const fileInput = document.getElementById('track-model-file');
        if (fileInput) fileInput.value = '';
        setModelFileInfo('未选择本地模型，可使用 URL 或默认图标');
    }

    function getSimulationModelUrl() {
        if (localModelObjectUrl) return localModelObjectUrl;
        const urlInput = document.getElementById('track-model-url');
        return urlInput ? urlInput.value.trim() : '';
    }

    function getSimulationModelScale(cfg) {
        const scaleInput = document.getElementById('track-model-scale');
        const customScale = scaleInput ? parseFloat(scaleInput.value) : NaN;
        if (!isNaN(customScale) && customScale > 0) return customScale;
        return cfg.modelScale;
    }

    function pickCartesian(screenPosition) {
        if (!viewer) return null;
        let cartesian = viewer.scene.pickPosition(screenPosition);
        if (!cartesian) {
            cartesian = viewer.camera.pickEllipsoid(screenPosition, viewer.scene.globe.ellipsoid);
        }
        return cartesian;
    }

    function cartesianToTrackPoint(cartesian) {
        const c = Cesium.Cartographic.fromCartesian(cartesian);
        return {
            lng: Cesium.Math.toDegrees(c.longitude),
            lat: Cesium.Math.toDegrees(c.latitude),
            alt: c.height,
            time: null,
            crs: IMPORT_CRS
        };
    }

    function removeTrackEntities(entities) {
        if (!viewer || !entities) return;
        entities.slice().forEach(function (e) {
            if (e) viewer.entities.remove(e);
        });
        entities.length = 0;
    }

    function getPointHeight(p, cfg) {
        if (p.alt != null && !isNaN(p.alt)) return p.alt;
        return mode === 'drone' ? cfg.height : cfg.height;
    }

    function buildPositionProperty(points, speedFactor, cfg) {
        const property = new Cesium.SampledPositionProperty();
        property.setInterpolationOptions({
            interpolationDegree: 2,
            interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
        });
        const start = Cesium.JulianDate.now();
        const interval = 2 / speedFactor;
        points.forEach(function (p, i) {
            const h = getPointHeight(p, cfg);
            const time = Cesium.JulianDate.addSeconds(start, i * interval, new Cesium.JulianDate());
            property.addSample(time, Cesium.Cartesian3.fromDegrees(p.lng, p.lat, h));
        });
        const stop = Cesium.JulianDate.addSeconds(start, (points.length - 1) * interval, new Cesium.JulianDate());
        return { property: property, start: start, stop: stop, interval: interval };
    }

    function setupTrackClock(start, stop, speedFactor, loop) {
        viewer.clock.startTime = start.clone();
        viewer.clock.stopTime = stop.clone();
        viewer.clock.currentTime = start.clone();
        viewer.clock.clockRange = loop ? Cesium.ClockRange.LOOP_STOP : Cesium.ClockRange.CLAMPED;
        viewer.clock.multiplier = speedFactor;
        viewer.clock.shouldAnimate = true;
    }

    function updateDrawPreviewLine() {
        if (drawPreviewLine) {
            viewer.entities.remove(drawPreviewLine);
            drawPreviewLine = null;
        }
        if (drawCartesians.length < 2) return;
        const cfg = MODE_CONFIG[mode];
        drawPreviewLine = viewer.entities.add({
            _trackDraw: true,
            polyline: {
                positions: drawCartesians.slice(),
                width: 3,
                material: cfg.color.withAlpha(0.85),
                clampToGround: mode !== 'drone'
            }
        });
    }

    function stopDrawTrack() {
        isDrawing = false;
        if (drawHandler) {
            drawHandler.destroy();
            drawHandler = null;
        }
        if (viewer && viewer.scene && viewer.scene.canvas) {
            viewer.scene.canvas.style.cursor = '';
        }
        document.querySelectorAll('.track-draw-btn').forEach(function (btn) {
            btn.classList.remove('active');
        });
    }

    function clearDrawGraphics() {
        removeTrackEntities(drawMarkerEntities);
        if (drawPreviewLine) {
            viewer.entities.remove(drawPreviewLine);
            drawPreviewLine = null;
        }
        drawCartesians = [];
    }

    function startDrawTrack() {
        if (!viewer) return;
        stopDrawTrack();
        stopPathRoaming();
        stopSimulation();
        clearDrawGraphics();
        clearTrack(false);
        isDrawing = true;
        setTrackInfo('绘制中：左键添加顶点，右键完成（至少 2 个点）');
        if (viewer.scene.canvas) viewer.scene.canvas.style.cursor = 'crosshair';
        const drawBtn = document.getElementById('track-draw-start-btn');
        if (drawBtn) drawBtn.classList.add('active');

        drawHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        drawHandler.setInputAction(function (click) {
            const cartesian = pickCartesian(click.position);
            if (!cartesian) return;
            drawCartesians.push(cartesian);
            const cfg = MODE_CONFIG[mode];
            const marker = viewer.entities.add({
                _trackDraw: true,
                position: cartesian,
                point: {
                    pixelSize: 8,
                    color: cfg.color,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: mode === 'drone' ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            drawMarkerEntities.push(marker);
            updateDrawPreviewLine();
            setTrackInfo('已绘制 ' + drawCartesians.length + ' 个顶点，右键完成');
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        drawHandler.setInputAction(function () {
            finishDrawTrack();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    function undoDrawPoint() {
        if (!drawCartesians.length) return;
        drawCartesians.pop();
        const last = drawMarkerEntities.pop();
        if (last) viewer.entities.remove(last);
        updateDrawPreviewLine();
        if (isDrawing) {
            setTrackInfo(drawCartesians.length
                ? ('已绘制 ' + drawCartesians.length + ' 个顶点，右键完成')
                : '绘制中：左键添加顶点，右键完成（至少 2 个点）');
        }
    }

    function finishDrawTrack() {
        if (!isDrawing && drawCartesians.length < 2) return;
        stopDrawTrack();
        if (drawCartesians.length < 2) {
            alert('轨迹至少需要 2 个顶点');
            clearDrawGraphics();
            setTrackInfo('');
            return;
        }
        trackPoints = drawCartesians.map(cartesianToTrackPoint);
        clearDrawGraphics();
        drawPath();
        setTrackInfo(formatTrackInfo(trackPoints.length, '地图绘制'));
    }

    function cancelDrawTrack() {
        stopDrawTrack();
        clearDrawGraphics();
        setTrackInfo('');
    }

    function setMode(m) {
        mode = m;
        document.querySelectorAll('.track-mode-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.mode === m);
        });
    }

    function parseTrackFile(text) {
        text = String(text || '').replace(/^\uFEFF/, '').trim();
        if (!text) return [];

        try {
            return parseJsonTrack(JSON.parse(text));
        } catch (e) {
            return parseCsvTrack(text);
        }
    }

    function ensureWgs84Degrees(lng, lat) {
        let x = parseFloat(lng);
        let y = parseFloat(lat);
        if (isNaN(x) || isNaN(y)) return null;
        // 明显经纬度颠倒时自动纠正（WGS84 纬度绝对值不超过 90）
        if (Math.abs(y) > 90 && Math.abs(x) <= 90) {
            const tmp = x;
            x = y;
            y = tmp;
        }
        if (y < -90 || y > 90 || x < -180 || x > 180) return null;
        return { lng: x, lat: y };
    }

    function pointFromCoords(coords, props) {
        props = props || {};
        if (!coords || coords.length < 2) return null;
        const wgs = ensureWgs84Degrees(coords[0], coords[1]);
        if (!wgs) return null;
        const altRaw = coords.length > 2 ? coords[2] : pickProp(props, ['alt', 'height', 'elevation', 'z', '高度', '海拔']);
        const time = pickProp(props, ['time', 'timestamp', 't', '时间', 'datetime', 'date']);
        const alt = altRaw != null && altRaw !== '' ? parseFloat(altRaw) : null;
        return {
            lng: wgs.lng,
            lat: wgs.lat,
            alt: alt != null && !isNaN(alt) ? alt : null,
            time: time != null ? String(time) : null,
            crs: IMPORT_CRS
        };
    }

    function pickProp(props, keys) {
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (props[k] != null && props[k] !== '') return props[k];
            const lower = k.toLowerCase();
            for (const p in props) {
                if (Object.prototype.hasOwnProperty.call(props, p) && p.toLowerCase() === lower) return props[p];
            }
        }
        return null;
    }

    function parseJsonTrack(json) {
        const points = [];
        function addFromCoords(coords, props) {
            if (!coords || !coords.length) return;
            if (typeof coords[0] === 'number') {
                const pt = pointFromCoords(coords, props);
                if (pt) points.push(pt);
                return;
            }
            coords.forEach(function (c) { addFromCoords(c, props); });
        }

        if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
            json.features.forEach(function (f) {
                if (!f.geometry) return;
                if (f.geometry.type === 'Point') addFromCoords(f.geometry.coordinates, f.properties);
                else if (f.geometry.type === 'LineString') addFromCoords(f.geometry.coordinates, f.properties);
                else if (f.geometry.type === 'MultiLineString') {
                    f.geometry.coordinates.forEach(function (line) { addFromCoords(line, f.properties); });
                }
            });
            return points;
        }
        if (json.type === 'Feature' && json.geometry) {
            if (json.geometry.type === 'Point') addFromCoords(json.geometry.coordinates, json.properties);
            else if (json.geometry.type === 'LineString') addFromCoords(json.geometry.coordinates, json.properties);
            return points;
        }
        if (json.type === 'LineString' && Array.isArray(json.coordinates)) {
            addFromCoords(json.coordinates, {});
            return points;
        }

        const arr = json.tracks || json.points || json.features || (Array.isArray(json) ? json : []);
        arr.forEach(function (item) {
            if (item.geometry && item.geometry.type === 'Point') {
                const pt = pointFromCoords(item.geometry.coordinates, item.properties || {});
                if (pt) points.push(pt);
            } else if (item.geometry && item.geometry.type === 'LineString') {
                item.geometry.coordinates.forEach(function (c) {
                    const pt = pointFromCoords(c, item.properties || {});
                    if (pt) points.push(pt);
                });
            } else {
                const lng = item.lng || item.lon || item.longitude || item.x;
                const lat = item.lat || item.latitude || item.y;
                const pt = pointFromCoords([lng, lat, item.alt || item.height || item.z], item);
                if (pt) points.push(pt);
            }
        });
        return points;
    }

    function parseCsvTrack(text) {
        const lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) return [];

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

        const LNG_KEYS = ['lng', 'lon', 'longitude', 'x', '经度', 'lon_deg', 'long'];
        const LAT_KEYS = ['lat', 'latitude', 'y', '纬度', 'lat_deg'];
        const ALT_KEYS = ['alt', 'height', 'elevation', 'z', '高度', '海拔', 'altitude'];
        const TIME_KEYS = ['time', 'timestamp', 't', '时间', 'datetime', 'date', '时刻'];
        const CRS_KEYS = ['crs', 'srid', 'epsg', '坐标系', 'coord_sys', 'coordinatesystem'];

        function findIdx(headers, keys) {
            for (let i = 0; i < headers.length; i++) {
                const n = String(headers[i]).trim().toLowerCase();
                if (keys.some(function (k) { return n === k.toLowerCase() || n.includes(k.toLowerCase()); })) return i;
            }
            return -1;
        }

        function findNumericColumns(cells) {
            const idx = [];
            cells.forEach(function (c, i) {
                const n = parseFloat(c);
                if (c !== '' && !isNaN(n)) idx.push(i);
            });
            return idx;
        }

        const headerCells = parseLine(lines[0]);
        const hasHeader = headerCells.some(function (c) { return c !== '' && isNaN(parseFloat(c)); });
        let start = 0;
        let lngIdx = 0;
        let latIdx = 1;
        let altIdx = -1;
        let timeIdx = -1;
        let crsIdx = -1;

        if (hasHeader) {
            lngIdx = findIdx(headerCells, LNG_KEYS);
            latIdx = findIdx(headerCells, LAT_KEYS);
            altIdx = findIdx(headerCells, ALT_KEYS);
            timeIdx = findIdx(headerCells, TIME_KEYS);
            crsIdx = findIdx(headerCells, CRS_KEYS);
            start = 1;
            if (lngIdx === -1 || latIdx === -1) {
                const nums = findNumericColumns(headerCells);
                if (lngIdx === -1 && nums.length) lngIdx = nums[0];
                if (latIdx === -1 && nums.length > 1) latIdx = nums[1];
            }
        }

        const points = [];
        let crsWarning = '';
        for (let li = start; li < lines.length; li++) {
            const cells = parseLine(lines[li]);
            if (!cells.length) continue;

            if (crsIdx >= 0 && cells[crsIdx] && !crsWarning) {
                const crsVal = String(cells[crsIdx]).toLowerCase();
                if (/gcj|火星|bd09|百度/.test(crsVal)) {
                    crsWarning = '文件标注了非 WGS84 坐标系，当前按 WGS84 直接加载';
                }
            }

            let rowLngIdx = lngIdx;
            let rowLatIdx = latIdx;
            if (!hasHeader) {
                const nums = findNumericColumns(cells);
                if (nums.length >= 2) {
                    rowLngIdx = nums[0];
                    rowLatIdx = nums[1];
                }
            }

            const wgs = ensureWgs84Degrees(cells[rowLngIdx], cells[rowLatIdx]);
            if (!wgs) continue;

            let alt = null;
            if (altIdx >= 0 && cells[altIdx] != null && cells[altIdx] !== '') {
                alt = parseFloat(cells[altIdx]);
            } else if (!hasHeader) {
                const extra = cells.filter(function (c, i) {
                    return i !== rowLngIdx && i !== rowLatIdx && c !== '' && !isNaN(parseFloat(c));
                });
                if (extra.length) alt = parseFloat(extra[0]);
            }

            let time = null;
            if (timeIdx >= 0 && cells[timeIdx] != null && cells[timeIdx] !== '') {
                time = cells[timeIdx];
            } else if (!hasHeader) {
                const textCols = cells.filter(function (c, i) {
                    return i !== rowLngIdx && i !== rowLatIdx && (c === '' || isNaN(parseFloat(c)));
                });
                if (textCols.length) time = textCols[0];
            }

            points.push({
                lng: wgs.lng,
                lat: wgs.lat,
                alt: alt != null && !isNaN(alt) ? alt : null,
                time: time,
                crs: IMPORT_CRS
            });
        }
        points._crsWarning = crsWarning;
        return points;
    }

    function formatTrackInfo(count, extra) {
        let msg = '已加载 ' + count + ' 个轨迹点（' + IMPORT_CRS + ' / ' + IMPORT_EPSG + '）';
        if (extra) msg += '，' + extra;
        return msg;
    }

    async function loadTrack() {
        stopDrawTrack();
        stopPathRoaming();
        const fileInput = document.getElementById('track-file');
        if (!fileInput.files || !fileInput.files[0]) { alert('请选择轨迹文件 (CSV/JSON)'); return; }
        const text = await fileInput.files[0].text();
        trackPoints = parseTrackFile(text);
        if (trackPoints.length < 2) { alert('轨迹至少需要 2 个有效 WGS84 坐标点'); return; }
        clearTrack(false);
        drawPath();
        setTrackInfo(formatTrackInfo(trackPoints.length, trackPoints._crsWarning || ''));
    }

    function drawPath() {
        removeTrackEntities(pathMarkerEntities);
        if (pathEntity) {
            viewer.entities.remove(pathEntity);
            pathEntity = null;
        }
        const cfg = MODE_CONFIG[mode];
        const positions = trackPoints.map(function (p) {
            return Cesium.Cartesian3.fromDegrees(p.lng, p.lat, getPointHeight(p, cfg));
        });
        pathEntity = viewer.entities.add({
            _trackPath: true,
            polyline: {
                positions: positions,
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: cfg.color }),
                clampToGround: mode !== 'drone'
            }
        });
        trackPoints.forEach(function (p, i) {
            if (i % Math.max(1, Math.floor(trackPoints.length / 20)) !== 0 && i !== trackPoints.length - 1) return;
            const marker = viewer.entities.add({
                _trackPath: true,
                position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, getPointHeight(p, cfg)),
                point: {
                    pixelSize: 4,
                    color: cfg.color.withAlpha(0.6),
                    heightReference: mode === 'drone' ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND
                }
            });
            pathMarkerEntities.push(marker);
        });
        viewer.flyTo(pathEntity);
    }

    function createDemoTrack() {
        stopDrawTrack();
        stopPathRoaming();
        const demos = {
            vehicle: [
                { lng: 116.391, lat: 39.907 }, { lng: 116.395, lat: 39.908 }, { lng: 116.400, lat: 39.910 },
                { lng: 116.405, lat: 39.912 }, { lng: 116.410, lat: 39.915 }, { lng: 116.415, lat: 39.918 }
            ],
            drone: [
                { lng: 116.390, lat: 39.905, alt: 50 }, { lng: 116.395, lat: 39.910, alt: 80 },
                { lng: 116.400, lat: 39.915, alt: 100 }, { lng: 116.405, lat: 39.920, alt: 120 },
                { lng: 116.410, lat: 39.918, alt: 90 }, { lng: 116.415, lat: 39.912, alt: 60 }
            ],
            pedestrian: [
                { lng: 116.392, lat: 39.906 }, { lng: 116.393, lat: 39.907 }, { lng: 116.394, lat: 39.908 },
                { lng: 116.395, lat: 39.909 }, { lng: 116.396, lat: 39.910 }, { lng: 116.397, lat: 39.911 },
                { lng: 116.398, lat: 39.912 }
            ]
        };
        trackPoints = demos[mode] || demos.vehicle;
        clearTrack(false);
        drawPath();
        setTrackInfo(formatTrackInfo(trackPoints.length, '演示轨迹 · ' + MODE_CONFIG[mode].label));
    }

    function startSimulation() {
        if (trackPoints.length < 2) { alert('请先绘制或加载轨迹'); return; }
        stopDrawTrack();
        stopPathRoaming();
        stopSimulation();
        const cfg = MODE_CONFIG[mode];
        const speedFactor = parseFloat(document.getElementById('track-speed').value) || 1;
        const modelUrl = getSimulationModelUrl();
        const modelScale = getSimulationModelScale(cfg);
        const built = buildPositionProperty(trackPoints, speedFactor, cfg);
        const property = built.property;
        const start = built.start;
        const stop = built.stop;
        setupTrackClock(start, stop, speedFactor, true);

        const entityOpts = {
            availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: start, stop: stop })]),
            position: property,
            orientation: new Cesium.VelocityOrientationProperty(property),
            path: {
                resolution: 1,
                material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: cfg.color }),
                width: 6,
                leadTime: 0,
                trailTime: 60
            }
        };

        if (modelUrl) {
            entityOpts.model = { uri: modelUrl, scale: modelScale, minimumPixelSize: 48 };
            entityOpts.orientation = new Cesium.VelocityOrientationProperty(property);
        } else if (mode === 'pedestrian') {
            entityOpts.billboard = {
                image: createPedestrianCanvas(cfg.icon),
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                scale: 0.5
            };
            entityOpts.orientation = undefined;
        } else {
            entityOpts.billboard = {
                image: createVehicleCanvas(cfg.icon, cfg.color),
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                heightReference: mode === 'drone' ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,
                scale: 0.6
            };
            if (mode !== 'drone') entityOpts.orientation = undefined;
        }

        if (mode === 'drone') {
            entityOpts.cylinder = {
                length: cfg.height,
                topRadius: 0,
                bottomRadius: cfg.height * 0.3,
                material: cfg.color.withAlpha(0.08),
                outline: false
            };
        }

        animationEntity = viewer.entities.add(entityOpts);
        viewer.trackedEntity = animationEntity;
        isPlaying = true;
        const modelHint = modelUrl ? (localModelFileName ? ' · 本地模型 ' + localModelFileName : ' · 自定义模型') : '';
        setTrackInfo(MODE_CONFIG[mode].label + ' 模拟运行中... (倍速 ' + speedFactor + 'x)' + modelHint);
    }

    function stopPathRoaming() {
        isRoaming = false;
        if (!viewer) return;
        viewer.trackedEntity = undefined;
        if (roamTickListener) {
            viewer.clock.onTick.removeEventListener(roamTickListener);
            roamTickListener = null;
        }
        if (roamEntity) {
            viewer.entities.remove(roamEntity);
            roamEntity = null;
        }
    }

    function updateRoamingCamera(time, viewMode, eyeHeight) {
        if (!roamEntity || !roamEntity.position) return;
        const pos = roamEntity.position.getValue(time);
        if (!pos) return;
        const nextTime = Cesium.JulianDate.addSeconds(time, 0.4, new Cesium.JulianDate());
        let nextPos = roamEntity.position.getValue(nextTime);
        if (!nextPos) nextPos = pos;

        if (viewMode === 'overhead') {
            const cart = Cesium.Cartographic.fromCartesian(pos);
            const camHeight = (cart.height || 0) + eyeHeight;
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, camHeight),
                orientation: {
                    heading: 0,
                    pitch: Cesium.Math.toRadians(-89),
                    roll: 0
                }
            });
            return;
        }

        const direction = Cesium.Cartesian3.subtract(nextPos, pos, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitudeSquared(direction) < 1e-6) {
            direction.x = 1;
            direction.y = 0;
            direction.z = 0;
        } else {
            Cesium.Cartesian3.normalize(direction, direction);
        }
        const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
        const back = Cesium.Cartesian3.multiplyByScalar(direction, -eyeHeight * 0.6, new Cesium.Cartesian3());
        const upOffset = Cesium.Cartesian3.multiplyByScalar(up, eyeHeight * 0.35, new Cesium.Cartesian3());
        const camPos = Cesium.Cartesian3.add(pos, back, new Cesium.Cartesian3());
        Cesium.Cartesian3.add(camPos, upOffset, camPos);
        viewer.camera.setView({
            destination: camPos,
            orientation: { direction: direction, up: up }
        });
    }

    function startPathRoaming() {
        if (trackPoints.length < 2) { alert('请先绘制或加载轨迹'); return; }
        stopDrawTrack();
        stopPathRoaming();
        stopSimulation();

        const cfg = MODE_CONFIG[mode];
        const speedFactor = parseFloat(document.getElementById('track-roam-speed').value) || 1;
        const eyeHeight = parseFloat(document.getElementById('track-roam-height').value) || 80;
        const viewMode = (document.getElementById('track-roam-view') || {}).value || 'follow';
        const loop = document.getElementById('track-roam-loop') && document.getElementById('track-roam-loop').checked;

        const built = buildPositionProperty(trackPoints, speedFactor, cfg);
        setupTrackClock(built.start, built.stop, speedFactor, !!loop);

        roamEntity = viewer.entities.add({
            _trackRoam: true,
            availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: built.start, stop: built.stop })]),
            position: built.property,
            point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT, outlineWidth: 0 }
        });

        isRoaming = true;
        roamTickListener = function () {
            if (!isRoaming) return;
            updateRoamingCamera(viewer.clock.currentTime, viewMode, eyeHeight);
        };
        viewer.clock.onTick.addEventListener(roamTickListener);
        updateRoamingCamera(viewer.clock.currentTime, viewMode, eyeHeight);
        setTrackInfo('路径漫游中 · ' + (viewMode === 'overhead' ? '鸟瞰' : '跟随') + '视角 (倍速 ' + speedFactor + 'x)');
    }

    function pausePathRoaming() {
        if (!isRoaming) return;
        viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
        setTrackInfo(viewer.clock.shouldAnimate ? '路径漫游继续...' : '路径漫游已暂停');
    }

    function createVehicleCanvas(icon, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color.toCssColorString();
        ctx.beginPath();
        ctx.arc(32, 32, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, 32, 34);
        return canvas;
    }

    function createPedestrianCanvas(icon) {
        return createVehicleCanvas(icon, Cesium.Color.LIME);
    }

    function stopSimulation() {
        isPlaying = false;
        if (!isRoaming) viewer.clock.shouldAnimate = false;
        if (!isRoaming) viewer.trackedEntity = undefined;
        if (animationEntity) {
            viewer.entities.remove(animationEntity);
            animationEntity = null;
        }
    }

    function clearTrack(clearPoints) {
        stopDrawTrack();
        stopPathRoaming();
        stopSimulation();
        clearDrawGraphics();
        removeTrackEntities(pathMarkerEntities);
        if (pathEntity) {
            viewer.entities.remove(pathEntity);
            pathEntity = null;
        }
        if (clearPoints !== false) {
            trackPoints = [];
            setTrackInfo('');
            clearLocalModel();
        }
    }

    function pauseSimulation() {
        if (!isPlaying) return;
        viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
        setTrackInfo(viewer.clock.shouldAnimate ? '模拟继续...' : '模拟已暂停');
    }

    function onPanelDeactivate() {
        stopDrawTrack();
    }

    return {
        init: init,
        setMode: setMode,
        startDrawTrack: startDrawTrack,
        undoDrawPoint: undoDrawPoint,
        finishDrawTrack: finishDrawTrack,
        cancelDrawTrack: cancelDrawTrack,
        onModelFileChange: onModelFileChange,
        clearLocalModel: clearLocalModel,
        loadTrack: loadTrack,
        createDemoTrack: createDemoTrack,
        startSimulation: startSimulation,
        stopSimulation: stopSimulation,
        pauseSimulation: pauseSimulation,
        startPathRoaming: startPathRoaming,
        stopPathRoaming: stopPathRoaming,
        pausePathRoaming: pausePathRoaming,
        clearTrack: clearTrack,
        onPanelDeactivate: onPanelDeactivate
    };
})();
