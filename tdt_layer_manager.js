/**
 * 天地图页面 - 自定义图层管理
 * 依赖: OpenLayers (ol), 可选 CoordFileConverter / wellknown / shpjs
 */
const TdtLayerManager = (function () {
    'use strict';

    let map = null;
    let listEl = null;
    let onFeatureClick = null;
    let styleEditId = null;
    let pendingIconDataUrl = null;
    const managedLayers = [];
    let uid = 1;
    const Z_BASE = 30;

    function zeroPad(num, len, radix) {
        var str = num.toString(radix || 10);
        while (str.length < len) str = '0' + str;
        return str;
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function defaultStyleConfig() {
        return {
            point: {
                renderType: 'circle',
                circleFill: '#e6a23c',
                circleStroke: '#ffffff',
                circleStrokeWidth: 2,
                circleRadius: 6,
                iconUrl: '',
                iconScale: 1
            },
            line: { color: '#e6a23c', width: 2, lineDash: '' },
            polygon: {
                strokeColor: '#e6a23c',
                strokeWidth: 2,
                lineDash: '',
                fillColor: '#e6a23c',
                fillOpacity: 0.25
            },
            label: {
                enabled: false,
                field: '',
                fontSize: 12,
                fontColor: '#303133',
                outlineColor: '#ffffff',
                outlineWidth: 3,
                offsetX: 0,
                offsetY: -14
            }
        };
    }

    function cloneStyleConfig(cfg) {
        return JSON.parse(JSON.stringify(cfg || defaultStyleConfig()));
    }

    function hexToRgba(hex, alpha) {
        const h = String(hex || '#000000').replace('#', '');
        if (h.length < 6) return 'rgba(0,0,0,' + alpha + ')';
        const r = parseInt(h.substr(0, 2), 16);
        const g = parseInt(h.substr(2, 2), 16);
        const b = parseInt(h.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function parseLineDash(str) {
        if (!str || !String(str).trim()) return null;
        const parts = String(str).split(',').map(function (n) { return parseFloat(n.trim()); });
        return parts.some(isNaN) ? null : parts;
    }

    function classifyGeom(geom, types) {
        if (!geom) return;
        const t = geom.getType();
        if (t === 'Point' || t === 'MultiPoint') types.point = true;
        else if (t === 'LineString' || t === 'MultiLineString') types.line = true;
        else if (t === 'Polygon' || t === 'MultiPolygon') types.polygon = true;
        else if (t === 'GeometryCollection') {
            geom.getGeometries().forEach(function (g) { classifyGeom(g, types); });
        }
    }

    function detectGeomTypes(layer) {
        const source = layer.getSource && layer.getSource();
        const types = { point: false, line: false, polygon: false };
        if (!source || !source.getFeatures) return ['point'];
        source.getFeatures().forEach(function (f) { classifyGeom(f.getGeometry(), types); });
        const list = Object.keys(types).filter(function (k) { return types[k]; });
        return list.length ? list : ['point'];
    }

    function collectPropertyKeys(layer) {
        const source = layer.getSource && layer.getSource();
        const keys = {};
        if (!source || !source.getFeatures) return [];
        source.getFeatures().forEach(function (f) {
            Object.keys(f.getProperties()).forEach(function (k) {
                if (k !== 'geometry') keys[k] = true;
            });
        });
        return Object.keys(keys).sort();
    }

    function buildPointImage(cfg) {
        if (cfg.renderType === 'icon' && cfg.iconUrl) {
            return new ol.style.Icon({
                src: cfg.iconUrl,
                scale: cfg.iconScale != null ? cfg.iconScale : 1,
                anchor: [0.5, 0.5]
            });
        }
        return new ol.style.Circle({
            radius: cfg.circleRadius != null ? cfg.circleRadius : 6,
            fill: new ol.style.Fill({ color: cfg.circleFill || '#e6a23c' }),
            stroke: new ol.style.Stroke({
                color: cfg.circleStroke || '#ffffff',
                width: cfg.circleStrokeWidth != null ? cfg.circleStrokeWidth : 2
            })
        });
    }

    function buildStroke(cfg) {
        return new ol.style.Stroke({
            color: cfg.color || cfg.strokeColor || '#e6a23c',
            width: cfg.width != null ? cfg.width : (cfg.strokeWidth != null ? cfg.strokeWidth : 2),
            lineDash: parseLineDash(cfg.lineDash)
        });
    }

    function buildLabelStyle(labelCfg, text, geom) {
        const gType = geom.getType();
        let placement = 'point';
        let labelGeometry = null;
        if (gType.indexOf('Line') >= 0) placement = 'line';
        else if (gType.indexOf('Polygon') >= 0) {
            labelGeometry = function (feature) {
                return new ol.geom.Point(ol.extent.getCenter(feature.getGeometry().getExtent()));
            };
        }
        const styleOpts = {
            text: new ol.style.Text({
                text: text,
                font: (labelCfg.fontSize || 12) + 'px sans-serif',
                fill: new ol.style.Fill({ color: labelCfg.fontColor || '#303133' }),
                stroke: new ol.style.Stroke({
                    color: labelCfg.outlineColor || '#ffffff',
                    width: labelCfg.outlineWidth != null ? labelCfg.outlineWidth : 3
                }),
                offsetX: labelCfg.offsetX || 0,
                offsetY: labelCfg.offsetY != null ? labelCfg.offsetY : -14,
                placement: placement,
                overflow: true
            })
        };
        if (labelGeometry) styleOpts.geometry = labelGeometry;
        return new ol.style.Style(styleOpts);
    }

    function createStyleFunction(entry) {
        return function (feature) {
            const geom = feature.getGeometry();
            if (!geom) return null;
            const gType = geom.getType();
            const cfg = entry.styleConfig || defaultStyleConfig();
            const styles = [];

            if (gType === 'Point' || gType === 'MultiPoint') {
                styles.push(new ol.style.Style({ image: buildPointImage(cfg.point) }));
            } else if (gType === 'LineString' || gType === 'MultiLineString') {
                styles.push(new ol.style.Style({ stroke: buildStroke(cfg.line) }));
            } else if (gType === 'Polygon' || gType === 'MultiPolygon') {
                styles.push(new ol.style.Style({
                    stroke: buildStroke({
                        color: cfg.polygon.strokeColor,
                        width: cfg.polygon.strokeWidth,
                        lineDash: cfg.polygon.lineDash
                    }),
                    fill: new ol.style.Fill({
                        color: hexToRgba(cfg.polygon.fillColor, cfg.polygon.fillOpacity != null ? cfg.polygon.fillOpacity : 0.25)
                    })
                }));
            } else {
                styles.push(new ol.style.Style({
                    stroke: buildStroke(cfg.line),
                    fill: new ol.style.Fill({
                        color: hexToRgba(cfg.polygon.fillColor, cfg.polygon.fillOpacity != null ? cfg.polygon.fillOpacity : 0.25)
                    }),
                    image: buildPointImage(cfg.point)
                }));
            }

            if (cfg.label.enabled && cfg.label.field) {
                const val = feature.get(cfg.label.field);
                if (val != null && val !== '') {
                    styles.push(buildLabelStyle(cfg.label, String(val), geom));
                }
            }
            return styles.length === 1 ? styles[0] : styles;
        };
    }

    function initLayerStyle(entry) {
        if (!isVectorLayer(entry.layer)) return;
        entry.geomTypes = detectGeomTypes(entry.layer);
        entry.propertyKeys = collectPropertyKeys(entry.layer);
        entry.styleConfig = entry.styleConfig || defaultStyleConfig();
        applyLayerStyle(entry);
    }

    function applyLayerStyle(entry) {
        if (!isVectorLayer(entry.layer)) return;
        entry.layer.setStyle(createStyleFunction(entry));
    }

    function getProjection(code) {
        if (!code || code === 'EPSG:4326') return ol.proj.get('EPSG:4326');
        if (code === 'EPSG:3857') return ol.proj.get('EPSG:3857');
        return ol.proj.get(code) || ol.proj.get('EPSG:4326');
    }

    function init(mapInstance, listContainerId, options) {
        map = mapInstance;
        listEl = document.getElementById(listContainerId);
        onFeatureClick = options && options.onFeatureClick;
        renderList();
    }

    function isVectorLayer(layer) {
        return layer instanceof ol.layer.Vector;
    }

    function applyZIndices() {
        managedLayers.forEach(function (e, i) {
            e.layer.setZIndex(Z_BASE + i);
        });
    }

    function register(layer, meta) {
        if (!map || !layer) throw new Error('地图或图层无效');
        const entry = {
            id: uid++,
            name: meta.name || ('图层' + uid),
            type: meta.type || 'unknown',
            layer: layer,
            visible: true,
            opacity: meta.opacity != null ? meta.opacity : 1,
            interactive: meta.interactive === true
        };
        layer.setVisible(true);
        layer.setOpacity(entry.opacity);
        map.addLayer(layer);
        managedLayers.push(entry);
        applyZIndices();
        if (isVectorLayer(layer)) initLayerStyle(entry);
        renderList();
        return entry;
    }

    function findEntry(id) {
        return managedLayers.find(function (e) { return e.id === id; });
    }

    function toggleVisible(id) {
        const entry = findEntry(id);
        if (!entry) return;
        entry.visible = !entry.visible;
        entry.layer.setVisible(entry.visible);
        renderList();
    }

    function removeLayer(id) {
        const idx = managedLayers.findIndex(function (e) { return e.id === id; });
        if (idx < 0) return;
        map.removeLayer(managedLayers[idx].layer);
        managedLayers.splice(idx, 1);
        applyZIndices();
        renderList();
    }

    function setOpacity(id, value, inputEl) {
        const entry = findEntry(id);
        if (!entry) return;
        const opacity = Math.max(0, Math.min(100, parseInt(value, 10) || 0)) / 100;
        entry.opacity = opacity;
        entry.layer.setOpacity(opacity);
        if (inputEl) {
            const row = inputEl.closest('.layer-opacity-row');
            if (row) {
                const valEl = row.querySelector('.layer-opacity-value');
                if (valEl) valEl.textContent = Math.round(opacity * 100) + '%';
            }
        }
    }

    function moveLayer(id, direction) {
        const idx = managedLayers.findIndex(function (e) { return e.id === id; });
        if (idx < 0) return;
        const newIdx = direction === 'up' ? idx + 1 : idx - 1;
        if (newIdx < 0 || newIdx >= managedLayers.length) return;
        const tmp = managedLayers[idx];
        managedLayers[idx] = managedLayers[newIdx];
        managedLayers[newIdx] = tmp;
        applyZIndices();
        renderList();
    }

    function handleMapClick(evt) {
        if (!map) return false;
        let handled = false;
        map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
            const entry = managedLayers.find(function (e) { return e.layer === layer; });
            if (!entry || !entry.visible || !entry.interactive) return;
            if (typeof onFeatureClick === 'function') {
                onFeatureClick(feature, evt.coordinate, entry);
            }
            handled = true;
            return true;
        }, {
            layerFilter: function (layer) {
                return managedLayers.some(function (e) {
                    return e.layer === layer && e.visible && e.interactive;
                });
            }
        });
        return handled;
    }

    function renderList() {
        const html = buildListHtml();
        if (listEl) listEl.innerHTML = html;
    }

    function buildListHtml() {
        if (!managedLayers.length) {
            return '<div class="layer-empty">暂无自定义图层</div>';
        }
        const items = managedLayers.map(function (e, idx) {
            return { entry: e, idx: idx };
        }).reverse();

        return items.map(function (item) {
            const e = item.entry;
            const idx = item.idx;
            const opacityPct = Math.round((e.opacity != null ? e.opacity : 1) * 100);
            const upDisabled = idx >= managedLayers.length - 1 ? ' disabled' : '';
            const downDisabled = idx <= 0 ? ' disabled' : '';
            const canStyle = isVectorLayer(e.layer);
            return '<div class="layer-item">' +
                '<div class="layer-item-head">' +
                '<label class="layer-item-main">' +
                '<input type="checkbox" ' + (e.visible ? 'checked' : '') + ' onchange="TdtLayerManager.toggleVisible(' + e.id + ')">' +
                '<span class="layer-name" title="' + escapeHtml(e.name) + '">' + escapeHtml(e.name) + '</span>' +
                '<span class="layer-type">' + escapeHtml(e.type) + '</span>' +
                '</label>' +
                '<div class="layer-order-btns">' +
                '<button type="button" class="layer-settings-btn"' + (canStyle ? '' : ' disabled') +
                ' onclick="TdtLayerManager.openStyleSettings(' + e.id + ')" title="样式设置">⚙</button>' +
                '<button type="button" class="layer-order-btn"' + upDisabled + ' onclick="TdtLayerManager.moveLayer(' + e.id + ',\'up\')" title="上移一层">▲</button>' +
                '<button type="button" class="layer-order-btn"' + downDisabled + ' onclick="TdtLayerManager.moveLayer(' + e.id + ',\'down\')" title="下移一层">▼</button>' +
                '<button type="button" class="layer-del" onclick="TdtLayerManager.removeLayer(' + e.id + ')" title="移除">×</button>' +
                '</div>' +
                '</div>' +
                '<div class="layer-opacity-row">' +
                '<span class="layer-opacity-label">透明度</span>' +
                '<input type="range" class="layer-opacity-slider" min="0" max="100" value="' + opacityPct + '" oninput="TdtLayerManager.setOpacity(' + e.id + ', this.value, this)">' +
                '<span class="layer-opacity-value">' + opacityPct + '%</span>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function geojsonToLayer(fc, name) {
        const format = new ol.format.GeoJSON();
        const features = format.readFeatures(fc, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:4326'
        });
        if (!features.length) throw new Error('未解析到有效要素');
        const source = new ol.source.Vector({ features: features });
        const layer = new ol.layer.Vector({ source: source });
        return register(layer, { name: name, type: '矢量数据', interactive: true });
    }

    async function importData(type, options) {
        const name = options.name || ('导入图层' + uid);
        let fc;

        if (type === 'wkt') {
            if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');
            fc = CoordFileConverter.parseWKT(options.text || '');
        } else if (type === 'csv') {
            if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');
            if (!options.file && !options.text) throw new Error('请选择 CSV 文件或粘贴内容');
            const csvText = options.file ? await options.file.text() : (options.text || '');
            fc = CoordFileConverter.parseCSVToFeatureCollection(csvText);
        } else if (type === 'shp') {
            if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');
            if (!options.file) throw new Error('请选择 Shapefile 文件');
            fc = await CoordFileConverter.loadShapefile(options.file);
        } else if (type === 'json' || type === 'geojson') {
            if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');
            let data;
            if (options.file) {
                data = JSON.parse(await options.file.text());
            } else if (options.text) {
                data = JSON.parse(options.text);
            } else {
                throw new Error('请上传文件或粘贴内容');
            }
            fc = CoordFileConverter.normalizeToFeatureCollection(data);
        } else {
            throw new Error('不支持的导入类型: ' + type);
        }

        const entry = geojsonToLayer(fc, name);
        fitToLayer(entry.layer);
        return entry;
    }

    function fitToLayer(layer) {
        if (!map || !layer) return;
        const source = layer.getSource && layer.getSource();
        if (!source || !source.getExtent) return;
        const extent = source.getExtent();
        if (extent && extent.every(isFinite)) {
            map.getView().fit(extent, { padding: typeof getMapFitPadding === 'function' ? getMapFitPadding() : [50, 50, 50, 50], duration: 500, maxZoom: 16 });
        }
    }

    function createXyzDecimal(url, options) {
        const proj = getProjection(options.projection);
        const is4326 = options.projection === 'EPSG:4326' || !options.projection;
        let sourceOpts = {
            crossOrigin: 'Anonymous',
            projection: proj
        };
//      if (url.indexOf('{z}') >= 0 || url.indexOf('{x}') >= 0) {
//          sourceOpts.url = url;
//      } else {
            sourceOpts.tileUrlFunction = function (tileCoord) {
                const z = is4326? tileCoord[0]-1:tileCoord[0];
                const x = tileCoord[1];
                const y = tileCoord[2];
                const ry = is4326 ? y : (-y - 1);
                
                return url.replace(/\{z\}/gi, z).replace(/\{x\}/gi, x).replace(/\{y\}/gi, ry).replace(/\{-y\}/gi, ry);
            };
//      }
        return new ol.layer.Tile({ source: new ol.source.XYZ(sourceOpts) });
    }

    function createXyzHex(url, options) {
        const proj = getProjection(options.projection || 'EPSG:4326');
        const baseUrl = url.endsWith('/') ? url : url + '/';
        return new ol.layer.Tile({
            source: new ol.source.XYZ({
                crossOrigin: 'Anonymous',
                projection: proj,
                tileUrlFunction: function (tileCoord) {
                    var x = 'C' + zeroPad(tileCoord[1], 8, 16);
                    var y = 'R' + zeroPad(tileCoord[2], 8, 16);
                    var z = 'L' + zeroPad(tileCoord[0], 2, 10);
                    if(proj.code_=="EPSG:4326"){
                    	z='L'+ zeroPad(tileCoord[0]-1, 2 ,10);
                    }
                    return baseUrl + z + '/' + y + '/' + x + '.png';
                }
            })
        });
    }

    function createWms(url, options) {
        return new ol.layer.Tile({
            source: new ol.source.TileWMS({
                url: url,
                params: {
                    LAYERS: options.layers || '',
                    TILED: true,
                    VERSION: options.version || '1.1.1'
                },
                crossOrigin: 'anonymous'
            })
        });
    }

    function createWmts(url, options) {
        const projection = getProjection(options.projection || 'EPSG:4326');
        const resolutions = options.resolutions
            ? options.resolutions.split(',').map(Number)
            : (function () {
                const r = [];
                for (let z = 0; z <= 18; z++) r.push(360 / 256 / Math.pow(2, z));
                return r;
            })();
        const matrixIds = resolutions.map(function (_, i) { return String(i); });
        return new ol.layer.Tile({
            source: new ol.source.WMTS({
                url: url,
                layer: options.layer || '',
                matrixSet: options.matrixSet || 'EPSG:4326',
                format: options.format || 'image/png',
                style: options.style || 'default',
                projection: projection,
                tileGrid: new ol.tilegrid.WMTS({
                    origin: ol.extent.getTopLeft(projection.getExtent()),
                    resolutions: resolutions,
                    matrixIds: matrixIds
                }),
                wrapX: true
            })
        });
    }

    function createVectorTile(url, options) {
        const format = new ol.format.MVT();
        return new ol.layer.VectorTile({
            source: new ol.source.VectorTile({
                format: format,
                url: url,
                projection: getProjection(options.projection || 'EPSG:3857')
            })
        });
    }

    function createArcGIS(url, options) {
        return new ol.layer.Tile({
            source: new ol.source.TileArcGISRest({
                url: url,
                params: options.params || {},
                crossOrigin: 'anonymous'
            })
        });
    }

    function addUrlLayer(type, options) {
        const name = options.name || ('URL图层' + uid);
        const url = (options.url || '').trim();
        if (!url) throw new Error('请输入服务 URL');

        let layer;
        switch (type) {
            case 'xyz':
                layer = createXyzDecimal(url, options);
                break;
            case 'xyz_hex':
                layer = createXyzHex(url, options);
                break;
            case 'wms':
                if (!options.layers) throw new Error('WMS 需填写 LAYERS 参数');
                layer = createWms(url, options);
                break;
            case 'wmts':
                if (!options.layer) throw new Error('WMTS 需填写图层名');
                layer = createWmts(url, options);
                break;
            case 'vectortile':
                layer = createVectorTile(url, options);
                break;
            case 'arcgis':
                layer = createArcGIS(url, options);
                break;
            default:
                throw new Error('不支持的 URL 类型: ' + type);
        }

        const typeLabels = {
            xyz: 'XYZ(十进制)',
            xyz_hex: 'XYZ(十六进制)',
            wms: 'WMS',
            wmts: 'WMTS',
            vectortile: 'VectorTile',
            arcgis: 'ArcGIS'
        };
        return register(layer, { name: name, type: typeLabels[type] || type });
    }

    function addCustomLayer(code, name) {
        const trimmed = (code || '').trim();
        if (!trimmed) throw new Error('请输入图层构造代码');
        const fn = new Function('ol', 'map', 'zeroPad', trimmed);
        const result = fn(ol, map, zeroPad);
        if (!result || typeof result.setMap !== 'function') {
            throw new Error('代码需 return 一个 OpenLayers 图层对象 (ol.layer.*)');
        }
        return register(result, {
            name: name || ('自定义图层' + uid),
            type: '自定义',
            interactive: isVectorLayer(result)
        });
    }

    function getDefaultCustomCode() {
        return [
            '// 可用变量: ol, map, zeroPad',
            '// 需 return 一个图层对象',
            'return new ol.layer.Tile({',
            '  source: new ol.source.XYZ({',
            '    crossOrigin: "Anonymous",',
            '    projection: ol.proj.get("EPSG:4326"),',
            '    tileUrlFunction: function (tileCoord) {',
            '      var x = "C" + zeroPad(tileCoord[1], 8, 16);',
            '      var y = "R" + zeroPad(tileCoord[2], 8, 16);',
            '      var z = "L" + zeroPad(tileCoord[0], 2, 10);',
            '      return "https://example.com/Layers/_alllayers/" + z + "/" + y + "/" + x + ".png";',
            '    }',
            '  })',
            '});'
        ].join('\n');
    }

    function updateUrlFormVisibility(type) {
        document.querySelectorAll('.url-opt').forEach(function (el) {
            el.style.display = 'none';
        });
        const showMap = {
            wms: ['url-opt-wms'],
            wmts: ['url-opt-wmts', 'url-opt-proj'],
            xyz: ['url-opt-proj'],
            xyz_hex: ['url-opt-proj'],
            vectortile: ['url-opt-proj-vt'],
            arcgis: []
        };
        (showMap[type] || []).forEach(function (cls) {
            document.querySelectorAll('.' + cls).forEach(function (el) {
                el.style.display = 'block';
            });
        });
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
        const fileInput = document.getElementById('layer-import-file');
        const needsFile = type === 'csv' || type === 'shp' || type === 'json' || type === 'geojson';
        const needsText = type === 'wkt' || type === 'json' || type === 'geojson';
        if (fileBox) fileBox.style.display = needsFile ? 'block' : 'none';
        if (textBox) textBox.style.display = needsText ? 'block' : 'none';
        if (fileInput) {
            if (type === 'csv') fileInput.accept = '.csv,.txt';
            else if (type === 'shp') fileInput.accept = '.zip,.shp';
            else fileInput.accept = '.json,.geojson';
        }
        const textEl = document.getElementById('layer-import-text');
        if (textEl) {
            textEl.placeholder = type === 'wkt'
                ? 'POINT(116.39 39.90)\nLINESTRING(...)'
                : '粘贴 GeoJSON / JSON 内容（可与文件二选一）';
        }
    }

    async function handleImportSubmit() {
        const typeBtn = document.querySelector('.import-type-btn.active');
        const type = typeBtn ? typeBtn.dataset.import : 'csv';
        const name = document.getElementById('layer-import-name').value.trim();
        const fileInput = document.getElementById('layer-import-file');
        const text = document.getElementById('layer-import-text').value;
        await importData(type, {
            name: name,
            file: fileInput.files && fileInput.files[0] ? fileInput.files[0] : null,
            text: text
        });
    }

    function handleUrlSubmit() {
        const type = document.getElementById('layer-url-type').value;
        const projVt = document.getElementById('layer-url-projection-vt');
        const proj = document.getElementById('layer-url-projection');
        addUrlLayer(type, {
            url: document.getElementById('layer-url-base').value.trim(),
            name: document.getElementById('layer-url-name').value.trim(),
            layers: document.getElementById('layer-url-wms-layers').value.trim(),
            layer: document.getElementById('layer-url-wmts-layer').value.trim(),
            matrixSet: document.getElementById('layer-url-wmts-matrix').value.trim(),
            format: document.getElementById('layer-url-wmts-format').value.trim(),
            style: document.getElementById('layer-url-wmts-style').value.trim(),
            projection: type === 'vectortile'
                ? (projVt ? projVt.value : 'EPSG:3857')
                : (proj ? proj.value : 'EPSG:4326')
        });
    }

    function handleCustomSubmit() {
        addCustomLayer(
            document.getElementById('layer-custom-code').value,
            document.getElementById('layer-custom-name').value.trim()
        );
    }

    function setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = !!checked;
    }

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function getChecked(id) {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }

    function togglePointModeUI() {
        const mode = document.querySelector('input[name="style-point-mode"]:checked');
        const isIcon = mode && mode.value === 'icon';
        const circlePanel = document.getElementById('style-point-circle-panel');
        const iconPanel = document.getElementById('style-point-icon-panel');
        if (circlePanel) circlePanel.style.display = isIcon ? 'none' : 'block';
        if (iconPanel) iconPanel.style.display = isIcon ? 'block' : 'none';
    }

    function populateStyleModal(entry) {
        const cfg = entry.styleConfig || defaultStyleConfig();
        const titleEl = document.getElementById('layer-style-title');
        if (titleEl) titleEl.textContent = '样式设置 - ' + entry.name;

        const types = entry.geomTypes || ['point'];
        document.getElementById('style-section-point').style.display = types.indexOf('point') >= 0 ? 'block' : 'none';
        document.getElementById('style-section-line').style.display = types.indexOf('line') >= 0 ? 'block' : 'none';
        document.getElementById('style-section-polygon').style.display = types.indexOf('polygon') >= 0 ? 'block' : 'none';

        const mode = cfg.point.renderType || 'circle';
        document.querySelectorAll('input[name="style-point-mode"]').forEach(function (r) {
            r.checked = r.value === mode;
        });
        setVal('style-point-fill', cfg.point.circleFill || '#e6a23c');
        setVal('style-point-stroke', cfg.point.circleStroke || '#ffffff');
        setVal('style-point-radius', cfg.point.circleRadius != null ? cfg.point.circleRadius : 6);
        setVal('style-point-stroke-width', cfg.point.circleStrokeWidth != null ? cfg.point.circleStrokeWidth : 2);
        setVal('style-point-icon-scale', cfg.point.iconScale != null ? cfg.point.iconScale : 1);

        const preview = document.getElementById('style-point-icon-preview');
        if (preview) {
            if (cfg.point.iconUrl) {
                preview.src = cfg.point.iconUrl;
                preview.style.display = 'block';
            } else {
                preview.src = '';
                preview.style.display = 'none';
            }
        }
        const iconFile = document.getElementById('style-point-icon-file');
        if (iconFile) iconFile.value = '';
        pendingIconDataUrl = null;
        togglePointModeUI();

        setVal('style-line-color', cfg.line.color || '#e6a23c');
        setVal('style-line-width', cfg.line.width != null ? cfg.line.width : 2);
        setVal('style-line-dash', cfg.line.lineDash || '');

        setVal('style-polygon-stroke', cfg.polygon.strokeColor || '#e6a23c');
        setVal('style-polygon-stroke-width', cfg.polygon.strokeWidth != null ? cfg.polygon.strokeWidth : 2);
        setVal('style-polygon-dash', cfg.polygon.lineDash || '');
        setVal('style-polygon-fill', cfg.polygon.fillColor || '#e6a23c');
        setVal('style-polygon-fill-opacity', Math.round((cfg.polygon.fillOpacity != null ? cfg.polygon.fillOpacity : 0.25) * 100));

        setChecked('style-label-enabled', cfg.label.enabled);
        setVal('style-label-size', cfg.label.fontSize != null ? cfg.label.fontSize : 12);
        setVal('style-label-color', cfg.label.fontColor || '#303133');
        setVal('style-label-outline-color', cfg.label.outlineColor || '#ffffff');
        setVal('style-label-outline-width', cfg.label.outlineWidth != null ? cfg.label.outlineWidth : 3);
        setVal('style-label-offset-x', cfg.label.offsetX || 0);
        setVal('style-label-offset-y', cfg.label.offsetY != null ? cfg.label.offsetY : -14);

        const fieldSelect = document.getElementById('style-label-field');
        if (fieldSelect) {
            const keys = entry.propertyKeys || [];
            fieldSelect.innerHTML = '<option value="">请选择字段</option>' +
                keys.map(function (k) {
                    return '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
                }).join('');
            fieldSelect.value = cfg.label.field || '';
        }
    }

    function openStyleSettings(id) {
        const entry = findEntry(id);
        if (!entry || !isVectorLayer(entry.layer)) return;
        styleEditId = id;
        entry.propertyKeys = collectPropertyKeys(entry.layer);
        populateStyleModal(entry);
        const modal = document.getElementById('layer-style-modal');
        if (modal) modal.classList.add('show');
    }

    function closeStyleSettings() {
        styleEditId = null;
        pendingIconDataUrl = null;
        const modal = document.getElementById('layer-style-modal');
        if (modal) modal.classList.remove('show');
    }

    function handleStyleIconFile(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            pendingIconDataUrl = e.target.result;
            const preview = document.getElementById('style-point-icon-preview');
            if (preview) {
                preview.src = pendingIconDataUrl;
                preview.style.display = 'block';
            }
            document.querySelectorAll('input[name="style-point-mode"]').forEach(function (r) {
                r.checked = r.value === 'icon';
            });
            togglePointModeUI();
        };
        reader.readAsDataURL(file);
    }

    function readStyleFromForm(entry) {
        const cfg = cloneStyleConfig(entry.styleConfig);
        const modeEl = document.querySelector('input[name="style-point-mode"]:checked');
        cfg.point.renderType = modeEl ? modeEl.value : 'circle';
        cfg.point.circleFill = getVal('style-point-fill') || '#e6a23c';
        cfg.point.circleStroke = getVal('style-point-stroke') || '#ffffff';
        cfg.point.circleRadius = parseFloat(getVal('style-point-radius')) || 6;
        cfg.point.circleStrokeWidth = parseFloat(getVal('style-point-stroke-width'));
        if (isNaN(cfg.point.circleStrokeWidth)) cfg.point.circleStrokeWidth = 2;
        cfg.point.iconScale = parseFloat(getVal('style-point-icon-scale')) || 1;
        if (pendingIconDataUrl) cfg.point.iconUrl = pendingIconDataUrl;
        else if (cfg.point.renderType === 'icon' && entry.styleConfig && entry.styleConfig.point.iconUrl) {
            cfg.point.iconUrl = entry.styleConfig.point.iconUrl;
        }

        cfg.line.color = getVal('style-line-color') || '#e6a23c';
        cfg.line.width = parseFloat(getVal('style-line-width')) || 2;
        cfg.line.lineDash = getVal('style-line-dash');

        cfg.polygon.strokeColor = getVal('style-polygon-stroke') || '#e6a23c';
        cfg.polygon.strokeWidth = parseFloat(getVal('style-polygon-stroke-width'));
        if (isNaN(cfg.polygon.strokeWidth)) cfg.polygon.strokeWidth = 2;
        cfg.polygon.lineDash = getVal('style-polygon-dash');
        cfg.polygon.fillColor = getVal('style-polygon-fill') || '#e6a23c';
        cfg.polygon.fillOpacity = Math.max(0, Math.min(100, parseFloat(getVal('style-polygon-fill-opacity')) || 25)) / 100;

        cfg.label.enabled = getChecked('style-label-enabled');
        cfg.label.field = getVal('style-label-field');
        cfg.label.fontSize = parseFloat(getVal('style-label-size')) || 12;
        cfg.label.fontColor = getVal('style-label-color') || '#303133';
        cfg.label.outlineColor = getVal('style-label-outline-color') || '#ffffff';
        cfg.label.outlineWidth = parseFloat(getVal('style-label-outline-width'));
        if (isNaN(cfg.label.outlineWidth)) cfg.label.outlineWidth = 3;
        cfg.label.offsetX = parseFloat(getVal('style-label-offset-x')) || 0;
        cfg.label.offsetY = parseFloat(getVal('style-label-offset-y'));
        if (isNaN(cfg.label.offsetY)) cfg.label.offsetY = -14;

        return cfg;
    }

    function applyStyleSettings() {
        const entry = styleEditId != null ? findEntry(styleEditId) : null;
        if (!entry) return;
        entry.styleConfig = readStyleFromForm(entry);
        applyLayerStyle(entry);
        closeStyleSettings();
    }

    return {
        init: init,
        register: register,
        toggleVisible: toggleVisible,
        removeLayer: removeLayer,
        setOpacity: setOpacity,
        moveLayer: moveLayer,
        handleMapClick: handleMapClick,
        renderList: renderList,
        importData: importData,
        addUrlLayer: addUrlLayer,
        addCustomLayer: addCustomLayer,
        getDefaultCustomCode: getDefaultCustomCode,
        zeroPad: zeroPad,
        updateUrlFormVisibility: updateUrlFormVisibility,
        switchAddTab: switchAddTab,
        switchImportType: switchImportType,
        handleImportSubmit: handleImportSubmit,
        handleUrlSubmit: handleUrlSubmit,
        handleCustomSubmit: handleCustomSubmit,
        openStyleSettings: openStyleSettings,
        closeStyleSettings: closeStyleSettings,
        applyStyleSettings: applyStyleSettings,
        togglePointModeUI: togglePointModeUI,
        handleStyleIconFile: handleStyleIconFile
    };
})();
