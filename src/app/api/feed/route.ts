import { NextResponse } from 'next/server';
import { withCache } from '@/lib/cache';
import { getVideosDetails, search } from '@/lib/youtube';

// /api/feed is only used as a last-resort fallback when the user has zero keywords configured.
// Keep the API-cost tiny: one search.list (100 units) + one videos.list (1 unit).
const FEED_QUERY = 'nursery rhymes';
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bypass = url.searchParams.get('nocache') === '1';
    const regionCode = (process.env.YOUTUBE_REGION_CODE || 'SG').trim();

    const cacheKey = `feed:${regionCode}:${FEED_QUERY}`;

    const items = await withCache(
      cacheKey,
      TTL_MS,
      async () => {
        const base = await search({
          q: FEED_QUERY,
          type: 'video',
          durationPreset: 'any',
          regionCode,
          maxResults: 25,
        });

        const ids = base.map((x) => x.id).filter(Boolean);
        const details = await getVideosDetails(ids);
        return details.filter((v) => v.madeForKids === true).slice(0, 24);
      },
      { bypass }
    );

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
