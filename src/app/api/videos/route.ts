import { NextResponse } from 'next/server';
import { getVideosDetails } from '@/lib/youtube';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ids = (url.searchParams.get('ids') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
    }

    const items = await getVideosDetails(ids);
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
