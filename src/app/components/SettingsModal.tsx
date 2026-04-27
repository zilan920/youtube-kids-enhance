'use client';

import { useEffect, useState } from 'react';

export type DurationPreset = 'any' | 'short' | 'medium' | 'long';

export type KeywordConfig = {
  keyword: string;
  durationPreset?: DurationPreset;
  minSec?: number;
  maxSec?: number;
};

export type Settings = {
  keywords: KeywordConfig[];
  durationPreset: DurationPreset;
  minSec?: number;
  maxSec?: number;
  lang: string;
};

type Props = {
  initial: Settings;
  onClose: () => void;
  onSave: (next: Settings) => void;
  maxKeywords?: number;
};

const PRESETS: { id: DurationPreset; label: string }[] = [
  { id: 'any', label: '任意' },
  { id: 'short', label: '短 (<4min)' },
  { id: 'medium', label: '中 (4-20min)' },
  { id: 'long', label: '长 (>20min)' },
];

function hasOverride(kc: KeywordConfig): boolean {
  return kc.durationPreset !== undefined || kc.minSec !== undefined || kc.maxSec !== undefined;
}

function presetLabel(p?: DurationPreset): string | null {
  if (!p) return null;
  return PRESETS.find((x) => x.id === p)?.label ?? null;
}

export function describeDuration(
  kc: KeywordConfig,
  fallback: { durationPreset: DurationPreset; minSec?: number; maxSec?: number }
): string {
  const preset = kc.durationPreset ?? fallback.durationPreset;
  const minSec = kc.minSec ?? fallback.minSec;
  const maxSec = kc.maxSec ?? fallback.maxSec;
  const parts: string[] = [];
  const pl = presetLabel(preset);
  if (pl && preset !== 'any') parts.push(pl);
  if (minSec !== undefined || maxSec !== undefined) {
    const l = minSec !== undefined ? `${minSec}s` : '';
    const r = maxSec !== undefined ? `${maxSec}s` : '';
    parts.push(`${l}-${r}`);
  }
  return parts.length === 0 ? '任意时长' : parts.join(' · ');
}

export default function SettingsModal({
  initial,
  onClose,
  onSave,
  maxKeywords = 6,
}: Props) {
  const [keywords, setKeywords] = useState<KeywordConfig[]>(initial.keywords);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(initial.durationPreset);
  const [minSec, setMinSec] = useState<string>(
    initial.minSec !== undefined ? String(initial.minSec) : ''
  );
  const [maxSec, setMaxSec] = useState<string>(
    initial.maxSec !== undefined ? String(initial.maxSec) : ''
  );
  const [lang, setLang] = useState<string>(initial.lang);
  const [draft, setDraft] = useState<string>('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function addKeyword() {
    const v = draft.trim();
    if (!v) return;
    if (keywords.some((k) => k.keyword.toLowerCase() === v.toLowerCase())) {
      setErr('关键字已存在');
      return;
    }
    if (keywords.length >= maxKeywords) {
      setErr(`最多 ${maxKeywords} 个关键字`);
      return;
    }
    setKeywords([...keywords, { keyword: v }]);
    setDraft('');
    setErr(null);
  }

  function removeKeyword(idx: number) {
    setKeywords(keywords.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    setErr(null);
  }

  function updateKeyword(idx: number, patch: Partial<KeywordConfig>) {
    setKeywords((prev) => prev.map((k, i) => (i === idx ? { ...k, ...patch } : k)));
  }

  function clearKeywordOverride(idx: number) {
    setKeywords((prev) =>
      prev.map((k, i) =>
        i === idx
          ? { keyword: k.keyword, durationPreset: undefined, minSec: undefined, maxSec: undefined }
          : k
      )
    );
  }

  function parseOptionalSec(v: string): { ok: boolean; value?: number } {
    const t = v.trim();
    if (t === '') return { ok: true, value: undefined };
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return { ok: false };
    return { ok: true, value: n };
  }

  function handleSave() {
    const gMin = parseOptionalSec(minSec);
    const gMax = parseOptionalSec(maxSec);
    if (!gMin.ok) {
      setErr('全局最短秒数必须是非负数字');
      return;
    }
    if (!gMax.ok) {
      setErr('全局最长秒数必须是非负数字');
      return;
    }
    if (gMin.value !== undefined && gMax.value !== undefined && gMin.value > gMax.value) {
      setErr('全局最短秒数不能大于最长秒数');
      return;
    }

    for (const kc of keywords) {
      if (kc.minSec !== undefined && kc.maxSec !== undefined && kc.minSec > kc.maxSec) {
        setErr(`关键字「${kc.keyword}」的最短秒数不能大于最长秒数`);
        return;
      }
    }

    onSave({
      keywords,
      durationPreset,
      minSec: gMin.value,
      maxSec: gMax.value,
      lang: lang.trim(),
    });
  }

  const inputCls =
    'border border-pink-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-4 focus:ring-pink-100 bg-white text-neutral-900 placeholder:text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:ring-pink-900/40';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm dark:bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-pink-100 overflow-hidden dark:bg-neutral-900 dark:border-neutral-700">
        <div className="px-5 py-4 border-b border-pink-100 flex items-center justify-between dark:border-neutral-700">
          <div className="text-lg font-semibold text-pink-900 dark:text-pink-200">设置</div>
          <button
            className="w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <section>
            <div className="text-sm font-medium text-gray-800 dark:text-neutral-200">
              关键字 <span className="text-xs text-gray-500 dark:text-neutral-400">（最多 {maxKeywords} 个；点击标签可单独设置时长）</span>
            </div>
            <div className="mt-2 space-y-2">
              {keywords.map((kc, i) => {
                const expanded = expandedIdx === i;
                const overridden = hasOverride(kc);
                const summary = describeDuration(kc, {
                  durationPreset,
                  minSec: minSec.trim() === '' ? undefined : Number(minSec),
                  maxSec: maxSec.trim() === '' ? undefined : Number(maxSec),
                });
                return (
                  <div
                    key={`${kc.keyword}-${i}`}
                    className="rounded-2xl border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800/60"
                  >
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <button
                        className="flex-1 flex items-center gap-2 text-left px-2 py-1 rounded-full hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                        onClick={() => setExpandedIdx(expanded ? null : i)}
                        aria-expanded={expanded}
                      >
                        <span className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
                          {kc.keyword}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            overridden
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}
                        >
                          {overridden ? summary : `默认: ${summary}`}
                        </span>
                        <span
                          className={`ml-auto text-xs text-neutral-500 dark:text-neutral-400 transition ${expanded ? 'rotate-180' : ''}`}
                          aria-hidden
                        >
                          ▾
                        </span>
                      </button>
                      <button
                        className="w-7 h-7 inline-flex items-center justify-center rounded-full text-yellow-900 hover:bg-yellow-200 dark:text-yellow-100 dark:hover:bg-yellow-800/60"
                        onClick={() => removeKeyword(i)}
                        aria-label={`移除 ${kc.keyword}`}
                      >
                        ×
                      </button>
                    </div>

                    {expanded ? (
                      <div className="px-3 pb-3 pt-1 border-t border-yellow-200 dark:border-yellow-800/60 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">时长预设：</span>
                          <button
                            className={`px-2.5 py-1 rounded-full border text-xs transition ${
                              kc.durationPreset === undefined
                                ? 'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-600 dark:border-indigo-600'
                                : 'bg-white border-pink-100 text-gray-700 hover:bg-pink-50 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700'
                            }`}
                            onClick={() => updateKeyword(i, { durationPreset: undefined })}
                            title="使用全局默认"
                          >
                            默认
                          </button>
                          {PRESETS.map((p) => (
                            <button
                              key={p.id}
                              className={`px-2.5 py-1 rounded-full border text-xs transition ${
                                kc.durationPreset === p.id
                                  ? 'bg-green-200 border-green-300 text-green-900 dark:bg-green-900/50 dark:border-green-700 dark:text-green-100'
                                  : 'bg-white border-pink-100 text-gray-700 hover:bg-pink-50 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700'
                              }`}
                              onClick={() => updateKeyword(i, { durationPreset: p.id })}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-gray-600 dark:text-neutral-400">
                            最短（秒，可选）
                            <input
                              type="number"
                              min={0}
                              className={`mt-1 w-full ${inputCls} px-3 py-1.5`}
                              value={kc.minSec !== undefined ? String(kc.minSec) : ''}
                              onChange={(e) => {
                                const t = e.target.value.trim();
                                const n = t === '' ? undefined : Number(t);
                                updateKeyword(i, {
                                  minSec: n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined,
                                });
                                setErr(null);
                              }}
                              placeholder="默认"
                            />
                          </label>
                          <label className="text-[11px] text-gray-600 dark:text-neutral-400">
                            最长（秒，可选）
                            <input
                              type="number"
                              min={0}
                              className={`mt-1 w-full ${inputCls} px-3 py-1.5`}
                              value={kc.maxSec !== undefined ? String(kc.maxSec) : ''}
                              onChange={(e) => {
                                const t = e.target.value.trim();
                                const n = t === '' ? undefined : Number(t);
                                updateKeyword(i, {
                                  maxSec: n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined,
                                });
                                setErr(null);
                              }}
                              placeholder="默认"
                            />
                          </label>
                        </div>

                        {overridden ? (
                          <button
                            className="text-[11px] text-indigo-600 hover:underline dark:text-indigo-300"
                            onClick={() => clearKeywordOverride(i)}
                          >
                            清除覆盖，使用默认
                          </button>
                        ) : (
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-500">
                            未设置则使用全局默认时长。
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                className={`flex-1 ${inputCls}`}
                value={draft}
                placeholder="例如 peppa pig / 数学启蒙"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <button
                className="px-4 py-2 rounded-full bg-pink-100 text-pink-900 hover:bg-pink-200 disabled:opacity-50 text-sm dark:bg-pink-900/40 dark:text-pink-100 dark:hover:bg-pink-900/60"
                onClick={addKeyword}
                disabled={!draft.trim() || keywords.length >= maxKeywords}
              >
                添加
              </button>
            </div>
          </section>

          <section>
            <div className="text-sm font-medium text-gray-800 dark:text-neutral-200">
              默认时长 <span className="text-xs text-gray-500 dark:text-neutral-400">（关键字未单独设置时使用）</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`px-3 py-1.5 rounded-full border text-sm transition ${
                    durationPreset === p.id
                      ? 'bg-green-200 border-green-300 text-green-900 dark:bg-green-900/50 dark:border-green-700 dark:text-green-100'
                      : 'bg-white border-pink-100 text-gray-700 hover:bg-pink-50 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                  onClick={() => setDurationPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-600 dark:text-neutral-400">
                最短（秒，可选）
                <input
                  type="number"
                  min={0}
                  className={`mt-1 w-full ${inputCls} px-3`}
                  value={minSec}
                  onChange={(e) => {
                    setMinSec(e.target.value);
                    setErr(null);
                  }}
                  placeholder="如 30"
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-neutral-400">
                最长（秒，可选）
                <input
                  type="number"
                  min={0}
                  className={`mt-1 w-full ${inputCls} px-3`}
                  value={maxSec}
                  onChange={(e) => {
                    setMaxSec(e.target.value);
                    setErr(null);
                  }}
                  placeholder="如 600"
                />
              </label>
            </div>
            <div className="mt-1 text-[11px] text-gray-500 dark:text-neutral-500">
              自定义秒数会与预设共同生效（自定义范围为硬限制）。
            </div>
          </section>

          <section>
            <div className="text-sm font-medium text-gray-800 dark:text-neutral-200">语言（可选）</div>
            <input
              className={`mt-2 w-full ${inputCls}`}
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setErr(null);
              }}
              placeholder="例如 en / zh / ja"
            />
          </section>

          {err ? <div className="text-sm text-red-600 dark:text-red-400">{err}</div> : null}
        </div>

        <div className="px-5 py-4 border-t border-pink-100 flex items-center justify-end gap-2 dark:border-neutral-700">
          <button
            className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-5 py-2 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 text-sm dark:bg-indigo-600 dark:hover:bg-indigo-500"
            onClick={handleSave}
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
}
