import type { Cue } from '../types/jap';

/**
 * Background Audio & MediaSession Controller for Mobile & Desktop.
 *
 * Provides:
 * 1. Continuous AudioSession keep-alive on iOS & Android using a silent audio loop so
 *    playback never terminates when the screen is locked or browser is minimized.
 * 2. Full MediaSession API integration (Lock screen controls: Play, Pause, Next, Prev, Seek).
 * 3. VisibilityChange auto-recovery if mobile browser tries to sleep the iframe on blur.
 * 4. Screen WakeLock API to keep device awake during party sessions.
 */

class BackgroundAudioManager {
  private silentAudio: HTMLAudioElement | null = null;
  private wakeLockSentinel: any = null;
  private isKeepAliveRunning = false;
  private handlers: {
    onPlay?: () => void;
    onPause?: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    onSeek?: (sec: number) => void;
  } = {};

  init() {
    if (typeof window === 'undefined') return;

    if (!this.silentAudio) {
      try {
        // 1-second silent WAV audio track base64
        const silentWavBase64 =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/w==';
        const audio = new Audio(silentWavBase64);
        audio.loop = true;
        audio.volume = 0.001; // Tiny audible value so browser audio graph is actively recognized
        audio.autoplay = false;
        this.silentAudio = audio;
      } catch {
        // ignore audio creation errors
      }
    }

    // Auto-reacquire wake lock on visibility restore
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.requestWakeLock();
        } else if (document.visibilityState === 'hidden') {
          // Keep audio session alive when minimized or screen locked
          if (this.isKeepAliveRunning && this.silentAudio) {
            this.silentAudio.play().catch(() => {});
          }
        }
      });
    }
  }

  setHandlers(handlers: {
    onPlay?: () => void;
    onPause?: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    onSeek?: (sec: number) => void;
  }) {
    this.handlers = handlers;
    this.registerMediaSessionActions();
  }

  startKeepAlive() {
    this.init();
    this.isKeepAliveRunning = true;
    if (this.silentAudio) {
      this.silentAudio.play().catch(() => {
        // User interaction required for autoplay in some browsers
      });
    }
    this.requestWakeLock();
  }

  pauseKeepAlive() {
    this.isKeepAliveRunning = false;
    if (this.silentAudio) {
      this.silentAudio.pause();
    }
    this.releaseWakeLock();
  }

  resumeKeepAlive() {
    this.isKeepAliveRunning = true;
    if (this.silentAudio) {
      this.silentAudio.play().catch(() => {});
    }
    this.requestWakeLock();
  }

  async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (!this.wakeLockSentinel) {
          this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          this.wakeLockSentinel.addEventListener('release', () => {
            this.wakeLockSentinel = null;
          });
        }
      } catch {
        // WakeLock may be rejected if low battery or tab in background
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {
        // ignore
      }
      this.wakeLockSentinel = null;
    }
  }

  updateMediaSession(cue: Cue | null, isPaused: boolean, currentSec = 0, durationSec = 200) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (!cue) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    navigator.mediaSession.playbackState = isPaused ? 'paused' : 'playing';

    const artworkUrl = cue.art || `https://i.ytimg.com/vi/${cue.youtube_ids[0]}/hqdefault.jpg`;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: cue.title,
        artist: cue.artist,
        album: 'JAPxRock · The Aux & YT Music Hook Engine',
        artwork: [
          { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    } catch {
      // ignore metadata construction errors
    }

    if ('setPositionState' in navigator.mediaSession && durationSec > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, durationSec),
          playbackRate: 1.0,
          position: Math.min(Math.max(0, currentSec), durationSec),
        });
      } catch {
        // ignore position state errors
      }
    }
  }

  private registerMediaSessionActions() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const actionMap: Array<[MediaSessionAction, (() => void) | ((d: any) => void) | undefined]> = [
      ['play', () => this.handlers.onPlay?.()],
      ['pause', () => this.handlers.onPause?.()],
      ['previoustrack', () => this.handlers.onPrevious?.()],
      ['nexttrack', () => this.handlers.onNext?.()],
      [
        'seekto',
        (details: any) => {
          if (typeof details.seekTime === 'number' && this.handlers.onSeek) {
            this.handlers.onSeek(details.seekTime);
          }
        },
      ],
      [
        'seekbackward',
        (details: any) => {
          const skipTime = details.seekOffset || 10;
          this.handlers.onSeek?.(Math.max(0, skipTime));
        },
      ],
      [
        'seekforward',
        (details: any) => {
          const skipTime = details.seekOffset || 10;
          this.handlers.onSeek?.(skipTime);
        },
      ],
    ];

    for (const [action, handler] of actionMap) {
      try {
        if (handler) {
          navigator.mediaSession.setActionHandler(action, handler);
        } else {
          navigator.mediaSession.setActionHandler(action, null);
        }
      } catch {
        // Some actions might not be supported in older browsers
      }
    }
  }
}

export const backgroundAudio = new BackgroundAudioManager();
