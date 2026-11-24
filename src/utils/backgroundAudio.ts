import type { Cue } from '../types/jap';

/**
 * Background Audio & MediaSession Controller for Mobile & Desktop.
 *
 * Designed to match YouTube Music mobile web behavior:
 * 1. Infinite MediaStream / AudioContext keep-alive so Android & iOS never kill playback
 *    when the device is locked, the screen is turned off, or the browser is minimized.
 * 2. Unlocks audio context on the first user interaction (touch/click) to bypass browser autoplay restrictions.
 * 3. Lock-screen & Notification MediaSession controls:
 *    - ⏮ Previous Track (Rewind / Jump back)
 *    - ⏯ Play / Pause
 *    - ⏭ Next Track (Skip / Crossfade to next)
 *    - Seekbar support
 *    - HD Album Artwork & Track Metadata
 * 4. Omits 'seekbackward'/'seekforward' so Android Chrome displays the native
 *    [⏮ PREV] [⏯ PLAY/PAUSE] [⏭ NEXT] 3-button layout instead of +/- 10s.
 * 5. Screen WakeLock API to keep device awake during live party sessions.
 */

function createSilentWavBlob(durationSec = 3): Blob {
  const sampleRate = 44100;
  const numChannels = 1;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF Chunk Descriptor
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM data is all 0s (pure silence)
  return new Blob([buffer], { type: 'audio/wav' });
}

class BackgroundAudioManager {
  private audioCtx: AudioContext | null = null;
  private silentAudio: HTMLAudioElement | null = null;
  private wakeLockSentinel: any = null;
  private isKeepAliveRunning = false;
  private isUnlocked = false;
  private currentCue: Cue | null = null;

  private handlers: {
    onPlay?: () => void;
    onPause?: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    onSeek?: (sec: number) => void;
  } = {};

  constructor() {
    this.setupGlobalUnlockListeners();
  }

  /**
   * Sets up global touch and click listeners so the audio session is unlocked
   * directly inside a verified user gesture (required by iOS Safari and Android Chrome).
   */
  private setupGlobalUnlockListeners() {
    if (typeof window === 'undefined') return;

    const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown'];
    const handleGesture = () => {
      this.unlock();
      unlockEvents.forEach((ev) =>
        window.removeEventListener(ev, handleGesture, { capture: true })
      );
    };

    unlockEvents.forEach((ev) =>
      window.addEventListener(ev, handleGesture, { capture: true, passive: true })
    );

    // Auto-reacquire wake lock on visibility restore and sustain audio on minimize
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.requestWakeLock();
        } else if (document.visibilityState === 'hidden') {
          if (this.isKeepAliveRunning && this.silentAudio) {
            this.silentAudio.play().catch(() => {});
          }
        }
      });
    }
  }

  /**
   * Unlocks the AudioContext and starts the persistent silent audio stream.
   */
  unlock() {
    if (this.isUnlocked || typeof window === 'undefined') return;
    this.isUnlocked = true;

    try {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      }
    } catch {
      // AudioContext unavailable
    }

    this.ensureAudioElement();
  }

  private ensureAudioElement() {
    if (this.silentAudio || typeof window === 'undefined') return;

    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.autoplay = false;
      audio.volume = 0.001; // Tiny audible value so OS recognizes active playback

      // Attempt 1: Web Audio Live MediaStream Destination (infinite continuous stream)
      if (
        this.audioCtx &&
        typeof this.audioCtx.createMediaStreamDestination === 'function'
      ) {
        try {
          const dest = this.audioCtx.createMediaStreamDestination();
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          gain.gain.value = 0.0001;
          osc.connect(gain);
          gain.connect(dest);
          osc.start();

          audio.srcObject = dest.stream;
          this.silentAudio = audio;
          return;
        } catch {
          // fallback to WAV blob
        }
      }

      // Attempt 2: Valid 3-second silent WAV Blob URL with looping
      const wavBlob = createSilentWavBlob(3);
      const blobUrl = URL.createObjectURL(wavBlob);
      audio.src = blobUrl;
      audio.loop = true;
      this.silentAudio = audio;
    } catch {
      // Audio creation error
    }
  }

  init() {
    this.unlock();
    this.ensureAudioElement();
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

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    if (this.silentAudio) {
      this.silentAudio.play().catch(() => {
        // Will resume on next user gesture
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

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

  resumeKeepAlive() {
    this.isKeepAliveRunning = true;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.silentAudio) {
      this.silentAudio.play().catch(() => {});
    }
    this.requestWakeLock();

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
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
        // WakeLock rejected if tab in background or low battery
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

  updateMediaSession(
    cue: Cue | null,
    isPaused: boolean,
    currentSec = 0,
    durationSec = 200
  ) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (!cue) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    this.currentCue = cue;
    navigator.mediaSession.playbackState = isPaused ? 'paused' : 'playing';

    const artworkUrl =
      cue.art || `https://i.ytimg.com/vi/${cue.youtube_ids[0]}/hqdefault.jpg`;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: cue.title,
        artist: cue.artist,
        album: cue.language ? `JAPxRock · ${cue.language.toUpperCase()}` : 'JAPxRock Live',
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

    // Update position timeline on lock screen
    if ('setPositionState' in navigator.mediaSession && durationSec > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, durationSec),
          playbackRate: isPaused ? 0 : 1.0,
          position: Math.min(Math.max(0, currentSec), durationSec),
        });
      } catch {
        // ignore position state errors
      }
    }
  }

  /**
   * Registers media action handlers for the lock screen and notification shade.
   *
   * IMPORTANT: We deliberately avoid 'seekbackward' and 'seekforward'.
   * On mobile Android Chrome, registering those causes Android to replace
   * the 'previoustrack' and 'nexttrack' buttons with 10s skip buttons.
   * Registering ONLY play/pause, previoustrack, nexttrack, seekto, and stop
   * guarantees the exact YouTube Music mobile layout:
   * [⏮ PREVIOUS] [⏯ PLAY/PAUSE] [⏭ SKIP/NEXT]
   */
  private registerMediaSessionActions() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const actionMap: Array<
      [MediaSessionAction, (() => void) | ((d: any) => void) | null]
    > = [
      ['play', () => this.handlers.onPlay?.()],
      ['pause', () => this.handlers.onPause?.()],
      ['previoustrack', () => this.handlers.onPrevious?.()],
      ['nexttrack', () => this.handlers.onNext?.()],
      ['stop', () => this.handlers.onPause?.()],
      [
        'seekto',
        (details: any) => {
          if (typeof details.seekTime === 'number' && this.handlers.onSeek) {
            this.handlers.onSeek(details.seekTime);
          }
        },
      ],
      // Explicitly disable seekbackward & seekforward so Android prioritizes Next/Prev buttons
      ['seekbackward', null],
      ['seekforward', null],
    ];

    for (const [action, handler] of actionMap) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Handler not supported on this platform
      }
    }
  }
}

export const backgroundAudio = new BackgroundAudioManager();
