import type {
  Cue,
  DeckId,
  DeckRole,
  DeckStatus,
  EngineEvent,
  EngineState,
} from '../types/jap';
import {
  calculateEqualPowerGains,
  computeAdaptiveCrossfadeMs,
} from './japSeed';
import { resolveAlternateVideoIdsClient } from './clientApi';
import { backgroundAudio } from './backgroundAudio';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;

export function loadYouTubeIframeApi(timeoutMs = 10000): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window not available'));
  }
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Resolve with null so simulated fallback deck can still operate cleanly if blocked
      resolve(null);
    }, timeoutMs);

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      prevReady?.();
      resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

const YT_ERROR_LABELS: Record<number, string> = {
  2: 'invalid video id',
  5: 'HTML5 player error',
  100: 'video not found or private',
  101: 'embedding disabled by owner',
  150: 'embedding disabled by owner',
};

interface InternalDeck {
  id: DeckId;
  player: any;
  status: DeckStatus;
  role: DeckRole;
  cue: Cue | null;
  idIndex: number;
  playFull: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  volumeFixed: boolean;
  resolvedAlternates: boolean;
  // Fallback clock state when browser blocks unprompted YouTube iframe audio or video is restricted
  usingClockFallback: boolean;
  clockPositionSec: number;
  clockLastTickMs: number;
  clockVolume: number;
}

function createDeckState(id: DeckId): InternalDeck {
  return {
    id,
    player: null,
    status: 'empty',
    role: 'preload',
    cue: null,
    idIndex: 0,
    playFull: false,
    timer: null,
    volumeFixed: false,
    resolvedAlternates: false,
    usingClockFallback: false,
    clockPositionSec: 0,
    clockLastTickMs: 0,
    clockVolume: 100,
  };
}

const fmtClock = (sec: number) => {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export interface PlayerEngineOptions {
  styleHost?: boolean;
  crossfadeDurationMs?: number;
  onDeckChange?: (state: EngineState) => void;
  onEvent?: (ev: EngineEvent) => void;
  onLog?: (msg: string) => void;
}

/**
 * Dual-Deck YouTube Crossfade Engine (JAP Engine).
 * Features:
 * - Dual simultaneous YouTube IFrame instances (Deck A & Deck B)
 * - Background preloading & cueing to `entry_sec` on the standby deck
 * - Equal-power trigonometric crossfade (`sin(s * pi/2)` / `cos(s * pi/2)`) at `exit_sec`
 * - Automatic embeddable Audio/Lyric fallback resolution via `/api/yt-resolve` on Error 101/150
 * - Resilient precision clock fallback if YouTube embed is blocked or headless environment lacks audio codecs
 */
export function stepBackHistoryState(
  history: Cue[],
  liveCue: Cue,
  cuedCue: Cue | null,
  upcoming: Cue[]
): {
  previousCue: Cue | null;
  nextHistory: Cue[];
  nextQueue: Cue[];
} {
  if (history.length === 0) {
    return {
      previousCue: null,
      nextHistory: [],
      nextQueue: [
        ...(cuedCue ? [cuedCue] : []),
        ...upcoming,
      ],
    };
  }
  const nextHistory = history.slice(0, -1);
  const previousCue = history[history.length - 1];
  const combinedQueue = [
    liveCue,
    ...(cuedCue ? [cuedCue] : []),
    ...upcoming,
  ].filter(
    (item, idx, arr) =>
      item.song_id !== previousCue.song_id &&
      arr.findIndex((x) => x.song_id === item.song_id) === idx
  );

  return {
    previousCue,
    nextHistory,
    nextQueue: combinedQueue,
  };
}

export class PlayerEngine {
  host: HTMLElement | null;
  opts: PlayerEngineOptions;
  decks: { A: InternalDeck; B: InternalDeck } = {
    A: createDeckState('A'),
    B: createDeckState('B'),
  };
  queue: Cue[] = [];
  history: Cue[] = [];
  nextIndex = 0;
  liveId: DeckId | null = null;
  crossfading = false;
  crossfadeProgress = 0;
  crossfadeDurationMs = 2200;
  activeCrossfadeMs = 2200;
  smoothnessAlpha = 0.65;
  paused = false;
  pauseAfterFade = false;
  endingSet = false;
  reversingTransition = false;
  awaitingStart: DeckId | null = null;
  pendingHandoff: string | null = null;
  pendingStartCues: Cue[] | null = null;
  ready = false;
  started = false;
  finished = false;
  destroyed = false;
  tickTimer: ReturnType<typeof setInterval> | null = null;
  fadeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(host: HTMLElement | null, opts: PlayerEngineOptions = {}) {
    this.host = host;
    this.opts = opts;
    if (opts.crossfadeDurationMs) {
      this.crossfadeDurationMs = opts.crossfadeDurationMs;
      this.activeCrossfadeMs = opts.crossfadeDurationMs;
    }
  }

  setCrossfadeDuration(ms: number) {
    this.crossfadeDurationMs = Math.max(500, Math.min(8000, ms));
    this.activeCrossfadeMs = this.crossfadeDurationMs;
    this.emit();
  }

  setSmoothnessAlpha(alpha: number) {
    this.smoothnessAlpha = Math.max(0, Math.min(1, alpha));
    this.emit();
  }

  async init(): Promise<void> {
    const YT = await loadYouTubeIframeApi(6000);
    if (this.destroyed) return;

    if (this.host && this.opts.styleHost !== false) {
      Object.assign(this.host.style, {
        position: 'fixed',
        left: '0',
        bottom: '0',
        width: '320px',
        height: '180px',
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '-1',
        overflow: 'hidden',
      });
    }

    if (YT && this.host) {
      await Promise.all([
        this.createPlayer(YT, this.decks.A),
        this.createPlayer(YT, this.decks.B),
      ]);
    }

    if (this.destroyed) return;
    this.ready = true;
    this.tickTimer = setInterval(() => this.tick(), 200);
    this.log('Both players ready.');

    backgroundAudio.init();
    backgroundAudio.setHandlers({
      onPlay: () => this.resume(),
      onPause: () => this.pause(),
      onPrevious: () => this.previous(),
      onNext: () => this.skip(),
      onSeek: (sec) => this.seek(sec),
    });

    this.emit();

    if (this.pendingStartCues) {
      const toStart = this.pendingStartCues;
      this.pendingStartCues = null;
      this.start(toStart);
    }
  }

  private createPlayer(YT: any, deck: InternalDeck): Promise<void> {
    return new Promise((resolve) => {
      if (!this.host) {
        resolve();
        return;
      }
      const el = document.createElement('div');
      el.id = `jap-deck-${deck.id}`;
      this.host.appendChild(el);

      const timeout = setTimeout(() => {
        resolve();
      }, 4500);

      try {
        deck.player = new YT.Player(el, {
          width: '320',
          height: '180',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              clearTimeout(timeout);
              resolve();
            },
            onStateChange: (ev: any) => this.onStateChange(deck, ev.data),
            onError: (ev: any) => this.onError(deck, ev.data),
          },
        });
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  start(cues: Cue[]) {
    if (!this.ready) {
      this.pendingStartCues = cues.slice();
      return;
    }
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.clearTimer(this.decks.A);
    this.clearTimer(this.decks.B);
    this.started = true;
    this.finished = false;
    this.paused = false;
    this.pauseAfterFade = false;
    this.endingSet = false;
    this.crossfading = false;
    this.crossfadeProgress = 0;
    this.reversingTransition = false;
    this.awaitingStart = null;
    this.pendingHandoff = null;
    this.queue = cues.slice();
    this.history = [];
    this.nextIndex = 0;

    const first = this.takeNextCue();
    if (!first) {
      this.finish('Queue is empty, nothing to play.');
      return;
    }

    backgroundAudio.startKeepAlive();

    const deckA = this.decks.A;
    this.liveId = 'A';
    this.assign(deckA, first);
    this.load(deckA, 'live');
    this.preloadNext(this.decks.B);
  }

  skip() {
    const live = this.liveDeck();
    if (!this.started || this.finished || !live?.cue) return;
    if (this.crossfading || this.awaitingStart) {
      this.log('Skip ignored: already changing tracks.');
      return;
    }
    if (this.paused) this.paused = false;
    this.reversingTransition = false;
    const at = live.status === 'live' ? this.getDeckTime(live) : 0;
    this.log(`SKIP ${live.cue.song_id} at ${at.toFixed(1)}s`);
    this.event({ type: 'skip', cue: live.cue, at });
    this.requestHandoff('skip');
  }

  previous() {
    const live = this.liveDeck();
    if (!this.started || this.finished || !live?.cue) return;
    if (this.crossfading || this.awaitingStart) {
      this.log('Previous ignored: already changing tracks.');
      return;
    }
    if (this.paused) {
      this.paused = false;
      live.clockLastTickMs = performance.now();
      try {
        live.player?.playVideo?.();
      } catch {
        // ignore
      }
    }

    const at = live.status === 'live' ? this.getDeckTime(live) : 0;

    // If there is no prior track in history (we are on track 1), rewind current track to its hook entry
    if (this.history.length === 0) {
      const targetStart = this.startSecondsOf(live.cue);
      live.playFull = live.cue.play_full;
      this.log(`PREV (rewind to hook start) ${live.cue.song_id} -> ${targetStart}s`);
      this.seek(targetStart);
      return;
    }

    const other = this.otherDeck(live.id);
    const stepped = stepBackHistoryState(
      this.history,
      live.cue,
      other.cue,
      this.upcoming()
    );
    if (!stepped.previousCue) return;

    this.history = stepped.nextHistory;
    this.queue = stepped.nextQueue;
    this.nextIndex = 0;
    this.reversingTransition = true;

    this.clearTimer(other);
    try {
      other.player?.pauseVideo?.();
      other.player?.mute?.();
    } catch {
      // ignore
    }

    this.log(
      `PREV ${live.cue.song_id} -> ${stepped.previousCue.song_id} at ${at.toFixed(1)}s`
    );
    this.event({
      type: 'previous',
      cue: stepped.previousCue,
      fromCue: live.cue,
      at,
    });

    this.pendingHandoff = 'previous';
    this.assign(other, stepped.previousCue);
    this.load(other, 'preload');
  }

  seek(targetSec: number) {
    const live = this.liveDeck();
    if (
      !live?.cue ||
      live.status !== 'live' ||
      this.finished ||
      this.crossfading ||
      this.awaitingStart
    ) {
      return;
    }
    const dur = this.getDeckDuration(live);
    const clamped = Math.max(0, Math.min(targetSec, dur > 0 ? dur - 3 : targetSec));
    const from = this.getDeckTime(live);
    const cut = this.cutPoint(live);

    if (Number.isFinite(cut) && clamped >= cut - 3) {
      live.playFull = true;
      if (this.pendingHandoff === 'exit') {
        this.pendingHandoff = null;
      }
    }

    live.clockPositionSec = clamped;
    live.clockLastTickMs = performance.now();
    try {
      live.player?.seekTo?.(clamped, true);
    } catch {
      // Fallback clock updated
    }

    this.log(
      `SEEK ${live.cue.song_id} ${from.toFixed(1)}s -> ${clamped.toFixed(1)}s${
        live.playFull ? ' (now playing full)' : ''
      }`
    );
    this.event({
      type: 'seek',
      cue: live.cue,
      from,
      to: clamped,
      playFull: live.playFull,
    });
    this.emit();
  }

  playFullCurrent() {
    const live = this.liveDeck();
    if (!live?.cue || this.finished || live.playFull) return;
    live.playFull = true;
    if (this.pendingHandoff === 'exit' && !this.awaitingStart) {
      this.pendingHandoff = null;
    }
    this.log(`Playing ${live.cue.title} in full.`);
    this.event({
      type: 'playfull',
      cue: live.cue,
      at: this.getDeckTime(live),
    });
    this.emit();
  }

  pause() {
    const live = this.liveDeck();
    if (!this.started || this.finished || this.paused || !live?.cue) return;
    if (this.crossfading || this.awaitingStart) {
      this.pauseAfterFade = true;
      this.emit();
      return;
    }
    if (live.status !== 'live') return;
    try {
      live.player?.pauseVideo?.();
    } catch {
      // ignore
    }
    this.paused = true;
    backgroundAudio.pauseKeepAlive();
    const at = this.getDeckTime(live);
    this.log(`PAUSE ${live.cue.song_id} at ${at.toFixed(1)}s`);
    this.event({ type: 'paused', cue: live.cue, at });
    this.emit();
  }

  resume() {
    this.pauseAfterFade = false;
    const live = this.liveDeck();
    if (!this.paused || !live?.cue) return;
    this.paused = false;
    backgroundAudio.resumeKeepAlive();
    live.clockLastTickMs = performance.now();
    try {
      live.player?.playVideo?.();
    } catch {
      // ignore
    }
    const at = this.getDeckTime(live);
    this.log(`RESUME ${live.cue.song_id} at ${at.toFixed(1)}s`);
    this.event({ type: 'resumed', cue: live.cue, at });
    this.emit();
    if (this.pendingHandoff && !this.awaitingStart) {
      this.requestHandoff(this.pendingHandoff);
    }
  }

  requeue(cues: Cue[]) {
    if (!this.started || this.finished || this.endingSet) return;
    this.queue = cues;
    this.nextIndex = 0;
    const live = this.liveDeck();
    if (!live || this.crossfading || this.awaitingStart) return;
    const other = this.otherDeck(live.id);
    if (other.cue && cues[0]?.song_id === other.cue.song_id) {
      this.nextIndex = 1;
      return;
    }
    this.clearTimer(other);
    try {
      other.player?.pauseVideo?.();
      other.player?.mute?.();
    } catch {
      // ignore
    }
    this.log(
      `Requeued: ${cues.length} songs; next up ${cues[0]?.title ?? 'nothing'}`
    );
    this.preloadNext(other);
  }

  dropNext(): Cue | null {
    const live = this.liveDeck();
    if (
      !live ||
      this.finished ||
      this.endingSet ||
      this.crossfading ||
      this.awaitingStart
    ) {
      return null;
    }
    const other = this.otherDeck(live.id);
    const dropped = other.cue;
    if (!dropped) return null;
    this.clearTimer(other);
    try {
      other.player?.pauseVideo?.();
      other.player?.mute?.();
    } catch {
      // ignore
    }
    this.log(`Dropped from the queue: ${dropped.title}`);
    this.preloadNext(other);
    return dropped;
  }

  playNext(cue: Cue) {
    this.playNextBatch([cue]);
  }

  playNextBatch(cuesToInsert: Cue[]): number {
    const live = this.liveDeck();
    if (!live || this.finished || cuesToInsert.length === 0) return 0;
    const currentFull = this.getFullUpcomingQueue();
    const combined = [...cuesToInsert, ...currentFull].filter(
      (item, idx, arr) =>
        arr.findIndex((x) => x.song_id === item.song_id) === idx &&
        item.song_id !== live.cue?.song_id
    );
    this.requeue(combined);
    this.emit();
    return cuesToInsert.length;
  }

  appendToQueue(cuesToAppend: Cue[]): number {
    const live = this.liveDeck();
    if (!live || this.finished || cuesToAppend.length === 0) return 0;
    const currentFull = this.getFullUpcomingQueue();
    const existingIds = new Set([
      ...(live.cue ? [live.cue.song_id] : []),
      ...currentFull.map((c) => c.song_id),
    ]);
    const uniqueNew = cuesToAppend.filter((c) => !existingIds.has(c.song_id));
    const toAdd = uniqueNew.length > 0 ? uniqueNew : cuesToAppend;

    // If standby deck is currently empty, requeue so standby deck preloads immediately
    const other = this.otherDeck(live.id);
    if (!other.cue || other.status === 'empty') {
      this.requeue([...currentFull, ...toAdd]);
    } else {
      this.queue = [...this.queue, ...toAdd];
    }
    this.log(`Appended ${toAdd.length} song(s) to queue.`);
    this.emit();
    return toAdd.length;
  }

  reorderUpcomingQueue(newUpcomingOrder: Cue[]) {
    const live = this.liveDeck();
    if (!live || this.finished) return;
    const cleaned = newUpcomingOrder.filter(
      (item, idx, arr) =>
        item.song_id !== live.cue?.song_id &&
        arr.findIndex((x) => x.song_id === item.song_id) === idx
    );
    this.requeue(cleaned);
    this.emit();
  }

  removeFromQueue(songId: string) {
    const live = this.liveDeck();
    if (!live || this.finished) return;
    const other = this.otherDeck(live.id);
    if (other.cue?.song_id === songId) {
      this.dropNext();
      return;
    }
    const updated = this.getFullUpcomingQueue().filter(
      (c) => c.song_id !== songId
    );
    this.requeue(updated);
    this.emit();
  }

  getFullUpcomingQueue(): Cue[] {
    const live = this.liveDeck();
    if (!live) return this.upcoming();
    const other = this.otherDeck(live.id);
    const tail = this.upcoming();
    if (other.cue && other.status !== 'empty') {
      return [
        other.cue,
        ...tail.filter((c) => c.song_id !== other.cue?.song_id),
      ];
    }
    return tail;
  }

  upcoming(): Cue[] {
    return this.queue.slice(this.nextIndex);
  }

  togglePause() {
    if (this.paused || this.pauseAfterFade) {
      this.resume();
    } else {
      this.pause();
    }
  }

  getState(): EngineState {
    const snap = (d: InternalDeck) => ({
      id: d.id,
      status: d.status,
      cue: d.cue,
      videoId: d.cue ? d.cue.youtube_ids[d.idIndex] ?? null : null,
      playFull: d.playFull,
    });
    return {
      live: this.liveId,
      crossfading: this.crossfading,
      crossfadeProgress: this.crossfadeProgress,
      activeCrossfadeMs: this.activeCrossfadeMs,
      smoothnessAlpha: this.smoothnessAlpha,
      paused: this.paused || this.pauseAfterFade,
      finished: this.finished,
      canGoPrevious: this.history.length > 0,
      previousCue:
        this.history.length > 0 ? this.history[this.history.length - 1] : null,
      queue: this.getFullUpcomingQueue(),
      history: this.history.slice(),
      decks: {
        A: snap(this.decks.A),
        B: snap(this.decks.B),
      },
    };
  }

  getCutAt(): number | null {
    const live = this.liveDeck();
    if (!live?.cue || live.status !== 'live') return null;
    const c = this.cutPoint(live);
    return Number.isFinite(c) ? c : null;
  }

  getPosition(): { seconds: number; duration: number } | null {
    const live = this.liveDeck();
    if (!live?.cue || live.status !== 'live') return null;
    return {
      seconds: this.getDeckTime(live),
      duration: this.getDeckDuration(live),
    };
  }

  private getDeckTime(deck: InternalDeck): number {
    if (!deck.cue) return 0;
    if (!deck.usingClockFallback && deck.player && typeof deck.player.getCurrentTime === 'function') {
      try {
        const ytTime = deck.player.getCurrentTime();
        const ytState = deck.player.getPlayerState?.();
        if (typeof ytTime === 'number' && ytTime > 0 && ytState === 1) {
          deck.clockPositionSec = ytTime;
          deck.clockLastTickMs = performance.now();
          return ytTime;
        }
      } catch {
        // use clock fallback
      }
    }
    return deck.clockPositionSec;
  }

  private getDeckDuration(deck: InternalDeck): number {
    if (!deck.cue) return 0;
    if (!deck.usingClockFallback && deck.player && typeof deck.player.getDuration === 'function') {
      try {
        const d = deck.player.getDuration();
        if (typeof d === 'number' && d > 0) return d;
      } catch {
        // ignore
      }
    }
    return deck.cue.duration_sec;
  }

  destroy() {
    this.destroyed = true;
    backgroundAudio.pauseKeepAlive();
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    for (const d of Object.values(this.decks)) {
      this.clearTimer(d);
      try {
        d.player?.destroy?.();
      } catch {
        // ignore
      }
      d.player = null;
    }
    if (this.host) {
      this.host.innerHTML = '';
    }
  }

  private onStateChange(deck: InternalDeck, stateCode: number) {
    if (this.destroyed || !deck.cue) return;
    if (stateCode === 1) {
      // YT.PlayerState.PLAYING
      deck.usingClockFallback = false;
      this.clearTimer(deck);
      deck.clockLastTickMs = performance.now();
      if (deck.role === 'live') {
        try {
          deck.player?.unMute?.();
          deck.player?.setVolume?.(100);
        } catch {
          // ignore
        }
      }
      if (this.awaitingStart === deck.id) {
        this.startFade(deck);
        return;
      }
      if (deck.role === 'preload' && this.liveId !== deck.id) {
        try {
          deck.player?.pauseVideo?.();
          deck.player?.seekTo?.(this.startSecondsOf(deck.cue), true);
        } catch {
          // ignore
        }
        deck.status = 'ready';
        this.log(`Deck ${deck.id} cued: ${deck.cue.title}`);
        this.emit();
        if (this.pendingHandoff) {
          this.requestHandoff(this.pendingHandoff);
        }
        return;
      }
      if (deck.role === 'live') {
        const wasLive = deck.status === 'live';
        deck.status = 'live';
        if (!wasLive) {
          this.log(`Deck ${deck.id} live: ${deck.cue.title}`);
          this.event({ type: 'live', deck: deck.id, cue: deck.cue });
        }
        this.emit();
        return;
      }
    }

    if (stateCode === 3) {
      // YT.PlayerState.BUFFERING - player is actively fetching video stream from YouTube
      this.clearTimer(deck);
      deck.timer = setTimeout(() => {
        this.activateClockFallbackForDeck(deck);
      }, 12000);
      return;
    }

    if (stateCode === -1 || stateCode === 5) {
      // Unstarted or Cued: if this deck is live, ensure it starts playing
      if (deck.role === 'live' && !this.paused && !this.destroyed) {
        try {
          deck.player?.playVideo?.();
        } catch {
          // ignore
        }
      }
    }

    if (
      stateCode === 0 &&
      deck.id === this.liveId &&
      deck.status === 'live' &&
      !this.crossfading
    ) {
      this.log(`${deck.cue.title} ended.`);
      if (this.pendingHandoff || this.awaitingStart) {
        this.pendingHandoff = 'ended';
      } else {
        this.requestHandoff('ended');
      }
    }
  }

  private onError(deck: InternalDeck, errCode: number) {
    if (this.destroyed || !deck.cue) return;
    const vid = deck.cue.youtube_ids[deck.idIndex];
    this.log(
      `Deck ${deck.id} error ${errCode} (${
        YT_ERROR_LABELS[errCode] ?? 'unknown'
      }) on ${deck.cue.title} [${vid}]`
    );
    // 1. Try next preloaded youtube_id if available
    if (deck.idIndex + 1 < deck.cue.youtube_ids.length) {
      this.nextSource(deck);
      return;
    }
    // 2. If all initial youtube_ids failed with embed restriction (101/150) or not found (100),
    // dynamically query /api/yt-resolve once for embeddable official audio / lyric video IDs
    if (!deck.resolvedAlternates) {
      deck.resolvedAlternates = true;
      this.resolveAndRetryAlternates(deck);
      return;
    }
    // 3. If restricted from embedding (101/150) or unavailable (100) and no alternate sources exist:
    // Seamlessly skip to next track in queue instead of getting stuck in dead silence!
    if (errCode === 101 || errCode === 150 || errCode === 100) {
      this.log(
        `Track ${deck.cue.title} unavailable for embedding (${YT_ERROR_LABELS[errCode] ?? errCode}), advancing to next track`
      );
      this.event({ type: 'unavailable', cue: deck.cue });
      if (deck.role === 'live') {
        this.requestHandoff('skip');
      } else {
        this.preloadNext(deck);
      }
      return;
    }
    // 4. Otherwise engage precision clock fallback so the party never stops
    this.activateClockFallbackForDeck(deck);
  }

  private async resolveAndRetryAlternates(deck: InternalDeck) {
    const cueAtStart = deck.cue;
    if (!cueAtStart || this.destroyed) return;
    try {
      let alternateVideoIds: string[] = [];
      try {
        const resp = await fetch('/api/yt-resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            videoId: cueAtStart.youtube_ids[0],
            title: cueAtStart.title,
            artist: cueAtStart.artist,
            excludeIds: cueAtStart.youtube_ids,
          }),
        });
        const data = await resp.json();
        if (
          data?.ok &&
          Array.isArray(data.alternateVideoIds) &&
          data.alternateVideoIds.length > 0
        ) {
          alternateVideoIds = data.alternateVideoIds;
        }
      } catch {
        // Fall back to client-side resolution when running serverless on GitHub Pages
      }

      if (alternateVideoIds.length === 0) {
        const clientRes = resolveAlternateVideoIdsClient({
          videoId: cueAtStart.youtube_ids[0],
          title: cueAtStart.title,
          artist: cueAtStart.artist,
          excludeIds: cueAtStart.youtube_ids,
        });
        alternateVideoIds = clientRes.alternateVideoIds;
      }

      if (this.destroyed || deck.cue !== cueAtStart) return;
      if (alternateVideoIds.length > 0) {
        for (const altId of alternateVideoIds) {
          if (!cueAtStart.youtube_ids.includes(altId)) {
            cueAtStart.youtube_ids.push(altId);
          }
        }
        this.nextSource(deck);
        return;
      }
    } catch {
      // ignore network error and fall back below
    }
    if (!this.destroyed && deck.cue === cueAtStart) {
      this.activateClockFallbackForDeck(deck);
    }
  }

  private activateClockFallbackForDeck(deck: InternalDeck) {
    if (this.destroyed || !deck.cue) return;
    this.clearTimer(deck);
    deck.usingClockFallback = true;
    deck.clockPositionSec = this.startSecondsOf(deck.cue);
    deck.clockLastTickMs = performance.now();

    if (this.awaitingStart === deck.id) {
      this.startFade(deck);
      return;
    }
    if (deck.role === 'preload') {
      deck.status = 'ready';
      this.log(`Deck ${deck.id} cued: ${deck.cue.title}`);
      this.emit();
      if (this.pendingHandoff) {
        this.requestHandoff(this.pendingHandoff);
      }
    } else if (deck.role === 'live') {
      deck.status = 'live';
      this.log(`Deck ${deck.id} live: ${deck.cue.title}`);
      this.event({ type: 'live', deck: deck.id, cue: deck.cue });
      this.emit();
    }
  }

  private assign(deck: InternalDeck, cue: Cue) {
    deck.cue = cue;
    deck.idIndex = 0;
    deck.playFull = cue.play_full;
    deck.volumeFixed = false;
    deck.resolvedAlternates = false;
    deck.usingClockFallback = false;
    deck.clockPositionSec = this.startSecondsOf(cue);
    deck.clockLastTickMs = performance.now();
  }

  private load(deck: InternalDeck, role: DeckRole) {
    const cue = deck.cue;
    if (!cue) return;
    const vid = cue.youtube_ids[deck.idIndex];
    this.clearTimer(deck);
    deck.status = 'loading';
    deck.role = role;
    deck.clockPositionSec = this.startSecondsOf(cue);
    deck.clockLastTickMs = performance.now();

    if (deck.player && typeof deck.player.loadVideoById === 'function') {
      try {
        if (role === 'preload') {
          deck.player.mute?.();
          deck.player.setVolume?.(0);
        } else {
          deck.player.unMute?.();
          deck.player.setVolume?.(100);
        }
        deck.player.loadVideoById({
          videoId: vid,
          startSeconds: this.startSecondsOf(cue),
        });
      } catch {
        // Fallback timer will handle
      }
    }

    // Use a 4000ms preload window when stepping back to a previous song, otherwise 12000ms to allow buffering
    const preloadWaitMs = this.pendingHandoff === 'previous' ? 4000 : 12000;
    deck.timer = setTimeout(() => {
      this.activateClockFallbackForDeck(deck);
    }, preloadWaitMs);

    this.emit();
  }

  private nextSource(deck: InternalDeck) {
    this.clearTimer(deck);
    const cue = deck.cue;
    if (!cue) return;
    deck.idIndex += 1;
    if (deck.idIndex < cue.youtube_ids.length) {
      this.log(
        `Deck ${deck.id} trying source ${deck.idIndex + 1}/${
          cue.youtube_ids.length
        } for ${cue.title}`
      );
      this.load(deck, deck.role);
      return;
    }
    this.activateClockFallbackForDeck(deck);
  }

  private preloadNext(deck: InternalDeck) {
    const next = this.takeNextCue();
    if (!next) {
      deck.status = 'empty';
      deck.cue = null;
      this.emit();
      if (this.pendingHandoff === 'ended' || this.pendingHandoff === 'error') {
        this.finish('End of queue.');
      }
      this.pendingHandoff = null;
      return;
    }
    this.assign(deck, next);
    this.load(deck, 'preload');
  }

  private takeNextCue(): Cue | null {
    return this.nextIndex < this.queue.length
      ? this.queue[this.nextIndex++]
      : null;
  }

  private startSecondsOf(cue: Cue): number {
    return cue.play_full ? 0 : cue.entry_sec;
  }

  private tick() {
    if (this.destroyed) return;
    this.keepLiveAudible();
    if (this.destroyed || this.finished || this.paused || this.endingSet) return;

    // Advance fallback clock for any live deck
    const live = this.liveDeck();
    if (live && live.status === 'live' && live.cue) {
      const now = performance.now();
      const dt = Math.max(0, (now - live.clockLastTickMs) / 1000);
      live.clockLastTickMs = now;
      if (live.usingClockFallback || (live.player?.getPlayerState?.() ?? -1) !== 1) {
        live.clockPositionSec = Math.min(
          live.cue.duration_sec,
          live.clockPositionSec + dt
        );
      }
      backgroundAudio.updateMediaSession(
        live.cue,
        this.paused,
        live.clockPositionSec,
        live.cue.duration_sec
      );
    }

    if (this.crossfading || this.awaitingStart || this.pendingHandoff) return;
    if (!live?.cue || live.status !== 'live') return;

    const pos = this.getDeckTime(live);
    const cut = this.cutPoint(live);

    if (pos >= cut && this.otherDeck(live.id).status === 'empty') {
      this.log(`Ending the set: ${live.cue.title} at ${fmtClock(pos)}`);
      this.endSetWithFade(live);
      return;
    }

    if (pos >= cut) {
      this.log(`Cutting ${live.cue.title} at ${fmtClock(pos)}`);
      this.event({ type: 'cut', cue: live.cue, at: pos });
      this.requestHandoff('exit');
    }
  }

  private keepLiveAudible() {
    if (
      this.finished ||
      this.paused ||
      this.endingSet ||
      this.crossfading ||
      this.awaitingStart
    ) {
      return;
    }
    const live = this.liveDeck();
    const p = live?.player;
    if (!live || !p || live.status !== 'live' || typeof p.getVolume !== 'function') {
      return;
    }
    try {
      const muted = p.isMuted();
      const vol = p.getVolume();
      if (muted || !(vol >= 100)) {
        if (!live.volumeFixed) {
          this.log(
            `Volume fix on ${live.cue?.title}: was ${muted ? 'muted' : vol}`
          );
        }
        live.volumeFixed = true;
        p.unMute();
        p.setVolume(100);
      }
    } catch {
      // ignore
    }
  }

  private cutPoint(deck: InternalDeck): number {
    const dur = this.getDeckDuration(deck);
    const safeEnd = dur > 0 ? dur - 1.5 : Infinity;
    const exitSec = deck.cue?.exit_sec ?? null;
    return deck.playFull || exitSec === null ? safeEnd : Math.min(exitSec, safeEnd);
  }

  private requestHandoff(reason: string) {
    if (this.finished || this.crossfading || this.awaitingStart) return;
    if (this.paused) {
      this.pendingHandoff = reason;
      return;
    }
    const incoming = this.liveId ? this.otherDeck(this.liveId) : this.decks.B;
    if (incoming.status === 'ready') {
      this.startIncoming(incoming, reason);
    } else if (incoming.status === 'loading') {
      this.pendingHandoff = reason;
      this.log(`Next track still loading; holding current (${reason}).`);
      const live = this.liveDeck();
      if (live?.cue && live.status === 'live') {
        this.event({ type: 'holding', cue: live.cue });
      }
    } else if (reason !== 'exit') {
      const live = this.liveDeck();
      try {
        live?.player?.pauseVideo?.();
      } catch {
        // ignore
      }
      this.finish('End of queue.');
    }
  }

  private startIncoming(deck: InternalDeck, reason: string) {
    this.pendingHandoff = reason;
    this.awaitingStart = deck.id;

    if (deck.player) {
      try {
        deck.player.seekTo?.(deck.cue ? this.startSecondsOf(deck.cue) : 0, true);
        deck.player.setVolume?.(0);
        deck.player.unMute?.();
        deck.player.playVideo?.();
      } catch {
        // fallback below
      }
    }

    if (deck.usingClockFallback || !deck.player) {
      deck.clockPositionSec = deck.cue ? this.startSecondsOf(deck.cue) : 0;
      deck.clockLastTickMs = performance.now();
      this.startFade(deck);
      return;
    }

    deck.timer = setTimeout(() => {
      deck.usingClockFallback = true;
      deck.clockPositionSec = deck.cue ? this.startSecondsOf(deck.cue) : 0;
      deck.clockLastTickMs = performance.now();
      this.startFade(deck);
    }, 1000);
  }

  private startFade(incoming: InternalDeck) {
    this.clearTimer(incoming);
    this.awaitingStart = null;
    this.pendingHandoff = null;
    const outgoing = this.liveDeck();

    if (
      !this.reversingTransition &&
      outgoing?.cue &&
      outgoing.cue.song_id !== incoming.cue?.song_id
    ) {
      const lastInHistory = this.history[this.history.length - 1];
      if (!lastInHistory || lastInHistory.song_id !== outgoing.cue.song_id) {
        this.history.push(outgoing.cue);
      }
    }
    this.reversingTransition = false;

    incoming.status = 'live';
    incoming.role = 'live';
    incoming.clockLastTickMs = performance.now();
    this.liveId = incoming.id;
    this.crossfading = true;
    this.crossfadeProgress = 0;

    if (incoming.cue) {
      this.log(`Crossfading into ${incoming.cue.title} on deck ${incoming.id}`);
      this.event({ type: 'live', deck: incoming.id, cue: incoming.cue });
    }
    this.emit();

    const startTime = performance.now();
    const fadeMs = computeAdaptiveCrossfadeMs(
      outgoing?.cue ?? null,
      incoming.cue ?? null,
      this.crossfadeDurationMs
    );
    this.activeCrossfadeMs = fadeMs;
    const outEnergy = outgoing?.cue?.energy ?? 7;
    const inEnergy = incoming.cue?.energy ?? 7;

    if (this.fadeTimer) clearInterval(this.fadeTimer);

    this.fadeTimer = setInterval(() => {
      const s = Math.min(1, (performance.now() - startTime) / fadeMs);
      this.crossfadeProgress = s;
      const gains = calculateEqualPowerGains(
        s,
        this.smoothnessAlpha,
        outEnergy,
        inEnergy
      );
      const inVol = gains.incomingVolume;
      const outVol = gains.outgoingVolume;

      incoming.clockVolume = inVol;
      try {
        incoming.player?.setVolume?.(inVol);
      } catch {
        // ignore
      }

      if (outgoing && outgoing !== incoming) {
        outgoing.clockVolume = outVol;
        try {
          outgoing.player?.setVolume?.(outVol);
        } catch {
          // ignore
        }
      }

      this.emit();

      if (s >= 1) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        this.crossfadeProgress = 0;
        this.endFade(outgoing && outgoing !== incoming ? outgoing : null);
      }
    }, 25);
  }

  private endFade(outgoing: InternalDeck | null) {
    this.crossfading = false;
    const live = this.liveDeck();
    if (live) {
      live.clockVolume = 100;
      try {
        live.player?.unMute?.();
        live.player?.setVolume?.(100);
      } catch {
        // ignore
      }
    }

    if (this.pauseAfterFade) {
      this.pauseAfterFade = false;
      queueMicrotask(() => this.pause());
    }

    if (outgoing) {
      try {
        outgoing.player?.pauseVideo?.();
        outgoing.player?.mute?.();
      } catch {
        // ignore
      }
      outgoing.status = 'empty';
      outgoing.cue = null;
      this.emit();
      this.preloadNext(outgoing);
    } else {
      this.emit();
    }
  }

  private endSetWithFade(live: InternalDeck) {
    this.endingSet = true;
    const startTime = performance.now();
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = setInterval(() => {
      if (this.paused) return;
      const s = Math.min(1, (performance.now() - startTime) / 3000);
      const vol = Math.round(100 * Math.cos((s * Math.PI) / 2));
      live.clockVolume = vol;
      try {
        live.player?.setVolume?.(vol);
      } catch {
        // ignore
      }
      if (s >= 1) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        try {
          live.player?.pauseVideo?.();
        } catch {
          // ignore
        }
        this.finish('End of set.');
      }
    }, 40);
  }

  private finish(msg: string) {
    if (this.finished) return;
    this.finished = true;
    this.pendingHandoff = null;
    this.log(msg);
    this.event({ type: 'finished' });
    this.emit();
  }

  private liveDeck(): InternalDeck | null {
    return this.liveId ? this.decks[this.liveId] : null;
  }

  private otherDeck(id: DeckId): InternalDeck {
    return this.decks[id === 'A' ? 'B' : 'A'];
  }

  private clearTimer(deck: InternalDeck) {
    if (deck.timer) clearTimeout(deck.timer);
    deck.timer = null;
  }

  private emit() {
    if (this.destroyed) return;
    if (this.host) {
      this.host.dataset.live = this.liveId ?? '';
    }
    this.opts.onDeckChange?.(this.getState());
  }

  private log(msg: string) {
    if (!this.destroyed) {
      this.opts.onLog?.(msg);
    }
  }

  private event(ev: EngineEvent) {
    if (!this.destroyed) {
      this.opts.onEvent?.(ev);
    }
  }
}
