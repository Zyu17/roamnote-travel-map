"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Archive, BedDouble, CalendarDays, Check, ChevronDown, Clock3, Ellipsis, ImageUp,
  GripVertical, Layers3, LocateFixed, Map as MapIcon, MapPin, Scan,
  MessageCircle, Navigation, Pencil, Plus, Search, Share2, Sparkles, Star,
  TrainFront, Trash2, Utensils, Users, UserRound, LogOut, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { DateRange } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import { AMapCanvas, type AMapHandle, type MapItem, type SearchPlace } from "@/components/amap-canvas";
import { TravelLeg, useTravelRoutes } from "@/components/travel-leg";
import { formatTravelDistance, formatTravelDuration, type TravelMode } from "@/lib/travel-route";

type Category = "sight" | "food" | "stay" | "transit";
export type PlanItem = MapItem & {
  time: string;
  meta: string;
  duration: string;
  note: string;
  address: string;
  travelMode?: TravelMode;
};
type Plans = Record<string, PlanItem[]>;
type IndexedPlans = Record<number, PlanItem[]>;
type CommentRecord = { author: string; color: string; text: string };
type TripSnapshot = {
  title: string;
  coverUrl: string;
  dateRange: { start: string; end: string };
  plans: Plans;
  favoriteIds: number[];
  comments: CommentRecord[];
};
type TripLibraryItem = { id: string; title: string; coverUrl: string | null; startDate: string | null; endDate: string | null; planCount: number; updatedAt: string };

const DEFAULT_DATE_RANGE = { start: "2025-10-17", end: "2025-10-19" };
const DEFAULT_COVER_URL = "/shanghai-cover.png";
const SYSTEM_COVERS = [
  { id: "shanghai", name: "上海秋日", url: "/shanghai-cover.png" },
  { id: "hangzhou", name: "西湖晨光", url: "/covers/hangzhou-west-lake.jpg" },
  { id: "xiamen", name: "海岸慢游", url: "/covers/xiamen-coast.jpg" },
];
function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function clockToMinutes(value: string, allowDayEnd = false) {
  if (allowDayEnd && value === "24:00") return 1440;
  if (!isClockTime(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function durationToMinutes(value: string) {
  const simple = /^(\d+(?:\.\d+)?)\s*(分钟|小时)$/.exec(value);
  if (simple) return Math.round(Number(simple[1]) * (simple[2] === "小时" ? 60 : 1));
  const mixed = /^(\d+)小时(\d+)分钟$/.exec(value);
  return mixed ? Number(mixed[1]) * 60 + Number(mixed[2]) : null;
}

function minutesToDuration(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
}

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

function isClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function addIsoDays(value: string, amount: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
}

function buildBrowsingDays(startValue: string, endValue: string) {
  const start = parseLocalDate(startValue);
  const end = parseLocalDate(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const result: ReturnType<typeof buildDays> = [];
  const cursor = new Date(start);
  while (cursor <= end && result.length < 180) {
    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();
    result.push({ iso: toIsoDate(cursor), weekday: `周${["日", "一", "二", "三", "四", "五", "六"][cursor.getDay()]}`, date: `${month}月${day}日`, shortDate: `${month}/${day}` });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
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
  return mapped;
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

const commentsSeed: CommentRecord[] = [
  { author: "林", color: "avatar-two", text: "周六下午博物馆预约好了，二维码放群里了。" },
  { author: "予", color: "avatar-one", text: "外滩源保留，日落前到就很舒服。" },
  { author: "周", color: "avatar-three", text: "晚餐我可以负责打电话确认座位。" },
];

function isTripId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{12,80}$/.test(value));
}

function createTripId() {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `trip_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function normalizeCloudSnapshot(value: unknown): TripSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<TripSnapshot>;
  if (!snapshot.dateRange || !buildDays(snapshot.dateRange.start ?? "", snapshot.dateRange.end ?? "").length) return null;
  return {
    title: typeof snapshot.title === "string" && snapshot.title.trim() ? snapshot.title.trim() : "上海 · 秋日周末",
    coverUrl: typeof snapshot.coverUrl === "string" && snapshot.coverUrl.trim() ? snapshot.coverUrl : DEFAULT_COVER_URL,
    dateRange: snapshot.dateRange,
    plans: normalizeStoredPlans(snapshot.plans, snapshot.dateRange),
    favoriteIds: Array.isArray(snapshot.favoriteIds) ? snapshot.favoriteIds.filter((id): id is number => typeof id === "number") : [],
    comments: Array.isArray(snapshot.comments) ? snapshot.comments.filter((comment): comment is CommentRecord => Boolean(comment && typeof comment === "object" && typeof comment.author === "string" && typeof comment.color === "string" && typeof comment.text === "string")) : commentsSeed,
  };
}

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
  const pendingMapSelection = useRef<{ dayIndex: number; id: number } | null>(null);
  const draggedId = useRef<number | null>(null);
  const daySwipeStart = useRef<number | null>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [plans, setPlans] = useState<Plans>(createInitialPlans);
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [dateDraft, setDateDraft] = useState(DEFAULT_DATE_RANGE);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateSelectionStep, setDateSelectionStep] = useState<"start" | "end">("start");
  const [dayPage, setDayPage] = useState(0);
  const [browseEnd, setBrowseEnd] = useState(DEFAULT_DATE_RANGE.end);
  const days = useMemo(() => buildDays(dateRange.start, dateRange.end), [dateRange]);
  const navigationDays = useMemo(() => buildBrowsingDays(dateRange.start, browseEnd), [dateRange.start, browseEnd]);
  const tripDateLabel = useMemo(() => formatDateRange(days), [days]);
  const datePickerRange = useMemo<DateRange>(() => ({ from: parseLocalDate(dateDraft.start), to: parseLocalDate(dateDraft.end) }), [dateDraft]);
  const pageCount = Math.max(1, Math.ceil(navigationDays.length / 3));
  const visibleDays = navigationDays.slice(dayPage * 3, dayPage * 3 + 3);
  const activeDate = navigationDays[activeDay]?.iso;
  const outsideTripRange = Boolean(activeDate && (activeDate < dateRange.start || activeDate > dateRange.end));
  const items = useMemo(() => activeDate ? plans[activeDate] ?? [] : [], [activeDate, plans]);
  const tripMapItems = useMemo<MapItem[]>(() => days.flatMap((day, dayIndex) =>
    (plans[day.iso] ?? []).map((item, stopIndex) => ({
      ...item,
      mapKey: `${day.iso}:${item.id}`,
      dayNumber: dayIndex + 1,
      stopNumber: stopIndex + 1,
      dayLabel: day.shortDate,
    }))), [days, plans]);
  const [tripOverview, setTripOverview] = useState(false);
  const mapItems = tripOverview ? tripMapItems : items;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [mapPickedPlace, setMapPickedPlace] = useState<SearchPlace | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPlace[]>(starterPlaces);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  const [directAdding, setDirectAdding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"map" | "plan">("map");
  const [mapConnected, setMapConnected] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [notice, setNotice] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [comments, setComments] = useState(commentsSeed);
  const [commentDraft, setCommentDraft] = useState("");
  const [editDraft, setEditDraft] = useState({ time: "", duration: "", note: "" });
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeTouched, setRangeTouched] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const dragAnchorRef = useRef<number | null>(null);
  const dragCurrentRef = useRef<number | null>(null);
  const timeGridRef = useRef<HTMLDivElement | null>(null);
  const initialScrollHourRef = useRef(9);
  const startMinutes = clockToMinutes(rangeStart);
  const endMinutes = clockToMinutes(rangeEnd, true);
  const rangeMinutes = startMinutes !== null && endMinutes !== null && startMinutes !== endMinutes
    ? (endMinutes - startMinutes + 1440) % 1440 || 1440
    : null;
  const invalidRange = Boolean((rangeStart && startMinutes === null) || (rangeEnd && endMinutes === null) || (!rangeStart && rangeEnd) || (startMinutes !== null && endMinutes !== null && startMinutes === endMinutes));

  useEffect(() => {
    if (!timePickerOpen || !timeGridRef.current) return;
    const rows = timeGridRef.current.querySelectorAll<HTMLElement>(".time-range-hour");
    const target = rows[Math.max(0, initialScrollHourRef.current - 2)];
    if (target && rows[0]) timeGridRef.current.scrollTop = target.offsetTop - rows[0].offsetTop;
  }, [timePickerOpen]);
  const [storageReady, setStorageReady] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [tripTitle, setTripTitle] = useState("上海 · 秋日周末");
  const [coverUrl, setCoverUrl] = useState(DEFAULT_COVER_URL);
  const [libraryTrips, setLibraryTrips] = useState<TripLibraryItem[]>([]);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "error">("loading");
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudState, setCloudState] = useState<"loading" | "synced" | "offline">("loading");
  const [authState, setAuthState] = useState<"loading" | "guest" | "signed" | "error">("loading");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountReady, setAccountReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [readOnlyTrip, setReadOnlyTrip] = useState(false);
  const hadLocalTripRef = useRef(false);
  const priorLocalTripRef = useRef<string | null>(null);
  const cachedOwnerIdRef = useRef<string | null>(null);

  const { legs, states: legStates, refresh: refreshLeg } = useTravelRoutes(items, authState === "signed", `${tripId}:${activeDate}`);
  const stats = useMemo(() => {
    if (!legs.length) return { distance: "0 公里", duration: "暂无交通路段" };
    const results = legs.map(leg => legStates[leg.key]?.result).filter(result => result?.status === "ready");
    if (results.length !== legs.length) return { distance: `${results.length}/${legs.length} 段已查询`, duration: authState !== "signed" ? "登录后查询交通" : legs.some(leg => !legStates[leg.key] || legStates[leg.key].loading) ? "查询交通中…" : "部分路线不可用" };
    return { distance: formatTravelDistance(results.reduce((sum, result) => sum + result.distance, 0)), duration: `交通约 ${formatTravelDuration(results.reduce((sum, result) => sum + result.duration, 0))}` };
  }, [legs, legStates, authState]);

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
      const sharedTripId = new URLSearchParams(window.location.search).get("trip");
      const localTripId = window.localStorage.getItem("roamnote-trip-id-v1");
      hadLocalTripRef.current = isTripId(localTripId);
      cachedOwnerIdRef.current = window.localStorage.getItem("roamnote-cache-owner-v1");
      priorLocalTripRef.current = isTripId(localTripId) ? localTripId : null;
      const nextTripId = isTripId(sharedTripId) ? sharedTripId : isTripId(localTripId) ? localTripId : createTripId();
      const storedDeviceId = window.localStorage.getItem("roamnote-device-id-v1");
      const nextDeviceId = isTripId(storedDeviceId) ? storedDeviceId : createTripId();
      if (!isTripId(sharedTripId)) window.localStorage.setItem("roamnote-trip-id-v1", nextTripId);
      window.localStorage.setItem("roamnote-device-id-v1", nextDeviceId);
      setTripId(nextTripId);
      setDeviceId(nextDeviceId);
    } catch { /* Device storage is optional. */ }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (readOnlyTrip) return;
    try { window.localStorage.setItem("roamnote-plans-v3", JSON.stringify(plans)); } catch { /* Device storage is optional. */ }
  }, [plans, storageReady, readOnlyTrip]);

  useEffect(() => {
    if (!storageReady) return;
    if (readOnlyTrip) return;
    try { window.localStorage.setItem("roamnote-dates-v1", JSON.stringify(dateRange)); } catch { /* Device storage is optional. */ }
  }, [dateRange, storageReady, readOnlyTrip]);

  useEffect(() => {
    if (!storageReady || !deviceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) throw new Error("account unavailable");
        const payload = await response.json() as { account?: { id: string; email: string } | null };
        if (!payload.account) {
          if (!cancelled) {
            if (cachedOwnerIdRef.current) {
              try {
                const oldOwner = cachedOwnerIdRef.current;
                window.localStorage.setItem(`roamnote-account-backup-${oldOwner}`, JSON.stringify({
                  tripId: window.localStorage.getItem("roamnote-trip-id-v1"),
                  plans: window.localStorage.getItem("roamnote-plans-v3"),
                  dates: window.localStorage.getItem("roamnote-dates-v1"),
                }));
                for (const key of ["roamnote-trip-id-v1", "roamnote-plans-v3", "roamnote-plans-v2", "roamnote-dates-v1", "roamnote-cache-owner-v1"]) window.localStorage.removeItem(key);
              } catch { /* Storage is optional; still hide another account's data. */ }
              setPlans({});
              const sharedTrip = new URLSearchParams(window.location.search).get("trip");
              setTripId(isTripId(sharedTrip) ? sharedTrip : createTripId());
              const start = toIsoDate(new Date());
              const nextRange = { start, end: addIsoDays(start, 2) };
              setDateRange(nextRange);
              setDateDraft(nextRange);
              setBrowseEnd(nextRange.end);
              setTripTitle("我的新行程");
              setCoverUrl(DEFAULT_COVER_URL);
              setFavoriteIds([]);
              setComments([]);
              cachedOwnerIdRef.current = null;
            }
            setAuthState("guest"); setAccountReady(true); setCloudState("offline");
          }
          return;
        }
        if (!cachedOwnerIdRef.current) {
          const claim = await fetch("/api/auth/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, legacyTripId: cachedOwnerIdRef.current ? null : priorLocalTripRef.current }) });
          if (!claim.ok) throw new Error("legacy claim failed");
        }
        const library = await fetch("/api/trips");
        if (!library.ok) throw new Error("library unavailable");
        const result = await library.json() as { trips?: TripLibraryItem[] };
        const remoteTrips = Array.isArray(result.trips) ? result.trips : [];
        if (cancelled) return;
        setAccountEmail(payload.account.email);
        setAuthState("signed");
        setLibraryTrips(remoteTrips);
        const sharedTrip = new URLSearchParams(window.location.search).get("trip");
        const previousOwner = cachedOwnerIdRef.current;
        const localTripId = window.localStorage.getItem("roamnote-trip-id-v1");
        const isAccountCache = previousOwner === payload.account.id;
        const belongsToAccount = remoteTrips.some((trip) => trip.id === localTripId);
        if (previousOwner && !isAccountCache) {
          try {
            window.localStorage.setItem(`roamnote-account-backup-${previousOwner}`, JSON.stringify({
              tripId: localTripId,
              plans: window.localStorage.getItem("roamnote-plans-v3"),
              dates: window.localStorage.getItem("roamnote-dates-v1"),
            }));
            for (const key of ["roamnote-trip-id-v1", "roamnote-plans-v3", "roamnote-plans-v2", "roamnote-dates-v1"]) window.localStorage.removeItem(key);
          } catch { /* Storage is optional. */ }
          setPlans({});
          setFavoriteIds([]);
          setComments([]);
          setTripTitle("我的新行程");
          setCoverUrl(DEFAULT_COVER_URL);
          const start = toIsoDate(new Date());
          const nextRange = { start, end: addIsoDays(start, 2) };
          setDateRange(nextRange);
          setDateDraft(nextRange);
          setBrowseEnd(nextRange.end);
        }
        if (!isTripId(sharedTrip)) {
          if (!isAccountCache && !belongsToAccount && remoteTrips[0]) {
            if (!previousOwner && hadLocalTripRef.current) {
              try { window.localStorage.setItem("roamnote-guest-backup-v1", JSON.stringify({ plans: window.localStorage.getItem("roamnote-plans-v3"), dates: window.localStorage.getItem("roamnote-dates-v1") })); } catch { /* Optional backup. */ }
            }
            setTripId(remoteTrips[0].id);
            window.localStorage.setItem("roamnote-trip-id-v1", remoteTrips[0].id);
          } else if (previousOwner && !isAccountCache && !belongsToAccount) {
            const nextTripId = createTripId();
            setTripId(nextTripId);
            window.localStorage.setItem("roamnote-trip-id-v1", nextTripId);
          }
        }
        window.localStorage.setItem("roamnote-cache-owner-v1", payload.account.id);
        cachedOwnerIdRef.current = payload.account.id;
        setAccountReady(true);
      } catch {
        if (!cancelled) { setAuthState("error"); setCloudState("offline"); }
      }
    })();
    return () => { cancelled = true; };
  }, [storageReady, deviceId]);

  useEffect(() => {
    if (!storageReady || !accountReady || !tripId) return;
    const url = new URL(window.location.href);
    const isSharedLink = url.searchParams.get("trip") === tripId;
    if (authState !== "signed" && !isSharedLink) return;
    let cancelled = false;
    void (async () => {
      try {
        const share = isSharedLink ? url.searchParams.get("share") ?? tripId : null;
        const response = await fetch(`/api/trip?id=${encodeURIComponent(tripId)}${share ? `&share=${encodeURIComponent(share)}` : ""}`);
        if (response.ok) {
          const payload = await response.json() as { title?: unknown; snapshot?: unknown; canEdit?: boolean };
          const snapshot = normalizeCloudSnapshot(payload.snapshot);
          if (snapshot && !cancelled) {
            setTripTitle(typeof payload.title === "string" && payload.title.trim() ? payload.title : snapshot.title);
            setCoverUrl(snapshot.coverUrl);
            setDateRange(snapshot.dateRange);
            setDateDraft(snapshot.dateRange);
            setBrowseEnd(snapshot.dateRange.end);
            setPlans(snapshot.plans);
            setFavoriteIds(snapshot.favoriteIds);
            setComments(snapshot.comments);
            setReadOnlyTrip(!payload.canEdit);
            setCloudState(payload.canEdit ? "synced" : "offline");
            setCloudReady(Boolean(payload.canEdit));
          }
        } else if (isSharedLink) {
          if (!cancelled) {
            setPlans({});
            setSelectedId(null);
            setReadOnlyTrip(true);
            setCloudReady(false);
            setCloudState("offline");
            setNotice("分享链接无效或已失效");
          }
        } else if (response.status === 404 && authState === "signed") {
          if (!cancelled) { setReadOnlyTrip(false); setCloudReady(true); }
        } else if (response.status === 403 && authState === "signed" && !isSharedLink) {
          if (!cancelled) {
            const nextTripId = createTripId();
            setTripId(nextTripId);
            setPlans({});
            setFavoriteIds([]);
            setComments([]);
            setTripTitle("我的新行程");
            setCoverUrl(DEFAULT_COVER_URL);
            const start = toIsoDate(new Date());
            const nextRange = { start, end: addIsoDays(start, 2) };
            setDateRange(nextRange);
            setDateDraft(nextRange);
            setBrowseEnd(nextRange.end);
            window.localStorage.setItem("roamnote-trip-id-v1", nextTripId);
          }
        } else if (response.status !== 404) {
          throw new Error("cloud read failed");
        }
      } catch {
        if (!cancelled) setCloudState("offline");
      }
    })();
    return () => { cancelled = true; };
  }, [storageReady, accountReady, authState, tripId]);

  useEffect(() => {
    if (!cloudReady || authState !== "signed" || readOnlyTrip || !tripId) return;
    const snapshot: TripSnapshot = { title: tripTitle, coverUrl, dateRange, plans, favoriteIds, comments };
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/trip", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tripId, title: tripTitle, snapshot }),
        });
        if (!response.ok) throw new Error("cloud write failed");
        setCloudState("synced");
      } catch {
        setCloudState("offline");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [cloudReady, authState, readOnlyTrip, tripId, tripTitle, coverUrl, dateRange, plans, favoriteIds, comments]);

  useEffect(() => {
    if (!libraryOpen || authState !== "signed") return;
    let cancelled = false;
    void fetch("/api/trips")
      .then(async (response) => {
        if (!response.ok) throw new Error("library read failed");
        const payload = await response.json() as { trips?: TripLibraryItem[] };
        if (!cancelled) { setLibraryTrips(Array.isArray(payload.trips) ? payload.trips : []); setLibraryState("ready"); }
      })
      .catch(() => { if (!cancelled) setLibraryState("error"); });
    return () => { cancelled = true; };
  }, [libraryOpen, authState, cloudState]);

  useEffect(() => {
    if (navigationDays.length) setActiveDay((current) => Math.min(current, navigationDays.length - 1));
  }, [navigationDays.length]);

  useEffect(() => {
    setDayPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    setDayPage(Math.floor(activeDay / 3));
  }, [activeDay]);

  useEffect(() => {
    const pending = pendingMapSelection.current;
    if (pending && days[pending.dayIndex]?.iso === activeDate) {
      setSelectedId(pending.id);
      pendingMapSelection.current = null;
    } else setSelectedId(null);
    setMapPickedPlace(null);
    window.setTimeout(() => mapRef.current?.fitToItems(), 80);
  }, [activeDate, storageReady]);

  useEffect(() => {
    if (mobilePanel !== "map" || !mapConnected) return;
    const frame = window.requestAnimationFrame(() => mapRef.current?.fitToItems());
    return () => window.cancelAnimationFrame(frame);
  }, [mobilePanel, mapConnected]);

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
    if (readOnlyTrip) { showNotice("分享行程仅供查看，不能修改"); return; }
    setDateDraft(dateRange);
    setDateSelectionStep("start");
    setDateOpen(true);
  };

  const openLibrary = () => {
    if (authState === "error") { showNotice("账户服务暂不可用，请刷新后再试"); return; }
    if (authState !== "signed") { goToLogin(); return; }
    setLibraryState("loading");
    setLibraryOpen(true);
  };

  const goToLogin = () => window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);

  const logout = async () => {
    if (!readOnlyTrip && !cloudReady && !window.confirm("尚未确认当前行程已保存到云端。退出会清除本机缓存，仍要退出吗？")) return;
    if (cloudReady && !readOnlyTrip && tripId) {
      try {
        const response = await fetch("/api/trip", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tripId, title: tripTitle, snapshot: { title: tripTitle, coverUrl, dateRange, plans, favoriteIds, comments } }),
        });
        if (!response.ok) throw new Error("save failed");
      } catch {
        if (!window.confirm("当前行程尚未同步到云端。现在退出会清除本机未保存的修改，仍要退出吗？")) return;
      }
    }
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { showNotice("退出失败，请稍后重试"); return; }
    for (const key of ["roamnote-trip-id-v1", "roamnote-plans-v3", "roamnote-plans-v2", "roamnote-dates-v1", "roamnote-cache-owner-v1"]) window.localStorage.removeItem(key);
    window.location.assign(window.location.pathname);
  };

  const selectDay = (index: number) => {
    setTripOverview(false);
    setActiveDay(index);
    setDayPage(Math.floor(index / 3));
  };

  const moveActiveDay = (direction: -1 | 1) => {
    setTripOverview(false);
    setActiveDay((current) => {
      if (direction === 1 && current >= navigationDays.length - 1) {
        setBrowseEnd((value) => addIsoDays(value, 3));
        showNotice("已继续显示行程结束后的日期；这些日期尚未纳入本次行程");
        return current + 1;
      }
      const next = Math.max(0, current + direction);
      const nextDate = navigationDays[next]?.iso;
      if (nextDate && nextDate > dateRange.end) showNotice("正在查看行程范围外的日期，安排仍会单独保存");
      return next;
    });
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
    if (readOnlyTrip) return;
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
    setBrowseEnd(dateDraft.end);
    setActiveDay(nextActiveDay >= 0 ? nextActiveDay : 0);
    setDateOpen(false);
    showNotice(`行程日期已更新为 ${formatDateRange(nextDays)}；仅保留重叠日期的安排`);
  };

  const switchTrip = (nextTripId: string) => {
    if (!isTripId(nextTripId) || nextTripId === tripId) { setLibraryOpen(false); return; }
    setCloudReady(false);
    setCloudState("loading");
    setReadOnlyTrip(false);
    setActiveDay(0);
    setDayPage(0);
    setTripId(nextTripId);
    try {
      window.localStorage.setItem("roamnote-trip-id-v1", nextTripId);
      const url = new URL(window.location.href);
      url.searchParams.set("trip", nextTripId);
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url);
    } catch { /* URL and device storage are optional. */ }
    setLibraryOpen(false);
    showNotice("正在打开已保存的行程");
  };

  const createNewTrip = () => {
    const nextTripId = createTripId();
    const start = toIsoDate(new Date());
    const end = addIsoDays(start, 2);
    setTripTitle("我的新行程");
    setCoverUrl(DEFAULT_COVER_URL);
    setDateRange({ start, end });
    setDateDraft({ start, end });
    setBrowseEnd(end);
    setPlans({});
    setFavoriteIds([]);
    setComments([]);
    setSelectedId(null);
    setCloudReady(false);
    setCloudState("loading");
    setReadOnlyTrip(false);
    setActiveDay(0);
    setDayPage(0);
    setTripId(nextTripId);
    try {
      window.localStorage.setItem("roamnote-trip-id-v1", nextTripId);
      const url = new URL(window.location.href);
      url.searchParams.set("trip", nextTripId);
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url);
    } catch { /* URL and device storage are optional. */ }
    setLibraryOpen(false);
    showNotice("新行程已创建，可以开始添加地点");
  };

  const uploadCover = (event: ChangeEvent<HTMLInputElement>) => {
    if (readOnlyTrip) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { showNotice("请选一张图片作为行程封面"); return; }
    if (file.size > 520_000) { showNotice("封面图片请控制在 500 KB 以内"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") { setCoverUrl(reader.result); showNotice("封面已更新，正在同步云端"); }
    };
    reader.onerror = () => showNotice("图片读取失败，请换一张再试");
    reader.readAsDataURL(file);
  };

  const deleteTrip = async (id: string) => {
    if (authState !== "signed" || !window.confirm("删除后将无法恢复这份云端行程，确定删除吗？")) return;
    try {
      const response = await fetch(`/api/trip?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      setLibraryTrips((current) => current.filter((trip) => trip.id !== id));
      if (id === tripId) { createNewTrip(); return; }
      showNotice("行程已删除");
    } catch { showNotice("删除失败，请稍后重试"); }
  };

  const selectItem = (mapItem: MapItem) => {
    setTripOverview(false);
    setMapPickedPlace(null);
    setSelectedId(mapItem.id);
    mapRef.current?.focusItem(mapItem);
  };

  const selectMapItem = (mapItem: MapItem) => {
    if (!tripOverview || mapItem.dayNumber === undefined) { selectItem(mapItem); return; }
    const dayIndex = mapItem.dayNumber - 1;
    setTripOverview(false);
    setMapPickedPlace(null);
    if (dayIndex === activeDay) setSelectedId(mapItem.id);
    else {
      pendingMapSelection.current = { dayIndex, id: mapItem.id };
      setActiveDay(dayIndex);
      setDayPage(Math.floor(dayIndex / 3));
    }
  };

  const toggleTripOverview = () => {
    if (tripOverview) { setTripOverview(false); return; }
    if (!tripMapItems.length) { showNotice("这段旅程还没有安排地点"); return; }
    setSelectedId(null);
    setMapPickedPlace(null);
    setTripOverview(true);
    setMobilePanel("map");
  };

  const addPlace = (place: SearchPlace) => {
    if (readOnlyTrip) { showNotice("分享行程仅供查看，不能添加地点"); return; }
    if (!activeDate) return;
    const category = categoryForType(place.type);
    const next: PlanItem = {
      id: Date.now(), time: "待安排", title: place.name,
      meta: `${place.district || "上海"} · 新增候选`, category, duration: "待设置",
      note: "刚刚加入行程，可以继续设置时间和停留时长。", address: place.address,
      position: { left: "50%", top: "58%" }, lnglat: place.lnglat,
    };
    setPlans((current) => ({ ...current, [activeDate]: [...(current[activeDate] ?? []), next] }));
    setMapPickedPlace(null);
    setSelectedId(next.id);
    setDialogOpen(false);
    setQuery("");
    showNotice(`${place.name} 已加入 ${navigationDays[activeDay].date}${outsideTripRange ? "（行程范围外）" : ""}`);
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
    if (readOnlyTrip) return;
    if (!activeDate || items.length < 2) return;
    setOptimizing(true);
    const optimized = optimizeByDistance([...items]);
    setPlans((current) => ({ ...current, [activeDate]: optimized }));
    showNotice("已按地点距离重排；交通耗时将按各段所选方式重新查询");
    setOptimizing(false);
  };

  const reorderAt = (targetId: number) => {
    if (readOnlyTrip) return;
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
    if (authState !== "signed") { goToLogin(); return; }
    if (!tripId || !cloudReady || readOnlyTrip) { showNotice("请等待当前行程保存完成后再分享"); return; }
    try {
      const response = await fetch(`/api/trip/share?id=${encodeURIComponent(tripId)}`);
      if (!response.ok) throw new Error("share unavailable");
      const payload = await response.json() as { shareCode: string };
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("trip", tripId);
      shareUrl.searchParams.set("share", payload.shareCode);
      await navigator.clipboard.writeText(shareUrl.toString());
      showNotice("只读分享链接已复制");
    } catch { showNotice("暂时无法复制分享链接，请稍后再试"); }
  };

  const openNavigation = () => {
    if (!selected) return;
    const [lng, lat] = selected.lnglat;
    window.open(`https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(selected.title)}&mode=walk&policy=1&src=roamnote&coordinate=gaode&callnative=1`, "_blank", "noopener,noreferrer");
  };

  const openPickedPlaceNavigation = () => {
    if (!mapPickedPlace) return;
    const [lng, lat] = mapPickedPlace.lnglat;
    window.open(`https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(mapPickedPlace.name)}&mode=walk&policy=1&src=roamnote&coordinate=gaode&callnative=1`, "_blank", "noopener,noreferrer");
  };

  const openItemEditor = (item: PlanItem) => {
    if (readOnlyTrip) return;
    selectItem(item);
    const start = isClockTime(item.time) ? item.time : "";
    const minutes = durationToMinutes(item.duration);
    const end = start && minutes && minutes < 1440 ? minutesToClock((clockToMinutes(start)! + minutes) % 1440) : "";
    setEditDraft({ time: start, duration: item.duration, note: item.note });
    setRangeStart(start);
    setRangeEnd(end);
    setRangeTouched(false);
    initialScrollHourRef.current = start ? Math.floor(clockToMinutes(start)! / 60) : 9;
    setPendingSlot(null);
    setDragSlot(null);
    setTimePickerOpen(false);
    setEditOpen(true);
  };

  const openEdit = () => { if (selected) openItemEditor(selected); };

  const applyTimeSlots = (first: number, last: number) => {
    const from = Math.min(first, last) * 15;
    const to = (Math.max(first, last) + 1) * 15;
    setRangeStart(minutesToClock(from));
    setRangeEnd(minutesToClock(to));
    setRangeTouched(true);
    setPendingSlot(null);
    setDragSlot(null);
    setTimePickerOpen(false);
  };

  const chooseTimeSlot = (slot: number) => {
    if (pendingSlot !== null) {
      applyTimeSlots(pendingSlot, slot);
    } else {
      setRangeStart(minutesToClock(slot * 15));
      setRangeEnd("");
      setRangeTouched(true);
      setPendingSlot(slot);
    }
  };

  const timeSlotFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-time-slot]");
    return target ? Number(target.dataset.timeSlot) : null;
  };

  const endTimeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragAnchorRef.current === null) return;
    const first = dragAnchorRef.current;
    const last = timeSlotFromPointer(event) ?? dragCurrentRef.current ?? first;
    if (last !== first) applyTimeSlots(first, last);
    else chooseTimeSlot(first);
    dragAnchorRef.current = null;
    dragCurrentRef.current = null;
    setDragSlot(null);
  };

  const saveEdit = () => {
    if (readOnlyTrip) return;
    if (!selected || !activeDate || invalidRange) return;
    const time = rangeTouched ? rangeStart || "待安排" : editDraft.time || "待安排";
    const duration = rangeTouched ? rangeMinutes ? minutesToDuration(rangeMinutes) : "待设置" : editDraft.duration || "待设置";
    setPlans((current) => ({
      ...current,
      [activeDate]: (current[activeDate] ?? []).map((item) => item.id === selected.id ? { ...item, ...editDraft, time, duration, meta: `${categoryStyle[item.category].label} · ${duration}` } : item),
    }));
    setEditOpen(false);
    showNotice("安排已保存");
  };

  useEffect(() => {
    if (authState === "loading" || authState === "error" || (authState === "signed" && cloudState === "loading")) return;
    type WebMCPContext = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: WebMCPContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "read_itinerary", title: "查看当前行程", description: "读取当前日期的行程地点、时间和地址。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ day: navigationDays[activeDay]?.date, items: items.map(({ title, time, address }) => ({ title, time, address })) }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [activeDay, items, navigationDays, authState, cloudState]);

  return (
    <main className={readOnlyTrip ? "app-shell shared-preview" : "app-shell"}>
      {(authState === "loading" || (authState === "signed" && cloudState === "loading")) && <div className="account-loading-overlay" role="status">正在安全加载行程…</div>}
      {authState === "error" && <div className="account-loading-overlay account-load-error" role="alert"><div><strong>暂时无法确认账户</strong><span>为保护行程数据，连接恢复前不会显示本机缓存。</span><button type="button" onClick={() => window.location.reload()}>重新连接</button></div></div>}
      <header className="topbar">
        <div className="brand" aria-label="漫游记"><span className="brand-mark"><Navigation size={18} strokeWidth={2.4} /></span><span className="brand-name">漫游记</span></div>
        <button className="trip-switcher" type="button" onClick={openLibrary}><span className="trip-cover" style={{ backgroundImage: `url("${coverUrl}")` }} /><span className="trip-copy"><strong>{tripTitle}</strong><small>{tripDateLabel} · 4人同行</small></span><ChevronDown size={16} /></button>
        <div className="top-actions">
          {authState === "signed" ? <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="account-button" type="button" aria-label="我的账户" disabled={loggingOut}><UserRound size={16} /><span>{loggingOut ? "正在退出" : "我的账户"}</span><ChevronDown size={13} className="account-chevron" /></button></DropdownMenuTrigger>
            <DropdownMenuContent className="account-menu" align="start" sideOffset={10} collisionPadding={12}>
              <DropdownMenuLabel className="account-menu-heading"><span>当前账户</span><strong>{accountEmail}</strong><small>行程独立保存在此账户下</small></DropdownMenuLabel>
              <DropdownMenuSeparator className="account-menu-divider" />
              <DropdownMenuItem className="account-menu-item" onSelect={openLibrary}><Archive size={16} />我的行程库</DropdownMenuItem>
              <DropdownMenuSeparator className="account-menu-divider" />
              <DropdownMenuItem className="account-menu-item account-menu-logout" disabled={loggingOut} onSelect={() => { setLoggingOut(true); void logout().catch(() => showNotice("退出失败，请检查网络后重试")).finally(() => setLoggingOut(false)); }}><LogOut size={16} />退出登录</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : <button className="account-button" type="button" aria-label={authState === "error" ? "重新连接账户" : "登录 / 注册"} disabled={authState === "loading"} onClick={() => authState === "error" ? window.location.reload() : goToLogin()}><UserRound size={16} /><span>{authState === "loading" ? "账户检查中" : authState === "error" ? "重试" : "登录 / 注册"}</span></button>}
          <div className="collaboration-actions">
            <button className="avatar-stack" type="button" aria-label="同行讨论" onClick={() => setCommentsOpen(true)}><span className="avatar avatar-one">予</span><span className="avatar avatar-two">林</span><span className="avatar avatar-three">+2</span></button>
            <button className="icon-button comments-button" aria-label="讨论" type="button" onClick={() => setCommentsOpen(true)}><MessageCircle size={18} />{comments.length > 0 && <span>{comments.length}</span>}</button>
          </div>
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
            <button className="day-page-button" type="button" aria-label="后一天" onClick={() => moveActiveDay(1)}><ChevronRight size={18} /></button>
            <span className={`day-page-status ${outsideTripRange ? "outside" : ""}`} aria-live="polite">{outsideTripRange ? `${navigationDays[activeDay]?.date} · 行程范围外` : `第 ${activeDay + 1} 天 / 共 ${days.length} 天`}</span>
          </div>
          {outsideTripRange && <div className="outside-range-note"><CalendarDays size={15} /><span>这一天尚未纳入当前行程；你仍可查看或添加安排，修改日期后可正式纳入。</span><button type="button" onClick={openDateEditor}>调整日期</button></div>}
          <div className="day-summary"><span><Navigation size={15} /> {stats.distance}</span><span><Clock3 size={15} /> {stats.duration}</span><button type="button" disabled={optimizing || readOnlyTrip} onClick={optimizeRoute}><Sparkles size={15} /> {optimizing ? "计算中" : "优化路线"}</button></div>
          <div className="timeline" aria-label={`${navigationDays[activeDay]?.date ?? "当前日期"}行程`}>
            {items.map((item, index) => {
              const config = categoryStyle[item.category]; const Icon = config.icon;
              const leg = legs[index];
              const isSelected = selected?.id === item.id;
              return <div className="timeline-entry" key={item.id}><div className={`timeline-stop${isSelected ? " selected" : ""}${isSelected && !readOnlyTrip ? " has-actions" : ""}`}><button type="button" draggable={!readOnlyTrip} className="timeline-item" aria-pressed={isSelected} title={readOnlyTrip ? "查看地点详情" : "单击查看地点，双击编辑安排"} onDragStart={() => { draggedId.current = item.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderAt(item.id)} onClick={() => selectItem(item)} onDoubleClick={() => openItemEditor(item)}>
                <span className="drag"><GripVertical size={16} /></span><span className="item-time">{item.time}</span><span className={`item-icon ${config.className}`}><Icon size={16} /></span><span className="item-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
              </button>{isSelected && !readOnlyTrip && <div className="timeline-stop-actions"><button type="button" className="timeline-edit-button" aria-label={`编辑${item.title}的安排`} onClick={() => openItemEditor(item)}><Pencil size={13} />编辑安排</button></div>}</div>{leg && <TravelLeg leg={leg} state={legStates[leg.key]} readOnly={readOnlyTrip} onRefresh={() => refreshLeg(leg.key)} onMode={(mode) => { if (!activeDate || readOnlyTrip) return; setPlans(current => ({ ...current, [activeDate]: (current[activeDate] ?? []).map(stop => stop.id === item.id ? { ...stop, travelMode: mode } : stop) })); }} />}</div>;
            })}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><button className="add-plan-button" type="button" disabled={readOnlyTrip}><Plus size={18} /> 添加地点或安排</button></DialogTrigger>
            <DialogContent className="add-dialog">
              <DialogHeader><DialogTitle>搜索地点或地址</DialogTitle><DialogDescription>全国搜索；选择结果或按回车，即可直接加入 {navigationDays[activeDay]?.date}。</DialogDescription></DialogHeader>
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
          <AMapCanvas ref={mapRef} items={mapItems} selectedId={tripOverview ? null : selected?.id ?? null} onSelect={selectMapItem} onPlacePick={(place) => { setSelectedId(null); setMapPickedPlace(place); }} onConnectionChange={setMapConnected} />
          <div className="map-search-wrap"><button className="map-search" type="button" disabled={readOnlyTrip} onClick={() => setDialogOpen(true)}><Search size={18} /><span>搜索地点或地址，直接加入行程</span><kbd>⌘ K</kbd></button></div>
          <div className="map-provider-status">
            <div className="map-provider-pill"><span className="live-dot" />{mapConnected ? "高德地图已连接" : "正在连接高德地图"}</div>
            <div className={`cloud-sync-pill ${cloudState}`}><span className="live-dot" />{readOnlyTrip ? "分享预览 · 只读" : authState === "guest" ? "登录后可同步云端" : authState === "error" ? "账户服务暂不可用" : cloudState === "synced" ? "行程已同步云端" : cloudState === "offline" ? "暂存本机，等待云端" : "正在同步行程"}</div>
          </div>
          <div className="map-controls" aria-label="地图控制">
            <button type="button" className={`overview-button ${tripOverview ? "is-active" : ""}`} aria-label={tripOverview ? "返回当天地图" : "全览整段旅程"} aria-pressed={tripOverview} onClick={toggleTripOverview}><MapIcon size={17} />{tripOverview ? "返回当天" : "全览全程"}</button><span />
            <button type="button" className="overview-button" aria-label="全览当天所有地点" title="全览当天所有地点" onClick={() => { if (!items.length) { showNotice("当天还没有地点可全览"); return; } setTripOverview(false); setSelectedId(null); setMapPickedPlace(null); window.requestAnimationFrame(() => mapRef.current?.fitToItems()); }}><Scan size={17} />全览当天</button><span />
            <button type="button" aria-label="放大" onClick={() => mapRef.current?.zoomIn()}><ZoomIn size={19} /></button><button type="button" aria-label="缩小" onClick={() => mapRef.current?.zoomOut()}><ZoomOut size={19} /></button><span />
            <button type="button" aria-label="定位" onClick={async () => { try { await mapRef.current?.locate(); showNotice("已定位到当前位置"); } catch (error) { showNotice(error instanceof Error ? error.message : "定位失败"); } }}><LocateFixed size={19} /></button>
            <button type="button" aria-label="切换图层" onClick={() => showNotice(`已切换为${mapRef.current?.cycleStyle() ?? "地图"}`)}><Layers3 size={19} /></button>
          </div>
          {tripOverview && <div className="trip-overview-banner" role="status"><strong>全程总览</strong><span>{days.length} 天 · {tripMapItems.length} 个地点</span><small>点选编号可查看对应日期</small></div>}
          <div className="map-legend">{Object.entries(categoryStyle).map(([key, value]) => { const Icon = value.icon; return <span key={key}><i className={value.className}><Icon size={12} /></i>{value.label}</span>; })}</div>
          {(selected || mapPickedPlace) && <aside className="place-card" aria-live="polite">
            {selected ? <><div className="place-photo"><img src="/shanghai-cover.png" alt="雨后晨光中的上海梧桐街道" /><button type="button" aria-label="关闭地点详情" onClick={() => setSelectedId(null)}><X size={17} /></button><span>{categoryStyle[selected.category].label}</span></div><div className="place-body">
              <div className="place-title-row"><div><h2>{selected.title}</h2><p><MapPin size={14} /> {selected.address}</p></div><button type="button" className={favoriteIds.includes(selected.id) ? "favorite-active" : ""} aria-label="收藏" onClick={() => setFavoriteIds((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id])}><Star size={19} fill={favoriteIds.includes(selected.id) ? "currentColor" : "none"} /></button></div>
              <div className="reservation-chip"><Check size={14} /> {selected.meta.includes("已预约") ? "已预约 · 凭证已保存" : `已加入 ${navigationDays[activeDay]?.date}`}</div><p className="place-note">{selected.note}</p>
              <div className="place-actions"><button type="button" onClick={openNavigation}><Navigation size={16} /> 开始导航</button><button type="button" onClick={openEdit}><CalendarDays size={16} /> 编辑安排</button></div>
            </div></> : mapPickedPlace ? <><div className="place-photo"><img src="/covers/xiamen-coast.jpg" alt="地图地点预览" /><button type="button" aria-label="关闭地点详情" onClick={() => setMapPickedPlace(null)}><X size={17} /></button><span>高德地点</span></div><div className="place-body"><div className="place-title-row"><div><h2>{mapPickedPlace.name}</h2><p><MapPin size={14} /> {mapPickedPlace.address || mapPickedPlace.district || "地图选点"}</p></div></div><div className="reservation-chip"><Check size={14} /> {mapPickedPlace.type || "周边地点"} · 可加入 {navigationDays[activeDay]?.date}</div><p className="place-note">来自高德地图的附近地点信息。加入后可继续修改时间、时长和备注。</p><div className="place-actions"><button type="button" onClick={() => addPlace(mapPickedPlace)}><Plus size={16} /> 加入当天行程</button><button type="button" onClick={openPickedPlaceNavigation}><Navigation size={16} /> 开始导航</button></div></div></> : null}
          </aside>}
        </section>
      </section>

      <nav className="mobile-nav" aria-label="移动端视图切换"><button type="button" className={mobilePanel === "map" ? "active" : ""} onClick={() => setMobilePanel("map")}><MapIcon size={18} />地图</button><button type="button" className={mobilePanel === "plan" ? "active" : ""} onClick={() => setMobilePanel("plan")}><CalendarDays size={18} />行程</button><button type="button" onClick={() => setCommentsOpen(true)}><Users size={18} />同行</button></nav>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>编辑安排</DialogTitle>
            <DialogDescription className="edit-place-name">{selected?.title}</DialogDescription>
          </DialogHeader>
          <div className="edit-grid">
            <section className="edit-section" aria-label="行程时间段">
              <div className="edit-section-heading"><span>行程时间段</span><button type="button" className="edit-clear" onClick={() => { setRangeStart(""); setRangeEnd(""); setRangeTouched(true); setPendingSlot(null); }}>暂不安排</button></div>
              <div className="time-range-entry">
                <label><span>开始</span><input type="text" inputMode="numeric" maxLength={5} placeholder="09:00" aria-label="开始时间" value={rangeStart} onFocus={(event) => event.target.select()} onChange={(event) => { setRangeStart(event.target.value); setRangeTouched(true); setPendingSlot(null); }} /></label>
                <span className="time-range-dash">—</span>
                <label><span>结束</span><input type="text" inputMode="numeric" maxLength={5} placeholder="10:00" aria-label="结束时间" value={rangeEnd} onFocus={(event) => event.target.select()} onChange={(event) => { setRangeEnd(event.target.value); setRangeTouched(true); setPendingSlot(null); }} /></label>
                <button type="button" className={timePickerOpen ? "time-range-toggle open" : "time-range-toggle"} aria-label="展开时间段选择" aria-expanded={timePickerOpen} aria-controls="time-range-picker" onClick={() => { if (!timePickerOpen) initialScrollHourRef.current = Math.floor((clockToMinutes(rangeStart) ?? 540) / 60); setTimePickerOpen((current) => !current); }}><ChevronDown size={19} /></button>
              </div>
              {invalidRange ? <p className="time-range-hint error">请输入 HH:MM 格式；开始和结束不能相同。</p> : <p className="time-range-hint">{rangeMinutes ? `停留 ${minutesToDuration(rangeMinutes)}${endMinutes !== null && startMinutes !== null && endMinutes < startMinutes ? " · 次日结束" : ""}` : "可以直接改时间，或展开后拖选时间段"}</p>}
              {timePickerOpen && <div id="time-range-picker" className="time-range-picker">
                <p className="time-range-instruction">上下滚动查看全天时间。拖动选择，或先后点选起止；每格 15 分钟。</p>
                <div ref={timeGridRef} className="time-range-grid" aria-label="全天时间列表" onPointerDown={(event) => { const slot = timeSlotFromPointer(event); if (slot === null) return; if (event.pointerType !== "touch") event.preventDefault(); dragAnchorRef.current = slot; dragCurrentRef.current = slot; setDragSlot(slot); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (dragAnchorRef.current === null) return; const slot = timeSlotFromPointer(event); if (slot !== null && slot !== dragCurrentRef.current) { dragCurrentRef.current = slot; setDragSlot(slot); } }} onPointerUp={endTimeDrag} onPointerCancel={() => { dragAnchorRef.current = null; dragCurrentRef.current = null; setDragSlot(null); }}>
                  {Array.from({ length: 24 }, (_, row) => <div className="time-range-hour" key={row}><span>{String(row).padStart(2, "0")}:00</span>{Array.from({ length: 4 }, (_, column) => { const slot = row * 4 + column; const minute = slot * 15; const inSelectedRange = startMinutes !== null && endMinutes !== null && startMinutes !== endMinutes && (endMinutes > startMinutes ? minute >= startMinutes && minute < endMinutes : minute >= startMinutes || minute < endMinutes); const inDraggedRange = dragAnchorRef.current !== null && dragSlot !== null && slot >= Math.min(dragAnchorRef.current, dragSlot) && slot <= Math.max(dragAnchorRef.current, dragSlot); return <button key={slot} type="button" data-time-slot={slot} aria-label={minutesToClock(minute)} aria-pressed={inDraggedRange || pendingSlot === slot || inSelectedRange} className={inDraggedRange || pendingSlot === slot || inSelectedRange ? "selected" : ""} onClick={(event) => { if (event.detail === 0) chooseTimeSlot(slot); }}>{String(column * 15).padStart(2, "0")}</button>; })}</div>)}
                </div>
              </div>}
            </section>
            <label className="edit-note"><span>同行备注</span><textarea rows={3} value={editDraft.note} onChange={(event) => setEditDraft((current) => ({ ...current, note: event.target.value }))} placeholder="例如：集合地点、预约信息…" /></label>
          </div>
          <button className="dialog-primary" type="button" disabled={invalidRange} onClick={saveEdit}>保存安排</button>
        </DialogContent>
      </Dialog>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}><DialogContent className="date-dialog"><DialogHeader><DialogTitle>设置行程日期</DialogTitle><DialogDescription>{dateSelectionStep === "start" ? "请点选新的出发日期" : "出发日已选择，请再点选结束日期"}，单次最多 14 天。</DialogDescription></DialogHeader><div className="date-step-selector"><button type="button" className={dateSelectionStep === "start" ? "active" : ""} onClick={() => setDateSelectionStep("start")}><small>1 · 出发</small><strong>{dateDraft.start.replaceAll("-", ".")}</strong></button><i /><button type="button" className={dateSelectionStep === "end" ? "active" : ""} onClick={() => setDateSelectionStep("end")}><small>2 · 结束</small><strong>{dateDraft.end.replaceAll("-", ".")}</strong></button></div><div className="date-calendar-shell"><Calendar mode="range" locale={zhCN} selected={datePickerRange} onSelect={() => undefined} onDayClick={chooseCalendarDate} numberOfMonths={2} defaultMonth={parseLocalDate(dateDraft.start)} showOutsideDays={false} /></div><div className="date-dialog-preview"><CalendarDays size={17} /><span>{formatDateRange(buildDays(dateDraft.start, dateDraft.end))}</span><small>{buildDays(dateDraft.start, dateDraft.end).length || 0} 天</small></div><button className="dialog-primary" type="button" onClick={saveDateRange}>保存行程日期</button></DialogContent></Dialog>

      <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}><DialogContent className="comments-dialog"><DialogHeader><DialogTitle>同行讨论</DialogTitle><DialogDescription>和同行者确认预约、餐厅与路线变化。</DialogDescription></DialogHeader><div className="comment-list">{comments.map((comment, index) => <div className="comment" key={`${comment.author}-${index}`}><span className={`avatar ${comment.color}`}>{comment.author}</span><p><strong>{comment.author}</strong>{comment.text}</p></div>)}</div><div className="comment-compose"><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="回复同行者…" /><button type="button" onClick={() => { if (!commentDraft.trim()) return; setComments((current) => [...current, { author: "予", color: "avatar-one", text: commentDraft.trim() }]); setCommentDraft(""); }}>发送</button></div></DialogContent></Dialog>

      <Dialog open={tripOpen} onOpenChange={setTripOpen}><DialogContent className="trip-dialog"><div className="trip-dialog-cover"><img src={coverUrl} alt="旅行封面" /></div><DialogHeader><DialogTitle>{tripTitle}</DialogTitle><DialogDescription>{tripDateLabel} · 4人同行 · 共 {days.reduce((sum, day) => sum + (plans[day.iso]?.length ?? 0), 0)} 个安排</DialogDescription></DialogHeader><label className="trip-title-editor"><span>行程名称</span><input value={tripTitle} maxLength={60} onChange={(event) => setTripTitle(event.target.value)} placeholder="给这次旅行起个名字" /></label><div className="cover-editor"><span>系统封面</span><div className="system-cover-library">{SYSTEM_COVERS.map((preset) => <button key={preset.id} type="button" aria-pressed={coverUrl === preset.url} className={coverUrl === preset.url ? "system-cover-option active" : "system-cover-option"} onClick={() => setCoverUrl(preset.url)} style={{ backgroundImage: `url("${preset.url}")` }}><span>{preset.name}</span></button>)}</div><span className="cover-editor-label">自定义封面</span><div><label className="cover-upload-button"><ImageUp size={15} />从本地选择图片<input type="file" accept="image/*" onChange={uploadCover} /></label><button type="button" onClick={() => setCoverUrl(DEFAULT_COVER_URL)}>恢复默认</button></div><input value={coverUrl.startsWith("data:") ? "已使用本地图片" : coverUrl} onChange={(event) => setCoverUrl(event.target.value)} disabled={coverUrl.startsWith("data:")} placeholder="或粘贴图片链接 https://…" /></div><button className="trip-edit-date" type="button" onClick={() => { setTripOpen(false); openDateEditor(); }}><CalendarDays size={15} />修改行程日期</button><div className="trip-overview">{days.map((day, index) => <button type="button" key={day.iso} onClick={() => { selectDay(index); setTripOpen(false); }}><span>{day.weekday}</span><strong>{day.date}</strong><small>{plans[day.iso]?.length ?? 0} 个地点</small></button>)}</div></DialogContent></Dialog>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}><DialogContent className="library-dialog"><DialogHeader><DialogTitle>我的行程库</DialogTitle><DialogDescription>保存在账户下的旅行都在这里，换浏览器登录同一邮箱也可查看。</DialogDescription></DialogHeader><button className="new-trip-button" type="button" onClick={createNewTrip}><Plus size={17} />新建行程</button>{libraryState === "loading" && <div className="library-sync-status" role="status"><i />正在同步行程库</div>}{libraryState === "error" && libraryTrips.length > 0 && <div className="library-sync-status error">暂时无法刷新，正在展示上次读取的行程。</div>}<div className="trip-library-list">{libraryState === "loading" && libraryTrips.length === 0 && <><div className="library-trip-skeleton" /><div className="library-trip-skeleton" /></>}{libraryState === "error" && !libraryTrips.length && <div className="library-empty">行程库暂时无法连接，请稍后重试。</div>}{libraryState === "ready" && !libraryTrips.length && <div className="library-empty"><Archive size={24} /><strong>还没有保存的行程</strong><span>当前行程完成首次云端同步后会出现在这里。</span></div>}{libraryTrips.map((trip) => <div key={trip.id} className={trip.id === tripId ? "library-trip-wrap active" : "library-trip-wrap"}><button type="button" className="library-trip" onClick={() => switchTrip(trip.id)}><span className="library-trip-cover" style={{ backgroundImage: `url("${trip.coverUrl || DEFAULT_COVER_URL}")` }} /><span className="library-trip-copy"><strong>{trip.title}</strong><small>{trip.startDate && trip.endDate ? `${trip.startDate.replaceAll("-", ".")} — ${trip.endDate.replaceAll("-", ".")}` : "日期待设置"}</small><em>{trip.planCount} 个安排 · 云端已保存</em></span>{trip.id === tripId ? <span className="current-trip-chip">当前</span> : <ChevronRight size={18} />}</button><div className="library-trip-actions">{trip.id === tripId && <button type="button" aria-label={`编辑${trip.title}`} onClick={() => { setLibraryOpen(false); setTripOpen(true); }}><Pencil size={15} />编辑</button>}<button type="button" className="delete-trip-button" aria-label={`删除${trip.title}`} onClick={() => void deleteTrip(trip.id)}><Trash2 size={15} />删除</button></div></div>)}</div></DialogContent></Dialog>


      {notice && <div className="notice" role="status"><Check size={16} /> {notice}</div>}
    </main>
  );
}
