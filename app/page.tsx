"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble, CalendarDays, Check, ChevronDown, Clock3, Compass, Ellipsis,
  Footprints, GripVertical, Layers3, LocateFixed, Map as MapIcon, MapPin,
  MessageCircle, Navigation, Plus, Search, Share2, Sparkles, Star,
  TrainFront, Utensils, Users, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import { AMapCanvas, type AMapHandle, type MapItem, type SearchPlace } from "@/components/amap-canvas";

type Category = "sight" | "food" | "stay" | "transit";
export type PlanItem = MapItem & {
  time: string;
  meta: string;
  duration: string;
  note: string;
  address: string;
};
type Plans = Record<string, PlanItem[]>;
type IndexedPlans = Record<number, PlanItem[]>;

const DEFAULT_DATE_RANGE = { start: "2025-10-17", end: "2025-10-19" };

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDays(startValue: string, endValue: string) {
  const start = parseLocalDate(startValue);
  const end = parseLocalDate(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const result: Array<{ iso: string; weekday: string; date: string; shortDate: string }> = [];
  const cursor = new Date(start);
  while (cursor <= end && result.length < 14) {
    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();
    result.push({
      iso: toIsoDate(cursor),
      weekday: `周${["日", "一", "二", "三", "四", "五", "六"][cursor.getDay()]}`,
      date: `${month}月${day}日`,
      shortDate: `${month}/${day}`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function formatDateRange(days: ReturnType<typeof buildDays>) {
  if (!days.length) return "日期待设置";
  const first = parseLocalDate(days[0].iso);
  const last = parseLocalDate(days[days.length - 1].iso);
  if (first.getFullYear() !== last.getFullYear()) return `${days[0].date}—${days.at(-1)?.date}`;
  if (first.getMonth() === last.getMonth()) return `${first.getMonth() + 1}月${first.getDate()}日—${last.getDate()}日`;
  return `${days[0].date}—${days.at(-1)?.date}`;
}

const initialPlanTemplates: IndexedPlans = {
  0: [
    { id: 101, time: "16:00", title: "上海虹桥站", meta: "抵达 · G135次", category: "transit", duration: "30分钟", note: "出站后乘坐地铁 10 号线前往酒店。", address: "闵行区申贵路1500号", position: { left: "24%", top: "58%" }, lnglat: [121.326, 31.2005] },
    { id: 102, time: "17:10", title: "静安昆仑大酒店", meta: "住宿 · 已预订", category: "stay", duration: "50分钟", note: "办理入住并放置行李，确认双床房。", address: "静安区华山路250号", position: { left: "47%", top: "45%" }, lnglat: [121.4436, 31.2183] },
    { id: 103, time: "19:00", title: "田子坊", meta: "晚餐与散步 · 2 小时", category: "food", duration: "2小时", note: "第一晚节奏放松，沿泰康路随意探索。", address: "黄浦区泰康路210弄", position: { left: "66%", top: "62%" }, lnglat: [121.4685, 31.2073] },
  ],
  1: [
    { id: 1, time: "09:30", title: "武康大楼", meta: "城市漫步 · 预计 1 小时", category: "sight", duration: "1小时", note: "从天平路一侧开始逛，上午光线更好。", address: "徐汇区淮海中路1850号", position: { left: "28%", top: "55%" }, lnglat: [121.4388, 31.2029] },
    { id: 2, time: "11:10", title: "新荣记 · 南阳路", meta: "午餐 · 已收藏", category: "food", duration: "1.5小时", note: "需要提前确认座位，4 人桌。", address: "静安区南阳路170号", position: { left: "46%", top: "42%" }, lnglat: [121.4517, 31.2245] },
    { id: 3, time: "13:30", title: "上海博物馆东馆", meta: "展览 · 已预约", category: "sight", duration: "2.5小时", note: "预约码在附件中，建议提前 15 分钟到达。", address: "浦东新区世纪大道1952号", position: { left: "71%", top: "29%" }, lnglat: [121.5508, 31.2354] },
    { id: 4, time: "17:20", title: "外滩源", meta: "日落散步 · 预计 50 分钟", category: "sight", duration: "50分钟", note: "沿圆明园路向南步行，日落时间约 17:18。", address: "黄浦区圆明园路", position: { left: "75%", top: "51%" }, lnglat: [121.4908, 31.2442] },
    { id: 5, time: "19:00", title: "甬府 · 黄浦店", meta: "晚餐 · 待预订", category: "food", duration: "2小时", note: "候选餐厅，可与福和慧二选一。", address: "黄浦区广东路", position: { left: "61%", top: "71%" }, lnglat: [121.4787, 31.2207] },
  ],
  2: [
    { id: 201, time: "09:00", title: "上海自然博物馆", meta: "展览 · 预计 2 小时", category: "sight", duration: "2小时", note: "从 B2 层开始向上参观，避开上午团队高峰。", address: "静安区北京西路510号", position: { left: "38%", top: "45%" }, lnglat: [121.4624, 31.2367] },
    { id: 202, time: "11:45", title: "绿波廊", meta: "午餐 · 待确认", category: "food", duration: "1.5小时", note: "靠近豫园，适合衔接下午行程。", address: "黄浦区豫园路115号", position: { left: "57%", top: "55%" }, lnglat: [121.4927, 31.2271] },
    { id: 203, time: "13:30", title: "豫园", meta: "园林 · 预计 1.5 小时", category: "sight", duration: "1.5小时", note: "周末人多，建议提前购买门票。", address: "黄浦区福佑路168号", position: { left: "62%", top: "45%" }, lnglat: [121.492, 31.227] },
    { id: 204, time: "16:00", title: "上海中心大厦", meta: "城市景观 · 预计 1 小时", category: "sight", duration: "1小时", note: "天气晴朗时登顶，阴天则改为陆家嘴散步。", address: "浦东新区银城中路501号", position: { left: "73%", top: "39%" }, lnglat: [121.5055, 31.2335] },
  ],
};

function createInitialPlans(): Plans {
  return Object.fromEntries(buildDays(DEFAULT_DATE_RANGE.start, DEFAULT_DATE_RANGE.end).map((day, index) => [day.iso, initialPlanTemplates[index] ?? []]));
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeStoredPlans(value: unknown, storedRange: { start: string; end: string }): Plans {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createInitialPlans();
  const records = value as Record<string, unknown>;
  const mapped: Plans = {};
  const legacyDays = buildDays(storedRange.start, storedRange.end);
  for (const [key, items] of Object.entries(records)) {
    if (!Array.isArray(items)) continue;
    if (isDateKey(key)) mapped[key] = items as PlanItem[];
    else if (/^\d+$/.test(key)) {
      const legacyDate = legacyDays[Number(key)]?.iso;
      if (legacyDate) mapped[legacyDate] = items as PlanItem[];
    }
  }
  return Object.keys(mapped).length ? mapped : createInitialPlans();
}

const categoryStyle: Record<Category, { icon: typeof MapPin; label: string; className: string }> = {
  sight: { icon: Star, label: "游玩", className: "marker-coral" },
  food: { icon: Utensils, label: "餐饮", className: "marker-gold" },
  stay: { icon: BedDouble, label: "住宿", className: "marker-ink" },
  transit: { icon: TrainFront, label: "交通", className: "marker-blue" },
};

const starterPlaces: SearchPlace[] = [
  { id: "anfuroad", name: "安福路", address: "安福路文化街区", district: "徐汇区", type: "风景名胜", lnglat: [121.4417, 31.2149] },
  { id: "postmuseum", name: "上海邮政博物馆", address: "天潼路395号", district: "虹口区", type: "科教文化", lnglat: [121.4904, 31.2491] },
  { id: "fuhehui", name: "福和慧", address: "愚园路1037号", district: "长宁区", type: "餐饮服务", lnglat: [121.4297, 31.2097] },
];

const commentsSeed = [
  { author: "林", color: "avatar-two", text: "周六下午博物馆预约好了，二维码放群里了。" },
  { author: "予", color: "avatar-one", text: "外滩源保留，日落前到就很舒服。" },
  { author: "周", color: "avatar-three", text: "晚餐我可以负责打电话确认座位。" },
];

function categoryForType(type: string): Category {
  if (/餐饮|美食|咖啡/.test(type)) return "food";
  if (/住宿|酒店|宾馆/.test(type)) return "stay";
  if (/交通|车站|机场|地铁/.test(type)) return "transit";
  return "sight";
}

function distanceMeters(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function approximateDistance(items: PlanItem[]) {
  return items.slice(1).reduce((sum, item, index) => sum + distanceMeters(items[index].lnglat, item.lnglat), 0);
}

function optimizeByDistance(items: PlanItem[]) {
  if (items.length < 3) return items;
  const times = [...items].map((item) => item.time).sort();
  const remaining = items.slice(1);
  const ordered = [items[0]];
  while (remaining.length) {
    const from = ordered[ordered.length - 1];
    let nearest = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (distanceMeters(from.lnglat, remaining[i].lnglat) < distanceMeters(from.lnglat, remaining[nearest].lnglat)) nearest = i;
    }
    ordered.push(remaining.splice(nearest, 1)[0]);
  }
  return ordered.map((item, index) => ({ ...item, time: times[index] }));
}

export default function Home() {
  const mapRef = useRef<AMapHandle>(null);
  const draggedId = useRef<number | null>(null);
  const daySwipeStart = useRef<number | null>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [plans, setPlans] = useState<Plans>(createInitialPlans);
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [dateDraft, setDateDraft] = useState(DEFAULT_DATE_RANGE);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateSelectionStep, setDateSelectionStep] = useState<"start" | "end">("start");
  const [dayPage, setDayPage] = useState(0);
  const days = useMemo(() => buildDays(dateRange.start, dateRange.end), [dateRange]);
  const tripDateLabel = useMemo(() => formatDateRange(days), [days]);
  const datePickerRange = useMemo<DateRange>(() => ({ from: parseLocalDate(dateDraft.start), to: parseLocalDate(dateDraft.end) }), [dateDraft]);
  const pageCount = Math.max(1, Math.ceil(days.length / 3));
  const visibleDays = days.slice(dayPage * 3, dayPage * 3 + 3);
  const activeDate = days[activeDay]?.iso;
  const items = activeDate ? plans[activeDate] ?? [] : [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPlace[]>(starterPlaces);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  const [directAdding, setDirectAdding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"map" | "plan">("map");
  const [mapConnected, setMapConnected] = useState(false);
  const [routeInfo, setRouteInfo] = useState<Record<string, { distance: number; duration: number }>>({});
  const [optimizing, setOptimizing] = useState(false);
  const [notice, setNotice] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [comments, setComments] = useState(commentsSeed);
  const [commentDraft, setCommentDraft] = useState("");
  const [editDraft, setEditDraft] = useState({ time: "", duration: "", note: "" });
  const [storageReady, setStorageReady] = useState(false);

  const stats = useMemo(() => {
    const actual = activeDate ? routeInfo[activeDate] : undefined;
    const distance = actual?.distance || approximateDistance(items);
    const duration = actual?.duration || Math.max(1, Math.round(distance / 4500 * 3600));
    return { distance: `${(distance / 1000).toFixed(1)} 公里`, duration: `约 ${Math.max(1, Math.round(duration / 3600))} 小时` };
  }, [activeDate, items, routeInfo]);

  useEffect(() => {
    try {
      let storedRange = DEFAULT_DATE_RANGE;
      const savedDates = window.localStorage.getItem("roamnote-dates-v1");
      if (savedDates) {
        const value = JSON.parse(savedDates) as { start?: string; end?: string };
        if (value.start && value.end && buildDays(value.start, value.end).length) {
          storedRange = { start: value.start, end: value.end };
          setDateRange(storedRange);
          setDateDraft(storedRange);
        }
      }
      const saved = window.localStorage.getItem("roamnote-plans-v3") ?? window.localStorage.getItem("roamnote-plans-v2");
      if (saved) setPlans(normalizeStoredPlans(JSON.parse(saved), storedRange));
    } catch { /* Device storage is optional. */ }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try { window.localStorage.setItem("roamnote-plans-v3", JSON.stringify(plans)); } catch { /* Device storage is optional. */ }
  }, [plans, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try { window.localStorage.setItem("roamnote-dates-v1", JSON.stringify(dateRange)); } catch { /* Device storage is optional. */ }
  }, [dateRange, storageReady]);

  useEffect(() => {
    if (days.length) setActiveDay((current) => Math.min(current, days.length - 1));
  }, [days.length]);

  useEffect(() => {
    setDayPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    setDayPage(Math.floor(activeDay / 3));
  }, [activeDay]);

  useEffect(() => {
    const first = activeDate ? plans[activeDate]?.[0] : undefined;
    setSelectedId(first?.id ?? null);
    window.setTimeout(() => mapRef.current?.fitToItems(), 80);
  }, [activeDate, storageReady]);

  useEffect(() => {
    if (!dialogOpen) return;
    const cleaned = query.trim();
    if (cleaned.length < 2) { setSearchResults(starterPlaces); setSearchState("idle"); return; }
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        const [places, geocode] = await Promise.all([
          mapRef.current?.searchPlaces(cleaned) ?? Promise.resolve([]),
          mapRef.current?.resolveAddress(cleaned) ?? Promise.resolve(null),
        ]);
        const addressResult = geocode && !places.some((place) => Math.abs(place.lnglat[0] - geocode.lnglat[0]) < .0001 && Math.abs(place.lnglat[1] - geocode.lnglat[1]) < .0001) ? [geocode] : [];
        setSearchResults([...places, ...addressResult].slice(0, 8));
        setSearchState("idle");
      } catch { setSearchResults([]); setSearchState("error"); }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [dialogOpen, query, mapConnected]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setDialogOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const openDateEditor = () => {
    setDateDraft(dateRange);
    setDateSelectionStep("start");
    setDateOpen(true);
  };

  const selectDay = (index: number) => {
    setActiveDay(index);
    setDayPage(Math.floor(index / 3));
  };

  const moveActiveDay = (direction: -1 | 1) => {
    setActiveDay((current) => Math.max(0, Math.min(days.length - 1, current + direction)));
  };

  const chooseCalendarDate = (date: Date) => {
    const iso = toIsoDate(date);
    if (dateSelectionStep === "start") {
      setDateDraft({ start: iso, end: iso });
      setDateSelectionStep("end");
      return;
    }
    const start = parseLocalDate(dateDraft.start);
    const selected = parseLocalDate(iso);
    const rangeLength = Math.round(Math.abs(selected.getTime() - start.getTime()) / 86400000) + 1;
    if (rangeLength > 14) {
      showNotice("单次行程最多 14 天，请选择更近的结束日");
      return;
    }
    setDateDraft(iso < dateDraft.start ? { start: iso, end: dateDraft.start } : { start: dateDraft.start, end: iso });
    setDateSelectionStep("start");
  };

  const saveDateRange = () => {
    const nextDays = buildDays(dateDraft.start, dateDraft.end);
    if (!nextDays.length) {
      showNotice("结束日期不能早于出发日期");
      return;
    }
    const end = parseLocalDate(dateDraft.end);
    const cappedEnd = parseLocalDate(nextDays[nextDays.length - 1].iso);
    if (end > cappedEnd) {
      showNotice("单次行程最多支持 14 天");
      return;
    }
    const currentlyViewedDate = activeDate;
    const nextActiveDay = nextDays.findIndex((day) => day.iso === currentlyViewedDate);
    setDateRange(dateDraft);
    setActiveDay(nextActiveDay >= 0 ? nextActiveDay : 0);
    setRouteInfo({});
    setDateOpen(false);
    showNotice(`行程日期已更新为 ${formatDateRange(nextDays)}；仅保留重叠日期的安排`);
  };

  const selectItem = (mapItem: MapItem) => {
    setSelectedId(mapItem.id);
    mapRef.current?.focusItem(mapItem);
  };

  const addPlace = (place: SearchPlace) => {
    if (!activeDate) return;
    const category = categoryForType(place.type);
    const next: PlanItem = {
      id: Date.now(), time: "待安排", title: place.name,
      meta: `${place.district || "上海"} · 新增候选`, category, duration: "待设置",
      note: "刚刚加入行程，可以继续设置时间和停留时长。", address: place.address,
      position: { left: "50%", top: "58%" }, lnglat: place.lnglat,
    };
    setPlans((current) => ({ ...current, [activeDate]: [...(current[activeDate] ?? []), next] }));
    setSelectedId(next.id);
    setDialogOpen(false);
    setQuery("");
    showNotice(`${place.name} 已加入 ${days[activeDay].date}`);
  };

  const addDirectAddress = async () => {
    const address = query.trim();
    if (!address || directAdding) return;
    setDirectAdding(true);
    try {
      const place = await mapRef.current?.resolveAddress(address);
      if (!place) {
        setSearchState("error");
        showNotice("未能解析这个地址，请补充城市、街道或门牌号");
        return;
      }
      addPlace(place);
    } catch {
      setSearchState("error");
      showNotice("地址解析暂时不可用，请稍后再试");
    } finally {
      setDirectAdding(false);
    }
  };

  const optimizeRoute = async () => {
    if (!activeDate || items.length < 2) return;
    setOptimizing(true);
    const optimized = optimizeByDistance([...items]);
    setPlans((current) => ({ ...current, [activeDate]: optimized }));
    try {
      const result = await mapRef.current?.planRoute(optimized);
      if (result) setRouteInfo((current) => ({ ...current, [activeDate]: result }));
      showNotice("已按距离重排行程，并生成高德驾车路线");
    } catch { showNotice("顺序已优化，路线服务暂时不可用"); }
    setOptimizing(false);
  };

  const reorderAt = (targetId: number) => {
    if (!activeDate) return;
    const sourceId = draggedId.current;
    if (!sourceId || sourceId === targetId) return;
    const next = [...items];
    const from = next.findIndex((item) => item.id === sourceId);
    const to = next.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPlans((current) => ({ ...current, [activeDate]: next }));
    draggedId.current = null;
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); showNotice("分享链接已复制"); }
    catch { showNotice("当前浏览器无法复制，请从地址栏复制链接"); }
  };

  const openNavigation = () => {
    if (!selected) return;
    const [lng, lat] = selected.lnglat;
    window.open(`https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(selected.title)}&mode=walk&policy=1&src=roamnote&coordinate=gaode&callnative=1`, "_blank", "noopener,noreferrer");
  };

  const openEdit = () => {
    if (!selected) return;
    setEditDraft({ time: selected.time, duration: selected.duration, note: selected.note });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!selected || !activeDate) return;
    setPlans((current) => ({
      ...current,
      [activeDate]: (current[activeDate] ?? []).map((item) => item.id === selected.id ? { ...item, ...editDraft, meta: `${categoryStyle[item.category].label} · ${editDraft.duration}` } : item),
    }));
    setEditOpen(false);
    showNotice("安排已保存");
  };

  useEffect(() => {
    type WebMCPContext = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: WebMCPContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "read_itinerary", title: "查看当前行程", description: "读取当前日期的行程地点、时间和地址。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ day: days[activeDay].date, items: items.map(({ title, time, address }) => ({ title, time, address })) }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [activeDay, items]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="漫游记"><span className="brand-mark"><Navigation size={18} strokeWidth={2.4} /></span><span className="brand-name">漫游记</span></div>
        <button className="trip-switcher" type="button" onClick={() => setTripOpen(true)}><span className="trip-cover" /><span className="trip-copy"><strong>上海 · 秋日周末</strong><small>{tripDateLabel} · 4人同行</small></span><ChevronDown size={16} /></button>
        <div className="top-actions">
          <div className="avatar-stack" aria-label="4 位同行者"><span className="avatar avatar-one">予</span><span className="avatar avatar-two">林</span><span className="avatar avatar-three">+2</span></div>
          <button className="icon-button comments-button" aria-label="讨论" type="button" onClick={() => setCommentsOpen(true)}><MessageCircle size={18} /><span>{comments.length}</span></button>
          <button className="share-button" type="button" onClick={share}><Share2 size={16} /> 分享</button>
        </div>
      </header>

      <section className="workspace">
        <aside className={`plan-panel ${mobilePanel === "plan" ? "mobile-visible" : ""}`}>
          <div className="plan-heading"><div><span className="eyebrow">{days.length} 日城市漫游</span><h1>我们的行程</h1></div><div className="plan-heading-actions"><button className="date-edit-button" aria-label="修改行程日期" type="button" onClick={openDateEditor}><CalendarDays size={15} /><span>日期</span></button><button className="soft-icon-button" aria-label="行程概览" type="button" onClick={() => setTripOpen(true)}><Ellipsis size={20} /></button></div></div>
          <div className="date-navigator" onTouchStart={(event) => { daySwipeStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const start = daySwipeStart.current; const end = event.changedTouches[0]?.clientX; daySwipeStart.current = null; if (start === null || end === undefined || Math.abs(start - end) < 36) return; moveActiveDay(start > end ? 1 : -1); }}>
            <button className="day-page-button" type="button" aria-label="前一天" disabled={activeDay === 0} onClick={() => moveActiveDay(-1)}><ChevronLeft size={18} /></button>
            <div className="day-tabs" role="tablist" aria-label="选择日期">
              {visibleDays.map((day, tabIndex) => { const index = dayPage * 3 + tabIndex; return <button type="button" role="tab" aria-selected={activeDay === index} className={activeDay === index ? "day-tab active" : "day-tab"} key={day.iso} onClick={() => selectDay(index)}><span>{day.weekday}</span><strong>{day.shortDate}</strong><small>{plans[day.iso]?.length ?? 0} 个安排</small></button>; })}
            </div>
            <button className="day-page-button" type="button" aria-label="后一天" disabled={activeDay >= days.length - 1} onClick={() => moveActiveDay(1)}><ChevronRight size={18} /></button>
            <span className="day-page-status" aria-live="polite">第 {dayPage * 3 + 1}—{Math.min((dayPage + 1) * 3, days.length)} 天 / 共 {days.length} 天</span>
          </div>
          <div className="day-summary"><span><Footprints size={15} /> {stats.distance}</span><span><Clock3 size={15} /> {stats.duration}</span><button type="button" disabled={optimizing} onClick={optimizeRoute}><Sparkles size={15} /> {optimizing ? "计算中" : "优化路线"}</button></div>
          <div className="timeline" aria-label={`${days[activeDay].date}行程`}>
            {items.map((item, index) => {
              const config = categoryStyle[item.category]; const Icon = config.icon;
              return <button type="button" draggable key={item.id} className={selected?.id === item.id ? "timeline-item selected" : "timeline-item"} onDragStart={() => { draggedId.current = item.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderAt(item.id)} onClick={() => selectItem(item)}>
                <span className="drag"><GripVertical size={16} /></span><span className="item-time">{item.time}</span><span className={`item-icon ${config.className}`}><Icon size={16} /></span><span className="item-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>{index < items.length - 1 && <span className="travel-leg">{item.category === "transit" ? "地铁 28 分钟" : "前往下一站"}</span>}
              </button>;
            })}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><button className="add-plan-button" type="button"><Plus size={18} /> 添加地点或安排</button></DialogTrigger>
            <DialogContent className="add-dialog">
              <DialogHeader><DialogTitle>搜索地点或地址</DialogTitle><DialogDescription>全国搜索；选择结果或按回车，即可直接加入 {days[activeDay].date}。</DialogDescription></DialogHeader>
              <label className="dialog-search"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addDirectAddress(); } }} placeholder="例如：连云港、武康路 115 号" /></label>
              <div className="search-status">{directAdding ? "正在解析地址…" : searchState === "loading" ? "正在搜索高德地点…" : query.length < 2 ? "推荐地点" : searchResults.length ? `找到 ${searchResults.length} 个可添加地点` : searchState === "error" ? "高德搜索暂时未返回结果，可尝试直接解析地址" : "没有匹配的地点，可直接解析这个地址"}</div>
              <div className="suggestion-list">
                {query.trim() && <button type="button" className="direct-address-result" disabled={directAdding} onClick={() => void addDirectAddress()}><span className="suggestion-icon"><MapPin size={17} /></span><span><strong>直接添加“{query.trim()}”</strong><small>按地址解析后加入当前日期</small></span><Plus size={17} /></button>}
                {searchResults.map((place) => <button type="button" key={place.id} onClick={() => addPlace(place)}><span className="suggestion-icon"><MapPin size={17} /></span><span><strong>{place.name}</strong><small>{place.district} · {place.address}</small></span><Plus size={17} /></button>)}
                {searchState === "error" && !query.trim() && <div className="search-empty">没有找到相关地点，换个关键词试试</div>}
              </div>
            </DialogContent>
          </Dialog>
        </aside>

        <section className={`map-panel ${mobilePanel === "map" ? "mobile-visible" : ""}`} aria-label="行程地图">
          <AMapCanvas ref={mapRef} items={items} selectedId={selected?.id ?? null} onSelect={selectItem} onConnectionChange={setMapConnected} />
          <div className="map-search-wrap"><button className="map-search" type="button" onClick={() => setDialogOpen(true)}><Search size={18} /><span>搜索地点或地址，直接加入行程</span><kbd>⌘ K</kbd></button></div>
          <div className="map-provider-pill"><span className="live-dot" />{mapConnected ? "高德地图已连接" : "正在连接高德地图"}</div>
          <div className="map-controls" aria-label="地图控制">
            <button type="button" aria-label="放大" onClick={() => mapRef.current?.zoomIn()}><ZoomIn size={19} /></button><button type="button" aria-label="缩小" onClick={() => mapRef.current?.zoomOut()}><ZoomOut size={19} /></button><span />
            <button type="button" aria-label="定位" onClick={async () => { try { await mapRef.current?.locate(); showNotice("已定位到当前位置"); } catch (error) { showNotice(error instanceof Error ? error.message : "定位失败"); } }}><LocateFixed size={19} /></button>
            <button type="button" aria-label="切换图层" onClick={() => showNotice(`已切换为${mapRef.current?.cycleStyle() ?? "地图"}`)}><Layers3 size={19} /></button>
          </div>
          <div className="map-legend">{Object.entries(categoryStyle).map(([key, value]) => { const Icon = value.icon; return <span key={key}><i className={value.className}><Icon size={12} /></i>{value.label}</span>; })}</div>
          <aside className="place-card" aria-live="polite">
            {selected ? <><div className="place-photo"><img src="/shanghai-cover.png" alt="雨后晨光中的上海梧桐街道" /><button type="button" aria-label="关闭地点详情" onClick={() => setSelectedId(null)}><X size={17} /></button><span>{categoryStyle[selected.category].label}</span></div><div className="place-body">
              <div className="place-title-row"><div><h2>{selected.title}</h2><p><MapPin size={14} /> {selected.address}</p></div><button type="button" className={favoriteIds.includes(selected.id) ? "favorite-active" : ""} aria-label="收藏" onClick={() => setFavoriteIds((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id])}><Star size={19} fill={favoriteIds.includes(selected.id) ? "currentColor" : "none"} /></button></div>
              <div className="reservation-chip"><Check size={14} /> {selected.meta.includes("已预约") ? "已预约 · 凭证已保存" : `已加入 ${days[activeDay].date}`}</div><p className="place-note">{selected.note}</p>
              <div className="place-actions"><button type="button" onClick={openNavigation}><Navigation size={16} /> 开始导航</button><button type="button" onClick={openEdit}><CalendarDays size={16} /> 编辑安排</button></div>
            </div></> : <div className="empty-place"><Compass size={26} /><strong>选择地图上的地点</strong><span>查看详情、备注和导航入口</span></div>}
          </aside>
        </section>
      </section>

      <nav className="mobile-nav" aria-label="移动端视图切换"><button type="button" className={mobilePanel === "map" ? "active" : ""} onClick={() => setMobilePanel("map")}><MapIcon size={18} />地图</button><button type="button" className={mobilePanel === "plan" ? "active" : ""} onClick={() => setMobilePanel("plan")}><CalendarDays size={18} />行程</button><button type="button" onClick={() => setCommentsOpen(true)}><Users size={18} />同行</button></nav>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="edit-dialog"><DialogHeader><DialogTitle>编辑 {selected?.title}</DialogTitle><DialogDescription>调整当天的到达时间、停留时长和同行备注。</DialogDescription></DialogHeader><div className="edit-grid"><label><span>到达时间</span><input value={editDraft.time} onChange={(event) => setEditDraft((current) => ({ ...current, time: event.target.value }))} /></label><label><span>停留时长</span><input value={editDraft.duration} onChange={(event) => setEditDraft((current) => ({ ...current, duration: event.target.value }))} /></label><label className="edit-note"><span>同行备注</span><textarea rows={4} value={editDraft.note} onChange={(event) => setEditDraft((current) => ({ ...current, note: event.target.value }))} /></label></div><button className="dialog-primary" type="button" onClick={saveEdit}>保存安排</button></DialogContent></Dialog>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}><DialogContent className="date-dialog"><DialogHeader><DialogTitle>设置行程日期</DialogTitle><DialogDescription>{dateSelectionStep === "start" ? "请点选新的出发日期" : "出发日已选择，请再点选结束日期"}，单次最多 14 天。</DialogDescription></DialogHeader><div className="date-step-selector"><button type="button" className={dateSelectionStep === "start" ? "active" : ""} onClick={() => setDateSelectionStep("start")}><small>1 · 出发</small><strong>{dateDraft.start.replaceAll("-", ".")}</strong></button><i /><button type="button" className={dateSelectionStep === "end" ? "active" : ""} onClick={() => setDateSelectionStep("end")}><small>2 · 结束</small><strong>{dateDraft.end.replaceAll("-", ".")}</strong></button></div><div className="date-calendar-shell"><Calendar mode="range" locale={zhCN} selected={datePickerRange} onSelect={() => undefined} onDayClick={chooseCalendarDate} numberOfMonths={2} defaultMonth={parseLocalDate(dateDraft.start)} showOutsideDays={false} /></div><div className="date-dialog-preview"><CalendarDays size={17} /><span>{formatDateRange(buildDays(dateDraft.start, dateDraft.end))}</span><small>{buildDays(dateDraft.start, dateDraft.end).length || 0} 天</small></div><button className="dialog-primary" type="button" onClick={saveDateRange}>保存行程日期</button></DialogContent></Dialog>

      <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}><DialogContent className="comments-dialog"><DialogHeader><DialogTitle>同行讨论</DialogTitle><DialogDescription>和同行者确认预约、餐厅与路线变化。</DialogDescription></DialogHeader><div className="comment-list">{comments.map((comment, index) => <div className="comment" key={`${comment.author}-${index}`}><span className={`avatar ${comment.color}`}>{comment.author}</span><p><strong>{comment.author}</strong>{comment.text}</p></div>)}</div><div className="comment-compose"><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="回复同行者…" /><button type="button" onClick={() => { if (!commentDraft.trim()) return; setComments((current) => [...current, { author: "予", color: "avatar-one", text: commentDraft.trim() }]); setCommentDraft(""); }}>发送</button></div></DialogContent></Dialog>

      <Dialog open={tripOpen} onOpenChange={setTripOpen}><DialogContent className="trip-dialog"><div className="trip-dialog-cover"><img src="/shanghai-cover.png" alt="上海秋日旅行封面" /></div><DialogHeader><DialogTitle>上海 · 秋日周末</DialogTitle><DialogDescription>{tripDateLabel} · 4人同行 · 共 {days.reduce((sum, day) => sum + (plans[day.iso]?.length ?? 0), 0)} 个安排</DialogDescription></DialogHeader><button className="trip-edit-date" type="button" onClick={() => { setTripOpen(false); openDateEditor(); }}><CalendarDays size={15} />修改行程日期</button><div className="trip-overview">{days.map((day, index) => <button type="button" key={day.iso} onClick={() => { selectDay(index); setTripOpen(false); }}><span>{day.weekday}</span><strong>{day.date}</strong><small>{plans[day.iso]?.length ?? 0} 个地点</small></button>)}</div></DialogContent></Dialog>

      {notice && <div className="notice" role="status"><Check size={16} /> {notice}</div>}
    </main>
  );
}
