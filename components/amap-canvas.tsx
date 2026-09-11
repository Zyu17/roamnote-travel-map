"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

type MapItem = { id: number; title: string; category: "sight" | "food" | "stay" | "transit"; position: { left: string; top: string }; lnglat: [number, number] };
type Props = { items: MapItem[]; selectedId: number | null; onSelect: (item: MapItem) => void; onConnectionChange: (connected: boolean) => void };

declare global { interface Window { AMap?: any; _AMapSecurityConfig?: { serviceHost?: string; securityJsCode?: string } } }

const colors = { sight: "#ef725f", food: "#e9a83f", stay: "#173d38", transit: "#477f9e" };

export function AMapCanvas({ items, selectedId, onSelect, onConnectionChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/map-config")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("map config unavailable")))
      .then((config: { amapJsKey?: string }) => { if (active) setKey(config.amapJsKey ?? null); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!key || !hostRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.AMap || !hostRef.current) return;
      hostRef.current.innerHTML = "";
      mapRef.current?.destroy?.();
      const map = new window.AMap.Map(hostRef.current, { viewMode: "2D", center: [121.47264, 31.2317], zoom: 12.3, mapStyle: "amap://styles/whitesmoke", showLabel: true });
      mapRef.current = map;
      const markers = items.map((item, index) => {
        const marker = new window.AMap.Marker({ position: item.lnglat, title: item.title, anchor: "center", content: `<button class="amap-custom-marker ${selectedId === item.id ? "is-active" : ""}" aria-label="${item.title}" style="--marker-color:${colors[item.category]}"><b>${index + 1}</b></button>` });
        marker.on("click", () => onSelect(item)); return marker;
      });
      map.add(markers);
      if (items.length > 1) {
        const route = new window.AMap.Polyline({ path: items.map((item) => item.lnglat), strokeColor: "#173d38", strokeWeight: 5, strokeOpacity: .82, showDir: true, lineJoin: "round" });
        map.add(route); map.setFitView([...markers, route], false, [110, 110, 110, 390]);
      }
      onConnectionChange(true);
    };
    if (window.AMap) { render(); return () => { cancelled = true; }; }
    window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/_AMapService` };
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`; script.async = true; script.onload = render; script.onerror = () => { setLoadFailed(true); onConnectionChange(false); }; document.head.appendChild(script);
    return () => { cancelled = true; mapRef.current?.destroy?.(); };
  }, [key, items, onConnectionChange, onSelect, selectedId]);

  if (key && !loadFailed) return <div ref={hostRef} className="real-map" />;
  return <div className="demo-map" aria-label="上海行程演示地图">
    <div className="river river-one" /><div className="river river-two" /><div className="park park-one" /><div className="park park-two" />
    <span className="district-label label-jingan">静安区</span><span className="district-label label-huangpu">黄浦区</span><span className="district-label label-pudong">浦东新区</span><span className="road-label road-one">延安高架路</span><span className="road-label road-two">世纪大道</span>
    <svg className="demo-route" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path className="route-shadow" d="M280 385 C350 345 395 315 460 294 S620 220 710 203 S790 288 750 357 S700 450 610 497" /><path className="route-line" d="M280 385 C350 345 395 315 460 294 S620 220 710 203 S790 288 750 357 S700 450 610 497" /></svg>
    {items.map((item, index) => <button type="button" key={item.id} className={`demo-marker marker-${item.category} ${selectedId === item.id ? "active" : ""}`} style={item.position} onClick={() => onSelect(item)} aria-label={item.title}><span>{index + 1}</span><strong>{item.title}</strong></button>)}
    {loadFailed && <div className="map-error"><AlertTriangle size={16} /> 高德地图暂时加载失败，已切换为演示地图</div>}
  </div>;
}
