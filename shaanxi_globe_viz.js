/**
 * 陕西行政区 3D 可视化（可嵌入 cesium_3d_map）
 * 依赖: Cesium, turf
 */
const ShaanxiGlobeViz = (function () {
    'use strict';

    const WALL_IMAGE = 'globe/grawall2.png';
    const RING_INNER_IMAGE = 'globe/11.png';
    const RING_OUTER_IMAGE = 'globe/22.png';
    const VIZ_BACKGROUND_IMAGE = 'Cesium/11.jpg';
    const RING_INNER_TINT = '#00d4ff';
    const RING_OUTER_TINT = '#33e0ff';
    const WALL_DEPTH = {
        province: { factor: 0.095, min: 70000, max: 130000 },
        city: { factor: 0.115, min: 12000, max: 48000 }
    };

    const SHAANXI_VIEW = { west: 105.49, south: 31.70, east: 111.27, north: 39.58 };

    const REGIONS = [
        { adcode: '610000', name: '陕西省', image: 'globe/sx.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610000.json', isProvince: true },
        { adcode: '610100', name: '西安市', image: 'globe/XAS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610100.json' },
        { adcode: '610200', name: '铜川市', image: 'globe/TCS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610200.json' },
        { adcode: '610300', name: '宝鸡市', image: 'globe/BJS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610300.json' },
        { adcode: '610400', name: '咸阳市', image: 'globe/XYS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610400.json' },
        { adcode: '610500', name: '渭南市', image: 'globe/WNS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610500.json' },
        { adcode: '610600', name: '延安市', image: 'globe/YAS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610600.json' },
        { adcode: '610700', name: '汉中市', image: 'globe/HZS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610700.json' },
        { adcode: '610800', name: '榆林市', image: 'globe/YLS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610800.json' },
        { adcode: '610900', name: '安康市', image: 'globe/AKS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/610900.json' },
        { adcode: '611000', name: '商洛市', image: 'globe/SLS.png', geoUrl: 'https://yaojindou0.github.io/geojsons/bound/611000.json' }
    ];

    const VIZ_CAMERA = {
        provinceHeading: 5,
        cityHeading: 10,
        provincePitch: -43,
        cityPitch: -40,
        minPitchDeg: -90,
        maxPitchDeg: -30
    };

    const GEO_BASE = 'https://yaojindou0.github.io/geojsons/bound/';
    const BOUNDARY_COLORS = {
        city: { line: '#00e5ff', hover: '#00a8ff' },
        county: { line: '#ffffff', hover: '#4fc3ff' }
    };

    let viewer = null;
    let regionEntries = [];
    let boundaryEntries = [];
    let hoveredBoundary = null;
    let hoveredLayerEntity = null;
    let ringState = null;
    let hoverHandler = null;
    let selectionGuard = null;
    let cameraConstraintListener = null;
    let vizCameraHeading = 0;
    let vizTransformCenter = null;
    let vizTransformRange = 0;
    let vizTransformLocked = false;
    let vizFlying = false;
    let ringPreUpdateHooked = false;
    let lastRingTickMs = null;
    let activeAdcode = '610000';
    let vizMode = false;
    let loaded = false;
    let savedSceneState = null;
    let savedInteractionState = null;
    let cachedProvinceCities = null;
    const cachedCountyFeatures = {};

    async function init(viewerInstance) {
        viewer = viewerInstance;
        disableAllDoubleClick();
        buildRegionSelect();
        await loadAllRegions();
    }

    function disableAllDoubleClick() {
        if (!viewer || viewer._doubleClickDisabled) return;
        viewer._doubleClickDisabled = true;
        const handler = viewer.cesiumWidget && viewer.cesiumWidget.screenSpaceEventHandler;
        if (handler) {
            handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        }
        function blockDoubleClick(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
        viewer.canvas.addEventListener('dblclick', blockDoubleClick, true);
        if (viewer.cesiumWidget && viewer.cesiumWidget.container) {
            viewer.cesiumWidget.container.addEventListener('dblclick', blockDoubleClick, true);
        }
    }

    function buildRegionSelect() {
        const sel = document.getElementById('viz-region-select');
        if (!sel) return;
        sel.innerHTML = REGIONS.map(function (r) {
            return '<option value="' + r.adcode + '"' + (r.adcode === activeAdcode ? ' selected' : '') + '>' + r.name + '</option>';
        }).join('');
    }

    function showVizBackground() {
        const el = document.getElementById('viz-scene-bg');
        if (!el) return;
        el.style.backgroundImage = 'url("' + VIZ_BACKGROUND_IMAGE + '")';
        el.style.display = 'block';
    }

    function hideVizBackground() {
        const el = document.getElementById('viz-scene-bg');
        if (el) el.style.display = 'none';
    }

    function saveSceneState() {
        const scene = viewer.scene;
        savedSceneState = {
            globe: scene.globe.show,
            skyBox: scene.skyBox && scene.skyBox.show,
            sun: scene.sun && scene.sun.show,
            moon: scene.moon && scene.moon.show,
            atmosphere: scene.skyAtmosphere && scene.skyAtmosphere.show,
            fog: scene.fog.enabled,
            backgroundColor: scene.backgroundColor.clone(),
            hadImagery: viewer.imageryLayers.length > 0
        };
    }

    function setupVizScene() {
        const scene = viewer.scene;
        scene.globe.show = false;
        if (scene.skyBox) scene.skyBox.show = false;
        if (scene.sun) scene.sun.show = false;
        if (scene.moon) scene.moon.show = false;
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
        scene.fog.enabled = false;
        scene.backgroundColor = Cesium.Color.TRANSPARENT;
        viewer.imageryLayers.removeAll();
        showVizBackground();
    }

    function restoreSceneState() {
        hideVizBackground();
        if (!savedSceneState) return;
        const scene = viewer.scene;
        scene.globe.show = savedSceneState.globe;
        if (scene.skyBox) scene.skyBox.show = savedSceneState.skyBox;
        if (scene.sun) scene.sun.show = savedSceneState.sun;
        if (scene.moon) scene.moon.show = savedSceneState.moon;
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = savedSceneState.atmosphere;
        scene.fog.enabled = savedSceneState.fog;
        scene.backgroundColor = savedSceneState.backgroundColor;
        if (savedSceneState.hadImagery && typeof switchBasemap === 'function') {
            const type = (typeof CesiumMapUI !== 'undefined' && CesiumMapUI.getCurrentBasemap)
                ? CesiumMapUI.getCurrentBasemap() : 'tdt_img';
            switchBasemap(type);
            if (typeof applyBasemapLayerStyle === 'function') applyBasemapLayerStyle(type);
        }
        savedSceneState = null;
    }

    function enableVizMode() {
        if (vizMode) {
            locateActiveRegion();
            return;
        }
        vizMode = true;
        saveSceneState();
        setupVizScene();
        lockVizInteraction();
        bindHoverHandler();
        bindSelectionGuard();
        bindCameraConstraints();
        if (typeof CesiumLayerManager !== 'undefined') {
            CesiumLayerManager.clearLayerSelection();
            CesiumLayerManager.refreshVizVectorLayers();
        }
        switchRegion(activeAdcode, false);
        requestAnimationFrame(function () {
            setTimeout(function () {
                const entry = getEntry(activeAdcode);
                if (entry) flyToRegion(entry);
            }, 120);
        });
    }

    function disableVizMode() {
        if (!vizMode) return;
        vizMode = false;
        releaseVizCameraTransform();
        hideVizLayerPopup();
        unbindHoverHandler();
        unbindSelectionGuard();
        unbindCameraConstraints();
        unlockVizInteraction();
        clearBoundaryOverlays();
        destroyBottomRings();
        regionEntries.forEach(function (entry) { setRegionVisible(entry, false); });
        if (typeof CesiumLayerManager !== 'undefined') {
            CesiumLayerManager.refreshAllVectorStyles();
        }
        restoreSceneState();
    }

    function isVizMode() { return vizMode; }

    function lockVizInteraction() {
        if (!viewer || savedInteractionState) return;
        const c = viewer.scene.screenSpaceCameraController;
        const cam = viewer.camera;
        savedInteractionState = {
            enableInputs: c.enableInputs,
            enableRotate: c.enableRotate,
            enableTranslate: c.enableTranslate,
            enableZoom: c.enableZoom,
            enableTilt: c.enableTilt,
            enableLook: c.enableLook,
            minimumPitch: c.minimumPitch,
            maximumPitch: c.maximumPitch,
            constrainedAxis: cam.constrainedAxis ? Cesium.Cartesian3.clone(cam.constrainedAxis) : undefined,
            infoBoxDisplay: viewer.infoBox && viewer.infoBox.container
                ? viewer.infoBox.container.style.display : '',
            selectionDisplay: (viewer.selectionIndicator && viewer.selectionIndicator.viewModel
                && viewer.selectionIndicator.viewModel.selectionIndicatorElement)
                ? viewer.selectionIndicator.viewModel.selectionIndicatorElement.style.display : ''
        };
        c.enableInputs = true;
        c.enableRotate = true;
        c.enableTranslate = false;
        c.enableZoom = false;
        c.enableTilt = true;
        c.enableLook = false;
        c.minimumPitch = Cesium.Math.toRadians(VIZ_CAMERA.minPitchDeg);
        c.maximumPitch = Cesium.Math.toRadians(VIZ_CAMERA.maxPitchDeg);
        if (viewer.infoBox && viewer.infoBox.container) {
            viewer.infoBox.container.style.display = 'none';
        }
        const selEl = viewer.selectionIndicator && viewer.selectionIndicator.viewModel
            ? viewer.selectionIndicator.viewModel.selectionIndicatorElement : null;
        if (selEl) selEl.style.display = 'none';
        viewer.selectedEntity = undefined;
        disableAllDoubleClick();
    }

    function unlockVizInteraction() {
        if (!viewer || !savedInteractionState) return;
        const c = viewer.scene.screenSpaceCameraController;
        const cam = viewer.camera;
        const s = savedInteractionState;
        c.enableInputs = s.enableInputs;
        c.enableRotate = s.enableRotate;
        c.enableTranslate = s.enableTranslate;
        c.enableZoom = s.enableZoom;
        c.enableTilt = s.enableTilt;
        c.enableLook = s.enableLook;
        c.minimumPitch = s.minimumPitch;
        c.maximumPitch = s.maximumPitch;
        cam.constrainedAxis = s.constrainedAxis;
        if (viewer.infoBox && viewer.infoBox.container) {
            viewer.infoBox.container.style.display = s.infoBoxDisplay;
        }
        const selEl = viewer.selectionIndicator && viewer.selectionIndicator.viewModel
            ? viewer.selectionIndicator.viewModel.selectionIndicatorElement : null;
        if (selEl) selEl.style.display = s.selectionDisplay;
        savedInteractionState = null;
    }

    function getViewPadding() {
        const left = document.body.classList.contains('layer-panel-open') ? 420 : 70;
        const right = (typeof CesiumMapUI !== 'undefined') ? CesiumMapUI.getRightPadding() : 200;
        return { left: left, top: 50, right: right, bottom: 56 };
    }

    function coordsToCartesian(coords, height) {
        height = height || 0;
        if (height === 0) {
            const flat = [];
            coords.forEach(function (c) { flat.push(c[0], c[1]); });
            return Cesium.Cartesian3.fromDegreesArray(flat);
        }
        const flat = [];
        coords.forEach(function (c) { flat.push(c[0], c[1], height); });
        return Cesium.Cartesian3.fromDegreesArrayHeights(flat);
    }

    function getLargestPolygon(geometry) {
        if (geometry.type === 'Polygon') return geometry.coordinates;
        if (geometry.type === 'MultiPolygon') {
            let largest = geometry.coordinates[0];
            let maxLen = largest[0].length;
            geometry.coordinates.forEach(function (poly) {
                if (poly[0].length > maxLen) { largest = poly; maxLen = poly[0].length; }
            });
            return largest;
        }
        return null;
    }

    function polygonCoordsToHierarchy(polyCoords) {
        const outer = coordsToCartesian(polyCoords[0]);
        if (polyCoords.length <= 1) {
            return new Cesium.PolygonHierarchy(outer);
        }
        const holes = polyCoords.slice(1).map(function (ring) {
            return new Cesium.PolygonHierarchy(coordsToCartesian(ring));
        });
        return new Cesium.PolygonHierarchy(outer, holes);
    }

    function normalizeFeatureToPolygons(feature) {
        const result = [];
        if (!feature || !feature.geometry) return result;

        function pushOuterRings(geom) {
            if (geom.type === 'Polygon' && geom.coordinates[0]) {
                result.push([geom.coordinates[0]]);
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(function (poly) {
                    if (poly[0]) result.push([poly[0]]);
                });
            }
        }

        if (typeof turf === 'undefined') {
            pushOuterRings(feature.geometry);
            return result;
        }

        try {
            let feat = feature;
            try {
                feat = turf.buffer(feature, 0, { units: 'kilometers' });
            } catch (bufErr) { /* keep original */ }

            let flat;
            if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
                try {
                    flat = turf.flatten(turf.unkinkPolygon(feat));
                } catch (unkinkErr) {
                    flat = turf.flatten(feat);
                }
            } else {
                flat = turf.flatten(feat);
            }

            flat.features.forEach(function (f) {
                if (!f.geometry || f.geometry.type !== 'Polygon' || !f.geometry.coordinates[0]) return;
                const rewound = turf.rewind(f, { reverse: false });
                const outer = rewound.geometry.coordinates[0];
                if (outer.length >= 4) result.push([outer]);
            });
        } catch (e) {
            console.warn('normalizeFeatureToPolygons', feature.properties && feature.properties.name, e);
            pushOuterRings(feature.geometry);
        }
        return result;
    }

    function geometryToFullHierarchy(geometry) {
        if (!geometry) return null;
        if (geometry.type === 'Polygon') {
            return polygonCoordsToHierarchy(geometry.coordinates);
        }
        if (geometry.type === 'MultiPolygon') {
            const polys = geometry.coordinates;
            if (!polys || !polys.length) return null;
            if (polys.length === 1) return polygonCoordsToHierarchy(polys[0]);
            const first = polys[0];
            const outer = coordsToCartesian(first[0]);
            const holes = first.slice(1).map(function (ring) {
                return new Cesium.PolygonHierarchy(coordsToCartesian(ring));
            });
            const children = polys.slice(1).map(polygonCoordsToHierarchy);
            return new Cesium.PolygonHierarchy(outer, holes, children);
        }
        return null;
    }

    function getAllOuterRings(geometry) {
        const rings = [];
        if (!geometry) return rings;
        if (geometry.type === 'Polygon') {
            if (geometry.coordinates[0]) rings.push(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(function (poly) {
                if (poly[0]) rings.push(poly[0]);
            });
        }
        return rings;
    }

    function geometryToHierarchy(geometry) {
        const poly = getLargestPolygon(geometry);
        if (!poly) return null;
        return polygonCoordsToHierarchy(poly);
    }

    function getOuterRingDegrees(geometry) {
        const poly = getLargestPolygon(geometry);
        if (!poly) return [];
        return poly[0];
    }

    function lngLatToSt(lng, lat, bbox) {
        const spanLng = bbox.east - bbox.west;
        const spanLat = bbox.north - bbox.south;
        const s = spanLng > 0 ? (lng - bbox.west) / spanLng : 0;
        const t = spanLat > 0 ? (lat - bbox.south) / spanLat : 0;
        return new Cesium.Cartesian2(
            Cesium.Math.clamp(s, 0, 1),
            Cesium.Math.clamp(t, 0, 1)
        );
    }

    function ringToStHierarchy(ring, bbox) {
        return ring.map(function (c) {
            return lngLatToSt(c[0], c[1], bbox);
        });
    }

    function polygonCoordsToStHierarchy(polyCoords, bbox) {
        const outer = ringToStHierarchy(polyCoords[0], bbox);
        if (polyCoords.length <= 1) {
            return new Cesium.PolygonHierarchy(outer);
        }
        const holes = polyCoords.slice(1).map(function (ring) {
            return new Cesium.PolygonHierarchy(ringToStHierarchy(ring, bbox));
        });
        return new Cesium.PolygonHierarchy(outer, holes);
    }

    function geometryToFullStHierarchy(geometry, bbox) {
        if (!geometry || !bbox) return null;
        if (geometry.type === 'Polygon') {
            return polygonCoordsToStHierarchy(geometry.coordinates, bbox);
        }
        if (geometry.type === 'MultiPolygon') {
            const polys = geometry.coordinates;
            if (!polys || !polys.length) return null;
            if (polys.length === 1) return polygonCoordsToStHierarchy(polys[0], bbox);
            const first = polys[0];
            const outer = ringToStHierarchy(first[0], bbox);
            const holes = first.slice(1).map(function (ring) {
                return new Cesium.PolygonHierarchy(ringToStHierarchy(ring, bbox));
            });
            const children = polys.slice(1).map(function (poly) {
                return polygonCoordsToStHierarchy(poly, bbox);
            });
            return new Cesium.PolygonHierarchy(outer, holes, children);
        }
        return null;
    }

    function getBbox(geometry) {
        const coords = [];
        function collect(arr) {
            if (typeof arr[0] === 'number') coords.push(arr);
            else arr.forEach(collect);
        }
        if (geometry.type === 'Polygon') geometry.coordinates.forEach(collect);
        else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(function (p) { p.forEach(collect); });

        const lngs = coords.map(function (c) { return c[0]; });
        const lats = coords.map(function (c) { return c[1]; });
        return {
            west: Math.min.apply(null, lngs),
            east: Math.max.apply(null, lngs),
            south: Math.min.apply(null, lats),
            north: Math.max.apply(null, lats)
        };
    }

    function getCentroid(geometry, props) {
        if (props && props.centroid) return { lng: props.centroid[0], lat: props.centroid[1] };
        if (props && props.center) return { lng: props.center[0], lat: props.center[1] };
        const bbox = getBbox(geometry);
        return { lng: (bbox.west + bbox.east) / 2, lat: (bbox.south + bbox.north) / 2 };
    }

    function bboxSpanMeters(bbox) {
        const midLat = (bbox.south + bbox.north) / 2;
        const lonSpan = (bbox.east - bbox.west) * 111319.9 * Math.cos(Cesium.Math.toRadians(midLat));
        const latSpan = (bbox.north - bbox.south) * 111319.9;
        return Math.max(lonSpan, latSpan);
    }

    function computeWallDepth(bbox, isProvince) {
        const span = bboxSpanMeters(bbox);
        const cfg = isProvince ? WALL_DEPTH.province : WALL_DEPTH.city;
        return Cesium.Math.clamp(span * cfg.factor, cfg.min, cfg.max);
    }

    function computeWallRepeat(wallRing, wallDepth) {
        const perimeter = wallRing.length;
        const horizontal = Math.max(8, perimeter / 45);
        const vertical = Cesium.Math.clamp(wallDepth / 12000, 1, 5);
        return new Cesium.Cartesian2(horizontal, vertical);
    }

    function computeRegionVisualPoints(entry) {
        const bbox = entry.bbox;
        const wallDepth = entry.wallDepth;
        const layout = computeRingLayout(entry);
        const points = [];

        function pushDeg(lng, lat, height) {
            points.push(Cesium.Cartesian3.fromDegrees(lng, lat, height));
        }

        const corners = [
            [bbox.west, bbox.south], [bbox.east, bbox.south],
            [bbox.east, bbox.north], [bbox.west, bbox.north]
        ];
        const heights = [0, -wallDepth, layout.baseHeight];

        heights.forEach(function (h) {
            corners.forEach(function (c) {
                pushDeg(c[0], c[1], h);
            });
        });

        const latRad = Cesium.Math.toRadians(layout.centerLat);
        const mPerDegLon = 111319.9 * Math.cos(latRad);
        const mPerDegLat = 111319.9;
        const ringR = layout.outerRadius;
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            pushDeg(
                layout.centerLng + (Math.cos(a) * ringR) / mPerDegLon,
                layout.centerLat + (Math.sin(a) * ringR) / mPerDegLat,
                layout.baseHeight
            );
        }

        return points;
    }

    function getViewVerticalBounds() {
        const pad = getViewPadding();
        const canvas = viewer.canvas;
        const top = pad.top;
        const bottom = canvas.clientHeight - pad.bottom;
        return { top: top, bottom: bottom, height: bottom - top };
    }

    function measureContentScreenBounds(points, center, heading, pitch, range) {
        const cam = viewer.camera;
        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
        cam.lookAtTransform(transform, new Cesium.HeadingPitchRange(heading, pitch, range));

        let minY = Infinity;
        let maxY = -Infinity;
        points.forEach(function (p) {
            const s = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, p);
            if (!s || !Cesium.defined(s)) return;
            minY = Math.min(minY, s.y);
            maxY = Math.max(maxY, s.y);
        });

        if (!isFinite(minY)) {
            return null;
        }
        return { minY: minY, maxY: maxY, span: maxY - minY };
    }

    function computeVerticalFitRange(entry, center, heading, pitch, hintRange) {
        const points = computeRegionVisualPoints(entry);
        const vb = getViewVerticalBounds();
        const cam = viewer.camera;
        const prevPos = cam.positionWC.clone();
        const prevDir = cam.directionWC.clone();
        const prevUp = cam.upWC.clone();

        const bs = Cesium.BoundingSphere.fromPoints(points);
        let lo = hintRange ? hintRange * 0.72 : Math.max(bs.radius * 0.8, 1000);
        let hi = hintRange ? hintRange * 1.35 : bs.radius * 30;

        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) * 0.5;
            const m = measureContentScreenBounds(points, center, heading, pitch, mid);
            if (!m) break;
            if (m.span > vb.height) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        let bestRange = hi;
        let bestErr = Infinity;
        for (let i = 0; i <= 8; i++) {
            const r = lo + (hi - lo) * (i / 8);
            const m = measureContentScreenBounds(points, center, heading, pitch, r);
            if (!m) continue;
            const err = Math.abs(m.minY - vb.top) + Math.abs(m.maxY - vb.bottom);
            if (err < bestErr) {
                bestErr = err;
                bestRange = r;
            }
        }

        cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
        cam.setView({
            destination: prevPos,
            orientation: { direction: prevDir, up: prevUp }
        });

        return bestRange;
    }

    function computeRegionVisualBoundingSphere(entry, lngShift) {
        lngShift = lngShift || 0;
        const points = computeRegionVisualPoints(entry);
        const bs = Cesium.BoundingSphere.fromPoints(points);
        if (Math.abs(lngShift) < 1e-9) {
            return bs;
        }

        const carto = Cesium.Cartographic.fromCartesian(bs.center);
        const shiftM = lngShift * 111319.9 * Math.cos(carto.latitude);
        carto.longitude += Cesium.Math.toRadians(lngShift);
        const shiftedCenter = Cesium.Cartographic.toCartesian(carto);
        const radius = bs.radius + Math.abs(shiftM) * 0.5;
        return new Cesium.BoundingSphere(shiftedCenter, radius);
    }

    function getCameraLngShift(entry) {
        const pad = getViewPadding();
        const canvas = viewer.canvas;
        const shiftRatio = (pad.left - pad.right) / Math.max(canvas.clientWidth, 1);
        return (entry.bbox.east - entry.bbox.west) * shiftRatio * 0.45;
    }

    function getVizHeadingRad(entry) {
        const deg = entry && entry.isProvince ? VIZ_CAMERA.provinceHeading : VIZ_CAMERA.cityHeading;
        return Cesium.Math.toRadians(deg);
    }

    function getVizPitchRad(entry) {
        const deg = entry && entry.isProvince ? VIZ_CAMERA.provincePitch : VIZ_CAMERA.cityPitch;
        return Cesium.Math.toRadians(deg);
    }

    function getRegionTransformCenter(entry) {
        const lngShift = getCameraLngShift(entry);
        return computeRegionVisualBoundingSphere(entry, lngShift).center;
    }

    function applyVizCameraTransform(entry, heading, pitch) {
        if (!viewer || !entry) return;
        const cam = viewer.camera;
        const center = getRegionTransformCenter(entry);
        const disRange = computeVerticalFitRange(entry, center, heading, pitch, 0);
        cam.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
        cam.lookAtTransform(transform, new Cesium.HeadingPitchRange(heading, pitch, disRange));
        vizTransformCenter = Cesium.Cartesian3.clone(center);
        vizTransformRange = disRange;
        vizTransformLocked = true;
    }

    function releaseVizCameraTransform() {
        if (!viewer) return;
        vizTransformLocked = false;
        vizTransformCenter = null;
        vizTransformRange = 0;
        vizFlying = false;
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    function applyVizCameraConstraints() {
        if (!viewer || !vizMode || vizFlying) return;
        const cam = viewer.camera;
        const minPitch = Cesium.Math.toRadians(VIZ_CAMERA.minPitchDeg);
        const maxPitch = Cesium.Math.toRadians(VIZ_CAMERA.maxPitchDeg);
        const pitch = Cesium.Math.clamp(cam.pitch, minPitch, maxPitch);
        const heading = cam.heading;

        if (vizTransformLocked && vizTransformCenter) {
            if (Math.abs(cam.pitch - pitch) > 0.001) {
                const transform = Cesium.Transforms.eastNorthUpToFixedFrame(vizTransformCenter);
                cam.lookAtTransform(
                    transform,
                    new Cesium.HeadingPitchRange(cam.heading, pitch, vizTransformRange)
                );
            }
            return;
        }

        const roll = 0;
        if (Math.abs(cam.pitch - pitch) > 0.001 ||
            Math.abs(cam.heading - heading) > 0.001 ||
            Math.abs(cam.roll - roll) > 0.001) {
            cam.setView({
                destination: cam.positionWC,
                orientation: { heading: heading, pitch: pitch, roll: roll }
            });
        }
    }

    function bindCameraConstraints() {
        if (cameraConstraintListener || !viewer) return;
        cameraConstraintListener = viewer.camera.changed.addEventListener(function () {
            applyVizCameraConstraints();
        });
    }

    function unbindCameraConstraints() {
        if (cameraConstraintListener) {
            cameraConstraintListener();
            cameraConstraintListener = null;
        }
    }

    async function loadGeoJson(url, isProvince) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('加载失败: ' + url);
        const fc = await resp.json();
        if (isProvince) {
            let feature = null;
            if (fc.features && fc.features.length) {
                feature = fc.features.find(function (f) {
                    const props = f.properties || {};
                    const ad = props.adcode != null ? String(props.adcode) : '';
                    return ad === '610000' || props.level === 'province';
                }) || fc.features[0];
            }
            if (!feature || !feature.geometry) throw new Error('未找到省级边界: ' + url);
            return { geometry: feature.geometry, properties: feature.properties || {} };
        }
        const f = fc.features[0];
        return { geometry: f.geometry, properties: f.properties || {} };
    }

    function addRegionWallAndEdge(entities, region, wallRing, wallDepth) {
        if (!wallRing || wallRing.length <= 2) return;
        const wallPositions = coordsToCartesian(wallRing);
        const minH = new Array(wallPositions.length).fill(-wallDepth);
        const maxH = new Array(wallPositions.length).fill(0);
        entities.push(viewer.entities.add({
            name: region.name + '_wall',
            show: false,
            wall: {
                positions: wallPositions,
                minimumHeights: minH,
                maximumHeights: maxH,
                material: new Cesium.ImageMaterialProperty({
                    image: WALL_IMAGE,
                    color: Cesium.Color.fromCssColorString('#5ce1ff').withAlpha(0.92),
                    repeat: computeWallRepeat(wallRing, wallDepth)
                })
            }
        }));
        entities.push(viewer.entities.add({
            name: region.name + '_edge',
            show: false,
            polyline: {
                positions: wallPositions.concat([wallPositions[0]]),
                width: 2,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.25,
                    color: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.6)
                }),
                clampToGround: false
            }
        }));
    }

    function createRegionEntities(region, geometry, properties) {
        const entities = [];
        const bbox = getBbox(geometry);
        const wallDepth = computeWallDepth(bbox, !!region.isProvince);
        const hierarchy = geometryToFullHierarchy(geometry) || geometryToHierarchy(geometry);
        const stHierarchy = geometryToFullStHierarchy(geometry, bbox);
        const outerRings = getAllOuterRings(geometry);

        const polygonOpts = {
            hierarchy: hierarchy,
            height: 0,
            perPositionHeight: false,
            material: new Cesium.ImageMaterialProperty({
                image: region.image,
                transparent: false
            })
        };
        if (stHierarchy) polygonOpts.textureCoordinates = stHierarchy;

        const topEntity = viewer.entities.add({
            name: region.name + '_top',
            show: false,
            polygon: polygonOpts
        });
        entities.push(topEntity);

        if (hierarchy && outerRings.length) {
            outerRings.forEach(function (wallRing) {
                addRegionWallAndEdge(entities, region, wallRing, wallDepth);
            });
        }

        return {
            adcode: region.adcode,
            name: region.name,
            entities: entities,
            geometry: geometry,
            properties: properties,
            bbox: bbox,
            wallDepth: wallDepth,
            spanMeters: bboxSpanMeters(bbox),
            centroid: getCentroid(geometry, properties),
            isProvince: !!region.isProvince
        };
    }

    function computeRingLayout(entry) {
        const bbox = entry.bbox;
        const midLat = (bbox.south + bbox.north) / 2;
        const lonM = (bbox.east - bbox.west) * 111319.9 * Math.cos(Cesium.Math.toRadians(midLat));
        const latM = (bbox.north - bbox.south) * 111319.9;
        const halfDiag = Math.sqrt(lonM * lonM + latM * latM) * 0.5;
        const wallDepth = entry.wallDepth || 50000;
        return {
            centerLng: entry.centroid.lng,
            centerLat: entry.centroid.lat,
            innerRadius: halfDiag * 1.06 * 0.75,
            outerRadius: halfDiag * 1.26 * 0.75,
            baseHeight: -wallDepth * 0.88
        };
    }

    function destroyBottomRings() {
        if (ringState && ringState.entities) {
            ringState.entities.forEach(function (e) { viewer.entities.remove(e); });
        }
        ringState = null;
        lastRingTickMs = null;
    }

    function rotateBottomRings() {
        if (!vizMode || !ringState || !viewer) return;
        const nowMs = performance.now();
        if (lastRingTickMs != null) {
            const dt = (nowMs - lastRingTickMs) / 1000;
            ringState.angles[0] += ringState.speeds[0] * dt;
            ringState.angles[1] += ringState.speeds[1] * dt;
            viewer.scene.requestRender();
        }
        lastRingTickMs = nowMs;
    }

    function createRingEntity(ringIndex, image, radius, tintHex) {
        return viewer.entities.add({
            show: false,
            position: new Cesium.CallbackProperty(function () {
                if (!ringState) return Cesium.Cartesian3.ZERO;
                return Cesium.Cartesian3.fromDegrees(
                    ringState.centerLng,
                    ringState.centerLat,
                    ringState.baseHeight
                );
            }, false),
            ellipse: {
                semiMajorAxis: radius,
                semiMinorAxis: radius,
                height: new Cesium.CallbackProperty(function () {
                    return ringState ? ringState.baseHeight : 0;
                }, false),
                fill: true,
                outline: false,
                material: new Cesium.ImageMaterialProperty({
                    image: image,
                    transparent: true,
                    color: Cesium.Color.fromCssColorString(tintHex).withAlpha(0.92)
                }),
                stRotation: new Cesium.CallbackProperty(function () {
                    return ringState ? ringState.angles[ringIndex] : 0;
                }, false)
            }
        });
    }

    function createBottomRings(entry) {
        destroyBottomRings();
        if (!viewer || !entry) return;
        const layout = computeRingLayout(entry);
        ringState = {
            centerLng: layout.centerLng,
            centerLat: layout.centerLat,
            baseHeight: layout.baseHeight,
            innerRadius: layout.innerRadius,
            outerRadius: layout.outerRadius,
            angles: [0, 0],
            speeds: [-0.55, 0.72],
            entities: []
        };
        ringState.entities.push(createRingEntity(0, RING_INNER_IMAGE, layout.innerRadius, RING_INNER_TINT));
        ringState.entities.push(createRingEntity(1, RING_OUTER_IMAGE, layout.outerRadius, RING_OUTER_TINT));
        if (!ringPreUpdateHooked) {
            viewer.scene.preUpdate.addEventListener(rotateBottomRings);
            ringPreUpdateHooked = true;
        }
        setBottomRingsVisible(true);
        viewer.scene.requestRender();
    }

    function setBottomRingsVisible(visible) {
        if (!ringState) return;
        ringState.entities.forEach(function (e) { e.show = visible; });
    }

    function clearBoundaryOverlays() {
        if (hoveredBoundary) setBoundaryHighlight(hoveredBoundary, false);
        hoveredBoundary = null;
        boundaryEntries.forEach(function (item) {
            if (item._dataSource) {
                viewer.dataSources.remove(item._dataSource, true);
            }
            if (item.labelEntity) viewer.entities.remove(item.labelEntity);
        });
        boundaryEntries = [];
    }

    function setBoundaryHighlight(item, active) {
        if (!item) return;
        const palette = BOUNDARY_COLORS[item.level] || BOUNDARY_COLORS.county;
        const lineColor = active ? palette.hover : palette.line;
        const lineWidth = active ? (item.level === 'city' ? 3.5 : 2.5) : (item.level === 'city' ? 2 : 1.5);
        const fillColor = Cesium.Color.fromCssColorString(palette.hover).withAlpha(0.48);
        item.polygonEntities.forEach(function (entity) {
            if (!entity.polygon) return;
            entity.polygon.material = active ? fillColor : Cesium.Color.TRANSPARENT;
            entity.polygon.outlineWidth = lineWidth;
            entity.polygon.outlineColor = Cesium.Color.fromCssColorString(lineColor).withAlpha(active ? 0.95 : 0.72);
        });
        item.borderEntities.forEach(function (borderEntity) {
            borderEntity.polyline.width = lineWidth;
            borderEntity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
                glowPower: active ? 0.35 : 0.18,
                color: Cesium.Color.fromCssColorString(lineColor).withAlpha(active ? 0.95 : 0.72)
            });
        });
        item.labelEntity.label.fillColor = active
            ? Cesium.Color.fromCssColorString('#ffffff')
            : Cesium.Color.fromCssColorString('#e8f7ff');
        item.labelEntity.label.font = active
            ? 'bold 15px Microsoft YaHei,sans-serif'
            : 'bold 13px Microsoft YaHei,sans-serif';
    }

    async function createBoundaryItem(feature, level) {
        if (!feature || !feature.geometry) return null;
        const props = feature.properties || {};
        const centroid = getCentroid(feature.geometry, props);
        const palette = BOUNDARY_COLORS[level] || BOUNDARY_COLORS.county;
        const fillHeight = 40;
        const strokeColor = Cesium.Color.fromCssColorString(palette.line).withAlpha(0.72);

        const item = {
            adcode: String(props.adcode || props.name || ''),
            name: props.name || '',
            level: level,
            polygonEntities: [],
            borderEntities: [],
            labelEntity: null,
            _dataSource: null
        };

        const ds = await Cesium.GeoJsonDataSource.load(
            { type: 'FeatureCollection', features: [feature] },
            {
                clampToGround: false,
                stroke: strokeColor,
                fill: Cesium.Color.TRANSPARENT,
                strokeWidth: level === 'city' ? 2 : 1.5
            }
        );

        ds.entities.values.forEach(function (entity) {
            entity.show = true;
            entity._vizBoundary = item;
            entity.description = undefined;
            entity.name = undefined;
            if (entity.polygon) {
                entity.polygon.height = fillHeight;
                entity.polygon.perPositionHeight = false;
                entity.polygon.outline = true;
                entity.polygon.outlineColor = strokeColor;
                entity.polygon.outlineWidth = level === 'city' ? 2 : 1.5;
                entity.polygon.material = Cesium.Color.TRANSPARENT;
                item.polygonEntities.push(entity);
            } else if (entity.polyline) {
                entity.polyline.width = level === 'city' ? 2 : 1.5;
                entity.polyline.clampToGround = false;
                item.borderEntities.push(entity);
            }
        });

        viewer.dataSources.add(ds);
        item._dataSource = ds;

        item.labelEntity = viewer.entities.add({
            show: true,
            allowPicking: false,
            _vizBoundary: item,
            description: undefined,
            name: undefined,
            position: Cesium.Cartesian3.fromDegrees(centroid.lng, centroid.lat, fillHeight),
            label: {
                text: props.name || '',
                font: 'bold 13px Microsoft YaHei,sans-serif',
                fillColor: Cesium.Color.fromCssColorString('#e8f7ff'),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER
            }
        });
        return item;
    }

    function setBoundaryOverlaysVisible(visible) {
        boundaryEntries.forEach(function (item) {
            if (item._dataSource) item._dataSource.show = visible;
            item.polygonEntities.forEach(function (entity) { entity.show = visible; });
            item.borderEntities.forEach(function (entity) { entity.show = visible; });
            if (item.labelEntity) item.labelEntity.show = visible;
            if (!visible) {
                item.polygonEntities.forEach(function (entity) {
                    if (entity.polygon) entity.polygon.material = Cesium.Color.TRANSPARENT;
                });
            }
        });
    }

    async function loadProvinceCityFeatures() {
        if (cachedProvinceCities) return cachedProvinceCities;
        const features = [];
        for (let i = 0; i < REGIONS.length; i++) {
            const region = REGIONS[i];
            if (region.isProvince) continue;
            try {
                const resp = await fetch(region.geoUrl);
                if (!resp.ok) continue;
                const fc = await resp.json();
                const f = fc.features && fc.features[0];
                if (!f || !f.geometry) continue;
                f.properties = Object.assign({
                    name: region.name,
                    adcode: region.adcode
                }, f.properties || {});
                features.push(f);
            } catch (e) {
                console.warn('地市边界加载失败', region.name, e);
            }
        }
        cachedProvinceCities = features;
        return cachedProvinceCities;
    }

    async function loadCountyFeatures(adcode) {
        if (cachedCountyFeatures[adcode]) return cachedCountyFeatures[adcode];
        const resp = await fetch(GEO_BASE + adcode + '_full.json');
        if (!resp.ok) throw new Error('加载区县边界失败: ' + adcode);
        const fc = await resp.json();
        cachedCountyFeatures[adcode] = fc.features || [];
        return cachedCountyFeatures[adcode];
    }

    async function refreshBoundaryOverlays(adcode) {
        if (!viewer || !vizMode) return;
        clearBoundaryOverlays();
        try {
            if (adcode === '610000') {
                const features = await loadProvinceCityFeatures();
                for (let i = 0; i < features.length; i++) {
                    const item = await createBoundaryItem(features[i], 'city');
                    if (item) boundaryEntries.push(item);
                }
            } else {
                const features = await loadCountyFeatures(adcode);
                for (let i = 0; i < features.length; i++) {
                    const item = await createBoundaryItem(features[i], 'county');
                    if (item) boundaryEntries.push(item);
                }
            }
            setBoundaryOverlaysVisible(true);
            viewer.scene.requestRender();
        } catch (e) {
            console.warn('边界加载失败', e);
        }
    }

    function hideVizLayerPopup() {
        hoveredLayerEntity = null;
        const el = document.getElementById('viz-layer-popup');
        if (el) el.style.display = 'none';
    }

    function positionVizLayerPopup(screenPosition) {
        const el = document.getElementById('viz-layer-popup');
        const container = document.getElementById('cesiumContainer');
        if (!el || !container || !screenPosition) return;
        requestAnimationFrame(function () {
            let left = screenPosition.x + 14;
            let top = screenPosition.y - 14;
            const maxLeft = container.clientWidth - el.offsetWidth - 8;
            const maxTop = container.clientHeight - el.offsetHeight - 8;
            left = Cesium.Math.clamp(left, 8, Math.max(8, maxLeft));
            top = Cesium.Math.clamp(top, 8, Math.max(8, maxTop));
            el.style.left = left + 'px';
            el.style.top = top + 'px';
        });
    }

    function showVizLayerPopup(entity, screenPosition) {
        const el = document.getElementById('viz-layer-popup');
        if (!el || typeof CesiumLayerManager === 'undefined') return;
        if (entity !== hoveredLayerEntity) {
            hoveredLayerEntity = entity;
            el.innerHTML = CesiumLayerManager.buildEntityPropertiesHtml(entity);
        }
        el.style.display = 'block';
        positionVizLayerPopup(screenPosition);
    }

    function pickLayerPointAt(position) {
        if (typeof CesiumLayerManager === 'undefined') return null;
        return CesiumLayerManager.pickHoverPointAt(position);
    }

    function resetVizCursor() {
        if (viewer && viewer.scene && viewer.scene.canvas) {
            viewer.scene.canvas.style.cursor = '';
        }
    }

    function pickBoundaryAt(position) {
        const pickedObjects = viewer.scene.drillPick(position, 6);
        for (let i = 0; i < pickedObjects.length; i++) {
            const obj = pickedObjects[i];
            if (obj.id && obj.id._vizBoundary) return obj.id._vizBoundary;
        }
        return null;
    }

    function pickBoundary(movement) {
        return pickBoundaryAt(movement.endPosition);
    }

    function isBoundaryPick(position) {
        return !!pickBoundaryAt(position);
    }

    function bindSelectionGuard() {
        if (selectionGuard || !viewer) return;
        selectionGuard = viewer.selectedEntityChanged.addEventListener(function () {
            if (!vizMode) return;
            if (viewer.selectedEntity) viewer.selectedEntity = undefined;
        });
    }

    function unbindSelectionGuard() {
        if (selectionGuard) {
            selectionGuard();
            selectionGuard = null;
        }
    }

    function bindHoverHandler() {
        if (hoverHandler || !viewer) return;
        hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        hoverHandler.setInputAction(function (movement) {
            if (!vizMode) return;
            const layerPoint = pickLayerPointAt(movement.endPosition);
            if (layerPoint) {
                if (hoveredBoundary) {
                    setBoundaryHighlight(hoveredBoundary, false);
                    hoveredBoundary = null;
                }
                showVizLayerPopup(layerPoint, movement.endPosition);
                viewer.scene.canvas.style.cursor = 'pointer';
            } else {
                hideVizLayerPopup();
                const next = pickBoundary(movement);
                viewer.scene.canvas.style.cursor = next ? 'pointer' : '';
                if (next === hoveredBoundary) return;
                if (hoveredBoundary) setBoundaryHighlight(hoveredBoundary, false);
                hoveredBoundary = next;
                if (hoveredBoundary) setBoundaryHighlight(hoveredBoundary, true);
            }
            viewer.scene.requestRender();
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        hoverHandler.setInputAction(function (click) {
            if (!vizMode) return;
            if (isBoundaryPick(click.position)) {
                viewer.selectedEntity = undefined;
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        hoverHandler.setInputAction(function () {
            /* 禁用双击 */
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    function unbindHoverHandler() {
        if (hoverHandler) {
            hoverHandler.destroy();
            hoverHandler = null;
        }
        hideVizLayerPopup();
        resetVizCursor();
    }

    async function loadAllRegions() {
        for (let i = 0; i < REGIONS.length; i++) {
            const region = REGIONS[i];
            try {
                const data = await loadGeoJson(region.geoUrl, region.isProvince);
                const entry = createRegionEntities(region, data.geometry, data.properties);
                regionEntries.push(entry);
            } catch (e) {
                console.error(region.name, e);
            }
        }
        loaded = true;
    }

    function setRegionVisible(entry, visible) {
        entry.entities.forEach(function (e) { e.show = visible; });
    }

    function getEntry(adcode) {
        return regionEntries.find(function (e) { return e.adcode === adcode; });
    }

    function onRegionSelectChange() {
        const sel = document.getElementById('viz-region-select');
        if (!sel) return;
        switchRegion(sel.value, true);
    }

    function switchRegion(adcode, fly) {
        activeAdcode = adcode;
        const sel = document.getElementById('viz-region-select');
        if (sel && sel.value !== adcode) sel.value = adcode;

        if (vizMode) {
            regionEntries.forEach(function (entry) {
                setRegionVisible(entry, entry.adcode === adcode);
            });
            const current = getEntry(adcode);
            if (current) {
                createBottomRings(current);
                refreshBoundaryOverlays(adcode);
            }
            if (current && fly !== false) flyToRegion(current);
        }
    }

    function flyToRegion(entry) {
        if (!viewer || !entry) return;
        vizCameraHeading = getVizHeadingRad(entry);
        releaseVizCameraTransform();
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

        const lngShift = getCameraLngShift(entry);
        const bs = computeRegionVisualBoundingSphere(entry, lngShift);
        const pitch = getVizPitchRad(entry);
        vizFlying = true;

        viewer.camera.flyToBoundingSphere(bs, {
            duration: 1.5,
            offset: new Cesium.HeadingPitchRange(
                vizCameraHeading,
                pitch,
                0
            ),
            complete: function () {
                vizFlying = false;
                applyVizCameraTransform(entry, vizCameraHeading, pitch);
                viewer.scene.requestRender();
            },
            cancel: function () {
                vizFlying = false;
            }
        });
    }

    function locateActiveRegion() {
        if (!loaded) return;
        if (!vizMode) enableVizMode();
        const entry = getEntry(activeAdcode);
        if (entry) flyToRegion(entry);
    }

    function flyToHome() {
        if (!viewer) return;
        if (vizMode && loaded) {
            const entry = getEntry('610000');
            if (entry) flyToRegion(entry);
            return;
        }
        viewer.camera.flyTo({
            destination: Cesium.Rectangle.fromDegrees(
                SHAANXI_VIEW.west, SHAANXI_VIEW.south,
                SHAANXI_VIEW.east, SHAANXI_VIEW.north
            ),
            duration: 1.2
        });
    }

    function setHomeView() {
        if (!viewer) return;
        viewer.camera.setView({
            destination: Cesium.Rectangle.fromDegrees(
                SHAANXI_VIEW.west, SHAANXI_VIEW.south,
                SHAANXI_VIEW.east, SHAANXI_VIEW.north
            )
        });
    }

    function resetView() {
        flyToHome();
    }

    function fitRegionInView() {
        if (!vizMode) return;
        const entry = getEntry(activeAdcode);
        if (entry) {
            createBottomRings(entry);
            flyToRegion(entry);
        }
    }

    return {
        init: init,
        enableVizMode: enableVizMode,
        disableVizMode: disableVizMode,
        isVizMode: isVizMode,
        switchRegion: switchRegion,
        onRegionSelectChange: onRegionSelectChange,
        locateActiveRegion: locateActiveRegion,
        resetView: resetView,
        fitRegionInView: fitRegionInView,
        flyToHome: flyToHome,
        setHomeView: setHomeView,
        getRegions: function () { return REGIONS; },
        getActiveAdcode: function () { return activeAdcode; }
    };
})();
