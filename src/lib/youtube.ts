import { parse, toSeconds } from 'iso8601-duration';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export type YoutubeSearchType = 'video' | 'playlist' | 'channel';
export type YoutubeDurationPreset = 'any' | 'short' | 'medium' | 'long';

export type SearchListItem = {
  id: string;
  kind?: string;
  title?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
};

export type VideoListItem = {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  durationText?: string;
  defaultLanguage?: string;
  madeForKids?: boolean;
  embeddable?: boolean;
  regionRestriction?: YoutubeRegionRestriction;
};

export type YoutubeRegionRestriction = {
  allowed?: string[];
  blocked?: string[];
};

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function isoDurationToSeconds(iso: string): number {
  // YouTube returns ISO 8601 durations, e.g. PT4M13S
  return toSeconds(parse(iso));
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type YTThumbnail = { url?: string };

type YTSearchItem = {
  id?: { videoId?: string; playlistId?: string; channelId?: string; kind?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { medium?: YTThumbnail; default?: YTThumbnail };
  };
};

type YTSearchResponse = { items?: YTSearchItem[] };

type YTVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    defaultLanguage?: string;
    thumbnails?: { medium?: YTThumbnail; default?: YTThumbnail };
  };
  contentDetails?: {
    duration?: string;
    regionRestriction?: YoutubeRegionRestriction;
  };
  status?: {
    madeForKids?: boolean;
    embeddable?: boolean;
  };
};

type YTVideosResponse = { items?: YTVideoItem[] };

type YTMostPopularResponse = { items?: YTVideoItem[] };


async function ytFetch(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
  const key = mustGetEnv('YOUTUBE_API_KEY');
  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    // avoid caching stale results in dev/prod
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YouTube API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function search(params: {
  q: string;
  type: YoutubeSearchType;
  durationPreset?: YoutubeDurationPreset;
  relevanceLanguage?: string;
  regionCode?: string;
  maxResults?: number;
}): Promise<SearchListItem[]> {
  const {
    q,
    type,
    durationPreset = 'any',
    relevanceLanguage,
    regionCode,
    maxResults = 20,
  } = params;

  const safeSearch = 'strict';

  // YouTube only allows videoDuration filter for type=video; include it in the single request
  // to avoid a redundant 100-unit search.list call.
  const videoDuration =
    type === 'video' && durationPreset !== 'any' ? durationPreset : undefined;

  const json = (await ytFetch('search', {
    part: 'snippet',
    q,
    type,
    maxResults,
    safeSearch,
    relevanceLanguage,
    regionCode,
    videoDuration,
    videoEmbeddable: type === 'video' ? 'true' : undefined,
    videoSyndicated: type === 'video' ? 'true' : undefined,
  })) as YTSearchResponse;

  const items = json.items ?? [];
  return items
    .map((it) => {
      const id = it.id?.videoId || it.id?.playlistId || it.id?.channelId;
      if (!id) return null;
      return {
        id,
        kind: it.id?.kind,
        title: it.snippet?.title,
        channelTitle: it.snippet?.channelTitle,
        publishedAt: it.snippet?.publishedAt,
        thumbnailUrl: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

export async function getMostPopularVideos(params: {
  regionCode: string;
  maxResults?: number;
  videoCategoryId?: string;
}): Promise<VideoListItem[]> {
  const { regionCode, maxResults = 24, videoCategoryId } = params;

  const json = (await ytFetch('videos', {
    part: 'snippet,contentDetails,status',
    chart: 'mostPopular',
    regionCode,
    maxResults,
    videoCategoryId,
  })) as YTMostPopularResponse;

  const items = json.items ?? [];

  return items
    .map((it) => {
      const id = it.id;
      if (!id) return null;
      const durationIso = it.contentDetails?.duration;
      const durationSec = durationIso ? isoDurationToSeconds(durationIso) : undefined;
      return {
        id,
        title: it.snippet?.title ?? '',
        channelTitle: it.snippet?.channelTitle ?? '',
        publishedAt: it.snippet?.publishedAt,
        thumbnailUrl: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url,
        defaultLanguage: it.snippet?.defaultLanguage,
        madeForKids: it.status?.madeForKids,
        embeddable: it.status?.embeddable,
        regionRestriction: it.contentDetails?.regionRestriction,
        durationSec,
        durationText: durationSec !== undefined ? formatDuration(durationSec) : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

export async function getVideosDetails(videoIds: string[]): Promise<VideoListItem[]> {
  const ids = videoIds.filter(Boolean);
  if (ids.length === 0) return [];

  const json = (await ytFetch('videos', {
    part: 'snippet,contentDetails,status',
    id: ids.join(','),
    maxResults: 50,
  })) as YTVideosResponse;

  const items = json.items ?? [];

  return items
    .map((it) => {
      const id = it.id;
      if (!id) return null;
      const durationIso = it.contentDetails?.duration;
      const durationSec = durationIso ? isoDurationToSeconds(durationIso) : undefined;
      return {
        id,
        title: it.snippet?.title ?? '',
        channelTitle: it.snippet?.channelTitle ?? '',
        publishedAt: it.snippet?.publishedAt,
        thumbnailUrl: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url,
        defaultLanguage: it.snippet?.defaultLanguage,
        madeForKids: it.status?.madeForKids,
        embeddable: it.status?.embeddable,
        regionRestriction: it.contentDetails?.regionRestriction,
        durationSec,
        durationText: durationSec !== undefined ? formatDuration(durationSec) : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

export function isVideoPlayableInRegion(video: VideoListItem, regionCode?: string): boolean {
  const normalizedRegion = regionCode?.trim().toUpperCase();
  if (!normalizedRegion) return true;

  const restriction = video.regionRestriction;
  if (!restriction) return true;

  if (restriction.allowed) {
    return restriction.allowed.map((region) => region.toUpperCase()).includes(normalizedRegion);
  }

  if (restriction.blocked) {
    return !restriction.blocked.map((region) => region.toUpperCase()).includes(normalizedRegion);
  }

  return true;
}
