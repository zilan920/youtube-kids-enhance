'use client';

import { useEffect, useMemo, useState } from 'react';

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
  const [type, setType] = useState<SearchType>('video');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('any');
  const [lang, setLang] = useState('');
  const [minSec, setMinSec] = useState<string>('');
  const [maxSec, setMaxSec] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const [filtersDirty, setFiltersDirty] = useState(false);

  const canRangeFilter = type === 'video';

  const STORAGE_KEY = 'youtube-kids-enhance.filters.v1';

  useEffect(() => {
    // restore last filter selections (but don't auto-apply)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<{
          type: SearchType;
          durationPreset: DurationPreset;
          lang: string;
          minSec: string;
          maxSec: string;
        }>;
        if (s.type) setType(s.type);
        if (s.durationPreset) setDurationPreset(s.durationPreset);
        if (typeof s.lang === 'string') setLang(s.lang);
        if (typeof s.minSec === 'string') setMinSec(s.minSec);
        if (typeof s.maxSec === 'string') setMaxSec(s.maxSec);
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

  const apiUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('q', q);
    sp.set('type', type);
    sp.set('durationPreset', durationPreset);
    if (lang.trim()) sp.set('lang', lang.trim());
    if (canRangeFilter && minSec.trim()) sp.set('minSec', minSec.trim());
    if (canRangeFilter && maxSec.trim()) sp.set('maxSec', maxSec.trim());
    return `/api/search?${sp.toString()}`;
  }, [q, type, durationPreset, lang, minSec, maxSec, canRangeFilter]);

  async function runSearch() {
    // "Search" button: explicit action. If q is empty, keep showing the default feed.
    if (!q.trim()) return;

    setLoading(true);
    setError(null);
    setSelectedVideoId(null);
    try {
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Search failed');
      setItems(json.items || []);
      setFiltersDirty(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters() {
    // persist selections
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ type, durationPreset, lang, minSec, maxSec })
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
      if (canRangeFilter && minSec.trim()) sp.set('minSec', minSec.trim());
      if (canRangeFilter && maxSec.trim()) sp.set('maxSec', maxSec.trim());

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
    <main className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold">youtube-kids-enhance</h1>
      <p className="text-sm text-gray-600 mt-1">
        MVP：搜索/播放 + 按播放时长、语言、类型筛选（SafeSearch=Strict）。
      </p>

      <section className="mt-6 grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            className="border rounded px-3 py-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索：例如 peppa pig, alphabet song, 数学启蒙..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
          />
          <button
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            onClick={runSearch}
            disabled={!q.trim() || loading}
          >
            {loading ? '搜索中…' : '搜索'}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-700">视频类型</span>
            <select
              className="border rounded px-3 py-2"
              value={type}
              onChange={(e) => {
                setType(e.target.value as SearchType);
                setFiltersDirty(true);
              }}
            >
              <option value="video">video</option>
              <option value="playlist">playlist</option>
              <option value="channel">channel</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-700">播放时长（预设）</span>
            <select
              className="border rounded px-3 py-2"
              value={durationPreset}
              onChange={(e) => {
                setDurationPreset(e.target.value as DurationPreset);
                setFiltersDirty(true);
              }}
              disabled={type !== 'video'}
              title={type !== 'video' ? '仅 video 支持时长过滤' : undefined}
            >
              <option value="any">any</option>
              <option value="short">short (&lt;4min)</option>
              <option value="medium">medium (4–20min)</option>
              <option value="long">long (&gt;20min)</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-700">语言（relevanceLanguage / defaultLanguage）</span>
            <input
              className="border rounded px-3 py-2"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setFiltersDirty(true);
              }}
              placeholder="例如 en, zh, ms"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-700">最短秒数（可选）</span>
            <input
              className="border rounded px-3 py-2"
              value={minSec}
              onChange={(e) => {
                setMinSec(e.target.value);
                setFiltersDirty(true);
              }}
              placeholder="例如 60"
              disabled={!canRangeFilter}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-700">最长秒数（可选）</span>
            <input
              className="border rounded px-3 py-2"
              value={maxSec}
              onChange={(e) => {
                setMaxSec(e.target.value);
                setFiltersDirty(true);
              }}
              placeholder="例如 600"
              disabled={!canRangeFilter}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
            onClick={applyFilters}
            disabled={loading}
            title="仅在点击后才会应用筛选"
          >
            应用筛选
          </button>
          {filtersDirty ? (
            <span className="text-xs text-gray-600 self-center">
              已更改筛选条件，点击“应用筛选”查看结果（会记住本次选择）。
            </span>
          ) : null}
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
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

        <div className="mt-3 grid gap-3">
          {items.length === 0 ? (
            <div className="text-sm text-gray-600">暂无结果。输入关键词后点击“搜索”。</div>
          ) : null}

          {items.map((it) => (
            <button
              key={it.id}
              className="text-left border rounded p-3 hover:bg-gray-50"
              onClick={() => {
                if (type === 'video') {
                  setSelectedVideoId(it.id);
                  return;
                }
                if (type === 'channel') {
                  window.open(`https://www.youtube.com/channel/${it.id}`, '_blank');
                  return;
                }
                // playlist
                window.open(`https://www.youtube.com/playlist?list=${it.id}`, '_blank');
              }}
            >
              <div className="flex gap-3">
                {it.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.thumbnailUrl}
                    alt={it.title || 'thumbnail'}
                    className="w-28 h-16 sm:w-32 sm:h-20 object-cover rounded bg-gray-100"
                  />
                ) : (
                  <div className="w-28 h-16 sm:w-32 sm:h-20 rounded bg-gray-100" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium line-clamp-2">{it.title}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {it.channelTitle}
                    {'durationText' in it && it.durationText ? ` · ${it.durationText}` : ''}
                    {'defaultLanguage' in it && it.defaultLanguage ? ` · ${it.defaultLanguage}` : ''}
                  </div>
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
