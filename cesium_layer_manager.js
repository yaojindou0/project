/**
 * Cesium 3D 图层管理
 * 依赖: Cesium, CoordFileConverter(可选), wellknown(可选)
 */
const CesiumLayerManager = (function () {
    'use strict';

    let viewer = null;
    let listEl = null;
    const managedLayers = [];
    let uid = 1;
    let styleEditId = null;
    let draftPointIconUrl = undefined;
    const VIZ_LAYER_TOP_HEIGHT = 120;
    let layerSelectionListener = null;
    let savedInfoBoxDisplay = '';
    let layerClickMarkEntity = null;
    let layerPopupFollowEntity = null;
    let layerPopupPostRenderListener = null;

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function zeroPad(num, len, radix) {
        let str = num.toString(radix || 10);
        while (str.length < len) str = '0' + str;
        return str;
    }

    function defaultVectorStyle() {
        return {
            point: {
                color: '#409eff',
                pixelSize: 8,
                height: 0,
                iconUrl: '',
                iconScale: 1,
                labelField: '',
                labelFontSize: 14,
                labelColor: '#303133'
            },
            line: { color: '#409eff', width: 3, material: 'solid' },
            polygon: {
                fillColor: '#409eff',
                fillOpacity: 0.35,
                fillMaterial: 'solid',
                strokeColor: '#409eff',
                strokeWidth: 2,
                height: 0,
                extrudedHeight: 0
            },
            clampToGround: true
        };
    }

    function mergeStyleConfig(cfg) {
        const d = defaultVectorStyle();
        cfg = cfg || {};
        return {
            clampToGround: cfg.clampToGround != null ? cfg.clampToGround : d.clampToGround,
            point: Object.assign({}, d.point, cfg.point || {}),
            line: Object.assign({}, d.line, cfg.line || {}),
            polygon: Object.assign({}, d.polygon, cfg.polygon || {})
        };
    }

    function computeGeomTypes(ds) {
        const types = { point: false, line: false, polygon: false };
        if (!ds || !ds.entities) return types;
        ds.entities.values.forEach(function (entity) {
            if (entity.point || entity.billboard ||
                (entity.position && !entity.polyline && !entity.polygon)) types.point = true;
            if (entity.polyline) types.line = true;
            if (entity.polygon) types.polygon = true;
        });
        return types;
    }

    function isVizModeActive() {
        return typeof ShaanxiGlobeViz !== 'undefined' && ShaanxiGlobeViz.isVizMode();
    }

    async function flyToLayerTarget(target, options) {
        if (isVizModeActive() || !viewer || !target) return;
        if (options) await viewer.flyTo(target, options);
        else await viewer.flyTo(target);
    }

    async function zoomToLayerTarget(target) {
        if (isVizModeActive() || !viewer || !target) return;
        try {
            await viewer.zoomTo(target);
        } catch (e) { /* ignore */ }
    }

    function isPointLikeEntity(entity) {
        if (!entity) return false;
        if (entity.polyline || entity.polygon) return false;
        return !!(entity.point || entity.billboard || entity.position);
    }

    function collectEntityPropertyRows(entity) {
        const rows = [];
        const seen = {};
        function add(key, value) {
            if (!key || seen[key]) return;
            if (value === '' || value == null) return;
            seen[key] = true;
            rows.push({ key: key, value: String(value) });
        }
        if (entity.name) add('name', entity.name);
        const props = entity.properties;
        if (!props) return rows;
        if (props.propertyNames) {
            props.propertyNames.forEach(function (k) {
                add(k, getEntityPropValue(entity, k));
            });
            return rows;
        }
        if (typeof props.getValue === 'function') {
            const bag = props.getValue(viewer.clock.currentTime);
            if (bag) Object.keys(bag).forEach(function (k) { add(k, bag[k]); });
            return rows;
        }
        if (typeof props === 'object') {
            Object.keys(props).forEach(function (k) {
                const p = props[k];
                const val = typeof p === 'object' && p && typeof p.getValue === 'function'
                    ? p.getValue(viewer.clock.currentTime) : p;
                add(k, val);
            });
        }
        return rows;
    }

    function buildEntityPropertiesHtml(entity) {
        const title = entity.name || getEntityPropValue(entity, 'name') || '点位属性';
        const rows = collectEntityPropertyRows(entity);
        let html = '<div class="viz-layer-popup-title">' + escapeHtml(title) + '</div>';
        if (!rows.length) {
            html += '<div class="viz-layer-popup-row">无属性字段</div>';
        } else {
            rows.forEach(function (r) {
                html += '<div class="viz-layer-popup-row"><span class="k">' + escapeHtml(r.key) +
                    '</span><span class="v">' + escapeHtml(r.value) + '</span></div>';
            });
        }
        return html;
    }

    function pickHoverPointAt(screenPosition) {
        if (!viewer || !screenPosition) return null;
        const pickedObjects = viewer.scene.drillPick(screenPosition, 10);
        for (let i = 0; i < pickedObjects.length; i++) {
            const entity = pickedObjects[i].id;
            if (entity && entity._vizLayerEntity && isPointLikeEntity(entity)) {
                return entity;
            }
        }
        return null;
    }

    const VECTOR_LAYER_TYPES = ['GeoJSON', 'JSON', 'CSV', 'WKT', 'KML'];

    function isDataSourceLike(obj) {
        return !!(obj && obj.entities && typeof obj.show === 'boolean');
    }

    function isImageryLayerLike(obj) {
        try {
            return !!(obj && Cesium.ImageryLayer && obj instanceof Cesium.ImageryLayer);
        } catch (err) {
            return !!(obj && typeof obj.alpha === 'number' && typeof obj.show === 'boolean');
        }
    }

    function isTilesetLike(obj) {
        try {
            if (obj && Cesium.Cesium3DTileset && obj instanceof Cesium.Cesium3DTileset) return true;
        } catch (err) { /* ignore */ }
        return !!(obj && obj.root && obj.boundingSphere && typeof obj.show === 'boolean');
    }

    function captureTilesetBaseGeo(tileset) {
        const center = tileset.boundingSphere.center;
        const carto = Cesium.Cartographic.fromCartesian(center);
        return { longitude: carto.longitude, latitude: carto.latitude };
    }

    function applyTilesetHeight(tileset, baseGeo, heightOffset) {
        if (!tileset || !baseGeo) return;
        heightOffset = parseFloat(heightOffset) || 0;
        const surface = Cesium.Cartesian3.fromRadians(baseGeo.longitude, baseGeo.latitude, 0.0);
        const offset = Cesium.Cartesian3.fromRadians(baseGeo.longitude, baseGeo.latitude, heightOffset);
        const translation = Cesium.Cartesian3.subtract(offset, surface, new Cesium.Cartesian3());
        tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
    }

    function canAdjustTilesetHeight(entry) {
        return !!(entry && entry.type === '3DTiles' && isTilesetLike(entry.obj));
    }

    function normalizeLocalPath(path) {
        return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    }

    function localPathDir(path) {
        path = normalizeLocalPath(path);
        const idx = path.lastIndexOf('/');
        return idx >= 0 ? path.substring(0, idx) : '';
    }

    function resolveLocalPath(baseDir, relativeUrl) {
        const combined = baseDir ? baseDir + '/' + relativeUrl : relativeUrl;
        const parts = combined.split('/');
        const out = [];
        parts.forEach(function (part) {
            if (!part || part === '.') return;
            if (part === '..') out.pop();
            else out.push(part);
        });
        return out.join('/');
    }

    function lookupLocalPath(pathMap, path) {
        path = normalizeLocalPath(path);
        if (pathMap[path]) return pathMap[path];
        const lower = path.toLowerCase();
        let key;
        for (key in pathMap) {
            if (key.toLowerCase() === lower) return pathMap[key];
        }
        for (key in pathMap) {
            if (key.endsWith('/' + path) || key === path) return pathMap[key];
        }
        return null;
    }

    function findLocalTilesetPath(files) {
        let tilesetPath = null;
        let tilesetDepth = Infinity;
        files.forEach(function (file) {
            const path = normalizeLocalPath(file.webkitRelativePath || file.name);
            if (!/tileset\.json$/i.test(path)) return;
            const depth = path.split('/').length;
            if (depth < tilesetDepth) {
                tilesetPath = path;
                tilesetDepth = depth;
            }
        });
        return tilesetPath;
    }

    function rewriteTilesetNodeUris(node, currentDir, pathToBlob) {
        if (!node) return;
        if (node.content) {
            if (node.content.uri) {
                const absPath = resolveLocalPath(currentDir, node.content.uri);
                const blobUrl = lookupLocalPath(pathToBlob, absPath);
                if (blobUrl) node.content.uri = blobUrl;
            }
            if (node.content.url) {
                const absPath = resolveLocalPath(currentDir, node.content.url);
                const blobUrl = lookupLocalPath(pathToBlob, absPath);
                if (blobUrl) node.content.url = blobUrl;
            }
        }
        if (node.children && node.children.length) {
            node.children.forEach(function (child) {
                rewriteTilesetNodeUris(child, currentDir, pathToBlob);
            });
        }
    }

    async function prepareLocalTilesetFiles(files) {
        files = Array.from(files || []);
        if (!files.length) throw new Error('请选择本地 3D Tiles 文件夹');

        const pathToBlob = {};
        const blobUrls = [];
        files.forEach(function (file) {
            const path = normalizeLocalPath(file.webkitRelativePath || file.name);
            const blobUrl = URL.createObjectURL(file);
            pathToBlob[path] = blobUrl;
            blobUrls.push(blobUrl);
        });

        const rootPath = findLocalTilesetPath(files);
        if (!rootPath) throw new Error('未找到 tileset.json，请选择包含该文件的完整文件夹');

        const jsonFiles = files.filter(function (file) {
            return /\.json$/i.test(file.name);
        }).sort(function (a, b) {
            const pa = normalizeLocalPath(a.webkitRelativePath || a.name);
            const pb = normalizeLocalPath(b.webkitRelativePath || b.name);
            return pb.split('/').length - pa.split('/').length;
        });

        for (let i = 0; i < jsonFiles.length; i++) {
            const file = jsonFiles[i];
            const path = normalizeLocalPath(file.webkitRelativePath || file.name);
            let json;
            try {
                json = JSON.parse(await file.text());
            } catch (err) {
                continue;
            }
            if (!json || !json.root) continue;

            rewriteTilesetNodeUris(json.root, localPathDir(path), pathToBlob);
            const rewrittenBlob = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/json' }));
            if (pathToBlob[path]) URL.revokeObjectURL(pathToBlob[path]);
            pathToBlob[path] = rewrittenBlob;
            blobUrls.push(rewrittenBlob);
        }

        const tilesetUrl = pathToBlob[rootPath];
        if (!tilesetUrl) throw new Error('无法解析本地 tileset.json');

        return {
            tilesetUrl: tilesetUrl,
            blobUrls: blobUrls,
            displayName: rootPath.split('/').pop() || '本地 3D Tiles'
        };
    }

    function isEntityLike(obj) {
        try {
            if (obj && Cesium.Entity && obj instanceof Cesium.Entity) return true;
        } catch (err) { /* ignore */ }
        return !!(obj && typeof obj.show === 'boolean' && obj.id !== undefined && !obj.entities);
    }

    function canLocateEntry(entry) {
        const o = entry && entry.obj;
        if (!o) return false;
        return isDataSourceLike(o) || isTilesetLike(o) || isEntityLike(o);
    }

    function canStyleEntry(entry) {
        if (!entry || !entry.obj || !isDataSourceLike(entry.obj)) return false;
        if (entry.extra && entry.extra.isVector) return true;
        return VECTOR_LAYER_TYPES.indexOf(entry.type) >= 0;
    }

    function cssColor(hex, alpha) {
        const c = Cesium.Color.fromCssColorString(hex || '#409eff');
        if (alpha != null) c.alpha = alpha;
        return c;
    }

    function init(viewerInstance, listElementId) {
        viewer = viewerInstance;
        listEl = document.getElementById(listElementId);
        if (viewer.infoBox && viewer.infoBox.container) {
            savedInfoBoxDisplay = viewer.infoBox.container.style.display || 'block';
        }
        bindLayerEntitySelection();
        bindLayerMapPopupEvents();
        renderList();
    }

    function getSelectionIndicatorElement() {
        if (!viewer || !viewer.selectionIndicator || !viewer.selectionIndicator.viewModel) return null;
        return viewer.selectionIndicator.viewModel.selectionIndicatorElement || null;
    }

    function getSelectionIndicatorSize(entity) {
        if (!entity) return 16;
        if (entity.point) {
            let pixelSize = entity.point.pixelSize;
            if (pixelSize && typeof pixelSize.getValue === 'function') {
                pixelSize = pixelSize.getValue(viewer.clock.currentTime);
            }
            pixelSize = pixelSize || 8;
            return Cesium.Math.clamp(Math.round(pixelSize * 1.35 + 4), 12, 28);
        }
        if (entity.billboard) {
            let scale = entity.billboard.scale;
            if (scale && typeof scale.getValue === 'function') {
                scale = scale.getValue(viewer.clock.currentTime);
            }
            scale = scale || 1;
            return Cesium.Math.clamp(Math.round(16 * scale + 8), 14, 34);
        }
        return 16;
    }

    function applySelectionIndicatorSize(entity) {
        const el = getSelectionIndicatorElement();
        if (!el) return;
        const size = getSelectionIndicatorSize(entity);
        el.style.width = size + 'px';
        el.style.height = size + 'px';
    }

    function resetSelectionIndicatorSize() {
        const el = getSelectionIndicatorElement();
        if (!el) return;
        el.style.width = '';
        el.style.height = '';
    }

    function getEntityCartesian(entity) {
        if (!viewer || !entity || !entity.position) return null;
        return entity.position.getValue(viewer.clock.currentTime);
    }

    function getEntityScreenPosition(entity) {
        const cart = getEntityCartesian(entity);
        if (!cart) return null;
        return Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, cart);
    }

    function clearLayerClickMark() {
        if (layerClickMarkEntity && viewer) {
            viewer.entities.remove(layerClickMarkEntity);
        }
        layerClickMarkEntity = null;
    }

    function updateLayerClickMark(entity) {
        if (!viewer || !entity) return;
        const cartesian = getEntityCartesian(entity);
        if (!cartesian) return;
        clearLayerClickMark();
        layerClickMarkEntity = viewer.entities.add({
            position: cartesian,
            _layerClickMark: true,
            point: {
                pixelSize: 14,
                color: Cesium.Color.fromCssColorString('#f56c6c'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
    }

    async function flyToLayerPoint(entity) {
        if (!viewer || !entity || isVizModeActive()) return;
        try {
            await viewer.flyTo(entity, {
                duration: 1.2,
                offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 800)
            });
        } catch (e) { /* ignore */ }
    }

    function stopLayerPopupFollow() {
        layerPopupFollowEntity = null;
    }

    function startLayerPopupFollow(entity) {
        layerPopupFollowEntity = entity;
        if (!viewer || layerPopupPostRenderListener) return;
        layerPopupPostRenderListener = viewer.scene.postRender.addEventListener(function () {
            if (!layerPopupFollowEntity) return;
            const el = document.getElementById('layer-map-popup');
            if (!el || el.style.display === 'none') return;
            const screenPos = getEntityScreenPosition(layerPopupFollowEntity);
            if (screenPos) positionLayerMapPopup(screenPos);
        });
    }

    function bindLayerMapPopupEvents() {
        const el = document.getElementById('layer-map-popup');
        if (!el || el._layerPopupWheelBound) return;
        el._layerPopupWheelBound = true;
        el.addEventListener('wheel', function (e) {
            e.stopPropagation();
        }, { passive: true });
    }

    function hideLayerMapPopup() {
        const el = document.getElementById('layer-map-popup');
        if (el) el.style.display = 'none';
        stopLayerPopupFollow();
    }

    function positionLayerMapPopup(screenPosition) {
        const el = document.getElementById('layer-map-popup');
        const container = document.getElementById('cesiumContainer');
        if (!el || !container || !screenPosition) return;
        let left = screenPosition.x + 14;
        let top = screenPosition.y - 14;
        const maxLeft = container.clientWidth - el.offsetWidth - 8;
        const maxTop = container.clientHeight - el.offsetHeight - 8;
        left = Cesium.Math.clamp(left, 8, Math.max(8, maxLeft));
        top = Cesium.Math.clamp(top, 8, Math.max(8, maxTop));
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }

    function showLayerMapPopup(entity, screenPosition) {
        const el = document.getElementById('layer-map-popup');
        if (!el || !entity) return;
        el.innerHTML = buildEntityPropertiesHtml(entity);
        el.style.display = 'block';
        startLayerPopupFollow(entity);
        requestAnimationFrame(function () {
            positionLayerMapPopup(screenPosition);
        });
    }

    function handleLayerEntitySelection(entity) {
        hideLayerMapPopup();
        resetSelectionIndicatorSize();
        clearLayerClickMark();
        if (isVizModeActive()) return;

        if (entity && entity._vizLayerEntity && isPointLikeEntity(entity)) {
            if (viewer.infoBox && viewer.infoBox.container) {
                viewer.infoBox.container.style.display = 'none';
            }
            applySelectionIndicatorSize(entity);
            updateLayerClickMark(entity);
            const screenPos = getEntityScreenPosition(entity);
            if (screenPos) showLayerMapPopup(entity, screenPos);
            flyToLayerPoint(entity);
            return;
        }

        if (viewer.infoBox && viewer.infoBox.container) {
            viewer.infoBox.container.style.display = savedInfoBoxDisplay || 'block';
        }
    }

    function bindLayerEntitySelection() {
        if (layerSelectionListener || !viewer) return;
        layerSelectionListener = viewer.selectedEntityChanged.addEventListener(function () {
            handleLayerEntitySelection(viewer.selectedEntity);
        });
    }

    function clearLayerSelection() {
        hideLayerMapPopup();
        resetSelectionIndicatorSize();
        clearLayerClickMark();
        if (viewer) viewer.selectedEntity = undefined;
    }

    function nextId() { return uid++; }

    function addEntry(name, type, obj, extra) {
        const entry = {
            id: nextId(),
            name: name || ('图层' + (managedLayers.length + 1)),
            type: type,
            obj: obj,
            visible: true,
            opacity: 1,
            extra: extra || {}
        };
        if (entry.extra.isVector && !entry.extra.styleConfig) {
            entry.extra.styleConfig = defaultVectorStyle();
        }
        managedLayers.push(entry);
        renderList();
        return entry;
    }

    function findEntry(id) {
        return managedLayers.find(function (e) { return e.id === id; });
    }

    function isVectorEntry(entry) {
        return canStyleEntry(entry);
    }

    function buildListHtml() {
        if (!managedLayers.length) {
            return '<div class="layer-empty">暂无自定义图层</div>';
        }
        const items = managedLayers.slice().reverse();
        return items.map(function (e) {
            const idx = managedLayers.indexOf(e);
            const opacityPct = Math.round((e.opacity != null ? e.opacity : 1) * 100);
            const upDisabled = idx >= managedLayers.length - 1 ? ' disabled' : '';
            const downDisabled = idx <= 0 ? ' disabled' : '';
            const showLocate = canLocateEntry(e);
            const showStyle = canStyleEntry(e);
            const showHeight = canAdjustTilesetHeight(e);
            const heightVal = e.extra && e.extra.heightOffset != null ? e.extra.heightOffset : 0;
            return '<div class="layer-item">' +
                '<div class="layer-item-head">' +
                '<label class="layer-item-main">' +
                '<input type="checkbox" ' + (e.visible ? 'checked' : '') + ' onchange="CesiumLayerManager.setVisible(' + e.id + ', this.checked)">' +
                '<span class="layer-name" title="' + escapeHtml(e.name) + '">' + escapeHtml(e.name) + '</span>' +
                '<span class="layer-type">' + escapeHtml(e.type) + '</span>' +
                '</label>' +
                '<div class="layer-order-btns">' +
                (showLocate ? '<button type="button" class="layer-action-btn layer-btn-locate" onclick="CesiumLayerManager.locateLayer(' + e.id + ')" title="定位到图层">定位</button>' : '') +
                (showStyle ? '<button type="button" class="layer-action-btn layer-btn-style" onclick="CesiumLayerManager.openStyleSettings(' + e.id + ')" title="样式设置">设置</button>' : '') +
                '<button type="button" class="layer-order-btn"' + upDisabled + ' onclick="CesiumLayerManager.moveLayer(' + e.id + ',\'up\')" title="上移">▲</button>' +
                '<button type="button" class="layer-order-btn"' + downDisabled + ' onclick="CesiumLayerManager.moveLayer(' + e.id + ',\'down\')" title="下移">▼</button>' +
                '<button type="button" class="layer-del" onclick="CesiumLayerManager.removeLayer(' + e.id + ')" title="移除">×</button>' +
                '</div></div>' +
                '<div class="layer-opacity-row">' +
                '<span class="layer-opacity-label">透明度</span>' +
                '<input type="range" class="layer-opacity-slider" min="0" max="100" value="' + opacityPct +
                '" oninput="CesiumLayerManager.setOpacity(' + e.id + ', this.value)">' +
                '<span class="layer-opacity-value">' + opacityPct + '%</span></div>' +
                (showHeight ? '<div class="layer-opacity-row">' +
                '<span class="layer-opacity-label">高度</span>' +
                '<input type="number" class="layer-height-input" step="0.1" value="' + heightVal +
                '" onchange="CesiumLayerManager.setTilesetHeight(' + e.id + ', this.value)" title="高度偏移(m)">' +
                '<span class="layer-opacity-value">m</span></div>' : '') +
                '</div>';
        }).join('');
    }

    function renderList() {
        if (!listEl) return;
        listEl.innerHTML = buildListHtml();
    }

    function applyVisibility(entry) {
        const o = entry.obj;
        if (isTilesetLike(o) || isEntityLike(o) || isDataSourceLike(o) || isImageryLayerLike(o)) {
            o.show = entry.visible;
        } else if (o && o.collection) o.collection.show = entry.visible;
    }

    function applyOpacity(entry) {
        const o = entry.obj;
        const a = entry.opacity;
        if (isTilesetLike(o)) {
            o.style = new Cesium.Cesium3DTileStyle({ color: "color('white', " + a + ")" });
        } else if (isImageryLayerLike(o)) o.alpha = a;
        else if (isEntityLike(o) && o.model) o.model.color = Cesium.Color.WHITE.withAlpha(a);
    }

    function toggleVisible(id) {
        const e = findEntry(id);
        if (!e) return;
        setVisible(id, !e.visible);
    }

    function setVisible(id, visible) {
        const e = findEntry(id);
        if (!e) return;
        e.visible = !!visible;
        applyVisibility(e);
        renderList();
    }

    function setOpacity(id, pct) {
        const e = findEntry(id);
        if (!e) return;
        e.opacity = Math.max(0, Math.min(100, parseInt(pct, 10))) / 100;
        applyOpacity(e);
        renderList();
    }

    function setTilesetHeight(id, height) {
        const e = findEntry(id);
        if (!canAdjustTilesetHeight(e)) return;
        if (!e.extra) e.extra = {};
        if (!e.extra.baseGeo) e.extra.baseGeo = captureTilesetBaseGeo(e.obj);
        e.extra.heightOffset = parseFloat(height) || 0;
        applyTilesetHeight(e.obj, e.extra.baseGeo, e.extra.heightOffset);
        renderList();
    }

    function moveLayer(id, dir) {
        const idx = managedLayers.findIndex(function (e) { return e.id === id; });
        if (idx < 0) return;
        const target = dir === 'up' ? idx + 1 : idx - 1;
        if (target < 0 || target >= managedLayers.length) return;
        const tmp = managedLayers[idx];
        managedLayers[idx] = managedLayers[target];
        managedLayers[target] = tmp;
        reorderImagery();
        renderList();
    }

    function reorderImagery() {
        const imageryLayers = viewer.imageryLayers;
        managedLayers.filter(function (e) { return isImageryLayerLike(e.obj); }).forEach(function (e) {
            imageryLayers.raiseToTop(e.obj);
        });
    }

    function removeLayer(id) {
        const idx = managedLayers.findIndex(function (e) { return e.id === id; });
        if (idx < 0) return;
        const e = managedLayers[idx];
        const o = e.obj;
        if (isTilesetLike(o)) viewer.scene.primitives.remove(o);
        else if (isEntityLike(o)) viewer.entities.remove(o);
        else if (isDataSourceLike(o)) viewer.dataSources.remove(o);
        else if (isImageryLayerLike(o)) viewer.imageryLayers.remove(o);
        else if (o && o.collection) viewer.scene.primitives.remove(o.collection);
        if (e.extra && e.extra.blobUrls) {
            e.extra.blobUrls.forEach(function (url) {
                try { URL.revokeObjectURL(url); } catch (err) { /* ignore */ }
            });
        }
        managedLayers.splice(idx, 1);
        renderList();
    }

    function locateLayer(id) {
        const e = findEntry(id);
        if (!e || !viewer) return;
        const o = e.obj;
        try {
            if (isTilesetLike(o) || isEntityLike(o)) {
                viewer.flyTo(o, { duration: 1.2 });
            } else if (isDataSourceLike(o)) {
                viewer.flyTo(o, { duration: 1.2 }).catch(function () {
                    viewer.zoomTo(o);
                });
            }
        } catch (err) {
            console.warn('定位失败', err);
            if (isDataSourceLike(o)) viewer.zoomTo(o);
        }
    }

    function getHeightReference(cfg, useExtrude, heightVal) {
        const h = parseFloat(heightVal) || 0;
        return (cfg.clampToGround && !useExtrude && h === 0)
            ? Cesium.HeightReference.CLAMP_TO_GROUND
            : Cesium.HeightReference.NONE;
    }

    function getEntityPropValue(entity, field) {
        if (!field || !entity) return '';
        if (field === 'name' && entity.name) return String(entity.name);
        const props = entity.properties;
        if (!props) return field === 'name' ? (entity.name || '') : '';
        if (props.propertyNames) {
            const names = props.propertyNames;
            for (let i = 0; i < names.length; i++) {
                if (names[i] === field && props[names[i]]) {
                    const p = props[names[i]];
                    return typeof p.getValue === 'function'
                        ? String(p.getValue(viewer.clock.currentTime) ?? '')
                        : String(p);
                }
            }
        }
        if (props[field]) {
            const p = props[field];
            return typeof p.getValue === 'function'
                ? String(p.getValue(viewer.clock.currentTime) ?? '')
                : String(p);
        }
        if (typeof props.getValue === 'function') {
            const bag = props.getValue(viewer.clock.currentTime);
            if (bag && bag[field] != null) return String(bag[field]);
        }
        return '';
    }

    function collectLabelFields(ds) {
        const keys = {};
        keys.name = true;
        if (!ds || !ds.entities) return Object.keys(keys).sort();
        ds.entities.values.forEach(function (entity) {
            if (entity.name) keys.name = true;
            const props = entity.properties;
            if (!props) return;
            if (props.propertyNames) {
                const names = props.propertyNames;
                for (let i = 0; i < names.length; i++) keys[names[i]] = true;
            } else if (typeof props.getValue === 'function') {
                const bag = props.getValue(viewer.clock.currentTime);
                if (bag) Object.keys(bag).forEach(function (k) { keys[k] = true; });
            } else if (typeof props === 'object') {
                Object.keys(props).forEach(function (k) { keys[k] = true; });
            }
        });
        return Object.keys(keys).sort();
    }

    function populateLabelFieldSelect(ds, selected) {
        const sel = document.getElementById('style-point-label-field');
        if (!sel) return;
        const fields = collectLabelFields(ds);
        sel.innerHTML = '<option value="">不显示标注</option>' +
            fields.map(function (f) {
                const label = f === 'name' ? 'name（名称）' : f;
                return '<option value="' + escapeHtml(f) + '">' + escapeHtml(label) + '</option>';
            }).join('');
        sel.value = selected && fields.indexOf(selected) >= 0 ? selected : '';
    }

    function updateIconPreview(url) {
        const preview = document.getElementById('style-point-icon-preview');
        if (!preview) return;
        if (url) {
            preview.src = url;
            preview.style.display = 'inline-block';
        } else {
            preview.removeAttribute('src');
            preview.style.display = 'none';
        }
    }

    function buildLineMaterial(cfg) {
        const color = cssColor(cfg.line.color);
        const mat = cfg.line.material || 'solid';
        if (mat === 'dash') {
            return new Cesium.PolylineDashMaterialProperty({ color: color });
        }
        if (mat === 'glow') {
            return new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: color });
        }
        if (mat === 'outline') {
            return new Cesium.PolylineOutlineMaterialProperty({
                color: color,
                outlineWidth: 2,
                outlineColor: Cesium.Color.WHITE
            });
        }
        if (mat === 'arrow') {
            return new Cesium.PolylineArrowMaterialProperty(color);
        }
        return color;
    }

    function buildPolygonFillMaterial(cfg) {
        const opacity = cfg.polygon.fillOpacity != null ? cfg.polygon.fillOpacity : 0.35;
        const color = cssColor(cfg.polygon.fillColor, opacity);
        const mat = cfg.polygon.fillMaterial || 'solid';
        if (mat === 'stripe') {
            return new Cesium.StripeMaterialProperty({
                evenColor: color,
                oddColor: Cesium.Color.WHITE.withAlpha(opacity * 0.5),
                repeat: 8
            });
        }
        if (mat === 'grid') {
            return new Cesium.GridMaterialProperty({
                color: color,
                cellAlpha: 0.2,
                lineCount: new Cesium.Cartesian2(8, 8),
                lineThickness: new Cesium.Cartesian2(1.5, 1.5)
            });
        }
        if (mat === 'checkerboard') {
            return new Cesium.CheckerboardMaterialProperty({
                evenColor: color,
                oddColor: Cesium.Color.WHITE.withAlpha(opacity * 0.5),
                repeat: new Cesium.Cartesian2(4, 4)
            });
        }
        return color;
    }

    function ensurePointGraphics(entity, pointColor, cfg, useExtrude) {
        if (entity.billboard) entity.billboard = undefined;
        if (!entity.point && entity.position) {
            entity.point = new Cesium.PointGraphics();
        }
        if (entity.point) {
            entity.point.color = pointColor;
            entity.point.pixelSize = cfg.point.pixelSize || 8;
            entity.point.outlineColor = Cesium.Color.WHITE.withAlpha(0.8);
            entity.point.outlineWidth = 1;
            entity.point.heightReference = getHeightReference(cfg, useExtrude, cfg.point.height);
        }
    }

    function applyPointBillboard(entity, cfg, useExtrude) {
        if (!entity.position) return;
        entity.point = undefined;
        if (!entity.billboard) entity.billboard = new Cesium.BillboardGraphics();
        entity.billboard.image = cfg.point.iconUrl;
        entity.billboard.scale = parseFloat(cfg.point.iconScale) || 1;
        entity.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
        entity.billboard.heightReference = getHeightReference(cfg, useExtrude, cfg.point.height);
    }

    function applyEntityLabel(entity, cfg, useExtrude, hasIcon) {
        const field = cfg.point.labelField;
        if (!field || !entity.position) {
            entity.label = undefined;
            return;
        }
        const text = getEntityPropValue(entity, field);
        if (!text) {
            entity.label = undefined;
            return;
        }
        if (!entity.label) entity.label = new Cesium.LabelGraphics();
        entity.label.text = text;
        entity.label.font = (parseFloat(cfg.point.labelFontSize) || 14) + 'px sans-serif';
        entity.label.fillColor = cssColor(cfg.point.labelColor || '#303133');
        entity.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
        entity.label.outlineWidth = 2;
        entity.label.outlineColor = Cesium.Color.WHITE;
        entity.label.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
        entity.label.pixelOffset = new Cesium.Cartesian2(0, hasIcon ? -22 : -12);
        entity.label.heightReference = getHeightReference(cfg, useExtrude, cfg.point.height);
        entity.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    }

    function applyPointStyle(entity, pointColor, cfg, useExtrude) {
        const hasIcon = !!(cfg.point.iconUrl);
        if (hasIcon) applyPointBillboard(entity, cfg, useExtrude);
        else ensurePointGraphics(entity, pointColor, cfg, useExtrude);
        applyPointHeight(entity, cfg, useExtrude);
        applyEntityLabel(entity, cfg, useExtrude, hasIcon);
    }

    function applyPointHeight(entity, cfg, useExtrude) {
        if (!entity.position || !cfg.clampToGround || useExtrude) return;
        const h = parseFloat(cfg.point.height) || 0;
        if (h === 0) return;
        const time = viewer.clock.currentTime;
        const cart = entity.position.getValue(time);
        if (!cart) return;
        const c = Cesium.Cartographic.fromCartesian(cart);
        entity.position = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h);
    }

    function raiseVectorDataSource(ds) {
        if (!viewer || !ds || !isVizModeActive()) return;
        viewer.dataSources.raiseToTop(ds);
    }

    function applyVizLayerTopStyle(entity, cfg, useExtrude, baseHeight) {
        if (!isVizModeActive()) return;
        const topH = VIZ_LAYER_TOP_HEIGHT;
        if (entity.point) {
            entity.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            entity.point.heightReference = Cesium.HeightReference.NONE;
        }
        if (entity.billboard) {
            entity.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            entity.billboard.heightReference = Cesium.HeightReference.NONE;
        }
        if (entity.label) {
            entity.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            entity.label.heightReference = Cesium.HeightReference.NONE;
        }
        if (entity.polyline) {
            entity.polyline.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            entity.polyline.clampToGround = false;
        }
        if (entity.polygon) {
            entity.polygon.height = Math.max(baseHeight || 0, topH);
            entity.polygon.heightReference = Cesium.HeightReference.NONE;
            entity.polygon.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        }
        const isPoint = entity.point || entity.billboard ||
            (entity.position && !entity.polyline && !entity.polygon);
        if (isPoint && entity.position) {
            const time = viewer.clock.currentTime;
            const cart = entity.position.getValue(time);
            if (cart) {
                const c = Cesium.Cartographic.fromCartesian(cart);
                const h = Math.max(parseFloat(cfg.point.height) || 0, topH);
                entity.position = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h);
            }
        }
    }

    function refreshVizVectorLayers() {
        if (!isVizModeActive()) return;
        managedLayers.forEach(function (entry) {
            if (!isVectorEntry(entry)) return;
            applyVectorStyle(entry);
        });
    }

    function refreshAllVectorStyles() {
        managedLayers.forEach(function (entry) {
            if (isVectorEntry(entry)) applyVectorStyle(entry);
        });
    }

    function resetVizLayerRenderStyle(entity, cfg, useExtrude, baseHeight) {
        if (isVizModeActive()) return;
        if (entity.point) {
            entity.point.disableDepthTestDistance = undefined;
            entity.point.heightReference = getHeightReference(cfg, useExtrude, cfg.point.height);
        }
        if (entity.billboard) {
            entity.billboard.disableDepthTestDistance = undefined;
            entity.billboard.heightReference = getHeightReference(cfg, useExtrude, cfg.point.height);
        }
        if (entity.label) {
            entity.label.disableDepthTestDistance = undefined;
            entity.label.heightReference = getHeightReference(cfg, useExtrude, cfg.point.height);
        }
        if (entity.polyline) {
            entity.polyline.disableDepthTestDistance = undefined;
            entity.polyline.clampToGround = cfg.clampToGround && !useExtrude;
        }
        if (entity.polygon) {
            entity.polygon.disableDepthTestDistance = undefined;
            entity.polygon.height = baseHeight;
            entity.polygon.heightReference = useExtrude || !cfg.clampToGround
                ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND;
        }
        const isPoint = entity.point || entity.billboard ||
            (entity.position && !entity.polyline && !entity.polygon);
        if (isPoint && entity.position) {
            const h = parseFloat(cfg.point.height) || 0;
            const time = viewer.clock.currentTime;
            const cart = entity.position.getValue(time);
            if (cart) {
                const c = Cesium.Cartographic.fromCartesian(cart);
                entity.position = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h);
            }
        }
    }

    function applyVectorStyle(entry) {
        if (!isVectorEntry(entry)) return;
        const cfg = mergeStyleConfig(entry.extra.styleConfig);
        entry.extra.styleConfig = cfg;
        const ds = entry.obj;
        const pointColor = cssColor(cfg.point.color);
        const strokeColor = cssColor(cfg.polygon.strokeColor);
        const extrude = parseFloat(cfg.polygon.extrudedHeight) || 0;
        const baseHeight = parseFloat(cfg.polygon.height) || 0;
        const useExtrude = extrude > baseHeight;

        ds.entities.values.forEach(function (entity) {
            entity._vizLayerEntity = true;
            entity.description = undefined;
            const isPoint = entity.point || entity.billboard ||
                (entity.position && !entity.polyline && !entity.polygon);
            if (isPoint) {
                applyPointStyle(entity, pointColor, cfg, useExtrude);
            }
            if (entity.polyline) {
                entity.polyline.material = buildLineMaterial(cfg);
                entity.polyline.width = cfg.line.width || 3;
                entity.polyline.clampToGround = cfg.clampToGround && !useExtrude;
            }
            if (entity.polygon) {
                entity.polygon.material = buildPolygonFillMaterial(cfg);
                entity.polygon.outline = true;
                entity.polygon.outlineColor = strokeColor;
                entity.polygon.outlineWidth = cfg.polygon.strokeWidth || 2;
                entity.polygon.height = baseHeight;
                entity.polygon.extrudedHeight = useExtrude ? extrude : undefined;
                entity.polygon.perPositionHeight = false;
                entity.polygon.heightReference = useExtrude || !cfg.clampToGround
                    ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND;
            }
            applyVizLayerTopStyle(entity, cfg, useExtrude, baseHeight);
            resetVizLayerRenderStyle(entity, cfg, useExtrude, baseHeight);
        });
        raiseVectorDataSource(ds);
        entry.extra.geomTypes = computeGeomTypes(ds);
    }

    function switchAddTab(tab) {
        document.querySelectorAll('.layer-add-tab').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.layer-add-panel').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'layer-add-' + tab);
        });
    }

    function switchImportType(type) {
        document.querySelectorAll('.import-type-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.import === type);
        });
        const fileBox = document.getElementById('layer-import-file-box');
        const textBox = document.getElementById('layer-import-text-box');
        const gltfPos = document.getElementById('layer-gltf-pos');
        const tilesHeight = document.getElementById('layer-3dtiles-import-height');
        const fileLabel = document.getElementById('layer-import-file-label');
        const importHint = document.getElementById('layer-import-hint');
        const fileInput = document.getElementById('layer-import-file');
        const needsFile = type === 'geojson' || type === 'kml' || type === 'czml' || type === 'gltf' ||
            type === 'csv' || type === 'json' || type === '3dtiles';
        const needsText = type === 'wkt' || type === 'json' || type === 'geojson' || type === 'csv';
        if (fileBox) fileBox.style.display = needsFile ? 'block' : 'none';
        if (textBox) textBox.style.display = needsText ? 'block' : 'none';
        if (gltfPos) gltfPos.style.display = type === 'gltf' ? 'flex' : 'none';
        if (tilesHeight) tilesHeight.style.display = type === '3dtiles' ? 'block' : 'none';
        if (importHint) {
            importHint.textContent = type === '3dtiles'
                ? '选择包含 tileset.json 及 b3dm/pnts 等瓦片文件的本地文件夹（需通过 http 服务打开页面）'
                : '坐标均为 WGS84（EPSG:4326）';
        }
        if (fileLabel) {
            fileLabel.textContent = type === '3dtiles' ? '选择文件夹' : '选择文件';
        }
        if (fileInput) {
            fileInput.value = '';
            if (type === '3dtiles') {
                fileInput.setAttribute('webkitdirectory', '');
                fileInput.setAttribute('directory', '');
                fileInput.setAttribute('multiple', '');
                fileInput.removeAttribute('accept');
            } else {
                fileInput.removeAttribute('webkitdirectory');
                fileInput.removeAttribute('directory');
                fileInput.removeAttribute('multiple');
                const accepts = {
                    geojson: '.geojson,.json',
                    json: '.json,.geojson',
                    csv: '.csv,.txt',
                    kml: '.kml,.kmz',
                    czml: '.czml',
                    gltf: '.gltf,.glb',
                    wkt: '.wkt,.txt'
                };
                fileInput.accept = accepts[type] || '.geojson,.json,.csv,.txt,.wkt';
            }
        }
        const textEl = document.getElementById('layer-import-text');
        if (textEl) {
            if (type === 'wkt') textEl.placeholder = 'POINT(116.39 39.90)\nLINESTRING(116.39 39.90, 116.40 39.91)';
            else if (type === 'csv') textEl.placeholder = '经度,纬度 或 名称,经度,纬度（WGS84）';
            else textEl.placeholder = '粘贴 GeoJSON / JSON（可与文件二选一）';
        }
    }

    async function add3DTiles(url, name, heightOffset, extraOpts) {
        if (!url) throw new Error('请输入 3D Tiles URL');
        const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
        viewer.scene.primitives.add(tileset);
        if (tileset.readyPromise) await tileset.readyPromise;
        heightOffset = parseFloat(heightOffset) || 0;
        const baseGeo = captureTilesetBaseGeo(tileset);
        if (heightOffset !== 0) applyTilesetHeight(tileset, baseGeo, heightOffset);
        try { await zoomToLayerTarget(tileset); } catch (e) { /* ignore */ }
        const extra = Object.assign({
            heightOffset: heightOffset,
            baseGeo: baseGeo
        }, extraOpts || {});
        return addEntry(name || '3D Tiles', '3DTiles', tileset, extra);
    }

    async function addLocal3DTiles(fileList, name, heightOffset) {
        const prepared = await prepareLocalTilesetFiles(fileList);
        return add3DTiles(prepared.tilesetUrl, name || prepared.displayName, heightOffset, {
            blobUrls: prepared.blobUrls,
            isLocal: true
        });
    }

    async function addModel(url, lng, lat, height, scale, name) {
        if (!url) throw new Error('请输入模型 URL');
        lng = parseFloat(lng); lat = parseFloat(lat); height = parseFloat(height) || 0;
        scale = parseFloat(scale) || 1;
        if (isNaN(lng) || isNaN(lat)) throw new Error('请输入有效经纬度');
        const entity = viewer.entities.add({
            name: name || 'glTF模型',
            position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
            model: {
                uri: url,
                scale: scale,
                minimumPixelSize: 64,
                heightReference: height === 0 ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE
            }
        });
        await flyToLayerTarget(entity);
        return addEntry(name || 'glTF模型', 'Model', entity);
    }

    function isGeographicProjection(projection) {
        return projection === 'EPSG:4326' || projection === 'EPSG:4490';
    }

    function getImageryTilingScheme(projection) {
        if (projection === 'EPSG:3857') return new Cesium.WebMercatorTilingScheme();
        return new Cesium.GeographicTilingScheme();
    }

    function getHexLevelIndex(level, projection) {
        if (projection === 'EPSG:4490') return level + 1;
        return level;
    }

    function getXyzLevelIndex(level, projection) {
        if (projection === 'EPSG:4490') return level + 1;
        return level;
    }

    function createXyzProvider(url, projection) {
        const needsZTag = projection === 'EPSG:4490';
        const tileUrl = needsZTag ? url.replace(/\{z\}/gi, '{cz}') : url;
        const opts = {
            url: tileUrl,
            tilingScheme: getImageryTilingScheme(projection),
            maximumLevel: 20
        };
        if (needsZTag) {
            opts.customTags = {
                cz: function (imageryProvider, x, y, level) {
                    return String(getXyzLevelIndex(level, projection));
                }
            };
        }
        return new Cesium.UrlTemplateImageryProvider(opts);
    }

    function createXyzHexProvider(url, projection) {
        const baseUrl = url.endsWith('/') ? url : url + '/';
        return new Cesium.UrlTemplateImageryProvider({
            url: baseUrl + '{cz}/{cy}/{cx}.png',
            tilingScheme: getImageryTilingScheme(projection),
            maximumLevel: 20,
            customTags: {
                cx: function (imageryProvider, x, y, level) {
                    return 'C' + zeroPad(x, 8, 16);
                },
                cy: function (imageryProvider, x, y, level) {
                    return 'R' + zeroPad(y, 8, 16);
                },
                cz: function (imageryProvider, x, y, level) {
                    const z = getHexLevelIndex(level, projection);
                    return 'L' + zeroPad(z, 2, 10);
                }
            }
        });
    }

    async function addImagery(type, options) {
        const name = options.name;
        let provider;
        let layerName = name;

        if (type === 'xyz') {
            const url = (options.url || '').trim();
            if (!url) throw new Error('请输入 XYZ 瓦片 URL');
            provider = createXyzProvider(url, options.projection || 'EPSG:3857');
            layerName = layerName || 'XYZ瓦片';
        } else if (type === 'xyz_hex') {
            const url = (options.url || '').trim();
            if (!url) throw new Error('请输入 ArcGIS 十六进制缓存目录 URL');
            provider = createXyzHexProvider(url, options.projection || 'EPSG:4326');
            layerName = layerName || 'ArcGIS十六进制切片';
        } else if (type === 'arcgis') {
            const url = (options.url || '').trim();
            if (!url) throw new Error('请输入 ArcGIS MapServer URL');
            provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(url);
            layerName = layerName || 'ArcGIS服务';
        } else if (type === 'wms') {
            const url = (options.url || '').trim();
            if (!url) throw new Error('请输入 WMS 地址');
            provider = new Cesium.WebMapServiceImageryProvider({
                url: url,
                layers: options.layers || '',
                parameters: { transparent: true, format: 'image/png' }
            });
            layerName = layerName || 'WMS';
        } else if (type === 'custom') {
            return addCustomImagery(options.code, name);
        } else {
            throw new Error('未知影像类型');
        }
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        return addEntry(layerName, 'Imagery', layer);
    }

    function addCustomImagery(code, name) {
        const trimmed = (code || '').trim();
        if (!trimmed) throw new Error('请输入图层构造代码');
        const fn = new Function('viewer', 'Cesium', 'zeroPad', trimmed);
        const result = fn(viewer, Cesium, zeroPad);
        if (result instanceof Cesium.ImageryLayer) {
            viewer.imageryLayers.add(result, viewer.imageryLayers.length);
            return addEntry(name || '自定义影像', 'Custom', result);
        }
        if (result && typeof result.requestImage === 'function') {
            const layer = viewer.imageryLayers.addImageryProvider(result);
            return addEntry(name || '自定义影像', 'Custom', layer);
        }
        throw new Error('代码需 return Cesium.ImageryProvider 或 ImageryLayer');
    }

    function getDefaultCustomImageryCode() {
        return [
            '// 可用: viewer, Cesium, zeroPad',
            '// return ImageryProvider 或 ImageryLayer',
            'var baseUrl = "https://example.com/Layers/_alllayers/";',
            'return new Cesium.UrlTemplateImageryProvider({',
            '  url: baseUrl + "{cz}/{cy}/{cx}.png",',
            '  tilingScheme: new Cesium.GeographicTilingScheme(),',
            '  customTags: {',
            '    cx: function(p,x,y,l){ return "C" + zeroPad(x,8,16); },',
            '    cy: function(p,x,y,l){ return "R" + zeroPad(y,8,16); },',
            '    cz: function(p,x,y,l){ return "L" + zeroPad(l,2,10); } // 4326 用 l；4490 用 l+1',
            '  }',
            '});'
        ].join('\n');
    }

    async function enableTerrain(type) {
        if (type === 'cesium') {
            try {
                viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
                return addEntry('Cesium World Terrain', 'Terrain', { terrain: true }, { builtin: true });
            } catch (e) {
                throw new Error('地形加载失败，请配置 Cesium Ion Token');
            }
        }
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        return addEntry('椭球地形', 'Terrain', { terrain: true }, { builtin: true });
    }

    async function loadFeatureCollection(fc, name, typeLabel) {
        const ds = await Cesium.GeoJsonDataSource.load(fc, {
            clampToGround: true,
            stroke: Cesium.Color.fromCssColorString('#409eff'),
            fill: Cesium.Color.fromCssColorString('#409eff').withAlpha(0.35),
            strokeWidth: 2,
            markerSize: 8
        });
        viewer.dataSources.add(ds);
        const entry = addEntry(name || typeLabel, typeLabel, ds, {
            isVector: true,
            styleConfig: defaultVectorStyle()
        });
        applyVectorStyle(entry);
        entry.extra.geomTypes = computeGeomTypes(ds);
        await flyToLayerTarget(ds, { duration: 1.2 });
        return entry;
    }

    async function parseImportToFC(type, file, text) {
        if (type === 'geojson' || type === 'json') {
            let raw = text;
            if (file) raw = await file.text();
            if (!raw || !raw.trim()) throw new Error('请上传文件或粘贴 JSON 内容');
            const data = JSON.parse(raw);
            if (typeof CoordFileConverter !== 'undefined') {
                return CoordFileConverter.normalizeToFeatureCollection(data);
            }
            if (data.type === 'FeatureCollection') return data;
            if (data.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
            throw new Error('无法识别的 JSON 结构');
        }
        if (type === 'csv') {
            let raw = text;
            if (file) raw = await file.text();
            if (!raw || !raw.trim()) throw new Error('请上传 CSV 或粘贴坐标文本');
            if (typeof CoordFileConverter === 'undefined') throw new Error('CSV 解析需要 coord_file_converter.js');
            return CoordFileConverter.parseCSVToFeatureCollection(raw);
        }
        if (type === 'wkt') {
            const raw = (text || '').trim();
            if (!raw) throw new Error('请粘贴 WKT 文本');
            if (typeof CoordFileConverter === 'undefined') throw new Error('WKT 解析需要 wellknown.js 与 coord_file_converter.js');
            return CoordFileConverter.parseWKT(raw);
        }
        return null;
    }

    async function importGeoData(type) {
        const nameInput = document.getElementById('layer-import-name');
        const name = nameInput ? nameInput.value.trim() : '';
        const fileInput = document.getElementById('layer-import-file');
        const textInput = document.getElementById('layer-import-text');
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        const files = fileInput && fileInput.files ? fileInput.files : null;
        const text = textInput ? textInput.value : '';

        if (type === '3dtiles') {
            if (!files || !files.length) throw new Error('请选择本地 3D Tiles 文件夹');
            const heightEl = document.getElementById('layer-import-3dtiles-height');
            const heightOffset = heightEl ? heightEl.value : 0;
            return addLocal3DTiles(files, name, heightOffset);
        }
        if (type === 'kml') {
            if (!file) throw new Error('请选择 KML/KMZ 文件');
            const ds = await Cesium.KmlDataSource.load(file, {
                camera: isVizModeActive() ? undefined : viewer.scene.camera,
                canvas: viewer.scene.canvas
            });
            viewer.dataSources.add(ds);
            const entry = addEntry(name || file.name, 'KML', ds, { isVector: true, styleConfig: defaultVectorStyle() });
            applyVectorStyle(entry);
            entry.extra.geomTypes = computeGeomTypes(ds);
            await flyToLayerTarget(ds, { duration: 1.2 });
            return entry;
        }
        if (type === 'czml') {
            if (!file) throw new Error('请选择 CZML 文件');
            const ds = await Cesium.CzmlDataSource.load(file);
            viewer.dataSources.add(ds);
            await flyToLayerTarget(ds);
            return addEntry(name || file.name, 'CZML', ds);
        }
        if (type === 'gltf') {
            if (!file) throw new Error('请选择 glTF/GLB 文件');
            const url = URL.createObjectURL(file);
            const lng = parseFloat(document.getElementById('layer-gltf-lng').value) || 116.39;
            const lat = parseFloat(document.getElementById('layer-gltf-lat').value) || 39.9;
            return addModel(url, lng, lat, 0, 1, name || file.name);
        }
        if (type === 'geojson' || type === 'json' || type === 'csv' || type === 'wkt') {
            const fc = await parseImportToFC(type, file, text);
            const label = type === 'csv' ? 'CSV' : (type === 'wkt' ? 'WKT' : 'GeoJSON');
            return loadFeatureCollection(fc, name || label, label);
        }
        throw new Error('不支持的导入类型');
    }

    async function handleSubmit(tab, tk) {
        if (tab === '3dtiles') {
            await add3DTiles(
                document.getElementById('layer-3dtiles-url').value.trim(),
                document.getElementById('layer-3dtiles-name').value.trim(),
                document.getElementById('layer-3dtiles-height').value
            );
        } else if (tab === 'model') {
            await addModel(
                document.getElementById('layer-model-url').value.trim(),
                document.getElementById('layer-model-lng').value,
                document.getElementById('layer-model-lat').value,
                document.getElementById('layer-model-height').value,
                document.getElementById('layer-model-scale').value,
                document.getElementById('layer-model-name').value.trim()
            );
        } else if (tab === 'imagery') {
            const type = document.getElementById('layer-imagery-type').value;
            await addImagery(type, {
                url: document.getElementById('layer-imagery-url').value.trim(),
                layers: document.getElementById('layer-wms-layers').value.trim(),
                projection: document.getElementById('layer-imagery-projection').value,
                code: document.getElementById('layer-imagery-custom-code').value,
                name: document.getElementById('layer-imagery-name').value.trim()
            });
        } else if (tab === 'terrain') {
            await enableTerrain(document.getElementById('layer-terrain-type').value);
        } else if (tab === 'import') {
            const active = document.querySelector('.import-type-btn.active');
            await importGeoData(active ? active.dataset.import : 'geojson');
        }
    }

    function updateImageryForm(type) {
        const boxes = {
            url: document.getElementById('layer-imagery-url-box'),
            wms: document.getElementById('layer-wms-box'),
            proj: document.getElementById('layer-imagery-proj-box'),
            projHint: document.getElementById('layer-imagery-proj-hint'),
            hexHint: document.getElementById('layer-imagery-hex-hint'),
            custom: document.getElementById('layer-imagery-custom-box')
        };
        if (boxes.url) boxes.url.style.display = (type === 'xyz' || type === 'xyz_hex' || type === 'wms' || type === 'arcgis') ? 'block' : 'none';
        if (boxes.wms) boxes.wms.style.display = type === 'wms' ? 'block' : 'none';
        if (boxes.proj) boxes.proj.style.display = (type === 'xyz' || type === 'xyz_hex') ? 'block' : 'none';
        if (boxes.projHint) {
            const proj = document.getElementById('layer-imagery-projection');
            const p = proj ? proj.value : '';
            boxes.projHint.style.display = (type === 'xyz' || type === 'xyz_hex') && (p === 'EPSG:4490' || p === 'EPSG:4326') ? 'block' : 'none';
        }
        if (boxes.hexHint) boxes.hexHint.style.display = type === 'xyz_hex' ? 'block' : 'none';
        if (boxes.custom) boxes.custom.style.display = type === 'custom' ? 'block' : 'none';
        if (type === 'custom') {
            const codeEl = document.getElementById('layer-imagery-custom-code');
            if (codeEl && !codeEl.value.trim()) codeEl.value = getDefaultCustomImageryCode();
        }
        const urlInput = document.getElementById('layer-imagery-url');
        if (urlInput) {
            if (type === 'xyz') urlInput.placeholder = 'https://.../tile/{z}/{x}/{y}.png';
            else if (type === 'xyz_hex') urlInput.placeholder = 'https://.../Layers/_alllayers/';
            else if (type === 'arcgis') urlInput.placeholder = 'https://.../arcgis/rest/services/xxx/MapServer';
            else if (type === 'wms') urlInput.placeholder = 'https://.../wms';
        }
    }

    function toggleStyleSections(types) {
        types = types || { point: true, line: true, polygon: true };
        const map = {
            point: 'style-section-point',
            line: 'style-section-line',
            polygon: 'style-section-polygon'
        };
        Object.keys(map).forEach(function (key) {
            const el = document.getElementById(map[key]);
            if (el) el.style.display = types[key] ? 'block' : 'none';
        });
    }

    function openStyleSettings(id) {
        const entry = findEntry(id);
        if (!canStyleEntry(entry)) return;
        if (!entry.extra) entry.extra = {};
        entry.extra.isVector = true;
        if (!entry.extra.styleConfig) entry.extra.styleConfig = defaultVectorStyle();
        draftPointIconUrl = undefined;
        styleEditId = id;
        const cfg = mergeStyleConfig(entry.extra.styleConfig);
        entry.extra.styleConfig = cfg;
        const types = entry.extra.geomTypes || computeGeomTypes(entry.obj);
        entry.extra.geomTypes = types;
        toggleStyleSections(types);
        const title = document.getElementById('layer-style-title');
        if (title) title.textContent = '样式设置 - ' + entry.name;
        setVal('style-point-color', cfg.point.color);
        setVal('style-point-size', cfg.point.pixelSize);
        setVal('style-point-height', cfg.point.height || 0);
        setVal('style-point-icon-scale', cfg.point.iconScale || 1);
        setVal('style-point-label-size', cfg.point.labelFontSize || 14);
        setVal('style-point-label-color', cfg.point.labelColor || '#303133');
        populateLabelFieldSelect(entry.obj, cfg.point.labelField || '');
        updateIconPreview(cfg.point.iconUrl || '');
        const iconFile = document.getElementById('style-point-icon-file');
        if (iconFile) iconFile.value = '';
        setVal('style-line-color', cfg.line.color);
        setVal('style-line-width', cfg.line.width);
        setVal('style-line-material', cfg.line.material || 'solid');
        setVal('style-polygon-fill', cfg.polygon.fillColor);
        setVal('style-polygon-fill-opacity', Math.round((cfg.polygon.fillOpacity || 0.35) * 100));
        setVal('style-polygon-fill-material', cfg.polygon.fillMaterial || 'solid');
        setVal('style-polygon-stroke', cfg.polygon.strokeColor);
        setVal('style-polygon-stroke-width', cfg.polygon.strokeWidth);
        setVal('style-polygon-height', cfg.polygon.height || 0);
        setVal('style-polygon-extrude', cfg.polygon.extrudedHeight || 0);
        setChecked('style-clamp-ground', cfg.clampToGround);
        const modal = document.getElementById('layer-style-modal');
        if (modal) modal.classList.add('show');
    }

    function onPointIconFile(input) {
        const file = input && input.files && input.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件（PNG/JPG/SVG 等）');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            draftPointIconUrl = e.target.result;
            updateIconPreview(draftPointIconUrl);
        };
        reader.readAsDataURL(file);
    }

    function clearPointIcon() {
        draftPointIconUrl = '';
        updateIconPreview('');
        const iconFile = document.getElementById('style-point-icon-file');
        if (iconFile) iconFile.value = '';
    }

    function closeStyleSettings() {
        styleEditId = null;
        draftPointIconUrl = undefined;
        const modal = document.getElementById('layer-style-modal');
        if (modal) modal.classList.remove('show');
    }

    function applyStyleSettings() {
        const entry = styleEditId != null ? findEntry(styleEditId) : null;
        if (!entry || !isVectorEntry(entry)) return;
        const prevCfg = entry.extra.styleConfig || defaultVectorStyle();
        let iconUrl = prevCfg.point.iconUrl || '';
        if (draftPointIconUrl !== undefined) iconUrl = draftPointIconUrl || '';
        entry.extra.styleConfig = {
            point: {
                color: getVal('style-point-color') || '#409eff',
                pixelSize: parseFloat(getVal('style-point-size')) || 8,
                height: parseFloat(getVal('style-point-height')) || 0,
                iconUrl: iconUrl,
                iconScale: parseFloat(getVal('style-point-icon-scale')) || 1,
                labelField: getVal('style-point-label-field') || '',
                labelFontSize: parseFloat(getVal('style-point-label-size')) || 14,
                labelColor: getVal('style-point-label-color') || '#303133'
            },
            line: {
                color: getVal('style-line-color') || '#409eff',
                width: parseFloat(getVal('style-line-width')) || 3,
                material: getVal('style-line-material') || 'solid'
            },
            polygon: {
                fillColor: getVal('style-polygon-fill') || '#409eff',
                fillOpacity: Math.max(0, Math.min(100, parseFloat(getVal('style-polygon-fill-opacity')) || 35)) / 100,
                fillMaterial: getVal('style-polygon-fill-material') || 'solid',
                strokeColor: getVal('style-polygon-stroke') || '#409eff',
                strokeWidth: parseFloat(getVal('style-polygon-stroke-width')) || 2,
                height: parseFloat(getVal('style-polygon-height')) || 0,
                extrudedHeight: parseFloat(getVal('style-polygon-extrude')) || 0
            },
            clampToGround: getChecked('style-clamp-ground')
        };
        applyVectorStyle(entry);
        closeStyleSettings();
    }

    function setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = !!checked;
    }

    function getChecked(id) {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }

    return {
        init: init,
        switchAddTab: switchAddTab,
        switchImportType: switchImportType,
        updateImageryForm: updateImageryForm,
        handleSubmit: handleSubmit,
        toggleVisible: toggleVisible,
        setVisible: setVisible,
        setOpacity: setOpacity,
        setTilesetHeight: setTilesetHeight,
        moveLayer: moveLayer,
        removeLayer: removeLayer,
        locateLayer: locateLayer,
        openStyleSettings: openStyleSettings,
        closeStyleSettings: closeStyleSettings,
        applyStyleSettings: applyStyleSettings,
        onPointIconFile: onPointIconFile,
        clearPointIcon: clearPointIcon,
        getDefaultCustomImageryCode: getDefaultCustomImageryCode,
        add3DTiles: add3DTiles,
        addLocal3DTiles: addLocal3DTiles,
        addModel: addModel,
        zeroPad: zeroPad,
        getViewer: function () { return viewer; },
        pickHoverPointAt: pickHoverPointAt,
        buildEntityPropertiesHtml: buildEntityPropertiesHtml,
        refreshVizVectorLayers: refreshVizVectorLayers,
        refreshAllVectorStyles: refreshAllVectorStyles,
        clearLayerSelection: clearLayerSelection
    };
})();
