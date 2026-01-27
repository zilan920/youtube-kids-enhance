import { NextResponse } from 'next/server';
import { getVideosDetails, search } from '@/lib/youtube';

export async function GET() {
  try {
    const regionCode = (process.env.YOUTUBE_REGION_CODE || 'SG').trim();

    // NOTE: There is no public API for the real YouTube Kids catalogue.
    // Best-effort approach: search kid-focused queries + enforce `madeForKids=true`.
    const queries = [
      'nursery rhymes',
      'kids songs',
      'peppa pig',
      'cartoon for kids',
      'learn alphabet',
      'learn numbers',
    ];

    const pickedIds: string[] = [];
    const seen = new Set<string>();

    for (const q of queries) {
      const base = await search({
        q,
        type: 'video',
        durationPreset: 'any',
        regionCode,
        maxResults: 25,
      });

      for (const it of base) {
        if (!it.id || seen.has(it.id)) continue;
        seen.add(it.id);
        pickedIds.push(it.id);
        if (pickedIds.length >= 50) break;
      }
      if (pickedIds.length >= 50) break;
    }

    const details = await getVideosDetails(pickedIds);

    // strict: only show videos explicitly marked "Made for Kids".
    const items = details.filter((v) => v.madeForKids === true).slice(0, 24);

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
