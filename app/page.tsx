"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BedDouble, CalendarDays, Check, ChevronDown, Clock3, Compass, Ellipsis,
  Footprints, GripVertical, Layers3, LocateFixed, Map as MapIcon, MapPin,
  MessageCircle, Navigation, Plus, Search, Share2, Sparkles, Star,
  TrainFront, Utensils, Users, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AMapCanvas } from "@/components/amap-canvas";

type Category = "sight" | "food" | "stay" | "transit";
export type PlanItem = {
  id: number; time: string; title: string; meta: string; category: Category;
  duration?: string; note?: string; position: { left: string; top: string };
  lnglat: [number, number];
};

const days = [
  { weekday: "周五", date: "10月17日", count: 3 },
  { weekday: "周六", date: "10月18日", count: 5 },
  { weekday: "周日", date: "10月19日", count: 4 },
];

const baseItems: PlanItem[] = [
  { id: 1, time: "09:30", title: "武康大楼", meta: "城市漫步 · 预计 1 小时", category: "sight", duration: "1小时", note: "从天平路一侧开始逛，上午光线更好。", position: { left: "28%", top: "55%" }, lnglat: [121.4388, 31.2029] },
  { id: 2, time: "11:10", title: "新荣记 · 南阳路", meta: "午餐 · 已收藏", category: "food", duration: "1.5小时", note: "需要提前确认座位，4 人桌。", position: { left: "46%", top: "42%" }, lnglat: [121.4517, 31.2245] },
  { id: 3, time: "13:30", title: "上海博物馆东馆", meta: "展览 · 已预约", category: "sight", duration: "2.5小时", note: "预约码在附件中，建议提前 15 分钟到达。", position: { left: "71%", top: "29%" }, lnglat: [121.5508, 31.2354] },
  { id: 4, time: "17:20", title: "外滩源", meta: "日落散步 · 预计 50 分钟", category: "sight", duration: "50分钟", note: "沿圆明园路向南步行，日落时间约 17:18。", position: { left: "75%", top: "51%" }, lnglat: [121.4908, 31.2442] },
  { id: 5, time: "19:00", title: "甬府 · 黄浦店", meta: "晚餐 · 待预订", category: "food", duration: "2小时", note: "候选餐厅，可与福和慧二选一。", position: { left: "61%", top: "71%" }, lnglat: [121.4787, 31.2207] },
];

const categoryStyle: Record<Category, { icon: typeof MapPin; label: string; className: string }> = {
  sight: { icon: Star, label: "游玩", className: "marker-coral" },
  food: { icon: Utensils, label: "餐饮", className: "marker-gold" },
  stay: { icon: BedDouble, label: "住宿", className: "marker-ink" },
  transit: { icon: TrainFront, label: "交通", className: "marker-blue" },
};

const suggestions = [
  { name: "安福路", area: "徐汇区", category: "sight" as Category, lnglat: [121.4417, 31.2149] as [number, number] },
  { name: "上海邮政博物馆", area: "虹口区", category: "sight" as Category, lnglat: [121.4904, 31.2491] as [number, number] },
  { name: "福和慧", area: "长宁区", category: "food" as Category, lnglat: [121.4297, 31.2097] as [number, number] },
];

export default function Home() {
  const [activeDay, setActiveDay] = useState(1);
  const [items, setItems] = useState(baseItems);
  const [selected, setSelected] = useState<PlanItem | null>(baseItems[2]);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"map" | "plan">("map");
  const [mapConnected, setMapConnected] = useState(false);
  const filteredSuggestions = useMemo(() => suggestions.filter((item) => item.name.includes(query) || item.area.includes(query)), [query]);

  const addSuggestion = (suggestion: (typeof suggestions)[number]) => {
    const next: PlanItem = {
      id: Date.now(), time: "待安排", title: suggestion.name,
      meta: `${suggestion.area} · 新增候选`, category: suggestion.category,
      duration: "待设置", note: "刚刚加入行程，可以继续设置时间和停留时长。",
      position: { left: "40%", top: "67%" }, lnglat: suggestion.lnglat,
    };
    setItems((current) => [...current, next]);
    setSelected(next);
    setDialogOpen(false);
  };

  useEffect(() => {
    type WebMCPContext = {
      registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: WebMCPContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: "read_itinerary",
      title: "查看当前行程",
      description: "读取当前选中日期的行程地点、时间和安排状态。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ day: days[activeDay].date, items: items.map(({ title, time, meta }) => ({ title, time, status: meta })) }),
    }, { signal: lifecycle.signal })).catch(() => undefined);

    void Promise.resolve(context.registerTool({
      name: "add_candidate_place",
      title: "添加候选地点",
      description: "将名称匹配的上海地点添加到当前行程。支持安福路、上海邮政博物馆和福和慧。",
      inputSchema: { type: "object", properties: { name: { type: "string", enum: suggestions.map((item) => item.name) } }, required: ["name"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const name = typeof input === "object" && input !== null && "name" in input ? String((input as { name: unknown }).name) : "";
        const match = suggestions.find((item) => item.name === name);
        if (!match) throw new Error("未找到可添加的候选地点");
        addSuggestion(match);
        return { added: true, name: match.name, day: days[activeDay].date };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [activeDay, items]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="漫游记">
          <span className="brand-mark"><Navigation size={18} strokeWidth={2.4} /></span>
          <span className="brand-name">漫游记</span>
        </div>
        <button className="trip-switcher" type="button">
          <span className="trip-cover" />
          <span className="trip-copy"><strong>上海 · 秋日周末</strong><small>10月17日—19日 · 4人同行</small></span>
          <ChevronDown size={16} />
        </button>
        <div className="top-actions">
          <div className="avatar-stack" aria-label="4 位同行者"><span className="avatar avatar-one">予</span><span className="avatar avatar-two">林</span><span className="avatar avatar-three">+2</span></div>
          <button className="icon-button comments-button" aria-label="讨论" type="button"><MessageCircle size={18} /><span>3</span></button>
          <button className="share-button" type="button"><Share2 size={16} /> 分享</button>
        </div>
      </header>

      <section className="workspace">
        <aside className={`plan-panel ${mobilePanel === "plan" ? "mobile-visible" : ""}`}>
          <div className="plan-heading">
            <div><span className="eyebrow">3 日城市漫游</span><h1>我们的行程</h1></div>
            <button className="soft-icon-button" aria-label="更多选项" type="button"><Ellipsis size={20} /></button>
          </div>
          <div className="day-tabs" role="tablist" aria-label="选择日期">
            {days.map((day, index) => (
              <button type="button" role="tab" aria-selected={activeDay === index} className={activeDay === index ? "day-tab active" : "day-tab"} key={day.date} onClick={() => setActiveDay(index)}>
                <span>{day.weekday}</span><strong>{day.date.replace("10月", "10/").replace("日", "")}</strong><small>{day.count} 个安排</small>
              </button>
            ))}
          </div>
          <div className="day-summary"><span><Footprints size={15} /> 8.4 公里</span><span><Clock3 size={15} /> 约 10 小时</span><button type="button"><Sparkles size={15} /> 优化路线</button></div>
          <div className="timeline" aria-label="10月18日行程">
            {items.map((item, index) => {
              const config = categoryStyle[item.category]; const Icon = config.icon;
              return (
                <button type="button" key={item.id} className={selected?.id === item.id ? "timeline-item selected" : "timeline-item"} onClick={() => setSelected(item)}>
                  <span className="drag"><GripVertical size={16} /></span><span className="item-time">{item.time}</span><span className={`item-icon ${config.className}`}><Icon size={16} /></span>
                  <span className="item-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
                  {index < items.length - 1 && <span className="travel-leg">{index === 1 ? "地铁 34 分钟" : "步行 18 分钟"}</span>}
                </button>
              );
            })}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><button className="add-plan-button" type="button"><Plus size={18} /> 添加地点或安排</button></DialogTrigger>
            <DialogContent className="add-dialog">
              <DialogHeader><DialogTitle>添加一个地点</DialogTitle><DialogDescription>搜索收藏地点，先加入当天行程，时间可以稍后再定。</DialogDescription></DialogHeader>
              <label className="dialog-search"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索地点或区域" /></label>
              <div className="suggestion-list">
                {filteredSuggestions.map((suggestion) => <button type="button" key={suggestion.name} onClick={() => addSuggestion(suggestion)}><span className="suggestion-icon"><MapPin size={17} /></span><span><strong>{suggestion.name}</strong><small>{suggestion.area} · 上海</small></span><Plus size={17} /></button>)}
              </div>
            </DialogContent>
          </Dialog>
        </aside>

        <section className={`map-panel ${mobilePanel === "map" ? "mobile-visible" : ""}`} aria-label="行程地图">
          <AMapCanvas items={items} selectedId={selected?.id ?? null} onSelect={(item) => setSelected(item as PlanItem)} onConnectionChange={setMapConnected} />
          <div className="map-search-wrap"><label className="map-search"><Search size={18} /><input placeholder="搜索上海的地点、餐厅或地址" onFocus={() => setDialogOpen(true)} /><kbd>⌘ K</kbd></label></div>
          <div className="map-provider-pill"><span className="live-dot" />{mapConnected ? "高德地图已连接" : "正在连接高德地图"}</div>
          <div className="map-controls" aria-label="地图控制"><button type="button" aria-label="放大"><ZoomIn size={19} /></button><button type="button" aria-label="缩小"><ZoomOut size={19} /></button><span /><button type="button" aria-label="定位"><LocateFixed size={19} /></button><button type="button" aria-label="图层"><Layers3 size={19} /></button></div>
          <div className="map-legend">{Object.entries(categoryStyle).map(([key, value]) => { const Icon = value.icon; return <span key={key}><i className={value.className}><Icon size={12} /></i>{value.label}</span>; })}</div>
          <aside className="place-card" aria-live="polite">
            {selected ? <>
              <div className="place-photo"><img src="/shanghai-cover.png" alt="雨后晨光中的上海梧桐街道" /><button type="button" aria-label="关闭地点详情" onClick={() => setSelected(null)}><X size={17} /></button><span>{categoryStyle[selected.category].label}</span></div>
              <div className="place-body">
                <div className="place-title-row"><div><h2>{selected.title}</h2><p><MapPin size={14} /> 上海市 · 距上一站 4.2 公里</p></div><button type="button" aria-label="收藏"><Star size={19} /></button></div>
                <div className="reservation-chip"><Check size={14} /> {selected.meta.includes("已预约") ? "已预约 · 凭证已保存" : "已加入 10月18日"}</div>
                <p className="place-note">{selected.note}</p>
                <div className="place-actions"><button type="button"><Navigation size={16} /> 开始导航</button><button type="button"><CalendarDays size={16} /> 编辑安排</button></div>
              </div>
            </> : <div className="empty-place"><Compass size={26} /><strong>选择地图上的地点</strong><span>查看详情、备注和导航入口</span></div>}
          </aside>
        </section>
      </section>
      <nav className="mobile-nav" aria-label="移动端视图切换"><button type="button" className={mobilePanel === "map" ? "active" : ""} onClick={() => setMobilePanel("map")}><MapIcon size={18} />地图</button><button type="button" className={mobilePanel === "plan" ? "active" : ""} onClick={() => setMobilePanel("plan")}><CalendarDays size={18} />行程</button><button type="button"><Users size={18} />同行</button></nav>
    </main>
  );
}
