import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CrowdSize,
  Cue,
  DeckId,
  DeckSlot,
  EngineEvent,
  EngineState,
  FunnelAnswers,
  TimeOfNight,
} from '../types/jap';
import {
  calculateEqualPowerGains,
  computePulsePeriod,
  fmtTime,
} from '../utils/japSeed';
import {
  analyzeYouTubeInputClient,
  getClientDjCommentary,
  getUserGeminiApiKey,
  saveGuestRequestClient,
  setUserGeminiApiKey,
} from '../utils/clientApi';
import type { PlayerEngine } from '../utils/playerEngine';
import { fitsSubtype, LANGUAGES, MIN_LANGUAGE_SONGS } from '../utils/setlistBuilder';
import { Deck } from './Deck';
import { ExitButton } from './SharedControls';

const TIME_OPTIONS: Array<{ id: TimeOfNight; label: string }> = [
  { id: 'warmup', label: 'Warming up' },
  { id: 'peak', label: 'Peak' },
  { id: 'winddown', label: 'Winding down' },
  { id: 'bangers', label: 'Only bangers' },
];

const CROWD_OPTIONS: Array<{ id: CrowdSize; label: string }> = [
  { id: 'small', label: '4–6' },
  { id: 'medium', label: '10–20' },
  { id: 'large', label: '20+' },
];

function summarizeAnswers(answers: FunnelAnswers): string {
  return [
    ...answers.languages.map((langId) => {
      const lang = LANGUAGES.find((l) => l.id === langId);
      const subs = (lang?.subtypes ?? [])
        .filter((s) => answers.subtypes.includes(`${langId}:${s.id}`))
        .map((s) => s.label);
      return [lang?.label.split(' /')[0] ?? langId, ...subs].join(' · ');
    }),
    TIME_OPTIONS.find((t) => t.id === answers.time)?.label,
    CROWD_OPTIONS.find((c) => c.id === answers.crowd)?.label,
  ]
    .filter(Boolean)
    .join(' · ');
}

const PauseIcon = () => (
  <svg viewBox="0 0 10 10" className="h-full w-full" fill="currentColor">
    <rect x="1.2" y="0.5" width="2.6" height="9" rx="0.6" />
    <rect x="6.2" y="0.5" width="2.6" height="9" rx="0.6" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 10 10" className="h-full w-full" fill="currentColor">
    <path d="M1.5 0.6 L9.4 5 L1.5 9.4 Z" />
  </svg>
);

const AgentTicker: React.FC<{ text: string }> = ({ text }) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [loopWidth, setLoopWidth] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      setLoopWidth(
        inner.offsetWidth > outer.clientWidth + 1 ? inner.offsetWidth + 96 : 0
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={outerRef}
      className="min-w-0 flex-1 overflow-hidden font-display text-[clamp(26px,2.2vw,38px)] uppercase leading-none tracking-wide"
    >
      <div key={text} className="ticker-in">
        <div
          className={`flex w-max ${loopWidth ? 'ticker-scroll' : ''}`}
          style={
            loopWidth
              ? ({
                  gap: 96,
                  '--loop': `${loopWidth}px`,
                  '--dur': `${loopWidth / 70}s`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <span ref={innerRef} className="whitespace-nowrap">
            {text}
          </span>
          {loopWidth > 0 && (
            <span aria-hidden="true" className="whitespace-nowrap">
              {text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface ChangeVibeModalProps {
  answers: FunnelAnswers;
  library: Cue[];
  onApply: (next: FunnelAnswers) => void;
  onClose: () => void;
}

const ChangeVibeModal: React.FC<ChangeVibeModalProps> = ({
  answers,
  library,
  onApply,
  onClose,
}) => {
  const [draft, setDraft] = useState<FunnelAnswers>(answers);
  const toggleItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  const hasChanged = JSON.stringify(draft) !== JSON.stringify(answers);
  const chipClass = (active: boolean) =>
    `rounded-2xl border-2 px-4 py-1.5 font-display text-xl uppercase tracking-wide transition ${
      active
        ? 'border-lime bg-lime text-ink'
        : 'border-white/25 text-white/80 hover:border-white/60'
    }`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/70 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border-2 border-white/15 bg-ink md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jap-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-5 md:px-8">
          <div className="flex items-center justify-between">
            <p className="font-display text-3xl uppercase tracking-wide md:text-4xl">
              Change the vibe
            </p>
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-11 w-11 rounded-full border-2 border-white/25 text-xl text-white/70"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-base text-white/50">
            The song playing carries on. Everything after it is re-picked.
          </p>

          <div className="mt-4">
            <p className="mb-2 font-display text-lg uppercase tracking-wide text-white/45">
              Where in the night
            </p>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  className={chipClass(draft.time === t.id)}
                  onClick={() => setDraft({ ...draft, time: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 font-display text-lg uppercase tracking-wide text-white/45">
              How many people
            </p>
            <div className="flex flex-wrap gap-2">
              {CROWD_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  className={chipClass(draft.crowd === c.id)}
                  onClick={() => setDraft({ ...draft, crowd: c.id })}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 font-display text-lg uppercase tracking-wide text-white/45">
              Languages
            </p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.filter(
                (l) =>
                  library.filter((c) => c.language === l.id).length >=
                  MIN_LANGUAGE_SONGS
              ).map((l) => (
                <button
                  key={l.id}
                  className={chipClass(draft.languages.includes(l.id))}
                  onClick={() => {
                    const nextLangs = toggleItem(draft.languages, l.id);
                    if (nextLangs.length) {
                      setDraft({
                        ...draft,
                        languages: nextLangs,
                        subtypes: draft.subtypes.filter((st) =>
                          nextLangs.includes(st.split(':')[0])
                        ),
                      });
                    }
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {draft.languages.map((langId) => {
            const langObj = LANGUAGES.find((l) => l.id === langId);
            if (!langObj) return null;
            const availableSubs = langObj.subtypes.filter((sub) =>
              library.some((c) => fitsSubtype(c, `${langId}:${sub.id}`))
            );
            if (!availableSubs.length) return null;
            return (
              <div key={langId} className="mt-4">
                <p className="mb-2 font-display text-lg uppercase tracking-wide text-white/45">
                  {langObj.label.split(' /')[0]} style (optional)
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSubs.map((sub) => {
                    const key = `${langId}:${sub.id}`;
                    return (
                      <button
                        key={key}
                        className={chipClass(draft.subtypes.includes(key))}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            subtypes: toggleItem(draft.subtypes, key),
                          })
                        }
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t-2 border-white/10 px-6 pb-5 pt-4 md:px-8">
          <button
            disabled={!hasChanged}
            onClick={() => onApply(draft)}
            className="bg-brand-mix h-16 w-full rounded-[20px] font-display text-3xl tracking-wide text-ink transition active:scale-[0.98] disabled:bg-white/10 disabled:bg-none disabled:text-white/35"
          >
            {hasChanged ? 'APPLY' : 'NO CHANGES YET'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DjSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [key, setKey] = useState(() => getUserGeminiApiKey());
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setUserGeminiApiKey(key.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border-2 border-white/20 bg-ink p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="font-display text-2xl uppercase tracking-wide text-lime">
            ✨ AI DJ Settings (Optional)
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>
        <p className="mt-3 text-sm text-white/70">
          JAPxRock comes with a context-aware mathematical DJ commentary engine built right in. No external server or API key is required.
        </p>
        <p className="mt-2 text-xs text-white/50">
          If you want live Google Gemini AI commentary, paste your own free Gemini API key below. It stays stored locally in your browser&apos;s localStorage.
        </p>

        <form onSubmit={handleSave} className="mt-4">
          <label className="block font-mono text-xs uppercase text-gold">
            Google Gemini API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIzaSy..."
            className="mt-1 h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3 font-mono text-sm text-white focus:border-lime focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between">
            {key ? (
              <button
                type="button"
                onClick={() => {
                  setKey('');
                  setUserGeminiApiKey('');
                }}
                className="text-xs text-gold hover:underline"
              >
                Clear Key (Use Heuristic DJ)
              </button>
            ) : <span />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/20 px-4 py-2 font-display text-sm text-white/70 hover:border-white hover:text-white"
              >
                CLOSE
              </button>
              <button
                type="submit"
                className="rounded-xl bg-lime px-5 py-2 font-display text-sm text-ink hover:bg-lime/90"
              >
                {saved ? '✓ SAVED' : 'SAVE KEY'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PlayNextModalProps {
  library: Cue[];
  playedIds: string[];
  liveId: string | null;
  onPick: (cues: Cue[]) => void;
  onAppend: (cues: Cue[]) => void;
  onClose: () => void;
}

const normalizeSearch = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const PlayNextModal: React.FC<PlayNextModalProps> = ({
  library,
  playedIds,
  liveId,
  onPick,
  onAppend,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [requestedQuery, setRequestedQuery] = useState<string | null>(null);
  const [importingUrl, setImportingUrl] = useState(false);

  const byId = useMemo(
    () => new Map(library.map((c) => [c.song_id, c])),
    [library]
  );

  const playedList = useMemo(
    () =>
      [...new Set([...playedIds].reverse())]
        .filter((id) => id !== liveId)
        .map((id) => byId.get(id))
        .filter((x): x is Cue => Boolean(x)),
    [playedIds, liveId, byId]
  );

  const matches = useMemo(() => {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return library
      .filter((c) => c.song_id !== liveId)
      .filter((c) => {
        const hay = normalizeSearch(`${c.title} ${c.artist}`);
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => (b.fame ?? 2) - (a.fame ?? 2))
      .slice(0, 40);
  }, [query, library, liveId]);

  const isUrl =
    query.includes('youtube.com/') ||
    query.includes('youtu.be/') ||
    query.includes('music.youtube.com/');

  const handleImportUrl = async (mode: 'next' | 'append') => {
    setImportingUrl(true);
    try {
      const trimmed = query.trim();
      const data = await analyzeYouTubeInputClient({
        url: trimmed,
        hookMode: 'verse-hook',
        optimizeOrder: false,
      });
      if (data?.ok && Array.isArray(data.cues) && data.cues.length > 0) {
        const isPlaylist =
          trimmed.includes('list=') ||
          trimmed.includes('/playlist') ||
          trimmed.includes('/browse/');
        const extracted: Cue[] = isPlaylist ? data.cues : [data.cues[0]];
        if (mode === 'next') {
          onPick(extracted);
        } else {
          onAppend(extracted);
        }
      }
    } catch {
      // ignore
    } finally {
      setImportingUrl(false);
    }
  };

  const renderSongRow = (cue: Cue, note?: string) => (
    <li
      key={cue.song_id}
      className="flex items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-white/5"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-xl uppercase leading-tight md:text-2xl">
          {cue.title}
        </div>
        <div className="truncate text-sm text-white/55 md:text-base">
          {cue.artist}
          {note ? ` · ${note}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onPick([cue])}
          className="rounded-xl border-2 border-sky px-3 py-1 font-display text-base tracking-wide text-sky transition hover:bg-sky hover:text-ink"
        >
          ⚡ PLAY NEXT
        </button>
        <button
          type="button"
          onClick={() => onAppend([cue])}
          className="bg-brand-mix rounded-xl px-3 py-1 font-display text-base tracking-wide text-ink transition active:scale-95"
        >
          ＋ QUEUE
        </button>
      </div>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/70 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border-2 border-white/15 bg-ink md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 md:px-8">
          <div className="flex items-center justify-between">
            <p className="font-display text-3xl uppercase tracking-wide md:text-4xl">
              Play next
            </p>
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-11 w-11 rounded-full border-2 border-white/25 text-xl text-white/70"
            >
              ✕
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search any song, artist, or paste a YouTube / YT Music link"
            aria-label="Search songs"
            className="mt-4 w-full rounded-2xl border-2 border-white/20 bg-transparent px-5 py-3 text-lg text-white placeholder:text-white/35 focus:border-lime focus:outline-none"
          />
        </div>

        <div className="jap-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-5 md:px-5">
          {query.trim() ? (
            isUrl ? (
              <div className="px-3 py-6">
                <p className="text-white/75">
                  YouTube / YT Music link detected. Extract its best verse &amp; add
                  it to the active set:
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    onClick={() => handleImportUrl('next')}
                    disabled={importingUrl}
                    className="rounded-2xl border-2 border-sky px-6 py-3 font-display text-2xl tracking-wide text-sky transition hover:bg-sky hover:text-ink"
                  >
                    {importingUrl ? 'ANALYZING HOOK…' : '⚡ PLAY NEXT →'}
                  </button>
                  <button
                    onClick={() => handleImportUrl('append')}
                    disabled={importingUrl}
                    className="bg-brand-mix rounded-2xl px-6 py-3 font-display text-2xl tracking-wide text-ink"
                  >
                    {importingUrl ? 'ANALYZING HOOK…' : '＋ ADD TO QUEUE →'}
                  </button>
                </div>
              </div>
            ) : matches.length ? (
              <ul>{matches.map((c) => renderSongRow(c))}</ul>
            ) : requestedQuery === query.trim() ? (
              <p className="px-3 py-6 text-lime">
                Requested! The agent finds the official version and adds it,
                usually within a day.
              </p>
            ) : (
              <div className="px-3 py-6">
                <p className="text-white/55">We don&apos;t have that one yet.</p>
                <button
                  onClick={() => {
                    setRequestedQuery(query.trim());
                    saveGuestRequestClient(query.trim());
                  }}
                  className="mt-3 rounded-full border-2 border-lime px-5 py-2 font-display text-xl tracking-wide text-lime transition hover:bg-lime hover:text-ink"
                >
                  ＋ REQUEST “{query.trim().slice(0, 40)}”
                </button>
              </div>
            )
          ) : playedList.length ? (
            <>
              <p className="px-3 pb-1 pt-2 font-display text-lg uppercase tracking-wide text-white/45">
                Played tonight
              </p>
              <ul>{playedList.map((c) => renderSongRow(c, 'play it again'))}</ul>
            </>
          ) : (
            <p className="px-3 py-6 text-white/50">
              Search any song in the 1,346-track library or paste a YouTube link to
              play it next.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const ActionDeckButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
}> = ({ children, onClick, primary, active, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`h-[clamp(84px,14vh,170px)] flex-1 rounded-[28px] font-display text-[clamp(44px,5vw,88px)] leading-none tracking-wide transition active:scale-[0.97] max-md:h-[76px] max-md:rounded-[22px] max-md:text-[30px] [@media(max-height:500px)]:h-[60px] [@media(max-height:500px)]:text-[36px] ${
      primary
        ? 'bg-brand-mix text-ink shadow-[0_10px_36px_rgba(56,189,248,0.25)] disabled:opacity-40'
        : active
          ? 'border-4 border-gold text-gold'
          : 'border-4 border-white/85 text-white hover:border-sky disabled:border-white/25 disabled:text-white/30'
    }`}
  >
    {children}
  </button>
);

export interface NowPlayingProps {
  engine: PlayerEngine;
  state: EngineState;
  events: EngineEvent[];
  onNewSet: () => void;
  onExit: () => void;
  onMinimize: () => void;
  onOpenQueue: () => void;
  answers: FunnelAnswers | null;
  library: Cue[];
  showPlayerTile: boolean;
  onTogglePlayerTile: () => void;
  onRetune: (nextAnswers: FunnelAnswers) => string | null;
  playedIds: () => string[];
}

export const NowPlaying: React.FC<NowPlayingProps> = ({
  engine,
  state,
  events,
  onNewSet,
  onExit,
  onMinimize,
  onOpenQueue,
  answers,
  library,
  showPlayerTile,
  onTogglePlayerTile,
  onRetune,
  playedIds,
}) => {
  const [changeVibeOpen, setChangeVibeOpen] = useState(false);
  const [playNextOpen, setPlayNextOpen] = useState(false);
  const [showMathHud, setShowMathHud] = useState(false);
  const [djSettingsOpen, setDjSettingsOpen] = useState(false);

  const [pos, setPos] = useState<{ seconds: number; duration: number } | null>(
    null
  );
  const [cutAt, setCutAt] = useState<number | null>(null);
  const [transientMsg, setTransientMsg] = useState<{
    text: string;
    until: number;
  } | null>(null);
  const [sweepKey, setSweepKey] = useState(0);
  const [showDragHint, setShowDragHint] = useState(false);

  const prevCrossfading = useRef(state.crossfading);
  useEffect(() => {
    if (state.crossfading && !prevCrossfading.current) {
      setSweepKey((k) => k + 1);
    }
    prevCrossfading.current = state.crossfading;
  }, [state.crossfading]);

  // Sync floating YouTube video tile position with the active deck's [data-player-slot]
  useEffect(() => {
    const syncTile = () => {
      const hostEl = document.querySelector('.jap-players') as HTMLElement | null;
      const slotEl = document.querySelector(
        '.deck[data-slot="live"] [data-player-slot]'
      ) as HTMLElement | null;
      if (!hostEl) return;
      if (!slotEl || state.crossfading || !showPlayerTile) {
        hostEl.style.setProperty('--tile-opacity', '0');
        return;
      }
      const rect = slotEl.getBoundingClientRect();
      hostEl.style.setProperty('--tile-x', `${Math.round(rect.left)}px`);
      hostEl.style.setProperty('--tile-y', `${Math.round(rect.top)}px`);
      hostEl.style.setProperty('--tile-w', `${Math.round(rect.width)}px`);
      hostEl.style.setProperty('--tile-h', `${Math.round(rect.height)}px`);
      hostEl.style.setProperty('--tile-opacity', '1');
    };
    syncTile();
    const timer = setInterval(syncTile, 150);
    window.addEventListener('resize', syncTile);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', syncTile);
    };
  }, [state.crossfading, showPlayerTile]);

  useEffect(() => {
    const tick = () => {
      setPos(engine.getPosition());
      setCutAt(engine.getCutAt());
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [engine]);

  const liveDeckSnap = state.live ? state.decks[state.live] : null;
  const otherDeckSnap = state.live
    ? state.decks[state.live === 'A' ? 'B' : 'A']
    : null;
  const liveCue = liveDeckSnap?.status === 'live' ? liveDeckSnap.cue : null;
  const nextCue = otherDeckSnap?.cue ?? null;

  const songCounterRef = useRef(0);
  const nextHintAtRef = useRef(1);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!liveCue) return;
    songCounterRef.current += 1;
    const count = songCounterRef.current;
    if (liveCue.unsure || count >= nextHintAtRef.current) {
      if (count >= nextHintAtRef.current) {
        nextHintAtRef.current = count + 3 + Math.floor(Math.random() * 3);
      }
      setShowDragHint(true);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => setShowDragHint(false), 8000);
    } else {
      setShowDragHint(false);
    }

    // Call client-side context-aware DJ engine (runs local heuristic or optional user Gemini key)
    let active = true;
    getClientDjCommentary({
      currentTitle: liveCue.title,
      currentArtist: liveCue.artist,
      nextTitle: nextCue?.title,
      nextArtist: nextCue?.artist,
      timeMode: answers?.time ?? 'peak',
    })
      .then((commentary) => {
        if (active && commentary) {
          setTransientMsg({
            text: `[AI DJ] ${commentary}`,
            until: Date.now() + 8000,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [liveCue?.song_id, nextCue?.song_id]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const lastEventNumRef = useRef(0);
  useEffect(() => {
    const fresh = events.filter((e) => (e.n ?? 0) > lastEventNumRef.current);
    if (!fresh.length) return;
    lastEventNumRef.current = fresh[fresh.length - 1].n ?? 0;

    const messages = fresh
      .map((ev) => {
        switch (ev.type) {
          case 'previous':
            return `Bringing back ${ev.cue.title} at ${fmtTime(
              ev.cue.play_full ? 0 : ev.cue.entry_sec
            )}, keeping ${ev.fromCue.title} up next`;
          case 'skip':
            if (!ev.cue.play_full && ev.at - ev.cue.entry_sec < 15) {
              return "Skipped fast? If it started at the wrong part, drag to the right bit next time. That's how I learn";
            }
            return `Skipped ${ev.cue.title}${
              nextCue ? `, bringing in ${nextCue.title}` : ''
            }`;
          case 'holding':
            return 'Next track is still loading, riding this one a little longer';
          case 'unavailable':
            return `Couldn't get a clean copy of ${ev.cue.title}, moving on`;
          case 'seek':
            setShowDragHint(false);
            return ev.playFull
              ? `Jumped to ${fmtTime(ev.to)}, letting it ride to the end`
              : `Noted: ${fmtTime(ev.to)}. Drags like this teach me where ${
                  ev.cue.title
                } really kicks in`;
          default:
            return null;
        }
      })
      .filter((x): x is string => x !== null);

    const chosen =
      messages.find((m) => m.startsWith("Couldn't")) ??
      messages[messages.length - 1];
    if (chosen) {
      setTransientMsg({
        text: chosen,
        until: Date.now() + (chosen.startsWith('Skipped fast') ? 9000 : 6000),
      });
    }
  }, [events, nextCue]);

  const isPlayingFull = liveDeckSnap?.playFull ?? false;
  const startingCue = liveCue ? null : liveDeckSnap?.cue ?? null;
  const isPaused = state.paused && !state.finished;

  const agentCommentary = (() => {
    if (isPaused) {
      if (transientMsg && transientMsg.until > Date.now()) {
        return transientMsg.text;
      }
      return `Paused at ${fmtTime(
        pos?.seconds ?? 0
      )}. Resume picks up exactly here`;
    }
    if (state.finished) {
      return "That's the set. Build another when you're ready.";
    }
    if (transientMsg && transientMsg.until > Date.now()) {
      return transientMsg.text;
    }
    if (!liveCue) {
      return startingCue
        ? `Lining up ${startingCue.title}`
        : 'Lining up the next track';
    }
    if (cutAt !== null && pos) {
      const rem = cutAt - pos.seconds;
      if (rem <= 10 && rem > 0) {
        return nextCue
          ? `Mixing into ${nextCue.title} in ${Math.ceil(rem)}`
          : `Ending the set in ${Math.ceil(rem)}`;
      }
      if (rem <= 0 && !nextCue) return "That's the set";
    }
    if (isPlayingFull || liveCue.play_full) {
      return liveCue.era === 'pre2020'
        ? 'Retro track, playing it in full'
        : 'This one plays in full';
    }
    if (!nextCue) {
      return cutAt !== null
        ? `Last track, ending the set at ${fmtTime(cutAt)}`
        : 'Last track of the set, letting it ride';
    }
    const energyTrajectory =
      nextCue.energy > liveCue.energy
        ? 'energy going up'
        : nextCue.energy < liveCue.energy
          ? 'bringing it down'
          : 'holding the energy';
    return cutAt === null
      ? `Letting this one run, ${energyTrajectory}`
      : `Cutting at ${fmtTime(cutAt)}, ${energyTrajectory}`;
  })();

  const slotForDeck = (id: DeckId): DeckSlot =>
    id === state.live ? 'live' : state.crossfading ? 'out' : 'cue';

  const currentEnergy = liveCue?.energy ?? 7;
  const pulsePeriod = computePulsePeriod(currentEnergy);
  const crossfadeGains = calculateEqualPowerGains(
    state.crossfadeProgress ?? 0,
    state.smoothnessAlpha ?? 0.65,
    liveCue?.energy ?? 7,
    nextCue?.energy ?? 7
  );
  const queueCount = state.queue?.length ?? 0;

  // Keyboard shortcuts (Space/K = pause, B/P/← = prev, S/→ = skip, F = full, M = minimize, Q = queue)
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        ev.code === 'Space' ||
        ev.key === 'k' ||
        ev.key === 'K' ||
        ev.key === 'MediaPlayPause'
      ) {
        ev.preventDefault();
        if (!ev.repeat) engine.togglePause();
        return;
      }
      if (
        ev.key === 'b' ||
        ev.key === 'B' ||
        ev.key === 'p' ||
        ev.key === 'P' ||
        ev.key === 'ArrowLeft' ||
        ev.key === 'MediaTrackPrevious'
      ) {
        ev.preventDefault();
        if (!ev.repeat) engine.previous();
        return;
      }
      if (
        ev.key === 's' ||
        ev.key === 'S' ||
        ev.key === 'ArrowRight' ||
        ev.key === 'MediaTrackNext'
      ) {
        engine.skip();
      }
      if (ev.key === 'f' || ev.key === 'F') {
        engine.playFullCurrent();
      }
      if ((ev.key === 'm' || ev.key === 'M') && !ev.repeat) {
        onMinimize();
      }
      if ((ev.key === 'q' || ev.key === 'Q') && !ev.repeat) {
        onOpenQueue();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [engine, onMinimize, onOpenQueue]);

  return (
    <main
      data-paused={isPaused ? 'true' : undefined}
      data-testid="now-playing-view"
      className="relative flex h-dvh flex-col overflow-clip px-[4vw] pb-[3vh] pt-[3vh]"
    >
      {/* Energy-coupled radial Light Blue + Yellow glow */}
      <div
        className="pulse-glow pointer-events-none absolute -left-[20vw] top-[10vh] h-[90vh] w-[90vw] rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.14),rgba(250,204,21,0.06),transparent)]"
        style={{ '--pulse': pulsePeriod } as React.CSSProperties}
      />

      {/* Top Navigation & Telemetry Controls */}
      <div className="relative z-30 flex items-center gap-[1.5vw] font-display text-[clamp(26px,2.4vw,40px)] leading-none tracking-wide">
        <button
          onClick={onMinimize}
          className="text-brand-mix shrink-0"
          aria-label="JAPxRock home (minimize player)"
          title="Minimize player to browse"
        >
          JAPxRock
        </button>

        {answers && !state.finished && (
          <button
            onClick={() => setChangeVibeOpen(true)}
            className="hidden max-w-[30vw] items-center gap-3 rounded-full border-2 border-white/20 px-5 py-2 text-[clamp(15px,1.2vw,20px)] uppercase text-white/80 transition hover:border-sky hover:text-white xl:flex"
          >
            <span className="min-w-0 truncate">{summarizeAnswers(answers)}</span>
            <span className="shrink-0 text-gold">CHANGE</span>
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-2.5">
          {/* Open Live Queue & Sequence Editor */}
          <button
            type="button"
            onClick={onOpenQueue}
            data-testid="open-queue-btn"
            title="View Queue, Reorder Sequence & Add YouTube URL (Q)"
            className="flex items-center gap-1.5 rounded-full border-2 border-gold/80 bg-gold/10 px-3.5 py-1.5 font-display text-base tracking-wide text-gold transition hover:bg-gold hover:text-ink md:text-xl"
          >
            <span>☰ QUEUE</span>
            <span className="tabular-nums">({queueCount})</span>
          </button>

          {/* Minimize Player to YouTube Music-style Bottom Bar */}
          <button
            type="button"
            onClick={onMinimize}
            data-testid="minimize-player-btn"
            title="Minimize player like YouTube Music (M)"
            className="flex items-center gap-1.5 rounded-full border-2 border-sky/80 bg-sky/10 px-3.5 py-1.5 font-display text-base tracking-wide text-sky transition hover:bg-sky hover:text-ink md:text-xl"
          >
            <span>▼</span>
            <span className="hidden sm:inline">MINIMIZE</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMathHud((v) => !v)}
            className={`hidden rounded-full border-2 px-3.5 py-1.5 font-display text-base tracking-wide transition lg:inline-flex md:text-xl ${
              showMathHud
                ? 'border-lime bg-lime text-ink'
                : 'border-white/20 text-white/60 hover:border-white/60 hover:text-white'
            }`}
          >
            MATH HUD
          </button>

          <button
            type="button"
            onClick={onTogglePlayerTile}
            className={`hidden rounded-full border-2 px-3.5 py-1.5 font-display text-base tracking-wide transition sm:inline-flex md:text-xl ${
              showPlayerTile
                ? 'border-lime bg-lime text-ink'
                : 'border-white/20 text-white/60 hover:border-white/60 hover:text-white'
            }`}
          >
            VIDEO
          </button>

          <button
            type="button"
            onClick={() => setDjSettingsOpen(true)}
            title="AI DJ Settings (Optionally configure your free Gemini API key)"
            className={`hidden rounded-full border-2 px-3.5 py-1.5 font-display text-base tracking-wide transition sm:inline-flex md:text-xl ${
              djSettingsOpen
                ? 'border-lime bg-lime text-ink'
                : 'border-white/20 text-white/60 hover:border-lime hover:text-lime'
            }`}
          >
            ✨ AI DJ
          </button>

          {pos && liveCue && !state.finished && (
            <button
              onClick={() => engine.togglePause()}
              aria-label={isPaused ? 'Resume (space)' : 'Pause (space)'}
              title={isPaused ? 'Resume (space)' : 'Pause (space)'}
              className={`group flex items-center gap-[0.45em] rounded-full border-2 py-[0.28em] pl-[0.5em] pr-[0.6em] tabular-nums transition ${
                isPaused
                  ? 'border-lime text-lime'
                  : 'border-white/20 text-white/60 hover:border-white/60 hover:text-white'
              }`}
            >
              <span
                className="flex h-[0.8em] w-[0.8em] items-center justify-center"
                aria-hidden="true"
              >
                {isPaused ? <PlayIcon /> : <PauseIcon />}
              </span>
              <span className={isPaused ? 'clock-blink' : ''}>
                {fmtTime(pos.seconds)} / {fmtTime(pos.duration)}
              </span>
            </button>
          )}

          <ExitButton onExit={onExit} confirm size="lg" />
        </div>
      </div>

      {/* Live Mathematical Telemetry Overlay Panel (when toggled) */}
      {showMathHud && liveCue && (
        <div className="relative z-30 mt-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-sky/40 bg-ink/90 px-4 py-2.5 font-mono text-xs text-white/80 backdrop-blur-md tabular-nums">
          <div>
            <span className="font-semibold text-sky">HOOK WINDOW:</span>{' '}
            [{fmtTime(liveCue.entry_sec)},{' '}
            {fmtTime(liveCue.exit_sec ?? liveCue.duration_sec)}] · Δt ={' '}
            {(liveCue.exit_sec ?? liveCue.duration_sec) - liveCue.entry_sec}s ·{' '}
            {liveCue.hookMath
              ? `J* = ${liveCue.hookMath.compositeScore} (μ=${liveCue.hookMath.meanIntensity}, ∇⁺H=${liveCue.hookMath.attackGradient}, P_pos=${liveCue.hookMath.structuralPrior})`
              : `Energy = ${liveCue.energy}/10`}
          </div>
          <div>
            <span className="font-semibold text-gold">
              C² QUINTIC S-CURVE EQUAL-POWER:
            </span>{' '}
            {state.crossfading
              ? `s=${(state.crossfadeProgress ?? 0).toFixed(2)} → σ_α=${
                  crossfadeGains.warpedProgress
                } · V_in=${crossfadeGains.incomingVolume}% · V_out=${
                  crossfadeGains.outgoingVolume
                }% · ΣP²=${crossfadeGains.powerSum} · T_fade=${
                  state.activeCrossfadeMs ?? 2200
                }ms`
              : `Deck ${state.live} = 100% · α=${(
                  state.smoothnessAlpha ?? 0.65
                ).toFixed(2)} · ΔL=${crossfadeGains.loudnessTrimDb}dB · T_fade=${
                  state.activeCrossfadeMs ?? 2200
                }ms`}
          </div>
        </div>
      )}

      {/* Mobile Change Vibe Button */}
      {answers && !state.finished && (
        <button
          onClick={() => setChangeVibeOpen(true)}
          className="relative z-10 mt-3 flex items-center gap-2 self-start rounded-full border-2 border-white/20 px-4 py-1.5 font-display text-base uppercase tracking-wide text-white/75 md:hidden"
        >
          <span className="truncate">{summarizeAnswers(answers)}</span>
          <span className="shrink-0 text-lime">CHANGE</span>
        </button>
      )}

      {/* Modals */}
      {djSettingsOpen && (
        <DjSettingsModal onClose={() => setDjSettingsOpen(false)} />
      )}
      {playNextOpen && (
        <PlayNextModal
          library={library}
          playedIds={playedIds()}
          liveId={liveCue?.song_id ?? null}
          onClose={() => setPlayNextOpen(false)}
          onPick={(pickedList) => {
            setPlayNextOpen(false);
            engine.playNextBatch(pickedList);
            setTransientMsg({
              text:
                pickedList.length === 1
                  ? `Your pick: ${pickedList[0].title} plays next`
                  : `Inserted ${pickedList.length} tracks to play next`,
              until: Date.now() + 7000,
            });
          }}
          onAppend={(appendedList) => {
            setPlayNextOpen(false);
            engine.appendToQueue(appendedList);
            setTransientMsg({
              text:
                appendedList.length === 1
                  ? `Added ${appendedList[0].title} to the queue`
                  : `Added ${appendedList.length} tracks to the queue`,
              until: Date.now() + 7000,
            });
          }}
        />
      )}

      {changeVibeOpen && answers && (
        <ChangeVibeModal
          answers={answers}
          library={library}
          onClose={() => setChangeVibeOpen(false)}
          onApply={(nextAns) => {
            setChangeVibeOpen(false);
            const firstTitle = onRetune(nextAns);
            setTransientMsg({
              text: `Retuned for ${summarizeAnswers(nextAns)}${
                firstTitle ? `. Up next: ${firstTitle}` : ''
              }`,
              until: Date.now() + 8000,
            });
          }}
        />
      )}

      {/* Dual-Deck Stage */}
      <div className="relative z-10 mt-[2.5vh] min-h-0 flex-1 [container-type:size]">
        <Deck
          id="A"
          slot={slotForDeck('A')}
          cue={state.decks.A.cue}
          position={state.live === 'A' ? pos?.seconds ?? null : null}
          duration={state.live === 'A' ? pos?.duration ?? null : null}
          cutAt={state.live === 'A' ? cutAt : null}
          playFull={state.decks.A.playFull}
          finished={state.finished}
          status={state.decks.A.status}
          showPlayerTile={showPlayerTile}
          onSeek={(sec) => engine.seek(sec)}
          hint={showDragHint && !isPaused}
        />
        <Deck
          id="B"
          slot={slotForDeck('B')}
          cue={state.decks.B.cue}
          position={state.live === 'B' ? pos?.seconds ?? null : null}
          duration={state.live === 'B' ? pos?.duration ?? null : null}
          cutAt={state.live === 'B' ? cutAt : null}
          playFull={state.decks.B.playFull}
          finished={state.finished}
          status={state.decks.B.status}
          showPlayerTile={showPlayerTile}
          onSeek={(sec) => engine.seek(sec)}
          hint={showDragHint && !isPaused}
        />
      </div>

      {/* Paused Stamp Overlay */}
      {isPaused && (
        <button
          onClick={() => engine.resume()}
          aria-label="Resume"
          className="absolute inset-x-0 bottom-[38vh] top-[12vh] z-20 flex flex-col items-center justify-center max-md:bottom-[30vh]"
        >
          <span className="paused-stamp pointer-events-none font-display text-[clamp(84px,16vw,260px)] uppercase leading-none tracking-tight">
            Paused
          </span>
          <span className="mt-[1.5vh] font-display text-[clamp(22px,2vw,34px)] uppercase tracking-wide text-white/60">
            at {fmtTime(pos?.seconds ?? 0)} ·{' '}
            <span className="max-md:hidden">space or </span>tap to resume
          </span>
        </button>
      )}

      {/* Crossfade Lime Sweep Flash */}
      {sweepKey > 0 && (
        <div
          key={sweepKey}
          className="sweep pointer-events-none absolute inset-y-0 left-0 z-20 w-[9vw] bg-lime mix-blend-difference"
        />
      )}

      {/* AGENT Commentary Ticker Bar */}
      <div className="relative z-10 mb-[3vh] flex items-center gap-5 border-y-2 border-white/15 py-[1.6vh] [@media(max-height:500px)]:hidden">
        <span className="shrink-0 font-display text-[clamp(26px,2.2vw,38px)] leading-none tracking-wide text-gold">
          AGENT
        </span>
        <AgentTicker text={agentCommentary} />
        {!state.finished && liveCue && (
          <div className="flex shrink-0 items-center gap-2">
            {state.previousCue && (
              <button
                onClick={() => engine.previous()}
                disabled={state.crossfading}
                title={`Back to previous song: ${state.previousCue.title} (Shortcut: B or ←)`}
                data-testid="agent-prev-song-btn"
                className="hidden max-w-[240px] items-center gap-1.5 truncate rounded-full border-2 border-sky/60 bg-sky/10 px-3.5 py-1.5 font-display text-base tracking-wide text-sky transition hover:border-sky hover:bg-sky hover:text-ink disabled:opacity-30 lg:inline-flex lg:text-lg"
              >
                <span className="shrink-0">⏮ PREV:</span>
                <span className="truncate">{state.previousCue.title}</span>
              </button>
            )}
            <button
              onClick={() => {
                const dropped = engine.dropNext();
                if (dropped) {
                  setTransientMsg({
                    text: `Removed ${dropped.title} from the queue`,
                    until: Date.now() + 6000,
                  });
                }
              }}
              disabled={!nextCue || state.crossfading}
              title="Remove the next song"
              className="rounded-full border-2 border-white/25 px-3 py-1.5 font-display text-base tracking-wide text-white/75 transition hover:border-white hover:text-white disabled:opacity-30 md:px-4 md:text-lg"
            >
              ✕<span className="hidden md:inline"> REMOVE NEXT</span>
            </button>
            <button
              onClick={() => setPlayNextOpen(true)}
              title="Choose the next song or paste a YouTube link"
              className="rounded-full border-2 border-gold px-3 py-1.5 font-display text-base tracking-wide text-gold transition hover:bg-gold hover:text-ink md:px-4 md:text-lg"
            >
              ＋<span className="hidden md:inline"> PLAY NEXT</span>
            </button>
          </div>
        )}
      </div>

      {/* Primary Deck Controls (← PREV / SKIP / PLAY FULL / RESUME / NEW SET) */}
      {state.finished ? (
        <div className="relative z-10 flex gap-[2vw]">
          <ActionDeckButton onClick={onNewSet} primary>
            NEW SET
          </ActionDeckButton>
        </div>
      ) : isPaused ? (
        <div className="relative z-10 flex gap-[2vw]">
          <ActionDeckButton
            onClick={() => engine.previous()}
            disabled={!liveCue || state.crossfading}
          >
            ← PREV
          </ActionDeckButton>
          <ActionDeckButton onClick={() => engine.resume()} primary>
            <span className="inline-flex items-center gap-[0.35em]">
              <span
                className="inline-flex h-[0.62em] w-[0.62em]"
                aria-hidden="true"
              >
                <PlayIcon />
              </span>
              RESUME
            </span>
          </ActionDeckButton>
        </div>
      ) : (
        <div className="relative z-10 flex gap-[1.5vw]">
          <button
            type="button"
            onClick={() => engine.previous()}
            disabled={!liveCue || state.crossfading}
            data-testid="deck-prev-button"
            title={
              state.previousCue
                ? `Back to previous song: ${state.previousCue.title} (${state.previousCue.artist})`
                : 'Restart current song hook from the entry point'
            }
            className="group relative flex h-[clamp(84px,14vh,170px)] flex-1 flex-col items-center justify-center rounded-[28px] border-4 border-sky/85 px-3 font-display leading-none tracking-wide text-sky transition hover:border-gold hover:bg-sky/10 hover:text-gold active:scale-[0.97] disabled:border-white/25 disabled:text-white/30 max-md:h-[76px] max-md:rounded-[22px] [@media(max-height:500px)]:h-[60px]"
          >
            <span className="text-[clamp(36px,4.4vw,80px)] max-md:text-[26px] [@media(max-height:500px)]:text-[32px]">
              ← PREV
            </span>
            {state.previousCue && (
              <span className="mt-1 max-w-[90%] truncate font-sans text-xs font-medium tracking-normal text-white/70 group-hover:text-white max-md:hidden">
                {state.previousCue.title}
              </span>
            )}
          </button>
          <ActionDeckButton
            onClick={() => engine.skip()}
            primary
            disabled={!liveCue || state.crossfading}
          >
            SKIP →
          </ActionDeckButton>
          <ActionDeckButton
            onClick={() => engine.playFullCurrent()}
            active={isPlayingFull}
            disabled={!liveCue || isPlayingFull}
          >
            {isPlayingFull ? 'PLAYING FULL' : 'PLAY FULL'}
          </ActionDeckButton>
        </div>
      )}
    </main>
  );
};
