"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { PlaceImage } from "@/lib/place-images";

type Props = { name: string; lnglat: [number, number]; label: string; onClose: () => void };

export function PlacePhoto({ name, lnglat, label, onClose }: Props) {
  const [state, setState] = useState<{ status: "loading" | "empty" | "ready"; image?: PlaceImage }>({ status: "loading" });
  const [loaded, setLoaded] = useState(false);
  const [lng, lat] = lnglat;
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { controller.abort(); setState({ status: "empty" }); }, 10000);
    const query = new URLSearchParams({ name, lng: String(lng), lat: String(lat) });
    void fetch(`/api/place-image?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("image unavailable");
        const data = await response.json() as { image: PlaceImage | null };
        if (!controller.signal.aborted) setState(data.image ? { status: "ready", image: data.image } : { status: "empty" });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "empty" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [name, lng, lat]);
  const image = state.image;
  const loading = state.status === "loading" || (state.status === "ready" && !loaded);
  return <div className={`place-photo ${loading ? "is-loading" : ""} ${state.status === "empty" ? "is-empty" : ""}`}>
    {!loaded && <div className="place-photo-placeholder" role="status"><MapPin size={27} /><small>{loading ? "正在加载地点图片" : "地点实景待补充"}</small></div>}
    {image && <img src={image.url} alt={image.alt} width={image.width} height={image.height}
      style={{ objectPosition: `${image.focalX * 100}% ${image.focalY * 100}%`, opacity: loaded ? 1 : 0 }}
      onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setState({ status: "empty" }); }} />}
    <button type="button" aria-label="关闭地点详情" onClick={onClose}><X size={17} /></button>
    <span>{label}</span>
    {image && loaded && <div className="place-photo-credit" title={`${image.alt}；${image.changes}`}>
      <a href={image.sourcePageUrl} target="_blank" rel="noopener noreferrer">摄影：{image.author}</a>
      <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer">{image.license}</a>
    </div>}
  </div>;
}
