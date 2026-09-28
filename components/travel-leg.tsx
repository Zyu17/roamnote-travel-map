"use client";
import { useEffect, useMemo, useState } from "react";
import { Car, ChevronDown, Footprints, Navigation, RefreshCw, TrainFront } from "lucide-react";
import { formatTravelDistance, formatTravelDuration, isTravelMode, routeNavigationUrl, travelModes, type RoutePoint, type TravelMode, type TravelRoute } from "@/lib/travel-route";
type Stop = RoutePoint & { travelMode?: TravelMode };
type Leg = { key: string; from: Stop; to: Stop; mode: TravelMode };
type State = { loading: boolean; result?: TravelRoute; error?: string };
const cache = new Map<string, { expires: number; result: TravelRoute }>();
const icons = { walking: Footprints, driving: Car, transit: TrainFront };

export function useTravelRoutes(items: Stop[], enabled: boolean, scope: string) {
  const legs = useMemo(() => items.slice(0, -1).map((from, i): Leg => {
    const to = items[i + 1]; const mode = isTravelMode(from.travelMode) ? from.travelMode : "driving";
    return { from, to, mode, key: `${scope}:${from.lnglat.join(",")}:${to.lnglat.join(",")}:${mode}` };
  }), [items, scope]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cursor = 0;
    async function worker() {
      while (cursor < legs.length && !controller.signal.aborted) {
        const leg = legs[cursor++];
        let next: State;
        try {
          const cached = cache.get(leg.key);
          let result = cached && cached.expires > Date.now() ? cached.result : undefined;
          if (!result) {
            const params = new URLSearchParams({ origin: leg.from.lnglat.join(","), destination: leg.to.lnglat.join(","), mode: leg.mode });
            const response = await fetch(`/api/amap-route?${params}`, { signal: controller.signal, cache: "no-store" });
            const payload = await response.json() as TravelRoute & { error?: string };
            if (!response.ok) throw new Error(payload.error ?? "路线查询失败");
            if (payload.status !== "ready" && payload.status !== "unavailable") throw new Error("路线数据不完整");
            result = payload;
            if (cache.size >= 300) cache.delete(cache.keys().next().value!);
            cache.set(leg.key, { result, expires: Date.now() + 300_000 });
          }
          next = { loading: false, result };
        } catch (error) { next = { loading: false, error: error instanceof Error ? error.message : "路线查询失败" }; }
        if (!controller.signal.aborted) setStates(current => ({ ...current, [leg.key]: next }));
      }
    }
    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setStates(Object.fromEntries(legs.map(leg => [leg.key, { loading: true }])));
      await Promise.all([worker(), worker()]);
    }
    void load();
    return () => controller.abort();
  }, [legs, enabled, revision]);
  return { legs, states, refresh: (key: string) => { cache.delete(key); setRevision(v => v + 1); } };
}

export function TravelLeg({ leg, state, readOnly, onMode, onRefresh }: { leg: Leg; state?: State; readOnly: boolean; onMode: (mode: TravelMode) => void; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = icons[leg.mode];
  const ready = state?.result?.status === "ready" ? state.result : null;
  const description = !state ? "登录后查询耗时" : state.loading ? "查询中…" : ready ? `约 ${formatTravelDuration(ready.duration)} · ${formatTravelDistance(ready.distance)}` : "暂无可用路线";
  return <div className="travel-leg-control">
    <div className="travel-leg-bar"><button type="button" className="travel-leg-toggle" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><Icon size={13} /><span>{travelModes[leg.mode]} · {description}</span><ChevronDown size={13} /></button><a href={routeNavigationUrl(leg.from, leg.to, leg.mode)} target="_blank" rel="noopener noreferrer" aria-label={`从${leg.from.title}到${leg.to.title}的${travelModes[leg.mode]}导航`}><Navigation size={13} />导航</a></div>
    {expanded && <div className="travel-leg-details"><p>{leg.from.title} → {leg.to.title}</p><div className="travel-mode-options" aria-label="选择交通方式">{(Object.keys(travelModes) as TravelMode[]).map(mode => { const ModeIcon = icons[mode]; return <button type="button" key={mode} disabled={readOnly} aria-pressed={mode === leg.mode} onClick={() => onMode(mode)}><ModeIcon size={14} />{travelModes[mode]}</button>; })}</div><small aria-live="polite">{ready ? `高德预计耗时 · ${new Date(ready.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 查询；不是未来出行的保证时间。` : state?.error ?? (state?.result?.status === "unavailable" ? state.result.message : description)}</small>{state && !state.loading && <button type="button" className="travel-route-refresh" onClick={onRefresh}><RefreshCw size={12} />重新查询</button>}</div>}
  </div>;
}
