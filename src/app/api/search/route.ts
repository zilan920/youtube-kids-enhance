import { NextResponse } from 'next/server';
import {
  getVideosDetails,
  search,
  type SearchListItem,
  type YoutubeDurationPreset,
  type YoutubeSearchType,
} from '@/lib/youtube';

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
    const regionCode = (process.env.YOUTUBE_REGION_CODE || 'SG').trim();

    if (!q) {
      return NextResponse.json({ error: 'Missing q' }, { status: 400 });
    }

    const base = await search({
      q,
      type,
      durationPreset,
      relevanceLanguage: lang || undefined,
      regionCode,
      maxResults: 20,
    });

    // For videos, enrich with duration + optional range filter.
    if (type === 'video') {
      const ids = (base as SearchListItem[]).map((x) => x.id).filter(Boolean);
      const details = await getVideosDetails(ids);

      const filtered = details.filter((v) => {
        if (v.durationSec === undefined) return false;
        if (minSec !== undefined && v.durationSec < minSec) return false;
        if (maxSec !== undefined && v.durationSec > maxSec) return false;
        return true;
      });

      // Optional language filter: prefer either relevanceLanguage (already used) OR snippet.defaultLanguage.
      const filteredLang = lang
        ? filtered.filter((v) => {
            const dl = (v.defaultLanguage || '').toLowerCase();
            return dl === lang.toLowerCase();
          })
        : filtered;

      return NextResponse.json({ type, items: filteredLang });
    }

    return NextResponse.json({ type, items: base });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
