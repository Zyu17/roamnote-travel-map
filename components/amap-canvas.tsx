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
  onPlacePick: (place: SearchPlace | null) => void;
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

// A slight arc makes the order legible without pretending to be a road route.
function curvedLeg(start: [number, number], end: [number, number], index: number): [number, number][] {
  const midLat = (start[1] + end[1]) / 2;
  const xScale = Math.max(0.3, Math.cos(midLat * Math.PI / 180));
  const dx = (end[0] - start[0]) * xScale;
  const dy = end[1] - start[1];
  const bend = (index % 2 === 0 ? 1 : -1) * 0.09;
  const control: [number, number] = [
    (start[0] + end[0]) / 2 - dy * bend / xScale,
    midLat + dx * bend,
  ];
  return Array.from({ length: 25 }, (_, step) => {
    const t = step / 24;
    const inverse = 1 - t;
    return [
      inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
      inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    ];
  });
}

type FitMap = {
  resize?: () => void;
  setZoomAndCenter: (zoom: number, center: unknown, immediate: boolean, duration: number) => void;
  setFitView: (markers: FitMarker[], immediate: boolean, padding: number[], maxZoom: number) => void;
};
type FitMarker = { getPosition: () => unknown };

function fitDayOnMap(map: FitMap, markers: FitMarker[], host: HTMLDivElement | null) {
  if (!markers.length) return;
  map.resize?.();
  if (markers.length === 1) {
    map.setZoomAndCenter(14, markers[0].getPosition(), false, 360);
    return;
  }
  const width = host?.clientWidth ?? 800;
  const height = host?.clientHeight ?? 600;
  const horizontal = Math.min(86, Math.round(width * 0.12));
  const vertical = Math.min(96, Math.round(height * 0.13));
  map.setFitView(markers, false, [vertical, vertical, horizontal, horizontal], 15);
}

function demoRoutePath(items: MapItem[]) {
  if (items.length < 2) return "";
  return items.slice(0, -1).map((item, index) => {
    const next = items[index + 1];
    const x1 = parseFloat(item.position.left) * 10;
    const y1 = parseFloat(item.position.top) * 7;
    const x2 = parseFloat(next.position.left) * 10;
    const y2 = parseFloat(next.position.top) * 7;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const bend = (index % 2 === 0 ? 1 : -1) * 0.1;
    return `M${x1} ${y1} Q${(x1 + x2) / 2 - dy * bend} ${(y1 + y2) / 2 + dx * bend} ${x2} ${y2}`;
  }).join(" ");
}

export const AMapCanvas = forwardRef<AMapHandle, Props>(function AMapCanvas(
  { items, selectedId, onSelect, onPlacePick, onConnectionChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const itineraryLinesRef = useRef<any[]>([]);
  const onSelectRef = useRef(onSelect);
  const onPlacePickRef = useRef(onPlacePick);
  const itemsRef = useRef(items);
  const styleIndexRef = useRef(0);
  const lastItemsKeyRef = useRef("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onPlacePickRef.current = onPlacePick; }, [onPlacePick]);
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
      map.on("click", async (event: any) => {
        if (event?.target && event.target !== map) return;
        const lng = Number(event?.lnglat?.getLng?.() ?? event?.lnglat?.lng);
        const lat = Number(event?.lnglat?.getLat?.() ?? event?.lnglat?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        onPlacePickRef.current(null);
        try {
          const response = await fetch(`/api/amap-search?mode=around&lng=${lng}&lat=${lat}`);
          const data = await response.json() as { places?: SearchPlace[] };
          onPlacePickRef.current(response.ok ? data.places?.[0] ?? null : null);
        } catch { onPlacePickRef.current(null); }
      });
      setReady(true);
      onConnectionChange(true);
    };
    if (window.AMap) initialize();
    else {
      window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/api/amap-proxy/_AMapService` };
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
      if (itineraryLinesRef.current.length) map.remove(itineraryLinesRef.current);
      itineraryLinesRef.current = items.slice(0, -1).flatMap((item, index) => {
        const next = items[index + 1];
        if (item.lnglat[0] === next.lnglat[0] && item.lnglat[1] === next.lnglat[1]) return [];
        const path = curvedLeg(item.lnglat, next.lnglat, index);
        return [new window.AMap.Polyline({
          path,
          strokeColor: "#246e64",
          strokeOpacity: 0.88,
          strokeWeight: 3,
          strokeStyle: "dashed",
          strokeDasharray: [9, 7],
          lineJoin: "round",
          lineCap: "round",
          zIndex: 30,
        })];
      });
      if (itineraryLinesRef.current.length) map.add(itineraryLinesRef.current);
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
    if (itemsChanged) fitDayOnMap(map, markers, hostRef.current);
  }, [items, ready, selectedId]);

  useImperativeHandle(ref, () => ({
    async searchPlaces(keyword) {
      const response = await fetch(`/api/amap-search?mode=place&q=${encodeURIComponent(keyword)}`);
      const data = await response.json() as { places?: SearchPlace[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "地点搜索失败");
      return data.places ?? [];
    },
    async resolveAddress(address) {
      const response = await fetch(`/api/amap-search?mode=geocode&q=${encodeURIComponent(address)}`);
      const data = await response.json() as { places?: SearchPlace[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "地址解析失败");
      return data.places?.[0] ?? null;
    },
    planRoute(routeItems) {
      return new Promise((resolve, reject) => {
        if (!window.AMap || !mapRef.current || routeItems.length < 2) return reject(new Error("至少需要两个地点"));
        window.AMap.plugin("AMap.Driving", () => {
          // Use the service for distance/time only; its solid road overlay would hide the day guide.
          const driving = new window.AMap.Driving({ showTraffic: false });
          const points = routeItems.map((item) => item.lnglat);
          driving.search(points[0], points[points.length - 1], { waypoints: points.slice(1, -1) }, (status: string, result: any) => {
            const route = result?.routes?.[0];
            if (status !== "complete" || !route) return reject(new Error(status === "no_data" ? "没有可用路线" : "路线计算失败"));
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
    fitToItems() { if (mapRef.current) fitDayOnMap(mapRef.current, markersRef.current, hostRef.current); },
  }), []);

  if (key && !loadFailed) return <div ref={hostRef} className="real-map" />;
  return <div className="demo-map" aria-label="上海行程演示地图">
    <div className="river river-one" /><div className="river river-two" /><div className="park park-one" /><div className="park park-two" />
    <span className="district-label label-jingan">静安区</span><span className="district-label label-huangpu">黄浦区</span><span className="district-label label-pudong">浦东新区</span>
    <svg className="demo-route" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path className="route-shadow" d={demoRoutePath(items)} /><path className="route-line" d={demoRoutePath(items)} /></svg>
    {items.map((item, index) => <button type="button" key={item.id} className={`demo-marker marker-${item.category} ${selectedId === item.id ? "active" : ""}`} style={item.position} onClick={() => onSelect(item)} aria-label={item.title}><span>{index + 1}</span><strong>{item.title}</strong></button>)}
    {loadFailed && <div className="map-error"><AlertTriangle size={16} /> 高德地图暂时加载失败，已切换为演示地图</div>}
  </div>;
});
