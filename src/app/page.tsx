'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import SettingsModal, {
  describeDuration,
  type DurationPreset,
  type KeywordConfig,
  type MadeForKidsFilter,
  type SearchOrder,
  type Settings,
  type VideoCaptionFilter,
  type VideoDefinitionFilter,
  type VideoDimensionFilter,
  type VideoLicenseFilter,
  type VideoTypeFilter,
} from './components/SettingsModal';
import VideoPlayer, { type PlayerMode } from './components/VideoPlayer';

type BaseItem = {
  id: string;
  title?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
};

type VideoItem = BaseItem & {
  title: string;
  channelTitle: string;
  durationText?: string;
  durationSec?: number;
  defaultLanguage?: string;
  madeForKids?: boolean;
  embeddable?: boolean;
};

type SectionState = {
  keyword: string;
  durationLabel: string;
  loading: boolean;
  error: string | null;
  items: VideoItem[];
};

const STORAGE_KEY = 'youtube-kids-enhance.settings.v4';
const STORAGE_KEY_V3 = 'youtube-kids-enhance.settings.v3';
const SECTIONS_CACHE_KEY = 'youtube-kids-enhance.sections.v1';
const CLIENT_CACHE_TTL_MS = 3 * 60 * 1000;
const PLAYER_MODE: PlayerMode =
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYER_MODE === 'plyr' ? 'plyr' : 'iframe';
const ORDERS: SearchOrder[] = ['relevance', 'date', 'rating', 'title', 'viewCount'];
const VIDEO_CAPTIONS: VideoCaptionFilter[] = ['any', 'closedCaption', 'none'];
const VIDEO_DEFINITIONS: VideoDefinitionFilter[] = ['any', 'high', 'standard'];
const VIDEO_DIMENSIONS: VideoDimensionFilter[] = ['any', '2d', '3d'];
const VIDEO_LICENSES: VideoLicenseFilter[] = ['any', 'creativeCommon', 'youtube'];
const VIDEO_TYPES: VideoTypeFilter[] = ['any', 'episode', 'movie'];
const MADE_FOR_KIDS_FILTERS: MadeForKidsFilter[] = ['required', 'any'];
const DEFAULT_SETTINGS: Settings = {
  keywords: [
    { keyword: 'nursery rhymes' },
    { keyword: 'peppa pig' },
    { keyword: 'learn numbers' },
  ],
  durationPreset: 'any',
  minSec: undefined,
  maxSec: undefined,
  lang: '',
  langStrict: false,
  regionCode: 'SG',
  maxResults: 20,
  order: 'relevance',
  publishedAfter: '',
  publishedBefore: '',
  channelId: '',
  videoCaption: 'any',
  videoDefinition: 'any',
  videoDimension: 'any',
  videoCategoryId: '',
  videoLicense: 'any',
  videoType: 'any',
  topicId: '',
  madeForKids: 'required',
};

function pickString(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback;
}

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && allowed.includes(raw as T) ? (raw as T) : fallback;
}

function parseKeywordConfig(raw: unknown): KeywordConfig | null {
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t ? { keyword: t } : null;
  }
  if (raw && typeof raw === 'object' && typeof (raw as { keyword?: unknown }).keyword === 'string') {
    const r = raw as Partial<KeywordConfig> & { keyword: string };
    const t = r.keyword.trim();
    if (!t) return null;
    const allowed: DurationPreset[] = ['any', 'short', 'medium', 'long'];
    return {
      keyword: t,
      durationPreset:
        r.durationPreset && allowed.includes(r.durationPreset) ? r.durationPreset : undefined,
      minSec: typeof r.minSec === 'number' && r.minSec >= 0 ? r.minSec : undefined,
      maxSec: typeof r.maxSec === 'number' && r.maxSec >= 0 ? r.maxSec : undefined,
    };
  }
  return null;
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_V3);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<Settings>;
    const keywords = Array.isArray(s.keywords)
      ? (s.keywords.map(parseKeywordConfig).filter(Boolean) as KeywordConfig[])
      : DEFAULT_SETTINGS.keywords;
    return {
      keywords: keywords.length > 0 ? keywords : DEFAULT_SETTINGS.keywords,
      durationPreset: (s.durationPreset as DurationPreset) || 'any',
      minSec: typeof s.minSec === 'number' ? s.minSec : undefined,
      maxSec: typeof s.maxSec === 'number' ? s.maxSec : undefined,
      lang: typeof s.lang === 'string' ? s.lang : '',
      langStrict: typeof s.langStrict === 'boolean' ? s.langStrict : DEFAULT_SETTINGS.langStrict,
      regionCode: pickString(s.regionCode, DEFAULT_SETTINGS.regionCode),
      maxResults:
        typeof s.maxResults === 'number' && s.maxResults >= 1 && s.maxResults <= 50
          ? s.maxResults
          : DEFAULT_SETTINGS.maxResults,
      order: pickEnum(s.order, ORDERS, DEFAULT_SETTINGS.order),
      publishedAfter: pickString(s.publishedAfter),
      publishedBefore: pickString(s.publishedBefore),
      channelId: pickString(s.channelId),
      videoCaption: pickEnum(s.videoCaption, VIDEO_CAPTIONS, DEFAULT_SETTINGS.videoCaption),
      videoDefinition: pickEnum(
        s.videoDefinition,
        VIDEO_DEFINITIONS,
        DEFAULT_SETTINGS.videoDefinition
      ),
      videoDimension: pickEnum(
        s.videoDimension,
        VIDEO_DIMENSIONS,
        DEFAULT_SETTINGS.videoDimension
      ),
      videoCategoryId: pickString(s.videoCategoryId),
      videoLicense: pickEnum(s.videoLicense, VIDEO_LICENSES, DEFAULT_SETTINGS.videoLicense),
      videoType: pickEnum(s.videoType, VIDEO_TYPES, DEFAULT_SETTINGS.videoType),
      topicId: pickString(s.topicId),
      madeForKids: pickEnum(s.madeForKids, MADE_FOR_KIDS_FILTERS, DEFAULT_SETTINGS.madeForKids),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function settingsFingerprint(s: Settings): string {
  return JSON.stringify({
    k: s.keywords.map((kc) => [
      kc.keyword,
      kc.durationPreset ?? '',
      kc.minSec ?? '',
      kc.maxSec ?? '',
    ]),
    d: s.durationPreset,
    m: s.minSec ?? '',
    M: s.maxSec ?? '',
    l: s.lang,
    ls: s.langStrict,
    r: s.regionCode,
    mr: s.maxResults,
    o: s.order,
    pa: s.publishedAfter,
    pb: s.publishedBefore,
    c: s.channelId,
    vc: s.videoCaption,
    vd: s.videoDefinition,
    vdim: s.videoDimension,
    vcat: s.videoCategoryId,
    vl: s.videoLicense,
    vt: s.videoType,
    topic: s.topicId,
    kids: s.madeForKids,
  });
}

function readCachedSections(fp: string): SectionState[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SECTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      fp?: string;
      ts?: number;
      sections?: SectionState[];
    };
    if (parsed.fp !== fp) return null;
    if (!parsed.ts || Date.now() - parsed.ts > CLIENT_CACHE_TTL_MS) return null;
    return Array.isArray(parsed.sections) ? parsed.sections : null;
  } catch {
    return null;
  }
}

function writeCachedSections(fp: string, sections: SectionState[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      SECTIONS_CACHE_KEY,
      JSON.stringify({ fp, ts: Date.now(), sections })
    );
  } catch {
    // ignore quota errors
  }
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [sections, setSections] = useState<SectionState[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedVideo, setSelectedVideo] = useState<Pick<VideoItem, 'id' | 'title'> | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  const fetchSeqRef = useRef(0);

  useEffect(() => {
    document.body.style.overflow = playerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [playerOpen]);

  const fetchByKeywords = useCallback(async (s: Settings, bypassCache = false) => {
    const seq = ++fetchSeqRef.current;
    const fp = settingsFingerprint(s);
    const fallback = { durationPreset: s.durationPreset, minSec: s.minSec, maxSec: s.maxSec };

    const init: SectionState[] = s.keywords.map((kc) => ({
      keyword: kc.keyword,
      durationLabel: describeDuration(kc, fallback),
      loading: true,
      error: null,
      items: [],
    }));
    setSections(init);
    setRefreshing(true);

    await Promise.all(
      s.keywords.map(async (kc, idx) => {
        const effDurationPreset = kc.durationPreset ?? s.durationPreset;
        const effMinSec = kc.minSec ?? s.minSec;
        const effMaxSec = kc.maxSec ?? s.maxSec;
        const durationLabel = describeDuration(kc, fallback);
        try {
          const sp = new URLSearchParams();
          sp.set('q', kc.keyword);
          sp.set('type', 'video');
          sp.set('durationPreset', effDurationPreset);
          if (effMinSec !== undefined) sp.set('minSec', String(effMinSec));
          if (effMaxSec !== undefined) sp.set('maxSec', String(effMaxSec));
          if (s.lang.trim()) sp.set('lang', s.lang.trim());
          if (s.langStrict) sp.set('langStrict', '1');
          if (s.regionCode.trim()) sp.set('regionCode', s.regionCode.trim());
          sp.set('maxResults', String(s.maxResults));
          sp.set('order', s.order);
          if (s.publishedAfter) sp.set('publishedAfter', s.publishedAfter);
          if (s.publishedBefore) sp.set('publishedBefore', s.publishedBefore);
          if (s.channelId.trim()) sp.set('channelId', s.channelId.trim());
          if (s.videoCaption !== 'any') sp.set('videoCaption', s.videoCaption);
          if (s.videoDefinition !== 'any') sp.set('videoDefinition', s.videoDefinition);
          if (s.videoDimension !== 'any') sp.set('videoDimension', s.videoDimension);
          if (s.videoCategoryId.trim()) sp.set('videoCategoryId', s.videoCategoryId.trim());
          if (s.videoLicense !== 'any') sp.set('videoLicense', s.videoLicense);
          if (s.videoType !== 'any') sp.set('videoType', s.videoType);
          if (s.topicId.trim()) sp.set('topicId', s.topicId.trim());
          sp.set('madeForKids', s.madeForKids);
          if (bypassCache) sp.set('nocache', '1');

          const res = await fetch(`/api/search?${sp.toString()}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || '请求失败');

          if (seq !== fetchSeqRef.current) return;
          setSections((prev) => {
            const next = [...prev];
            next[idx] = {
              keyword: kc.keyword,
              durationLabel,
              loading: false,
              error: null,
              items: (json.items || []) as VideoItem[],
            };
            return next;
          });
        } catch (e: unknown) {
          if (seq !== fetchSeqRef.current) return;
          const message = e instanceof Error ? e.message : 'Unknown error';
          setSections((prev) => {
            const next = [...prev];
            next[idx] = {
              keyword: kc.keyword,
              durationLabel,
              loading: false,
              error: message,
              items: [],
            };
            return next;
          });
        }
      })
    );

    if (seq === fetchSeqRef.current) {
      setRefreshing(false);
      setSections((prev) => {
        writeCachedSections(fp, prev);
        return prev;
      });
    }
  }, []);

  const runFetch = useCallback(
    (s: Settings, opts?: { bypassCache?: boolean }) => {
      if (s.keywords.length === 0) {
        setSections([]);
        return;
      }
      if (!opts?.bypassCache) {
        const cached = readCachedSections(settingsFingerprint(s));
        if (cached) {
          setSections(cached);
          return;
        }
      }
      void fetchByKeywords(s, opts?.bypassCache === true);
    },
    [fetchByKeywords]
  );

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setHydrated(true);
    runFetch(s);
  }, [runFetch]);

  function handleSaveSettings(next: Settings) {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.removeItem(STORAGE_KEY_V3);
    } catch {
      // ignore
    }
    setSettingsOpen(false);
    runFetch(next);
  }

  function handleRefresh() {
    try {
      sessionStorage.removeItem(SECTIONS_CACHE_KEY);
    } catch {
      // ignore
    }
    runFetch(settings, { bypassCache: true });
  }

  function closePlayer() {
    setPlayerOpen(false);
    setSelectedVideo(null);
  }

  function playVideo(video: VideoItem) {
    setSelectedVideo({ id: video.id, title: video.title });
    setPlayerOpen(true);
  }

  return (
    <main className="app-shell text-neutral-900 dark:text-neutral-100">
      <div className="app-content">
        <h1 className="sr-only">youtube-kids-enhance</h1>

      <header className="app-header flex items-center gap-3 rounded-2xl bg-white/75 backdrop-blur border border-pink-100 px-3 py-2 shadow-sm dark:bg-neutral-900/75 dark:border-neutral-700 sm:px-4">
        <div className="text-xl font-semibold sm:text-2xl">KidsTube</div>
        <div className="text-xs text-gray-600 hidden md:block dark:text-neutral-400">
          只显示 <span className="font-semibold">Made for Kids</span> 内容
        </div>
        <div className="flex-1" />
        <button
          className="touch-target inline-flex items-center justify-center gap-2 rounded-full bg-sky-100 px-3 py-2 text-sky-900 transition hover:bg-sky-200 disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
          onClick={handleRefresh}
          disabled={refreshing || settings.keywords.length === 0}
          title="强制刷新（绕过缓存）"
          aria-label="刷新"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={refreshing ? 'animate-spin' : undefined}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
          <span className="text-sm hidden sm:inline">刷新</span>
        </button>
        <button
          className="touch-target inline-flex items-center justify-center gap-2 rounded-full bg-pink-100 px-3 py-2 text-pink-900 transition hover:bg-pink-200 dark:bg-pink-900/40 dark:text-pink-100 dark:hover:bg-pink-900/60 sm:px-4"
          onClick={() => setSettingsOpen(true)}
          title="设置"
          aria-label="打开设置"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="text-sm">设置</span>
        </button>
      </header>

      {playerOpen && selectedVideo ? (
        <div className="player-overlay">
          <button
            className="player-exit-button touch-target rounded-full border border-white/20 bg-white/90 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-sm backdrop-blur transition hover:bg-white dark:bg-neutral-900/90 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={closePlayer}
          >
            退出
          </button>
          <div className="player-stage">
            <div className="player-shell">
              <div className="sr-only">正在播放：{selectedVideo.title}</div>
              <VideoPlayer
                key={`${PLAYER_MODE}:${selectedVideo.id}`}
                videoId={selectedVideo.id}
                title={selectedVideo.title}
                mode={PLAYER_MODE}
                onClose={closePlayer}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Sections: one per keyword */}
      {sections.length > 0 ? (
        <div className="mt-6 space-y-6">
          {sections.map((sec) => (
            <KeywordSection key={sec.keyword} section={sec} onPlay={playVideo} />
          ))}
        </div>
      ) : null}

      {hydrated && sections.length === 0 ? (
        <section className="mt-10 rounded-3xl border border-dashed border-pink-200 dark:border-neutral-700 bg-white/50 dark:bg-neutral-900/50 px-6 py-10 text-center">
          <div className="text-base text-pink-900 dark:text-pink-200 font-semibold">还没有关键字</div>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            在「设置」里添加关键字后，首页会按关键字分段展示儿童视频。
          </p>
          <button
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-100 text-pink-900 hover:bg-pink-200 transition dark:bg-pink-900/40 dark:text-pink-100 dark:hover:bg-pink-900/60"
            onClick={() => setSettingsOpen(true)}
          >
            打开设置 →
          </button>
        </section>
      ) : null}

      <footer className="mt-12 text-xs text-gray-500 dark:text-neutral-500">
        提示：YouTube Kids 级别的内容审核/家长控制超出 MVP 范围；当前仅启用 SafeSearch 严格模式。
      </footer>

      {settingsOpen ? (
        <SettingsModal
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      ) : null}
      </div>
    </main>
  );
}

function KeywordSection({
  section,
  onPlay,
}: {
  section: SectionState;
  onPlay: (video: VideoItem) => void;
}) {
  return (
    <section className="keyword-section">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-base sm:text-lg font-semibold text-pink-900 dark:text-pink-200">{section.keyword}</h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {section.durationLabel}
        </span>
        {!section.loading && !section.error ? (
          <span className="text-xs text-gray-500 dark:text-neutral-400">{section.items.length} 个视频</span>
        ) : null}
      </div>

      {section.loading ? (
        <RowSkeleton />
      ) : section.error ? (
        <RailMessage tone="error">加载失败：{section.error}</RailMessage>
      ) : section.items.length === 0 ? (
        <RailMessage>暂无符合条件的儿童视频。</RailMessage>
      ) : (
        <TwoRowScroller items={section.items} onPlay={onPlay} />
      )}
    </section>
  );
}

function TwoRowScroller({
  items,
  onPlay,
}: {
  items: VideoItem[];
  onPlay: (video: VideoItem) => void;
}) {
  return (
    <div className="video-rail no-scrollbar">
      {items.map((it) => (
        <button
          key={it.id}
          className="video-card text-left rounded-2xl overflow-hidden border bg-white hover:shadow-sm active:scale-[0.99] transition dark:bg-neutral-800 dark:border-neutral-700 dark:hover:shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
          onClick={() => onPlay(it)}
        >
          <div className="video-card-media bg-gray-100 dark:bg-neutral-700">
            {it.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.thumbnailUrl}
                alt={it.title || 'thumbnail'}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>

          <div className="video-card-body p-2.5 sm:p-3">
            <div className="font-semibold text-sm leading-snug line-clamp-2 text-neutral-900 dark:text-neutral-100">
              {it.title || '(no title)'}
            </div>
            <div className="text-xs text-gray-500 mt-1 line-clamp-1 dark:text-neutral-500">
              {it.channelTitle || ''}
            </div>
            <div className="mt-auto flex flex-wrap gap-1 pt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              {it.durationText ? (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-700/70">{it.durationText}</span>
              ) : null}
              {it.defaultLanguage ? (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-700/70">{it.defaultLanguage}</span>
              ) : null}
              {it.madeForKids ? (
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  Kids
                </span>
              ) : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="video-rail-static">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="video-card rounded-2xl overflow-hidden border bg-white dark:bg-neutral-800 dark:border-neutral-700"
        >
          <div className="video-card-media bg-gray-100 animate-pulse dark:bg-neutral-700" />
          <div className="video-card-body p-2.5 space-y-2 sm:p-3">
            <div className="h-3 bg-gray-100 rounded animate-pulse dark:bg-neutral-700" />
            <div className="h-3 bg-gray-100 rounded w-2/3 animate-pulse dark:bg-neutral-700" />
            <div className="mt-auto h-5 w-16 rounded-full bg-gray-100 animate-pulse dark:bg-neutral-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RailMessage({
  children,
  tone = 'empty',
}: {
  children: ReactNode;
  tone?: 'empty' | 'error';
}) {
  return (
    <div
      className={`rail-message mt-2 flex items-center justify-center rounded-2xl border border-dashed px-6 text-center text-sm ${
        tone === 'error'
          ? 'border-red-200 bg-red-50/70 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
          : 'border-pink-200 bg-white/45 text-gray-600 dark:border-neutral-700 dark:bg-neutral-900/45 dark:text-neutral-400'
      }`}
    >
      {children}
    </div>
  );
}
