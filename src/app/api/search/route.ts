import { NextResponse } from 'next/server';
import { withCache } from '@/lib/cache';
import {
  getVideosDetails,
  isVideoPlayableInRegion,
  search,
  type SearchListItem,
  type YoutubeDurationPreset,
  type YoutubeSearchOrder,
  type YoutubeSearchType,
  type YoutubeVideoCaption,
  type YoutubeVideoDefinition,
  type YoutubeVideoDimension,
  type YoutubeVideoLicense,
  type YoutubeVideoType,
} from '@/lib/youtube';

const TTL_MS = 10 * 60 * 1000;
const ORDERS: YoutubeSearchOrder[] = ['relevance', 'date', 'rating', 'title', 'viewCount'];
const VIDEO_CAPTIONS: YoutubeVideoCaption[] = ['any', 'closedCaption', 'none'];
const VIDEO_DEFINITIONS: YoutubeVideoDefinition[] = ['any', 'high', 'standard'];
const VIDEO_DIMENSIONS: YoutubeVideoDimension[] = ['any', '2d', '3d'];
const VIDEO_LICENSES: YoutubeVideoLicense[] = ['any', 'creativeCommon', 'youtube'];
const VIDEO_TYPES: YoutubeVideoType[] = ['any', 'episode', 'movie'];
const MADE_FOR_KIDS = ['required', 'any'] as const;
type MadeForKidsFilter = (typeof MADE_FOR_KIDS)[number];
type RejectReason =
  | 'notMadeForKids'
  | 'notEmbeddable'
  | 'notPlayableInRegion'
  | 'missingDuration'
  | 'tooShort'
  | 'tooLong'
  | 'langMismatch';

const REJECT_REASONS: RejectReason[] = [
  'notMadeForKids',
  'notEmbeddable',
  'notPlayableInRegion',
  'missingDuration',
  'tooShort',
  'tooLong',
  'langMismatch',
];

function emptyRejectCounts(): Record<RejectReason, number> {
  return Object.fromEntries(REJECT_REASONS.map((reason) => [reason, 0])) as Record<
    RejectReason,
    number
  >;
}

function logSearch(stage: string, data: Record<string, unknown>) {
  console.info(`[api/search] ${stage}`, JSON.stringify(data));
}

function parseNumber(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseMaxResults(v: string | null): number {
  const n = parseNumber(v);
  if (n === undefined) return 20;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

function parseEnum<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v && allowed.includes(v as T) ? (v as T) : fallback;
}

function normalizeDateTime(v: string | null, endOfDay = false): string | undefined {
  const value = (v || '').trim();
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
  }
  return value;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = (url.searchParams.get('type') || 'video') as YoutubeSearchType;
    const durationPreset = (url.searchParams.get('durationPreset') || 'any') as YoutubeDurationPreset;
    const lang = (url.searchParams.get('lang') || '').trim();
    const langStrict = url.searchParams.get('langStrict') === '1';
    const minSec = parseNumber(url.searchParams.get('minSec'));
    const maxSec = parseNumber(url.searchParams.get('maxSec'));
    const bypass = url.searchParams.get('nocache') === '1';
    const regionCode = (
      url.searchParams.get('regionCode') ||
      process.env.YOUTUBE_REGION_CODE ||
      'SG'
    )
      .trim()
      .toUpperCase();
    const maxResults = parseMaxResults(url.searchParams.get('maxResults'));
    const order = parseEnum(url.searchParams.get('order'), ORDERS, 'relevance');
    const publishedAfter = normalizeDateTime(url.searchParams.get('publishedAfter'));
    const publishedBefore = normalizeDateTime(url.searchParams.get('publishedBefore'), true);
    const channelId = (url.searchParams.get('channelId') || '').trim();
    const videoCaption = parseEnum(url.searchParams.get('videoCaption'), VIDEO_CAPTIONS, 'any');
    const videoDefinition = parseEnum(
      url.searchParams.get('videoDefinition'),
      VIDEO_DEFINITIONS,
      'any'
    );
    const videoDimension = parseEnum(
      url.searchParams.get('videoDimension'),
      VIDEO_DIMENSIONS,
      'any'
    );
    const videoCategoryId = (url.searchParams.get('videoCategoryId') || '').trim();
    const videoLicense = parseEnum(url.searchParams.get('videoLicense'), VIDEO_LICENSES, 'any');
    const videoType = parseEnum(url.searchParams.get('videoType'), VIDEO_TYPES, 'any');
    const topicId = (url.searchParams.get('topicId') || '').trim();
    const madeForKids = parseEnum<MadeForKidsFilter>(
      url.searchParams.get('madeForKids'),
      MADE_FOR_KIDS,
      'required'
    );

    if (!q) {
      return NextResponse.json({ error: 'Missing q' }, { status: 400 });
    }

    logSearch('request', {
      q,
      type,
      durationPreset,
      minSec,
      maxSec,
      regionCode,
      maxResults,
      order,
      madeForKids,
      lang: lang || undefined,
      langStrict,
      channelId: channelId || undefined,
      publishedAfter,
      publishedBefore,
      videoCaption,
      videoDefinition,
      videoDimension,
      videoCategoryId: videoCategoryId || undefined,
      videoLicense,
      videoType,
      topicId: topicId || undefined,
      bypassCache: bypass,
    });

    const cacheKey = JSON.stringify({
      route: 'search',
      type,
      durationPreset,
      lang,
      langStrict,
      minSec,
      maxSec,
      regionCode,
      maxResults,
      order,
      publishedAfter,
      publishedBefore,
      channelId,
      videoCaption,
      videoDefinition,
      videoDimension,
      videoCategoryId,
      videoLicense,
      videoType,
      topicId,
      madeForKids,
      q: q.toLowerCase(),
    });

    let loadedFresh = false;
    const payload = await withCache(
      cacheKey,
      TTL_MS,
      async () => {
        loadedFresh = true;
        logSearch('cache-miss', { q, madeForKids, bypassCache: bypass });

        const base = await search({
          q,
          type,
          durationPreset,
          relevanceLanguage: lang || undefined,
          regionCode,
          maxResults,
          order,
          publishedAfter,
          publishedBefore,
          channelId: channelId || undefined,
          videoCaption,
          videoDefinition,
          videoDimension,
          videoCategoryId: videoCategoryId || undefined,
          videoLicense,
          videoType,
          topicId: topicId || undefined,
        });

        logSearch('youtube-search-result', {
          q,
          type,
          count: base.length,
          ids: base.slice(0, 5).map((item) => item.id),
        });

        if (type !== 'video') {
          return { type, items: base } as const;
        }

        const ids = (base as SearchListItem[]).map((x) => x.id).filter(Boolean);
        const details = await getVideosDetails(ids);
        const detailIds = new Set(details.map((v) => v.id));
        const missingDetailCount = ids.filter((id) => !detailIds.has(id)).length;
        const rejectCounts = emptyRejectCounts();
        const rejectSamples: Array<{
          id: string;
          title: string;
          channelTitle: string;
          durationSec?: number;
          madeForKids?: boolean;
          embeddable?: boolean;
          reasons: RejectReason[];
        }> = [];

        const filtered = details.filter((v) => {
          const reasons: RejectReason[] = [];
          if (madeForKids === 'required' && v.madeForKids !== true) reasons.push('notMadeForKids');
          if (v.embeddable !== true) reasons.push('notEmbeddable');
          if (!isVideoPlayableInRegion(v, regionCode)) reasons.push('notPlayableInRegion');
          if (v.durationSec === undefined) reasons.push('missingDuration');
          if (minSec !== undefined && v.durationSec !== undefined && v.durationSec < minSec) {
            reasons.push('tooShort');
          }
          if (maxSec !== undefined && v.durationSec !== undefined && v.durationSec > maxSec) {
            reasons.push('tooLong');
          }

          for (const reason of reasons) rejectCounts[reason] += 1;
          if (reasons.length > 0 && rejectSamples.length < 5) {
            rejectSamples.push({
              id: v.id,
              title: v.title,
              channelTitle: v.channelTitle,
              durationSec: v.durationSec,
              madeForKids: v.madeForKids,
              embeddable: v.embeddable,
              reasons,
            });
          }

          return reasons.length === 0;
        });

        const filteredLang = lang && langStrict
          ? filtered.filter((v) => {
              const matches = (v.defaultLanguage || '').toLowerCase() === lang.toLowerCase();
              if (!matches) {
                rejectCounts.langMismatch += 1;
                if (rejectSamples.length < 5) {
                  rejectSamples.push({
                    id: v.id,
                    title: v.title,
                    channelTitle: v.channelTitle,
                    durationSec: v.durationSec,
                    madeForKids: v.madeForKids,
                    embeddable: v.embeddable,
                    reasons: ['langMismatch'],
                  });
                }
              }
              return matches;
            })
          : filtered;

        logSearch('filter-result', {
          q,
          type,
          searchCount: base.length,
          detailCount: details.length,
          missingDetailCount,
          rejectCounts,
          afterCommonFiltersCount: filtered.length,
          returnedCount: filteredLang.length,
          rejectSamples,
        });

        return { type, items: filteredLang } as const;
      },
      { bypass }
    );

    if (!loadedFresh) {
      logSearch('cache-hit', { q, madeForKids, returnedCount: payload.items.length });
    }

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    logSearch('error', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
