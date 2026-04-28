'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Plyr from 'plyr';

export type PlayerMode = 'iframe' | 'plyr';

export type PlayerIssue = {
  code: number | 'autoplay_blocked' | 'load_failed';
  message: string;
  recoverable?: boolean;
};

type VideoPlayerProps = {
  videoId: string;
  title: string;
  mode?: PlayerMode;
  onClose: () => void;
  onError?: (issue: PlayerIssue) => void;
};

type PlayerImplementationProps = {
  videoId: string;
  title: string;
  onIssue: (issue: PlayerIssue) => void;
};

type YouTubePlayerInstance = {
  destroy: () => void;
  playVideo: () => void;
};

type YouTubePlayerEvent = {
  data: number;
  target: YouTubePlayerInstance;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: (event: YouTubePlayerEvent) => void;
        onError?: (event: YouTubePlayerEvent) => void;
        onAutoplayBlocked?: () => void;
      };
    }
  ) => YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

let youtubeApiPromise: Promise<void> | null = null;

export default function VideoPlayer({
  videoId,
  title,
  mode = 'iframe',
  onClose,
  onError,
}: VideoPlayerProps) {
  const issueScope = `${mode}:${videoId}`;
  const [issueState, setIssueState] = useState<{
    scope: string;
    issue: PlayerIssue;
  } | null>(null);
  const issue = issueState?.scope === issueScope ? issueState.issue : null;

  const handleIssue = useCallback(
    (nextIssue: PlayerIssue) => {
      setIssueState({ scope: issueScope, issue: nextIssue });
      onError?.(nextIssue);
    },
    [issueScope, onError]
  );

  return (
    <div className="youtube-player-frame relative h-full w-full overflow-hidden rounded-[14px] bg-black">
      {mode === 'plyr' ? (
        <PlyrYouTubePlayer videoId={videoId} title={title} onIssue={handleIssue} />
      ) : (
        <IframeYouTubePlayer videoId={videoId} title={title} onIssue={handleIssue} />
      )}

      {issue?.recoverable ? (
        <div className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-white/90 px-3 py-2 text-sm text-neutral-800 shadow-sm dark:bg-neutral-900/90 dark:text-neutral-100">
          {issue.message}
        </div>
      ) : null}

      {issue && !issue.recoverable ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 px-6 text-center">
          <div className="max-w-sm">
            <div className="text-lg font-semibold text-white">这个视频现在不能在本站播放</div>
            <p className="mt-2 text-sm leading-6 text-neutral-200">{issue.message}</p>
            <button
              className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-pink-900 shadow-sm"
              onClick={onClose}
            >
              返回选择其他视频
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IframeYouTubePlayer({ videoId, title, onIssue }: PlayerImplementationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayerInstance | null = null;
    let playerContainer: HTMLDivElement | null = null;

    loadYouTubeIframeApi()
      .then(() => {
        const container = containerRef.current;
        if (cancelled || !container || !window.YT?.Player) return;

        playerContainer = container;
        player = new window.YT.Player(container, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              setEmbeddedIframeTitle(container, title);
              event.target.playVideo();
            },
            onError: (event) => {
              onIssue(describePlayerIssue(event.data));
            },
            onAutoplayBlocked: () => {
              onIssue(describePlayerIssue('autoplay_blocked'));
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) onIssue(describePlayerIssue('load_failed'));
      });

    return () => {
      cancelled = true;
      player?.destroy();
      if (playerContainer) playerContainer.innerHTML = '';
    };
  }, [onIssue, title, videoId]);

  return <div ref={containerRef} className="w-full h-full" aria-label={title} />;
}

function PlyrYouTubePlayer({ videoId, title, onIssue }: PlayerImplementationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let player: Plyr | null = null;
    let detachErrorListener: (() => void) | null = null;

    async function setup() {
      try {
        const PlyrConstructor = (await import('plyr')).default;
        if (cancelled || !containerRef.current) return;

        const handleError = (event: Event) => {
          const target = event.target as { error?: { code?: number } } | null;
          onIssue(describePlayerIssue(target?.error?.code ?? 'load_failed'));
        };

        player = new PlyrConstructor(containerRef.current, {
          autoplay: true,
          ratio: '16:9',
          storage: { enabled: false },
          keyboard: { focused: true, global: false },
          youtube: {
            noCookie: true,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            widget_referrer: window.location.href,
          },
        });

        player.on('error', handleError);
        detachErrorListener = () => player?.off('error', handleError);

        const playResult = player.play();
        if (playResult) {
          playResult.catch(() => onIssue(describePlayerIssue('autoplay_blocked')));
        }
      } catch {
        if (!cancelled) onIssue(describePlayerIssue('load_failed'));
      }
    }

    void setup();

    return () => {
      cancelled = true;
      detachErrorListener?.();
      player?.destroy();
    };
  }, [onIssue, videoId]);

  return (
    <div ref={containerRef} className="plyr__video-embed w-full h-full" aria-label={title}>
      <iframe
        src={buildYouTubeEmbedUrl(videoId)}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`
    );
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = YOUTUBE_IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function buildYouTubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    playsinline: '1',
    enablejsapi: '1',
    rel: '0',
    iv_load_policy: '3',
  });

  if (typeof window !== 'undefined') {
    params.set('origin', window.location.origin);
  }

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

function setEmbeddedIframeTitle(container: HTMLElement | null, title: string) {
  const iframe = container?.querySelector('iframe');
  if (iframe) iframe.title = title;
}

function describePlayerIssue(code: PlayerIssue['code']): PlayerIssue {
  switch (code) {
    case 'autoplay_blocked':
      return {
        code,
        recoverable: true,
        message: '浏览器阻止了自动播放，请点击播放器上的播放按钮继续。',
      };
    case 'load_failed':
      return {
        code,
        message: '播放器加载失败，请返回后再试一个视频。',
      };
    case 2:
      return {
        code,
        message: '视频地址无效，请返回后再选一个视频。',
      };
    case 5:
      return {
        code,
        message: '这个视频暂时不能用网页播放器播放。',
      };
    case 100:
      return {
        code,
        message: '这个视频已经不可用，可能被删除或设为私密。',
      };
    case 101:
    case 150:
      return {
        code,
        message: '视频发布者不允许它在本站播放。',
      };
    case 153:
      return {
        code,
        message: 'YouTube 没有收到所需的来源信息，请检查 Referer 或 Origin 配置。',
      };
    default:
      return {
        code,
        message: '播放器遇到未知问题，请返回后再试一个视频。',
      };
  }
}
