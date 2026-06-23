/**
 * 右侧底图/工具面板 + 底部状态栏
 */
const CesiumMapUI = (function () {
    'use strict';

    let viewer = null;
    let activeTab = 'basemap';
    let panelOpen = true;
    let currentBasemap = 'tdt_img';

    const BASEMAP_ITEMS = [
        { id: 'tdt_img', name: '天地图影像', thumb: 'thumb-sat' },
        { id: 'tdt_vec', name: '天地图电子', thumb: 'thumb-vec' },
        { id: 'amap_img', name: '高德影像', thumb: 'thumb-sat2' },
        { id: 'amap_vec', name: '高德电子', thumb: 'thumb-road' },
        { id: 'none', name: '无底图', thumb: 'thumb-none' }
    ];

    const TOOL_ITEMS = [
        { icon: '📍', label: '坐标定位', action: function () { CesiumMeasureTools.showCoordInput(); } },
        { icon: '👆', label: '拾取坐标', toolKey: 'pick' },
        { icon: '📏', label: '平面测距', toolKey: 'planarDistance' },
        { icon: '📐', label: '贴地3D测距', toolKey: 'groundDistance' },
        { icon: '⬜', label: '平面测面', toolKey: 'planarArea' },
        { icon: '🔷', label: '贴地3D测面', toolKey: 'groundArea' },
        { icon: '🏠', label: 'Home', action: function () { ShaanxiGlobeViz.flyToHome(); } },
        { icon: '🗑️', label: '清除标记', action: function () { CesiumMeasureTools.clearAll(); } }
    ];

    function init(viewerInstance) {
        viewer = viewerInstance;
        buildBasemapGrid();
        buildToolbar();
        bindTabs();
        initStatusBar();
        selectBasemap('tdt_img', false);
    }

    function bindTabs() {
        document.querySelectorAll('.map-ui-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                switchTab(btn.dataset.panel);
            });
        });
        document.getElementById('map-ui-panel-close').addEventListener('click', function () {
            togglePanel(false);
        });
        document.querySelectorAll('[data-viz-close]').forEach(function (btn) {
            btn.addEventListener('click', function () { exitVizMode(); });
        });
    }

    function setActiveTabUI(tab) {
        activeTab = tab;
        document.querySelectorAll('.map-ui-tab').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.panel === tab);
        });
        document.querySelectorAll('.ui-panel-content').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'ui-panel-' + tab);
        });
    }

    function switchTab(tab) {
        if (tab === activeTab && panelOpen) {
            if (tab === 'viz') {
                exitVizMode();
                return;
            }
            togglePanel(false);
            return;
        }
        if (activeTab === 'viz' && tab !== 'viz') {
            ShaanxiGlobeViz.disableVizMode();
        }
        if (tab === 'viz') {
            ShaanxiGlobeViz.enableVizMode();
        }
        setActiveTabUI(tab);
        togglePanel(true);
    }

    function exitVizMode() {
        if (typeof ShaanxiGlobeViz !== 'undefined' && ShaanxiGlobeViz.isVizMode()) {
            ShaanxiGlobeViz.disableVizMode();
        }
        setActiveTabUI('basemap');
        togglePanel(true);
    }

    function togglePanel(open) {
        panelOpen = open !== false;
        document.getElementById('map-ui-panel').classList.toggle('collapsed', !panelOpen);
    }

    function buildBasemapGrid() {
        const grid = document.getElementById('ui-basemap-grid');
        if (!grid) return;
        grid.innerHTML = BASEMAP_ITEMS.map(function (item) {
            return '<div class="basemap-item' + (item.id === currentBasemap ? ' active' : '') +
                '" data-id="' + item.id + '" onclick="CesiumMapUI.selectBasemap(\'' + item.id + '\')">' +
                '<div class="basemap-thumb ' + item.thumb + '"></div>' +
                '<div class="basemap-name">' + item.name + '</div></div>';
        }).join('');
    }

    function selectBasemap(id, fly) {
        currentBasemap = id;
        document.querySelectorAll('.basemap-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.id === id);
        });
        if (id === 'none') {
            if (typeof clearBasemapLayers === 'function') clearBasemapLayers();
            if (viewer) viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a2030');
        } else if (typeof switchBasemap === 'function') {
            switchBasemap(id);
            if (typeof applyBasemapLayerStyle === 'function') {
                applyBasemapLayerStyle(id);
            }
        }
    }

    function onBasemapStyleChange(valId, value) {
        const el = document.getElementById(valId);
        if (!el) return;
        const num = parseFloat(value);
        el.textContent = isNaN(num) ? value : String(Math.round(num * 100) / 100);
    }

    function onFilterColorChange(value) {
        const el = document.getElementById('basemap-filter-color-val');
        if (el) el.textContent = value || '#ffffff';
    }

    function applyBasemapStyle() {
        if (typeof applyBasemapLayerStyle === 'function') {
            applyBasemapLayerStyle(currentBasemap);
        }
    }

    async function toggleTerrain(enabled) {
        if (typeof setBasemapTerrain === 'function') {
            await setBasemapTerrain(enabled);
        }
    }

    function buildToolbar() {
        const bar = document.getElementById('map-ui-toolbar');
        if (!bar) return;
        const dividers = { 2: true, 6: true };
        bar.innerHTML = TOOL_ITEMS.map(function (item, i) {
            const id = 'ui-tool-' + i;
            let html = '';
            if (dividers[i]) html += '<div class="map-ui-tool-divider"></div>';
            html += '<button type="button" class="map-ui-tool-btn ui-tool-item" id="' + id +
                '" title="' + item.label + '" onclick="CesiumMapUI.runTool(' + i + ')">' + item.icon + '</button>';
            return html;
        }).join('');
    }

    function runTool(index) {
        const item = TOOL_ITEMS[index];
        if (!item) return;
        const btnId = 'ui-tool-' + index;
        if (item.toolKey) {
            CesiumMeasureTools.activateTool(CesiumMeasureTools.TOOLS[item.toolKey], btnId);
        } else if (item.action) {
            item.action();
        }
    }

    function heightToLevel(h) {
        if (!h || h <= 0) return 0;
        return Math.max(0, Math.round(Math.log2(591657550 / h)));
    }

    function updateScaleBar() {
        if (!viewer) return;
        const bar = document.getElementById('status-scale-bar');
        const label = document.getElementById('status-scale-label');
        if (!bar || !label) return;

        const canvas = viewer.canvas;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const barPx = 80;
        const center = new Cesium.Cartesian2(w / 2, h / 2);
        const offset = new Cesium.Cartesian2(w / 2 + barPx, h / 2);
        const ellipsoid = viewer.scene.globe.ellipsoid;

        let c1 = viewer.scene.pickPosition(center);
        let c2 = viewer.scene.pickPosition(offset);
        if (!c1) c1 = viewer.camera.pickEllipsoid(center, ellipsoid);
        if (!c2) c2 = viewer.camera.pickEllipsoid(offset, ellipsoid);

        let dist;
        if (c1 && c2) {
            const g = new Cesium.EllipsoidGeodesic(
                Cesium.Cartographic.fromCartesian(c1),
                Cesium.Cartographic.fromCartesian(c2)
            );
            dist = g.surfaceDistance;
        } else {
            const height = viewer.camera.positionCartographic.height || 1;
            const fovy = viewer.camera.frustum.fovy || Cesium.Math.toRadians(60);
            dist = height * Math.tan(fovy / 2) * 2 / h * barPx;
        }

        if (!isFinite(dist) || dist <= 0) {
            label.textContent = '--';
            return;
        }

        let text;
        if (dist >= 1000) {
            const km = dist / 1000;
            text = (km >= 100 ? Math.round(km / 10) * 10 : (km >= 10 ? Math.round(km) : Math.round(km * 10) / 10)) + ' 公里';
        } else {
            text = (dist >= 100 ? Math.round(dist / 10) * 10 : Math.round(dist)) + ' 米';
        }
        label.textContent = text;
        bar.style.width = barPx + 'px';
    }

    function initStatusBar() {
        if (!viewer) return;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

        handler.setInputAction(function (movement) {
            let cartesian = viewer.scene.pickPosition(movement.endPosition);
            if (!cartesian) cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
            if (!cartesian) return;
            const c = Cesium.Cartographic.fromCartesian(cartesian);
            setText('status-lng', Cesium.Math.toDegrees(c.longitude).toFixed(6));
            setText('status-lat', Cesium.Math.toDegrees(c.latitude).toFixed(6));
            setText('status-alt', (c.height || 0).toFixed(1));
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        function updateCamera() {
            const cam = viewer.camera;
            const c = cam.positionCartographic;
            setText('status-heading', Cesium.Math.toDegrees(cam.heading).toFixed(0) + '°');
            setText('status-pitch', Cesium.Math.toDegrees(cam.pitch).toFixed(0) + '°');
            setText('status-height', (c.height || 0).toFixed(1));
            setText('status-level', String(heightToLevel(c.height)));
            updateScaleBar();
        }

        viewer.camera.changed.addEventListener(updateCamera);
        viewer.scene.postRender.addEventListener(updateCamera);
        updateCamera();
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function getRightPadding() {
        const panel = document.getElementById('map-ui-right');
        if (!panel || panel.style.display === 'none') return 20;
        return (panelOpen ? 300 : 0) + 20;
    }

    function getCurrentBasemap() {
        return currentBasemap;
    }

    return {
        init: init,
        switchTab: switchTab,
        exitVizMode: exitVizMode,
        selectBasemap: selectBasemap,
        onBasemapStyleChange: onBasemapStyleChange,
        onFilterColorChange: onFilterColorChange,
        applyBasemapStyle: applyBasemapStyle,
        toggleTerrain: toggleTerrain,
        runTool: runTool,
        getRightPadding: getRightPadding,
        getCurrentBasemap: getCurrentBasemap
    };
})();
