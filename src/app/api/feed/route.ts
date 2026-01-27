import { NextResponse } from 'next/server';
import { getMostPopularVideos } from '@/lib/youtube';

export async function GET() {
  try {
    const regionCode = (process.env.YOUTUBE_REGION_CODE || 'SG').trim();
    const items = await getMostPopularVideos({
      regionCode,
      maxResults: 24,
      // Heuristic: education category tends to be safer for kids; can be made configurable.
      videoCategoryId: '27',
    });
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
