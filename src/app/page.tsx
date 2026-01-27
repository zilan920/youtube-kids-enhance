'use client';

import { useEffect, useState } from 'react';

type SearchType = 'video' | 'playlist' | 'channel';
type DurationPreset = 'any' | 'short' | 'medium' | 'long';

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
};

type Item = VideoItem | BaseItem;

export default function Home() {
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const [type, setType] = useState<SearchType>('video');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('any');
  const [lang, setLang] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const [filtersDirty, setFiltersDirty] = useState(false);

  const STORAGE_KEY = 'youtube-kids-enhance.filters.v2';

  useEffect(() => {
    // restore last filter selections (but don't auto-apply)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<{
          type: SearchType;
          durationPreset: DurationPreset;
          lang: string;
          showSearch: boolean;
        }>;
        if (s.type) setType(s.type);
        if (s.durationPreset) setDurationPreset(s.durationPreset);
        if (typeof s.lang === 'string') setLang(s.lang);
        if (typeof s.showSearch === 'boolean') setShowSearch(s.showSearch);
      }
    } catch {
      // ignore
    }

    // default load: show a "kids-like" feed first (unfiltered)
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/feed');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Feed failed');
        setItems(json.items || []);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Search action is intentionally unified into "applyFilters" (kids UI).

  async function applyFilters() {
    // persist selections
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ type, durationPreset, lang, showSearch })
      );
    } catch {
      // ignore
    }

    // Apply only when user clicks. If no query, we still apply filters by running a default kid query.
    const effectiveQ = q.trim() || 'kids';

    setLoading(true);
    setError(null);
    setSelectedVideoId(null);
    try {
      const sp = new URLSearchParams();
      sp.set('q', effectiveQ);
      sp.set('type', type);
      sp.set('durationPreset', durationPreset);
      if (lang.trim()) sp.set('lang', lang.trim());

      const res = await fetch(`/api/search?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Apply filters failed');
      setItems(json.items || []);
      setFiltersDirty(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto bg-gradient-to-b from-pink-50 via-yellow-50 to-sky-50">
      <h1 className="sr-only">youtube-kids-enhance</h1>
      <p className="mt-2 text-sm text-gray-700">
        只显示 <span className="font-semibold">Made for Kids</span> 内容。
      </p>

      <section className="mt-5 rounded-3xl bg-white/70 backdrop-blur border border-pink-100 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-2xl">KidsTube</div>
          <div className="flex-1" />
          <button
            className="px-3 py-2 rounded-full bg-pink-100 text-pink-900 hover:bg-pink-200 transition"
            onClick={() => {
              const next = !showSearch;
              setShowSearch(next);
              setFiltersDirty(true);
              try {
                localStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify({ type, durationPreset, lang, showSearch: next })
                );
              } catch {
                // ignore
              }
            }}
            title="搜索"
          >
            搜索
          </button>
          <button
            className="px-4 py-2 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-50"
            onClick={applyFilters}
            disabled={loading}
            title="点击才应用筛选"
          >
            应用
          </button>
        </div>

        {showSearch ? (
          <div className="mt-3">
            <input
              className="w-full border border-pink-100 rounded-2xl px-4 py-3 text-base outline-none focus:ring-4 focus:ring-pink-100"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setFiltersDirty(true);
              }}
              placeholder="想看什么？例如 peppa pig / alphabet song / 数学启蒙"
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
            />
          </div>
        ) : null}

        {/* Horizontal swipe filters (kids-style chips) */}
        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar py-1">
          {(['video', 'playlist', 'channel'] as SearchType[]).map((t) => (
            <button
              key={t}
              className={`shrink-0 px-4 py-2 rounded-full border transition ${
                type === t
                  ? 'bg-yellow-200 border-yellow-300 text-yellow-900'
                  : 'bg-white border-pink-100 text-gray-700 hover:bg-pink-50'
              }`}
              onClick={() => {
                setType(t);
                setFiltersDirty(true);
              }}
              title="类型"
            >
              {t}
            </button>
          ))}

          {(['any', 'short', 'medium', 'long'] as DurationPreset[]).map((d) => (
            <button
              key={d}
              className={`shrink-0 px-4 py-2 rounded-full border transition ${
                durationPreset === d
                  ? 'bg-green-200 border-green-300 text-green-900'
                  : 'bg-white border-pink-100 text-gray-700 hover:bg-pink-50'
              } ${type !== 'video' ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => {
                setDurationPreset(d);
                setFiltersDirty(true);
              }}
              title={type !== 'video' ? '仅 video 支持时长过滤' : '时长'}
            >
              {d}
            </button>
          ))}

          <div className="shrink-0 flex items-center gap-2 pl-1">
            <span className="text-xs text-gray-500">Lang</span>
            <input
              className="w-20 sm:w-24 border border-pink-100 rounded-full px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-pink-100"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setFiltersDirty(true);
              }}
              placeholder="en/zh"
            />
          </div>
        </div>

        {filtersDirty ? (
          <div className="mt-2 text-xs text-gray-600">
            已更改条件：点右上角“应用”才会刷新结果（会记住你的选择）。
          </div>
        ) : null}

        {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
      </section>

      {selectedVideoId ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">播放</h2>
          <div className="mt-3 aspect-video w-full">
            <iframe
              className="w-full h-full rounded border"
              src={`https://www.youtube-nocookie.com/embed/${selectedVideoId}`}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-medium">结果</h2>

        {items.length === 0 ? (
          <div className="mt-3 text-sm text-gray-600">暂无结果（当前仅显示 Made for Kids 的内容）。</div>
        ) : null}

        {/* YouTube Kids-like big cards */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <button
              key={it.id}
              className="text-left rounded-2xl overflow-hidden border bg-white hover:shadow-sm active:scale-[0.99] transition"
              onClick={() => {
                if (type === 'video') {
                  setSelectedVideoId(it.id);
                  return;
                }
                if (type === 'channel') {
                  window.open(`https://www.youtube.com/channel/${it.id}`, '_blank');
                  return;
                }
                window.open(`https://www.youtube.com/playlist?list=${it.id}`, '_blank');
              }}
            >
              <div className="aspect-video bg-gray-100">
                {it.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.thumbnailUrl}
                    alt={it.title || 'thumbnail'}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>

              <div className="p-3">
                <div className="font-semibold text-sm leading-snug line-clamp-2">
                  {it.title || '(no title)'}
                </div>
                <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {it.channelTitle || ''}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {'durationText' in it && it.durationText ? (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100">{it.durationText}</span>
                  ) : null}
                  {'defaultLanguage' in it && it.defaultLanguage ? (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100">{it.defaultLanguage}</span>
                  ) : null}
                  {'madeForKids' in it && it.madeForKids ? (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                      Kids
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <footer className="mt-12 text-xs text-gray-500">
        提示：YouTube Kids 级别的内容审核/家长控制超出 MVP 范围；当前仅启用 SafeSearch 严格模式。
      </footer>
    </main>
  );
}
