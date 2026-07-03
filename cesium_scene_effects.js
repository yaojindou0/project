/**
 * 场景效果：天气、天空盒、卷帘对比、多屏对比
 */
const CesiumSceneEffects = (function () {
    'use strict';

    let viewer = null;
    let getBasemapProviders = null;
    let setMainBasemapVisible = null;

    let currentWeather = 'sunny';
    let weatherPostStages = [];

    const WHEALE_BASE = 'globe/wheale/';
    const whealeShaderCache = {};

    let swipeActive = false;
    let swipeLeftLayer = null;
    let swipeRightLayer = null;

    let multiActive = false;
    let multiViewers = [];
    let multiCameraListeners = [];
    let cameraSyncLock = false;

    const BASEMAP_NAMES = {
        tdt_img: '天地图影像',
        tdt_vec: '天地图矢量',
        amap_img: '高德影像',
        amap_vec: '高德矢量'
    };

    const SKY_PRESETS = {
        sunny: { folder: 'lantian0', whealeSky: 'cloud.jpg', sun: true, sceneFog: 0, brightness: 0.1, saturation: -0.02, hue: 0 },
        rainy: { folder: 'night1', sun: false, sceneFog: 0, brightness: -0.18, saturation: -0.22, hue: -0.08 },
        foggy: { folder: 'waterFace', sun: false, sceneFog: 0, brightness: -0.08, saturation: -0.35, hue: 0 },
        snowy: { folder: 'lantian3', sun: true, sceneFog: 0, brightness: 0.06, saturation: -0.08, hue: 0 }
    };

    function init(viewerInstance, options) {
        viewer = viewerInstance;
        getBasemapProviders = options && options.getBasemapProviders;
        setMainBasemapVisible = options && options.setMainBasemapVisible;
        applySkyPreset('sunny');
        preloadWhealeShaders();
    }

    function skyboxSources(folder) {
        const base = 'globe/skybox/' + folder + '/';
        return {
            positiveX: base + 'right.png',
            negativeX: base + 'left.png',
            positiveY: base + 'up.png',
            negativeY: base + 'down.png',
            positiveZ: base + 'front.png',
            negativeZ: base + 'back.png'
        };
    }

    function whealeImageSources(file) {
        const url = WHEALE_BASE + file;
        return {
            positiveX: url,
            negativeX: url,
            positiveY: url,
            negativeZ: url,
            positiveZ: url,
            negativeY: url
        };
    }

    function applySkyPreset(weather) {
        if (!viewer) return;
        const preset = SKY_PRESETS[weather] || SKY_PRESETS.sunny;
        const sources = weather === 'sunny' && preset.whealeSky
            ? whealeImageSources(preset.whealeSky)
            : skyboxSources(preset.folder);

        if (viewer.scene.skyBox && viewer.scene.skyBox.destroy) {
            viewer.scene.skyBox.destroy();
        }
        viewer.scene.skyBox = new Cesium.SkyBox({ sources: sources });
        viewer.scene.skyBox.show = true;
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.hueShift = preset.hue;
        viewer.scene.skyAtmosphere.saturationShift = preset.saturation;
        viewer.scene.skyAtmosphere.brightnessShift = preset.brightness;
        viewer.scene.sun.show = preset.sun;
        viewer.scene.moon.show = weather === 'rainy' || weather === 'foggy';

        const fog = viewer.scene.fog;
        fog.enabled = preset.sceneFog > 0;
        fog.density = preset.sceneFog;
        fog.minimumBrightness = weather === 'foggy' ? 0.15 : 0.35;
    }

    function loadWhealeShader(file) {
        const url = WHEALE_BASE + file;
        if (whealeShaderCache[url]) return whealeShaderCache[url];
        whealeShaderCache[url] = fetch(url).then(function (res) {
            if (!res.ok) throw new Error('着色器加载失败: ' + url);
            return res.text();
        }).catch(function (err) {
            delete whealeShaderCache[url];
            throw err;
        });
        return whealeShaderCache[url];
    }

    function preloadWhealeShaders() {
        return Promise.all([
            loadWhealeShader('RainShader.glsl'),
            loadWhealeShader('SnowShader.glsl'),
            loadWhealeShader('FogShader.glsl'),
            loadWhealeShader('thunderShader.glsl')
        ]).catch(function (e) {
            console.warn('天气着色器预加载失败', e);
        });
    }

    function removeWeatherPostStages() {
        if (!viewer) return;
        weatherPostStages.forEach(function (stage) {
            try {
                viewer.scene.postProcessStages.remove(stage);
            } catch (e) { /* ignore */ }
        });
        weatherPostStages = [];
    }

    function addWeatherPostStage(options) {
        const stage = new Cesium.PostProcessStage(options);
        viewer.scene.postProcessStages.add(stage);
        weatherPostStages.push(stage);
        return stage;
    }

    async function applyWeatherPostProcess(weather) {
        removeWeatherPostStages();
        if (!viewer) return;

        try {
            if (weather === 'rainy') {
                const rainShader = await loadWhealeShader('RainShader.glsl');
                const thunderShader = await loadWhealeShader('thunderShader.glsl');
                addWeatherPostStage({
                    name: 'wheale-rain',
                    fragmentShader: rainShader,
                    uniforms: { u_scale: 1.2 }
                });
                addWeatherPostStage({
                    name: 'wheale-thunder',
                    fragmentShader: thunderShader
                });
            } else if (weather === 'snowy') {
                const snowShader = await loadWhealeShader('SnowShader.glsl');
                addWeatherPostStage({
                    name: 'wheale-snow',
                    fragmentShader: snowShader,
                    uniforms: { speed: 2.8 }
                });
            } else if (weather === 'foggy') {
                const fogShader = await loadWhealeShader('FogShader.glsl');
                addWeatherPostStage({
                    name: 'wheale-fog',
                    fragmentShader: fogShader,
                    uniforms: {
                        fogByDistance: new Cesium.Cartesian4(10.0, 0.0, 8000.0, 1.0),
                        fogColor: new Cesium.Color(0.82, 0.87, 0.92, 0.9)
                    }
                });
            }
            viewer.scene.requestRender();
        } catch (e) {
            console.error('天气特效加载失败', e);
            const result = document.getElementById('spatial-result');
            if (result) result.textContent = '天气特效加载失败: ' + e.message;
        }
    }

    function clearWeatherEffects() {
        removeWeatherPostStages();
    }

    async function setWeather(type) {
        if (!viewer) return;
        currentWeather = type || 'sunny';
        clearWeatherEffects();
        applySkyPreset(currentWeather);
        await applyWeatherPostProcess(currentWeather);

        const result = document.getElementById('spatial-result');
        if (result) {
            const names = { sunny: '晴天', rainy: '雨天', foggy: '雾天', snowy: '雪天' };
            const effects = {
                sunny: '（wheale/cloud.jpg 天空）',
                rainy: '（RainShader + 闪电 thunderShader）',
                foggy: '（FogShader 体积雾）',
                snowy: '（SnowShader 飘雪）'
            };
            if (!result.textContent || result.textContent.indexOf('加载失败') < 0) {
                result.textContent = '天气已切换：' + (names[currentWeather] || currentWeather) +
                    (effects[currentWeather] || '');
            }
        }
    }

    function onWeatherSelectChange() {
        const sel = document.getElementById('scene-weather-select');
        if (sel) setWeather(sel.value);
    }

    function addBasemapLayers(type, splitDirection) {
        if (!getBasemapProviders) throw new Error('底图提供器未初始化');
        const providers = getBasemapProviders(type);
        const layers = [];
        providers.forEach(function (provider) {
            const layer = viewer.imageryLayers.addImageryProvider(provider);
            if (splitDirection !== undefined) {
                layer.splitDirection = splitDirection;
            }
            layers.push(layer);
        });
        return layers;
    }

    function removeSwipeLayers() {
        if (swipeLeftLayer) {
            swipeLeftLayer.forEach(function (l) { viewer.imageryLayers.remove(l, true); });
            swipeLeftLayer = null;
        }
        if (swipeRightLayer) {
            swipeRightLayer.forEach(function (l) { viewer.imageryLayers.remove(l, true); });
            swipeRightLayer = null;
        }
    }

    function showSwipeHandle(show) {
        const handle = document.getElementById('imagery-swipe-handle');
        if (handle) handle.classList.toggle('active', show);
    }

    function updateSwipePosition(ratio) {
        if (!viewer) return;
        ratio = Cesium.Math.clamp(ratio, 0.02, 0.98);
        viewer.scene.splitPosition = ratio;
        const handle = document.getElementById('imagery-swipe-handle');
        if (handle) handle.style.left = (ratio * 100) + '%';
    }

    function initSwipeHandle() {
        const handle = document.getElementById('imagery-swipe-handle');
        if (!handle || handle._bound) return;
        handle._bound = true;
        let dragging = false;
        handle.addEventListener('mousedown', function (e) {
            if (!swipeActive) return;
            dragging = true;
            e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) {
            if (!dragging || !swipeActive) return;
            const container = document.getElementById('cesiumContainer');
            const rect = container.getBoundingClientRect();
            updateSwipePosition((e.clientX - rect.left) / rect.width);
        });
        document.addEventListener('mouseup', function () { dragging = false; });
    }

    function startSwipe() {
        if (!viewer || !getBasemapProviders) return;
        const leftType = document.getElementById('swipe-left-basemap').value;
        const rightType = document.getElementById('swipe-right-basemap').value;
        stopSwipe();
        try {
            if (setMainBasemapVisible) setMainBasemapVisible(false);

            swipeLeftLayer = addBasemapLayers(leftType, Cesium.SplitDirection.LEFT);
            swipeRightLayer = addBasemapLayers(rightType, Cesium.SplitDirection.RIGHT);

            swipeActive = true;
            updateSwipePosition(0.5);
            showSwipeHandle(true);
            initSwipeHandle();
            viewer.scene.requestRender();

            const result = document.getElementById('spatial-result');
            if (result) {
                result.textContent = '卷帘对比：左 ' + (BASEMAP_NAMES[leftType] || leftType) +
                    ' | 右 ' + (BASEMAP_NAMES[rightType] || rightType);
            }
        } catch (e) {
            alert('卷帘对比启动失败: ' + e.message);
        }
    }

    function stopSwipe() {
        swipeActive = false;
        removeSwipeLayers();
        if (setMainBasemapVisible) setMainBasemapVisible(true);
        showSwipeHandle(false);
        if (viewer) {
            viewer.scene.splitPosition = 1.0;
            viewer.scene.requestRender();
        }
    }

    function destroyMultiViewers() {
        multiViewers.forEach(function (v) {
            if (v && !v.isDestroyed()) v.destroy();
        });
        multiViewers = [];
        unbindMultiCameraLink();
        const wrap = document.getElementById('multi-compare-wrap');
        if (wrap) {
            wrap.classList.remove('active', 'layout-2', 'layout-4');
            wrap.innerHTML = '';
        }
        document.body.classList.remove('multi-compare-active');
        multiActive = false;
    }

    function copyCameraView(sourceCamera) {
        return {
            destination: Cesium.Cartesian3.clone(sourceCamera.positionWC),
            orientation: {
                heading: sourceCamera.heading,
                pitch: sourceCamera.pitch,
                roll: sourceCamera.roll
            }
        };
    }

    function applyCameraView(targetViewer, view) {
        if (!targetViewer || targetViewer.isDestroyed()) return;
        targetViewer.camera.setView(view);
    }

    function syncAllFrom(sourceViewer) {
        if (cameraSyncLock || !multiActive || !sourceViewer || sourceViewer.isDestroyed()) return;
        cameraSyncLock = true;
        try {
            const view = copyCameraView(sourceViewer.camera);
            if (viewer && !viewer.isDestroyed() && sourceViewer !== viewer) {
                applyCameraView(viewer, view);
            }
            multiViewers.forEach(function (v) {
                if (v && !v.isDestroyed() && v !== sourceViewer) {
                    applyCameraView(v, view);
                }
            });
        } finally {
            cameraSyncLock = false;
        }
    }

    function bindMultiCameraLink() {
        unbindMultiCameraLink();
        function attach(v) {
            if (!v || v.isDestroyed()) return;
            const fn = function () { syncAllFrom(v); };
            v.camera.changed.addEventListener(fn);
            multiCameraListeners.push({ viewer: v, fn: fn });
        }
        attach(viewer);
        multiViewers.forEach(attach);
    }

    function unbindMultiCameraLink() {
        multiCameraListeners.forEach(function (item) {
            if (item.viewer && !item.viewer.isDestroyed()) {
                item.viewer.camera.changed.removeEventListener(item.fn);
            }
        });
        multiCameraListeners = [];
    }

    function createLightViewer(container, basemapType) {
        const v = new Cesium.Viewer(container, {
            animation: false,
            timeline: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            infoBox: false,
            selectionIndicator: false,
            imageryProvider: false,
            terrainProvider: viewer.terrainProvider,
            skyBox: false,
            skyAtmosphere: false,
            creditContainer: document.createElement('div')
        });
        v.scene.globe.depthTestAgainstTerrain = true;
        v.scene.globe.show = true;
        v.scene.fxaa = true;
        v.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a1018');
        if (v.cesiumWidget && v.cesiumWidget.creditContainer) {
            v.cesiumWidget.creditContainer.style.display = 'none';
        }

        if (getBasemapProviders) {
            const providers = getBasemapProviders(basemapType);
            providers.forEach(function (provider, index) {
                v.imageryLayers.addImageryProvider(provider, index);
            });
        }
        return v;
    }

    function resizeMultiViewers() {
        multiViewers.forEach(function (v) {
            if (v && !v.isDestroyed()) {
                v.resize();
                v.scene.requestRender();
            }
        });
    }

    function startMultiCompare() {
        if (!viewer) return;
        stopMultiCompare();
        const layout = document.getElementById('multi-layout-select').value;
        const types = [
            document.getElementById('multi-basemap-1').value,
            document.getElementById('multi-basemap-2').value,
            document.getElementById('multi-basemap-3').value,
            document.getElementById('multi-basemap-4').value
        ];
        const count = layout === '4' ? 4 : 2;
        const wrap = document.getElementById('multi-compare-wrap');
        if (!wrap) return;

        wrap.className = 'multi-compare-wrap active layout-' + layout;
        wrap.innerHTML = '';

        const panels = [];
        for (let i = 0; i < count; i++) {
            const panel = document.createElement('div');
            panel.className = 'multi-compare-panel';
            const label = document.createElement('div');
            label.className = 'multi-compare-label';
            const typeId = types[i] || 'tdt_img';
            label.textContent = BASEMAP_NAMES[typeId] || typeId;
            panel.appendChild(label);
            const inner = document.createElement('div');
            inner.className = 'multi-compare-inner';
            panel.appendChild(inner);
            wrap.appendChild(panel);
            panels.push({ inner: inner, typeId: typeId });
        }

        document.body.classList.add('multi-compare-active');
        multiActive = true;

        function mountViewers() {
            panels.forEach(function (p) {
                multiViewers.push(createLightViewer(p.inner, p.typeId));
            });
            bindMultiCameraLink();
            if (viewer) syncAllFrom(viewer);
            resizeMultiViewers();
            setTimeout(resizeMultiViewers, 120);
            const result = document.getElementById('spatial-result');
            if (result) result.textContent = '多屏对比已开启（' + count + ' 屏），各屏地图已联动，任意一屏操作同步到其他屏';
        }

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                mountViewers();
            });
        });
    }

    function stopMultiCompare() {
        destroyMultiViewers();
        const result = document.getElementById('spatial-result');
        if (result) result.textContent = '多屏对比已关闭';
    }

    function clearSceneEffects() {
        setWeather('sunny');
        stopSwipe();
        stopMultiCompare();
    }

    return {
        init: init,
        setWeather: setWeather,
        onWeatherSelectChange: onWeatherSelectChange,
        startSwipe: startSwipe,
        stopSwipe: stopSwipe,
        startMultiCompare: startMultiCompare,
        stopMultiCompare: stopMultiCompare,
        clearSceneEffects: clearSceneEffects
    };
})();
