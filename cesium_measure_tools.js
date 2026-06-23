/**
 * Cesium 测量与坐标工具
 */
const CesiumMeasureTools = (function () {
    'use strict';

    let viewer = null;
    let handler = null;
    let activeTool = null;
    let measureEntities = [];
    let pickMarkers = [];
    let locateEntity = null;
    let globeVisible = true;
    let savedGlobeState = null;

    const TOOLS = {
        pick: 'pick',
        planarDistance: 'planarDistance',
        groundDistance: 'groundDistance',
        planarArea: 'planarArea',
        groundArea: 'groundArea'
    };

    function init(viewerInstance) {
        viewer = viewerInstance;
        destroyHandler();
    }

    function destroyHandler() {
        if (handler) {
            handler.destroy();
            handler = null;
        }
    }

    function deactivateTool() {
        activeTool = null;
        destroyHandler();
        if (viewer && viewer.canvas) viewer.canvas.style.cursor = 'default';
        document.querySelectorAll('#map-ui-toolbar .map-ui-tool-btn, .ui-tool-item').forEach(function (btn) {
            btn.classList.remove('active');
        });
    }

    function activateTool(tool, btnId) {
        if (activeTool === tool) {
            deactivateTool();
            return;
        }
        deactivateTool();
        activeTool = tool;
        if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
        }
        viewer.canvas.style.cursor = 'crosshair';
        if (tool === TOOLS.pick) startPick();
        else if (tool === TOOLS.planarDistance || tool === TOOLS.groundDistance) startDistance(tool);
        else if (tool === TOOLS.planarArea || tool === TOOLS.groundArea) startArea(tool);
    }

    function cartesianToDeg(cartesian) {
        const c = Cesium.Cartographic.fromCartesian(cartesian);
        return {
            lng: Cesium.Math.toDegrees(c.longitude),
            lat: Cesium.Math.toDegrees(c.latitude),
            height: c.height
        };
    }

    function startPick() {
        handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction(function (click) {
            const cartesian = viewer.scene.pickPosition(click.position) ||
                viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (!cartesian) return;
            const deg = cartesianToDeg(cartesian);
            document.getElementById('wgs84-lng').textContent = deg.lng.toFixed(6);
            document.getElementById('wgs84-lat').textContent = deg.lat.toFixed(6);
            document.getElementById('wgs84-height').textContent = deg.height.toFixed(2);
            document.getElementById('pick-result-panel').classList.add('show');

            const marker = viewer.entities.add({
                position: cartesian,
                point: { pixelSize: 10, color: Cesium.Color.LIME, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
                label: { text: deg.lng.toFixed(5) + ', ' + deg.lat.toFixed(5), font: '12px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
            });
            pickMarkers.push(marker);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function showCoordInput() {
        document.getElementById('coord-input-panel').classList.toggle('show');
        if (activeTool === TOOLS.pick) deactivateTool();
    }

    function hideCoordInput() {
        document.getElementById('coord-input-panel').classList.remove('show');
    }

    function locateByCoord() {
        const lng = parseFloat(document.getElementById('lng-input').value);
        const lat = parseFloat(document.getElementById('lat-input').value);
        const height = parseFloat(document.getElementById('height-input').value) || 500;
        if (isNaN(lng) || isNaN(lat)) {
            alert('请输入有效经纬度');
            return;
        }
        if (locateEntity) viewer.entities.remove(locateEntity);
        locateEntity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
            point: { pixelSize: 14, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
            label: { text: '定位点', font: '13px sans-serif', fillColor: Cesium.Color.WHITE, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -16), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
        });
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
            duration: 1.5
        });
        hideCoordInput();
    }

    function hidePickResult() {
        document.getElementById('pick-result-panel').classList.remove('show');
    }

    function copyCoords() {
        const lng = document.getElementById('wgs84-lng').textContent;
        const lat = document.getElementById('wgs84-lat').textContent;
        const h = document.getElementById('wgs84-height').textContent;
        const text = 'WGS84: ' + lng + ', ' + lat + ', 高程 ' + h + 'm';
        navigator.clipboard.writeText(text).then(function () { alert('坐标已复制'); }).catch(function () { alert('复制失败'); });
    }

    function formatDistance(m) {
        return m > 1000 ? (m / 1000).toFixed(3) + ' 公里' : m.toFixed(2) + ' 米';
    }

    function formatArea(m2) {
        return m2 > 1000000 ? (m2 / 1000000).toFixed(4) + ' 平方公里' : m2.toFixed(2) + ' 平方米';
    }

    function startDistance(tool) {
        const positions = [];
        const clamp = tool === TOOLS.groundDistance;
        let lineEntity = null;
        let labelEntity = null;

        handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

        function updateLine() {
            if (lineEntity) viewer.entities.remove(lineEntity);
            if (labelEntity) viewer.entities.remove(labelEntity);
            if (positions.length < 2) return;

            lineEntity = viewer.entities.add({
                polyline: {
                    positions: positions.slice(),
                    width: 3,
                    material: Cesium.Color.YELLOW,
                    clampToGround: clamp
                }
            });
            measureEntities.push(lineEntity);

            let total = 0;
            for (let i = 1; i < positions.length; i++) {
                if (clamp) {
                    total += Cesium.Cartesian3.distance(positions[i - 1], positions[i]);
                } else {
                    const c0 = Cesium.Cartographic.fromCartesian(positions[i - 1]);
                    const c1 = Cesium.Cartographic.fromCartesian(positions[i]);
                    const geo = new Cesium.EllipsoidGeodesic(c0, c1);
                    total += geo.surfaceDistance;
                }
            }
            const last = positions[positions.length - 1];
            labelEntity = viewer.entities.add({
                position: last,
                label: {
                    text: formatDistance(total),
                    font: '14px sans-serif',
                    fillColor: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cesium.Cartesian2(0, -20),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            measureEntities.push(labelEntity);
            document.getElementById('measure-result-text').textContent = '总距离：' + formatDistance(total);
            document.getElementById('measure-result').classList.add('show');
        }

        handler.setInputAction(function (click) {
            let cartesian = viewer.scene.pickPosition(click.position);
            if (!cartesian) cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (!cartesian) return;
            positions.push(cartesian);
            const pt = viewer.entities.add({
                position: cartesian,
                point: { pixelSize: 8, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 1, heightReference: clamp ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE }
            });
            measureEntities.push(pt);
            updateLine();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(function () {
            deactivateTool();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    function startArea(tool) {
        const positions = [];
        const clamp = tool === TOOLS.groundArea;
        let polyEntity = null;

        handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

        function updatePoly() {
            if (polyEntity) viewer.entities.remove(polyEntity);
            if (positions.length < 3) return;
            const closed = positions.slice();
            closed.push(positions[0]);
            polyEntity = viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(positions.slice()),
                    material: Cesium.Color.YELLOW.withAlpha(0.35),
                    outline: true,
                    outlineColor: Cesium.Color.YELLOW,
                    heightReference: clamp ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE
                }
            });
            measureEntities.push(polyEntity);

            let area = 0;
            if (clamp) {
                area = computeGroundArea(positions);
            } else {
                area = computePlanarArea(positions);
            }
            document.getElementById('measure-result-text').textContent = '总面积：' + formatArea(area);
            document.getElementById('measure-result').classList.add('show');
        }

        handler.setInputAction(function (click) {
            let cartesian = viewer.scene.pickPosition(click.position);
            if (!cartesian) cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (!cartesian) return;
            positions.push(cartesian);
            const pt = viewer.entities.add({
                position: cartesian,
                point: { pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 }
            });
            measureEntities.push(pt);
            updatePoly();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(function () {
            deactivateTool();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    function computePlanarArea(positions) {
        const coords = positions.map(function (p) {
            const c = Cesium.Cartographic.fromCartesian(p);
            return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
        });
        if (typeof turf !== 'undefined') {
            const poly = turf.polygon([[].concat(coords, [coords[0]])]);
            return turf.area(poly);
        }
        let area = 0;
        for (let i = 0; i < coords.length; i++) {
            const j = (i + 1) % coords.length;
            area += coords[i][0] * coords[j][1];
            area -= coords[j][0] * coords[i][1];
        }
        return Math.abs(area) * 0.5 * 111319.9 * 111319.9 * Math.cos(Cesium.Math.toRadians(coords[0][1]));
    }

    function computeGroundArea(positions) {
        let area = 0;
        const n = positions.length;
        if (n < 3) return 0;
        const center = Cesium.BoundingSphere.fromPoints(positions).center;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const a = Cesium.Cartesian3.subtract(positions[i], center, new Cesium.Cartesian3());
            const b = Cesium.Cartesian3.subtract(positions[j], center, new Cesium.Cartesian3());
            area += Cesium.Cartesian3.magnitude(Cesium.Cartesian3.cross(a, b, new Cesium.Cartesian3())) * 0.5;
        }
        return area;
    }

    function clearAll() {
        deactivateTool();
        measureEntities.forEach(function (e) { viewer.entities.remove(e); });
        measureEntities = [];
        pickMarkers.forEach(function (e) { viewer.entities.remove(e); });
        pickMarkers = [];
        if (locateEntity) { viewer.entities.remove(locateEntity); locateEntity = null; }
        hidePickResult();
        hideCoordInput();
        document.getElementById('measure-result').classList.remove('show');
    }

    function toggleGlobe() {
        globeVisible = !globeVisible;
        const scene = viewer.scene;
        const btn = document.getElementById('globe-toggle-btn');
        if (!globeVisible) {
            savedGlobeState = {
                globe: scene.globe.show,
                sky: scene.skyBox && scene.skyBox.show,
                sun: scene.sun && scene.sun.show,
                moon: scene.moon && scene.moon.show,
                atmosphere: scene.skyAtmosphere && scene.skyAtmosphere.show,
                fog: scene.fog.enabled
            };
            scene.globe.show = false;
            if (scene.skyBox) scene.skyBox.show = false;
            if (scene.sun) scene.sun.show = false;
            if (scene.moon) scene.moon.show = false;
            if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
            scene.fog.enabled = false;
            scene.backgroundColor = Cesium.Color.fromCssColorString('#1a1a2e');
            if (btn) { btn.classList.add('active'); btn.title = '显示地球背景'; }
        } else {
            scene.globe.show = savedGlobeState ? savedGlobeState.globe : true;
            if (scene.skyBox) scene.skyBox.show = savedGlobeState ? savedGlobeState.sky : true;
            if (scene.sun) scene.sun.show = savedGlobeState ? savedGlobeState.sun : true;
            if (scene.moon) scene.moon.show = savedGlobeState ? savedGlobeState.moon : true;
            if (scene.skyAtmosphere) scene.skyAtmosphere.show = savedGlobeState ? savedGlobeState.atmosphere : true;
            scene.fog.enabled = savedGlobeState ? savedGlobeState.fog : true;
            scene.backgroundColor = Cesium.Color.BLACK;
            if (btn) { btn.classList.remove('active'); btn.title = '无地球背景模式'; }
        }
    }

    return {
        init: init,
        TOOLS: TOOLS,
        activateTool: activateTool,
        deactivateTool: deactivateTool,
        showCoordInput: showCoordInput,
        hideCoordInput: hideCoordInput,
        locateByCoord: locateByCoord,
        hidePickResult: hidePickResult,
        copyCoords: copyCoords,
        clearAll: clearAll,
        toggleGlobe: toggleGlobe
    };
})();
