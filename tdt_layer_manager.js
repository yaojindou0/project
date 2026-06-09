/**
 * 天地图页面 - 自定义图层管理
 * 依赖: OpenLayers (ol), 可选 CoordFileConverter / wellknown / shpjs
 */
const TdtLayerManager = (function () {
    'use strict';

    let map = null;
    let listEl = null;
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

    function defaultVectorStyle() {
        return new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#e6a23c', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(230, 162, 60, 0.25)' }),
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#e6a23c' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            })
        });
    }

    function getProjection(code) {
        if (!code || code === 'EPSG:4326') return ol.proj.get('EPSG:4326');
        if (code === 'EPSG:3857') return ol.proj.get('EPSG:3857');
        return ol.proj.get(code) || ol.proj.get('EPSG:4326');
    }

    function init(mapInstance, listContainerId) {
        map = mapInstance;
        listEl = document.getElementById(listContainerId);
        renderList();
    }

    function register(layer, meta) {
        if (!map || !layer) throw new Error('地图或图层无效');
        const entry = {
            id: uid++,
            name: meta.name || ('图层' + uid),
            type: meta.type || 'unknown',
            layer: layer,
            visible: true
        };
        layer.setVisible(true);
        layer.setZIndex(Z_BASE + managedLayers.length);
        map.addLayer(layer);
        managedLayers.push(entry);
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
        renderList();
    }

    function renderList() {
        if (!listEl) return;
        if (!managedLayers.length) {
            listEl.innerHTML = '<div class="layer-empty">暂无自定义图层</div>';
            return;
        }
        listEl.innerHTML = managedLayers.map(function (e) {
            return '<div class="layer-item">' +
                '<label class="layer-item-main">' +
                '<input type="checkbox" ' + (e.visible ? 'checked' : '') + ' onchange="TdtLayerManager.toggleVisible(' + e.id + ')">' +
                '<span class="layer-name" title="' + escapeHtml(e.name) + '">' + escapeHtml(e.name) + '</span>' +
                '<span class="layer-type">' + escapeHtml(e.type) + '</span>' +
                '</label>' +
                '<button type="button" class="layer-del" onclick="TdtLayerManager.removeLayer(' + e.id + ')" title="移除">×</button>' +
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
        const layer = new ol.layer.Vector({
            source: source,
            style: defaultVectorStyle()
        });
        return register(layer, { name: name, type: '矢量数据' });
    }

    async function importData(type, options) {
        const name = options.name || ('导入图层' + uid);
        let fc;

        if (type === 'wkt') {
            if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');
            fc = CoordFileConverter.parseWKT(options.text || '');
        } else if (type === 'csv') {
            if (typeof CoordFileConverter === 'undefined') throw new Error('CoordFileConverter 未加载');
            fc = CoordFileConverter.parseCSVToFeatureCollection(options.text || '');
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
        return register(result, { name: name || ('自定义图层' + uid), type: '自定义' });
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

    return {
        init: init,
        register: register,
        toggleVisible: toggleVisible,
        removeLayer: removeLayer,
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
        handleCustomSubmit: handleCustomSubmit
    };
})();
