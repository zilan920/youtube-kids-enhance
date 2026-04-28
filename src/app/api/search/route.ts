import { NextResponse } from 'next/server';
import { withCache } from '@/lib/cache';
import {
  getVideosDetails,
  isVideoPlayableInRegion,
  search,
  type SearchListItem,
  type YoutubeDurationPreset,
  type YoutubeSearchType,
} from '@/lib/youtube';

const TTL_MS = 10 * 60 * 1000;

function parseNumber(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = (url.searchParams.get('type') || 'video') as YoutubeSearchType;
    const durationPreset = (url.searchParams.get('durationPreset') || 'any') as YoutubeDurationPreset;
    const lang = (url.searchParams.get('lang') || '').trim();
    const minSec = parseNumber(url.searchParams.get('minSec'));
    const maxSec = parseNumber(url.searchParams.get('maxSec'));
    const bypass = url.searchParams.get('nocache') === '1';
    const regionCode = (process.env.YOUTUBE_REGION_CODE || 'SG').trim();

    if (!q) {
      return NextResponse.json({ error: 'Missing q' }, { status: 400 });
    }

    const cacheKey = `search:${type}:${durationPreset}:${lang}:${minSec ?? ''}:${maxSec ?? ''}:${regionCode}:${q.toLowerCase()}`;

    const payload = await withCache(
      cacheKey,
      TTL_MS,
      async () => {
        const base = await search({
          q,
          type,
          durationPreset,
          relevanceLanguage: lang || undefined,
          regionCode,
          maxResults: 20,
        });

        if (type !== 'video') {
          return { type, items: base } as const;
        }

        const ids = (base as SearchListItem[]).map((x) => x.id).filter(Boolean);
        const details = await getVideosDetails(ids);

        const filtered = details.filter((v) => {
          if (v.madeForKids !== true) return false;
          if (v.embeddable !== true) return false;
          if (!isVideoPlayableInRegion(v, regionCode)) return false;
          if (v.durationSec === undefined) return false;
          if (minSec !== undefined && v.durationSec < minSec) return false;
          if (maxSec !== undefined && v.durationSec > maxSec) return false;
          return true;
        });

        const filteredLang = lang
          ? filtered.filter((v) => (v.defaultLanguage || '').toLowerCase() === lang.toLowerCase())
          : filtered;

        return { type, items: filteredLang } as const;
      },
      { bypass }
    );

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
