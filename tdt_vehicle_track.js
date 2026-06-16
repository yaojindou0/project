/**
 * 车辆轨迹 - 天地图驾车路径规划
 */
const TdtVehicleTrack = (function () {
    'use strict';

    let map = null;
    let tk = '';
    let routeLayer = null;
    let markerLayer = null;
    let pickMode = null;

    function init(mapInstance, apiKey) {
        map = mapInstance;
        tk = apiKey || '';
    }

    function isPicking() {
        return !!pickMode;
    }

    function handlePickClick(e) {
        if (!pickMode) return false;
        const lng = e.coordinate[0].toFixed(6);
        const lat = e.coordinate[1].toFixed(6);
        if (pickMode === 'orig') {
            document.getElementById('track-orig-lng').value = lng;
            document.getElementById('track-orig-lat').value = lat;
        } else if (pickMode === 'dest') {
            document.getElementById('track-dest-lng').value = lng;
            document.getElementById('track-dest-lat').value = lat;
        }
        setPickMode(null);
        return true;
    }

    function clearRoute() {
        if (!map) return;
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (markerLayer) { map.removeLayer(markerLayer); markerLayer = null; }
        const info = document.getElementById('track-route-info');
        if (info) info.textContent = '';
    }

    function setPickMode(mode) {
        pickMode = mode;
        document.getElementById('track-pick-orig').classList.toggle('active', mode === 'orig');
        document.getElementById('track-pick-dest').classList.toggle('active', mode === 'dest');
        if (map) map.getTargetElement().style.cursor = mode ? 'crosshair' : '';
    }

    function parseRouteXml(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        const err = doc.querySelector('parsererror');
        if (err) throw new Error('路径规划返回解析失败');

        const routelatlonEl = doc.getElementsByTagName('routelatlon')[0];
        if (!routelatlonEl || !routelatlonEl.textContent) {
            throw new Error('未获取到路径坐标 routelatlon');
        }

        let routelatlon = routelatlonEl.textContent.trim();
        if (routelatlon.endsWith(';')) routelatlon = routelatlon.slice(0, -1);

        const coords = routelatlon.split(';').map(function (seg) {
            const parts = seg.split(',');
            return [parseFloat(parts[0]), parseFloat(parts[1])];
        }).filter(function (c) { return c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]); });

        if (coords.length < 2) throw new Error('路径坐标无效');

        const distanceEl = doc.getElementsByTagName('distance')[0];
        const durationEl = doc.getElementsByTagName('duration')[0];
        const distance = distanceEl ? distanceEl.textContent : '';
        const duration = durationEl ? durationEl.textContent : '';

        const guides = [];
        const routes = doc.getElementsByTagName('routes')[0];
        if (routes) {
            const items = routes.getElementsByTagName('item');
            for (let i = 0; i < items.length; i++) {
                const g = items[i].getElementsByTagName('strguide')[0];
                if (g && g.textContent) guides.push(g.textContent);
            }
        }

        return { coords: coords, distance: distance, duration: duration, guides: guides };
    }

    function drawRoute(coords, orig, dest) {
        clearRoute();

        const lineFeature = new ol.Feature({
            geometry: new ol.geom.LineString(coords)
        });

        routeLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features: [lineFeature] }),
            zIndex: 28,
            style: new ol.style.Style({
                stroke: new ol.style.Stroke({ color: '#409eff', width: 5 })
            })
        });

        const origParts = orig.split(',');
        const destParts = dest.split(',');
        const features = [
            new ol.Feature({ geometry: new ol.geom.Point([parseFloat(origParts[0]), parseFloat(origParts[1])]), type: 'orig' }),
            new ol.Feature({ geometry: new ol.geom.Point([parseFloat(destParts[0]), parseFloat(destParts[1])]), type: 'dest' })
        ];

        markerLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features: features }),
            zIndex: 29,
            style: function (f) {
                const isOrig = f.get('type') === 'orig';
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 8,
                        fill: new ol.style.Fill({ color: isOrig ? '#67c23a' : '#f56c6c' }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                    }),
                    text: new ol.style.Text({
                        text: isOrig ? '起' : '终',
                        font: 'bold 12px Microsoft YaHei',
                        fill: new ol.style.Fill({ color: '#fff' })
                    })
                });
            }
        });

        map.addLayer(routeLayer);
        map.addLayer(markerLayer);

        const extent = lineFeature.getGeometry().getExtent();
        map.getView().fit(extent, {
            padding: typeof getMapFitPadding === 'function' ? getMapFitPadding() : [60, 60, 60, 60],
            duration: 500,
            maxZoom: 16
        });
    }

    async function planRoute() {
        const origLng = document.getElementById('track-orig-lng').value.trim();
        const origLat = document.getElementById('track-orig-lat').value.trim();
        const destLng = document.getElementById('track-dest-lng').value.trim();
        const destLat = document.getElementById('track-dest-lat').value.trim();
        const style = document.getElementById('track-style').value;

        if (!origLng || !origLat || !destLng || !destLat) {
            throw new Error('请填写或地图选取起终点经纬度');
        }

        const orig = origLng + ',' + origLat;
        const dest = destLng + ',' + destLat;
        const postStr = JSON.stringify({ orig: orig, dest: dest, style: style });
        const url = 'https://api.tianditu.gov.cn/drive?postStr=' + encodeURIComponent(postStr) +
            '&type=search&tk=' + encodeURIComponent(tk);

        const resp = await fetch(url);
        if (!resp.ok) throw new Error('路径规划请求失败 HTTP ' + resp.status);
        const xmlText = await resp.text();
        const result = parseRouteXml(xmlText);

        drawRoute(result.coords, orig, dest);

        const infoEl = document.getElementById('track-route-info');
        if (infoEl) {
            let html = '';
            if (result.distance) html += '<div>距离：' + (parseFloat(result.distance) / 1000).toFixed(2) + ' 公里</div>';
            if (result.duration) html += '<div>时间：' + Math.round(parseFloat(result.duration) / 60) + ' 分钟</div>';
            if (result.guides.length) {
                html += '<div style="margin-top:8px;font-weight:bold;">导航指引：</div><ol style="margin:4px 0;padding-left:18px;font-size:12px;">';
                result.guides.slice(0, 8).forEach(function (g) { html += '<li>' + g + '</li>'; });
                if (result.guides.length > 8) html += '<li>...共 ' + result.guides.length + ' 条</li>';
                html += '</ol>';
            }
            infoEl.innerHTML = html;
        }

        return result;
    }

    return {
        init: init,
        isPicking: isPicking,
        handlePickClick: handlePickClick,
        setPickMode: setPickMode,
        planRoute: planRoute,
        clearRoute: clearRoute
    };
})();
