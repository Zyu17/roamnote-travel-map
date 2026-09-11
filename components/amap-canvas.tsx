"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

export type MapItem = {
  id: number;
  title: string;
  category: "sight" | "food" | "stay" | "transit";
  position: { left: string; top: string };
  lnglat: [number, number];
};

export type SearchPlace = {
  id: string;
  name: string;
  address: string;
  district: string;
  type: string;
  lnglat: [number, number];
};

export type RouteResult = { distance: number; duration: number };

export type AMapHandle = {
  searchPlaces: (keyword: string) => Promise<SearchPlace[]>;
  resolveAddress: (address: string) => Promise<SearchPlace | null>;
  planRoute: (routeItems: MapItem[]) => Promise<RouteResult>;
  zoomIn: () => void;
  zoomOut: () => void;
  locate: () => Promise<void>;
  cycleStyle: () => string;
  focusItem: (item: MapItem) => void;
  fitToItems: () => void;
};

type Props = {
  items: MapItem[];
  selectedId: number | null;
  onSelect: (item: MapItem) => void;
  onConnectionChange: (connected: boolean) => void;
};

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { serviceHost?: string; securityJsCode?: string };
  }
}

const colors = { sight: "#ef725f", food: "#e9a83f", stay: "#173d38", transit: "#477f9e" };
const styles = [
  { value: "amap://styles/whitesmoke", label: "远山黛" },
  { value: "amap://styles/fresh", label: "草色青" },
  { value: "amap://styles/normal", label: "标准地图" },
];

function averageCenter(items: MapItem[]): [number, number] {
  if (!items.length) return [121.47264, 31.2317];
  return [
    items.reduce((sum, item) => sum + item.lnglat[0], 0) / items.length,
    items.reduce((sum, item) => sum + item.lnglat[1], 0) / items.length,
  ];
}

export const AMapCanvas = forwardRef<AMapHandle, Props>(function AMapCanvas(
  { items, selectedId, onSelect, onConnectionChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const itemsRef = useRef(items);
  const styleIndexRef = useRef(0);
  const lastItemsKeyRef = useRef("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    let active = true;
    fetch("/api/map-config")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("map config unavailable")))
      .then((value) => { const config = value as { amapJsKey?: string }; if (active) setKey(config.amapJsKey ?? null); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!key || !hostRef.current) return;
    let cancelled = false;
    const initialize = () => {
      if (cancelled || !window.AMap || !hostRef.current || mapRef.current) return;
      const map = new window.AMap.Map(hostRef.current, {
        viewMode: "2D",
        center: averageCenter(itemsRef.current),
        zoom: 12.6,
        mapStyle: styles[0].value,
        showLabel: true,
        animateEnable: true,
      });
      mapRef.current = map;
      setReady(true);
      onConnectionChange(true);
    };
    if (window.AMap) initialize();
    else {
      window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/api/amap-proxy` };
      const existing = document.querySelector<HTMLScriptElement>('script[data-roamnote-amap="true"]');
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.dataset.roamnoteAmap = "true";
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.AutoComplete,AMap.PlaceSearch,AMap.Driving,AMap.Geolocation,AMap.Geocoder`;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", initialize, { once: true });
      script.addEventListener("error", () => { setLoadFailed(true); onConnectionChange(false); }, { once: true });
    }
    return () => { cancelled = true; };
  }, [key, onConnectionChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !window.AMap) return;
    if (markersRef.current.length) map.remove(markersRef.current);
    const itemsKey = items.map((item) => `${item.id}:${item.lnglat.join(",")}`).join("|");
    const itemsChanged = lastItemsKeyRef.current !== itemsKey;
    if (itemsChanged) {
      routeRef.current?.clear?.();
      routeRef.current = null;
      lastItemsKeyRef.current = itemsKey;
    }
    const markers = items.map((item, index) => {
      const activeClass = selectedId === item.id ? "is-active" : "";
      const safeTitle = item.title.replace(/[<>"&]/g, "");
      const marker = new window.AMap.Marker({
        position: item.lnglat,
        title: safeTitle,
        anchor: "center",
        content: `<button class="amap-custom-marker ${activeClass}" aria-label="${safeTitle}" style="--marker-color:${colors[item.category]}"><b>${index + 1}</b></button>`,
        zIndex: selectedId === item.id ? 150 : 100,
      });
      marker.on("click", () => onSelectRef.current(item));
      return marker;
    });
    markersRef.current = markers;
    if (markers.length) map.add(markers);
    if (itemsChanged) map.setZoomAndCenter(items.length === 1 ? 15 : 12.6, averageCenter(items), true);
  }, [items, ready, selectedId]);

  useImperativeHandle(ref, () => ({
    searchPlaces(keyword) {
      return new Promise((resolve, reject) => {
        if (!window.AMap || !mapRef.current) return reject(new Error("地图还在加载"));
        window.AMap.plugin(["AMap.AutoComplete", "AMap.PlaceSearch"], () => {
          const readLocation = (location: any): [number, number] | null => {
            if (!location) return null;
            const lng = Number(location.lng ?? location.getLng?.());
            const lat = Number(location.lat ?? location.getLat?.());
            return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
          };
          const fromTip = (tip: any): SearchPlace | null => {
            const lnglat = readLocation(tip.location);
            if (!lnglat || !tip.name) return null;
            return {
              id: String(tip.id ?? `tip-${tip.name}-${lnglat.join("-")}`),
              name: String(tip.name),
              address: String(tip.address ?? tip.district ?? "地址待补充"),
              district: String(tip.district ?? ""),
              type: String(tip.typecode ?? tip.type ?? "地点"),
              lnglat,
            };
          };
          const fromPoi = (poi: any): SearchPlace | null => {
            const lnglat = readLocation(poi.location);
            if (!lnglat) return null;
            return {
              id: String(poi.id ?? `${poi.name}-${lnglat.join("-")}`),
              name: String(poi.name ?? "未命名地点"),
              address: Array.isArray(poi.address) ? poi.address.join("") : String(poi.address ?? "地址待补充"),
              district: String(poi.adname ?? poi.district ?? poi.cityname ?? ""),
              type: String(poi.type ?? ""),
              lnglat,
            };
          };

          const autocompletePromise = new Promise<SearchPlace[]>((done) => {
            const autocomplete = new window.AMap.AutoComplete({ city: "全国", citylimit: false });
            autocomplete.search(keyword, (status: string, result: any) => {
              if (status !== "complete") return done([]);
              done((result?.tips ?? []).map(fromTip).filter(Boolean) as SearchPlace[]);
            });
          });

          const placeSearchPromise = new Promise<SearchPlace[]>((done) => {
            const service = new window.AMap.PlaceSearch({ city: "全国", citylimit: false, pageSize: 8, pageIndex: 1, extensions: "base" });
            service.search(keyword, (status: string, result: any) => {
              const pois = result?.poiList?.pois ?? [];
              if (status !== "complete") return done([]);
              done(pois.map(fromPoi).filter(Boolean) as SearchPlace[]);
            });
          });

          Promise.all([autocompletePromise, placeSearchPromise])
            .then(([tips, pois]) => {
              const seen = new Set<string>();
              const merged = [...tips, ...pois].filter((place) => {
                const signature = `${place.name}-${place.lnglat[0].toFixed(5)}-${place.lnglat[1].toFixed(5)}`;
                if (seen.has(signature)) return false;
                seen.add(signature);
                return true;
              });
              resolve(merged.slice(0, 8));
            })
            .catch(() => reject(new Error("地点搜索失败")));
        });
      });
    },
    resolveAddress(address) {
      return new Promise((resolve, reject) => {
        if (!window.AMap || !mapRef.current) return reject(new Error("地图还在加载"));
        window.AMap.plugin("AMap.Geocoder", () => {
          const geocoder = new window.AMap.Geocoder({ city: "全国" });
          geocoder.getLocation(address, (status: string, result: any) => {
            const geocode = result?.geocodes?.[0];
            const location = geocode?.location;
            if (status !== "complete" || !location) return resolve(null);
            const lng = Number(location.lng ?? location.getLng?.());
            const lat = Number(location.lat ?? location.getLat?.());
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return resolve(null);
            const formattedAddress = String(geocode.formattedAddress ?? address);
            resolve({
              id: `address-${lng}-${lat}-${Date.now()}`,
              name: String(geocode.level === "省" || geocode.level === "市" ? address : formattedAddress),
              address: formattedAddress,
              district: String(geocode.district ?? geocode.city ?? geocode.province ?? ""),
              type: String(geocode.level ?? "地址"),
              lnglat: [lng, lat],
            });
          });
        });
      });
    },
    planRoute(routeItems) {
      return new Promise((resolve, reject) => {
        const map = mapRef.current;
        if (!window.AMap || !map || routeItems.length < 2) return reject(new Error("至少需要两个地点"));
        window.AMap.plugin("AMap.Driving", () => {
          routeRef.current?.clear?.();
          const driving = new window.AMap.Driving({ map, hideMarkers: true, showTraffic: false, autoFitView: false, outlineColor: "#ffffff", isOutline: true });
          routeRef.current = driving;
          const points = routeItems.map((item) => item.lnglat);
          driving.search(points[0], points[points.length - 1], { waypoints: points.slice(1, -1) }, (status: string, result: any) => {
            const route = result?.routes?.[0];
            if (status !== "complete" || !route) return reject(new Error(status === "no_data" ? "没有可用路线" : "路线计算失败"));
            map.setZoomAndCenter(12.6, averageCenter(routeItems), false, 420);
            resolve({ distance: Number(route.distance ?? 0), duration: Number(route.time ?? route.duration ?? 0) });
          });
        });
      });
    },
    zoomIn() { const map = mapRef.current; if (map) map.setZoom(Math.min(20, map.getZoom() + 1)); },
    zoomOut() { const map = mapRef.current; if (map) map.setZoom(Math.max(2, map.getZoom() - 1)); },
    locate() {
      return new Promise((resolve, reject) => {
        const map = mapRef.current;
        if (!window.AMap || !map) return reject(new Error("地图还在加载"));
        window.AMap.plugin("AMap.Geolocation", () => {
          const geolocation = new window.AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000, zoomToAccuracy: true });
          geolocation.getCurrentPosition((status: string, result: any) => {
            if (status !== "complete" || !result?.position) return reject(new Error("无法获取当前位置，请检查浏览器定位权限"));
            map.setZoomAndCenter(15, result.position, false, 420);
            resolve();
          });
        });
      });
    },
    cycleStyle() {
      styleIndexRef.current = (styleIndexRef.current + 1) % styles.length;
      const next = styles[styleIndexRef.current];
      mapRef.current?.setMapStyle(next.value);
      return next.label;
    },
    focusItem(item) { mapRef.current?.setZoomAndCenter(15, item.lnglat, false, 360); },
    fitToItems() { mapRef.current?.setZoomAndCenter(itemsRef.current.length === 1 ? 15 : 12.6, averageCenter(itemsRef.current), false, 360); },
  }), []);

  if (key && !loadFailed) return <div ref={hostRef} className="real-map" />;
  return <div className="demo-map" aria-label="上海行程演示地图">
    <div className="river river-one" /><div className="river river-two" /><div className="park park-one" /><div className="park park-two" />
    <span className="district-label label-jingan">静安区</span><span className="district-label label-huangpu">黄浦区</span><span className="district-label label-pudong">浦东新区</span>
    <svg className="demo-route" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path className="route-shadow" d="M280 385 C350 345 395 315 460 294 S620 220 710 203 S790 288 750 357 S700 450 610 497" /><path className="route-line" d="M280 385 C350 345 395 315 460 294 S620 220 710 203 S790 288 750 357 S700 450 610 497" /></svg>
    {items.map((item, index) => <button type="button" key={item.id} className={`demo-marker marker-${item.category} ${selectedId === item.id ? "active" : ""}`} style={item.position} onClick={() => onSelect(item)} aria-label={item.title}><span>{index + 1}</span><strong>{item.title}</strong></button>)}
    {loadFailed && <div className="map-error"><AlertTriangle size={16} /> 高德地图暂时加载失败，已切换为演示地图</div>}
  </div>;
});
