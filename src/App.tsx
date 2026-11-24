/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import seedData from './data/seed.json';
import type {
  CrowdSize,
  Cue,
  EngineEvent,
  EngineState,
  FunnelAnswers,
  PlayedTrackRecord,
  SavedSet,
  SetlistResult,
  TimeOfNight,
} from './types/jap';
import { checkSeed } from './utils/japSeed';
import { PlayerEngine } from './utils/playerEngine';
import {
  getSavedSets,
  recordEventClient,
  saveSetToStorage,
} from './utils/clientApi';
import {
  buildSetlist,
  fitsSubtype,
  inLanguage,
  LANGUAGES,
  MIN_LANGUAGE_SONGS,
} from './utils/setlistBuilder';
import { NowPlaying } from './components/NowPlaying';
import { QueueDrawer } from './components/QueueDrawer';
import { SetReview } from './components/SetReview';
import { ExitButton, SongRequestBox } from './components/SharedControls';
import {
  MySetsView,
  ReaAnalysisView,
  SetSummaryView,
  SongListsView,
  TuneView,
} from './components/SubViews';
import { YtMusicMiniPlayer } from './components/YtMusicMiniPlayer';
import { YtPlaylistImporter } from './components/YtPlaylistImporter';
import { YtMusicExplorer } from './components/YtMusicExplorer';
import { EchoMusicPlayer } from './components/EchoMusicPlayer';
import { EchoMusicHome } from './components/EchoMusicHome';
import { EchoMusicSettings } from './components/EchoMusicSettings';

const TIME_CARDS: Array<{ id: TimeOfNight; label: string; hint: string }> = [
  {
    id: 'warmup',
    label: 'Warming up',
    hint: 'People arriving, building slowly',
  },
  { id: 'peak', label: 'Peak', hint: 'Full room, dancefloor energy' },
  { id: 'winddown', label: 'Winding down', hint: 'Late, easing off' },
  {
    id: 'bangers',
    label: 'Only bangers',
    hint: 'High energy only, no slow songs',
  },
];

const CROWD_CARDS: Array<{ id: CrowdSize; label: string; hint: string }> = [
  { id: 'small', label: '4–6', hint: 'Music you can talk over' },
  { id: 'medium', label: '10–20', hint: 'A proper party' },
  { id: 'large', label: '20+', hint: 'A dancefloor' },
];

interface OptionCardProps {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
  dim?: boolean;
  compact?: boolean;
  tall?: boolean;
}

const OptionCard: React.FC<OptionCardProps> = ({
  label,
  hint,
  selected,
  onClick,
  dim,
  compact,
  tall,
}) => (
  <button
    onClick={onClick}
    aria-pressed={selected}
    className={`flex flex-col justify-between rounded-3xl border-4 p-5 text-left transition active:scale-[0.98] md:p-6 ${
      tall
        ? 'min-h-24 md:min-h-[clamp(160px,28vh,300px)]'
        : compact
          ? 'min-h-24 md:min-h-28'
          : 'min-h-28 md:min-h-36'
    } ${
      selected
        ? 'bg-brand-mix border-gold text-ink shadow-[0_8px_30px_rgba(56,189,248,0.22)]'
        : 'border-white/20 bg-white/[0.015] hover:border-sky/80'
    } ${dim && !selected ? 'opacity-50' : ''}`}
  >
    <span
      className={`font-display uppercase leading-none ${
        tall
          ? 'text-4xl md:text-[clamp(44px,5vw,80px)]'
          : 'text-4xl md:text-5xl'
      }`}
    >
      {label}
    </span>
    {hint && (
      <span
        className={`mt-3 text-lg md:text-xl ${
          selected ? 'text-ink/75' : 'text-white/60'
        }`}
      >
        {hint}
      </span>
    )}
  </button>
);

const FloatingNextButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  raised?: boolean;
}> = ({ onClick, disabled, raised }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`bg-brand-mix fixed inset-x-6 z-30 h-20 rounded-3xl font-display text-4xl tracking-wide text-ink shadow-[0_-12px_40px_16px_rgba(6,13,24,0.9)] transition active:scale-[0.97] disabled:bg-white/10 disabled:bg-none disabled:text-white/35 md:inset-x-auto md:right-[max(2.5rem,calc((100vw-72rem)/2+2.5rem))] md:h-24 md:px-14 md:text-5xl ${
      raised
        ? 'bottom-24 md:bottom-28'
        : 'bottom-[max(16px,env(safe-area-inset-bottom))] md:bottom-8'
    }`}
  >
    NEXT →
  </button>
);

const FunnelStepSection: React.FC<{
  title: string;
  sub?: string;
  onBack?: () => void;
  children: React.ReactNode;
}> = ({ title, sub, onBack, children }) => (
  <section className="mt-[4vh] flex flex-1 flex-col md:mt-[6vh]">
    {onBack && (
      <button
        onClick={onBack}
        className="mb-6 self-start font-display text-2xl tracking-wide text-white/60 hover:text-white"
      >
        ← BACK
      </button>
    )}
    <h1 className="font-display text-[44px] uppercase leading-[0.9] md:text-[clamp(56px,8vw,120px)]">
      {title}
    </h1>
    {sub && <p className="mt-4 text-xl text-white/60 md:text-2xl">{sub}</p>}
    <div className="mt-7 flex flex-1 flex-col md:mt-10">{children}</div>
  </section>
);

type AppViewMode =
  | 'funnel'
  | 'review'
  | 'playing'
  | 'summary'
  | 'songs'
  | 'tune'
  | 'rea'
  | 'sets'
  | 'ytmusic'
  | 'echo';

export default function App() {
  const playableLibrary = useMemo(() => checkSeed(seedData).playable, []);
  const unsureCount = useMemo(
    () => playableLibrary.filter((c) => c.unsure && !c.play_full).length,
    [playableLibrary]
  );

  const [view, setView] = useState<AppViewMode>('funnel');
  const [step, setStep] = useState(0);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<TimeOfNight | null>(null);

  const [answers, setAnswers] = useState<FunnelAnswers | null>(null);
  const [setlistResult, setSetlistResult] = useState<SetlistResult | null>(null);

  const [engineReady, setEngineReady] = useState(false);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [engineEvents, setEngineEvents] = useState<EngineEvent[]>([]);
  const [engineGeneration, setEngineGeneration] = useState(0);
  const [showPlayerTile, setShowPlayerTile] = useState(false);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [echoPlayerOpen, setEchoPlayerOpen] = useState(false);
  const [echoSettingsOpen, setEchoSettingsOpen] = useState(false);

  const [playedSongs, setPlayedSongs] = useState<PlayedTrackRecord[]>([]);
  const playedLogRef = useRef<PlayedTrackRecord[]>([]);
  const eventSeqRef = useRef(0);

  const [savedSets, setSavedSets] = useState<SavedSet[]>(() => getSavedSets());

  // Refresh saved sets from client storage on mount
  useEffect(() => {
    setSavedSets(getSavedSets());
  }, []);

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PlayerEngine | null>(null);
  const finishCallbackRef = useRef<() => void>(() => {});

  const handleEndPartyToSummary = useCallback(() => {
    setQueueDrawerOpen(false);
    const history = playedLogRef.current.slice();
    if (history.length === 0) {
      setEngineState(null);
      setEngineEvents([]);
      setEngineGeneration((g) => g + 1);
      setView('funnel');
      setStep(0);
      return;
    }
    setPlayedSongs(history);
    setEngineState(null);
    setEngineEvents([]);
    setEngineGeneration((g) => g + 1);
    setView('summary');
  }, []);

  finishCallbackRef.current = handleEndPartyToSummary;

  // Initialize Dual-Deck PlayerEngine
  useEffect(() => {
    const engine = new PlayerEngine(playerHostRef.current, {
      styleHost: false,
      onDeckChange: setEngineState,
      onEvent: (ev) => {
        const seq = ++eventSeqRef.current;
        setEngineEvents((prev) => [...prev.slice(-19), { ...ev, n: seq }]);

        if (ev.type === 'live') {
          recordEventClient({ type: 'play', song_id: ev.cue.song_id });

          const prevLast = playedLogRef.current[playedLogRef.current.length - 1];
          if (!prevLast || prevLast.song_id !== ev.cue.song_id) {
            playedLogRef.current.push({
              song_id: ev.cue.song_id,
              title: ev.cue.title,
              artist: ev.cue.artist,
            });
          } else {
            prevLast.skipped = false;
          }
        }
        if (ev.type === 'previous') {
          const prevEntry = [...playedLogRef.current]
            .reverse()
            .find((p) => p.song_id === ev.cue.song_id);
          if (prevEntry) prevEntry.skipped = false;
        }
        if (ev.type === 'skip') {
          const last = [...playedLogRef.current]
            .reverse()
            .find((p) => p.song_id === ev.cue.song_id);
          if (last) last.skipped = true;
        }
        if (ev.type === 'finished') {
          finishCallbackRef.current();
        }
      },
      onLog: (msg) => console.log('[JAPxRock]', msg),
    });

    engineRef.current = engine;
    let cancelled = false;
    engine.init().then(() => {
      if (!cancelled) setEngineReady(true);
    });

    return () => {
      cancelled = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineGeneration]);

  const hasActivePlayback = Boolean(
    engineState && engineState.live && !engineState.finished
  );

  // Navigate to home without killing active playback (minimizes to YT Music Mini-Player if playing)
  const navigateToHome = () => {
    setStep(0);
    setView('funnel');
    window.scrollTo(0, 0);
  };

  // Hard reset that stops playback and resets funnel
  const resetToHome = () => {
    setQueueDrawerOpen(false);
    if (hasActivePlayback || view === 'playing') {
      setEngineState(null);
      setEngineEvents([]);
      setEngineGeneration((g) => g + 1);
    }
    setAnswers(null);
    setSetlistResult(null);
    setStep(0);
    setView('funnel');
    window.scrollTo(0, 0);
  };

  const handleApproveAndPlay = useCallback(
    (cuesToPlay: Cue[]) => {
      const eng = engineRef.current;
      if (!eng || !engineReady || cuesToPlay.length === 0) return;
      playedLogRef.current = [];
      eng.start(cuesToPlay);
      setView('playing');
    },
    [engineReady]
  );

  const countSongs = (langId: string, subId?: string) =>
    playableLibrary.filter((c) =>
      subId ? fitsSubtype(c, `${langId}:${subId}`) : inLanguage(c, langId)
    ).length;

  const toggleInList = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const activeLangObjects = LANGUAGES.filter((l) =>
    selectedLangs.includes(l.id)
  );

  return (
    <>
      {view === 'songs' ? (
        <SongListsView
          library={playableLibrary}
          onHome={navigateToHome}
          onStartVibeSet={(cues, title) => {
            const ans: FunnelAnswers = {
              languages: ['hindi', 'punjabi'],
              subtypes: [],
              time: 'peak',
              crowd: 'medium',
            };
            setAnswers(ans);
            setSetlistResult({
              cues,
              fillers: new Set(),
              note: `${title} · Ready to drop straight into the hook.`,
            });
            setView('review');
          }}
        />
      ) : view === 'tune' ? (
        <TuneView library={playableLibrary} onHome={navigateToHome} />
      ) : view === 'rea' ? (
        <ReaAnalysisView
          libraryCount={playableLibrary.length}
          onHome={navigateToHome}
        />
      ) : view === 'sets' ? (
        <MySetsView
          sets={savedSets}
          library={playableLibrary}
          onHome={navigateToHome}
          onDeleteSet={(id) =>
            setSavedSets((prev) => prev.filter((s) => s.id !== id))
          }
          onRenameSet={(id, newName) =>
            setSavedSets((prev) =>
              prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
            )
          }
          onReplaySet={(res, ans) => {
            setAnswers(ans);
            setSetlistResult(res);
            setView('review');
          }}
        />
      ) : view === 'ytmusic' ? (
        <YtMusicExplorer
          onBack={navigateToHome}
          onPlaySet={(cues) => {
            const ans: FunnelAnswers = {
              languages: ['hindi', 'punjabi'],
              subtypes: [],
              time: 'peak',
              crowd: 'medium',
            };
            setAnswers(ans);
            setSetlistResult({
              cues,
              fillers: new Set(),
              note: 'Selected from YouTube Music catalog.',
            });
            handleApproveAndPlay(cues);
          }}
          onPlayNext={(cues) => {
            if (hasActivePlayback && engineRef.current) {
              engineRef.current.playNextBatch(cues);
            } else {
              handleApproveAndPlay(cues);
            }
          }}
          onAddToQueue={(cues) => {
            if (hasActivePlayback && engineRef.current) {
              engineRef.current.appendToQueue(cues);
            } else {
              handleApproveAndPlay(cues);
            }
          }}
          hasActivePlayback={hasActivePlayback}
          onOpenEcho={() => setView('echo')}
        />
      ) : view === 'echo' ? (
        <EchoMusicHome
          onPlaySong={(cue, title) => {
            const ans: FunnelAnswers = {
              languages: ['hindi', 'punjabi'],
              subtypes: [],
              time: 'peak',
              crowd: 'medium',
            };
            setAnswers(ans);
            setSetlistResult({
              cues: [cue],
              fillers: new Set(),
              note: `Selected from Echo Music: ${title}`,
            });
            handleApproveAndPlay([cue]);
            setEchoPlayerOpen(true);
          }}
          onOpenPlayer={() => setEchoPlayerOpen(true)}
          onOpenSettings={() => setEchoSettingsOpen(true)}
          onOpenSearch={() => setView('ytmusic')}
          onOpenQueue={() => setQueueDrawerOpen(true)}
          activeCue={engineState?.live ? engineState.decks[engineState.live]?.cue : null}
          isPlaying={Boolean(engineState && !engineState.paused && !engineState.finished && engineState.live)}
          onTogglePlayPause={() => engineRef.current?.togglePause()}
          onNext={() => engineRef.current?.skip()}
          onPrev={() => engineRef.current?.previous()}
          library={playableLibrary}
        />
      ) : view === 'review' && setlistResult && answers ? (
        <SetReview
          result={setlistResult}
          ready={engineReady}
          onApprove={handleApproveAndPlay}
          onBack={() => setView('funnel')}
          onHome={navigateToHome}
        />
      ) : view === 'playing' && engineRef.current && engineState ? (
        <NowPlaying
          engine={engineRef.current}
          state={engineState}
          events={engineEvents}
          onNewSet={handleEndPartyToSummary}
          onExit={handleEndPartyToSummary}
          onMinimize={navigateToHome}
          onOpenQueue={() => setQueueDrawerOpen(true)}
          onOpenYtMusic={() => setView('ytmusic')}
          onOpenEchoPlayer={() => setEchoPlayerOpen(true)}
          answers={answers}
          library={playableLibrary}
          showPlayerTile={showPlayerTile}
          onTogglePlayerTile={() => setShowPlayerTile((v) => !v)}
          onRetune={(nextAns) => {
            const playedSet = new Set(
              playedLogRef.current.map((p) => p.song_id)
            );
            const built = buildSetlist(
              playableLibrary.filter((c) => !playedSet.has(c.song_id)),
              nextAns
            );
            engineRef.current?.requeue(built.cues);
            setAnswers(nextAns);
            return built.cues[0]?.title ?? null;
          }}
          playedIds={() => playedLogRef.current.map((p) => p.song_id)}
        />
      ) : view === 'summary' ? (
        <SetSummaryView
          songs={playedSongs}
          answers={answers}
          unsureCount={unsureCount}
          onNewSet={resetToHome}
          onOpenTune={() => setView('tune')}
          onSaveSet={(setName) => {
            const newSaved: SavedSet = {
              id: `set-${Date.now()}`,
              name: setName,
              createdAt: new Date().toISOString(),
              answers: answers ?? {
                languages: ['hindi', 'punjabi'],
                subtypes: [],
                time: 'peak',
                crowd: 'medium',
              },
              songs: playedSongs,
            };
            const updated = saveSetToStorage(newSaved);
            setSavedSets(updated);
          }}
        />
      ) : (
        /* 4-Step JAPxRock Funnel + YouTube Music Playlist Hook Importer */
        <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 pb-36 pt-10 md:px-10 md:pb-44">
          {/* Header */}
          <div className="flex items-center justify-between font-display text-3xl tracking-wide">
            <button
              onClick={resetToHome}
              className="text-brand-mix"
              aria-label="JAPxRock home"
            >
              JAPxRock
            </button>

            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => setView('echo')}
                title="Echo Music with Auto Best Part of Song Picking"
                className="flex items-center gap-1.5 rounded-full border-2 border-[#ff3b30]/80 bg-[#ff3b30]/15 px-3 py-1 font-display text-sm tracking-wide text-[#ff6b60] transition hover:bg-[#ff3b30] hover:text-white md:text-lg shadow-[0_0_15px_rgba(255,59,48,0.25)]"
              >
                <span className="flex h-3.5 w-5 items-center justify-center rounded-full bg-[#ff3b30] text-black">
                  <svg className="h-2.5 w-4" viewBox="0 0 28 16" fill="currentColor">
                    <ellipse cx="14" cy="8" rx="13" ry="7" fill="#ff3b30" />
                    <ellipse cx="14" cy="8" rx="5" ry="3" fill="#000000" />
                  </svg>
                </span>
                <span>ECHO MUSIC</span>
              </button>
              <button
                onClick={() => setView('ytmusic')}
                title="Search and play from YouTube Music library"
                className="flex items-center gap-1.5 rounded-full border-2 border-red-500/80 bg-red-500/10 px-3 py-1 font-display text-sm tracking-wide text-red-400 transition hover:bg-red-500 hover:text-white md:text-lg"
              >
                <span>🎵</span>
                <span>YT MUSIC</span>
              </button>
              {step === 0 && (
                <>
                  <button
                    onClick={() => setView('rea')}
                    className="text-xl text-white/70 transition hover:text-gold md:text-2xl"
                  >
                    REA MATH
                  </button>
                  <button
                    onClick={() => setView('sets')}
                    className="text-xl text-white/70 transition hover:text-sky md:text-2xl"
                  >
                    MY SETS{savedSets.length > 0 ? ` (${savedSets.length})` : ''}
                  </button>
                </>
              )}
              <span className="text-white/50 tabular-nums">{step + 1} / 4</span>
              {step > 0 && <ExitButton onExit={resetToHome} />}
            </div>
          </div>

          {step === 0 && (
            <FunnelStepSection
              title="What are we playing?"
              sub="Paste any YouTube Music playlist link below — or pick every language the room wants."
            >
              {/* Paste Any YouTube Music / YouTube Playlist Link & Mathematical Hook Engine */}
              <YtPlaylistImporter
                onPlaylistAnalyzed={(res, ans) => {
                  setAnswers(ans);
                  setSetlistResult(res);
                  setView('review');
                  window.scrollTo(0, 0);
                }}
                onAppendToActiveQueue={
                  hasActivePlayback
                    ? (cues) => {
                        engineRef.current?.appendToQueue(cues);
                      }
                    : undefined
                }
              />

              <p className="text-brand-mix mb-4 font-display text-2xl tracking-wide md:text-3xl">
                ⚡ HOUSE PARTY? OR PICK LANGUAGES &amp; JAPxRock BUILDS THE SET:
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {LANGUAGES.filter(
                  (l) => countSongs(l.id) >= MIN_LANGUAGE_SONGS
                ).map((l) => {
                  const total = countSongs(l.id);
                  return (
                    <OptionCard
                      key={l.id}
                      selected={selectedLangs.includes(l.id)}
                      onClick={() =>
                        setSelectedLangs(toggleInList(selectedLangs, l.id))
                      }
                      label={l.label}
                      hint={`${total} song${total === 1 ? '' : 's'} ready`}
                      dim={total === 0}
                    />
                  );
                })}
              </div>

              {LANGUAGES.some((l) => countSongs(l.id) < MIN_LANGUAGE_SONGS) && (
                <p className="mt-6 text-lg text-white/45">
                  Coming soon:{' '}
                  {LANGUAGES.filter(
                    (l) => countSongs(l.id) < MIN_LANGUAGE_SONGS
                  )
                    .map((l) => l.label)
                    .join(', ')}
                  .
                </p>
              )}

              <div className="mt-10 flex flex-wrap items-center justify-between gap-6">
                <SongRequestBox />
                <FloatingNextButton
                  raised={hasActivePlayback}
                  disabled={selectedLangs.length === 0}
                  onClick={() => {
                    setStep(1);
                    window.scrollTo(0, 0);
                  }}
                />
              </div>

              <p className="mt-12 text-lg text-white/40">
                Plays through YouTube ·{' '}
                <button
                  onClick={() => setView('ytmusic')}
                  className="font-semibold text-red-400 underline hover:text-white"
                >
                  YouTube Music Explorer
                </button>{' '}
                ·{' '}
                <button
                  onClick={() => setView('songs')}
                  className="underline hover:text-white"
                >
                  Song lists ({playableLibrary.length})
                </button>{' '}
                ·{' '}
                <button
                  onClick={() => setView('tune')}
                  className="underline hover:text-white"
                >
                  Tune hooks ({unsureCount})
                </button>{' '}
                ·{' '}
                <button
                  onClick={() => setView('rea')}
                  className="underline hover:text-lime"
                >
                  REA Architecture &amp; Math
                </button>
              </p>
            </FunnelStepSection>
          )}

          {step === 1 && (
            <FunnelStepSection
              title="What kind?"
              sub="Optional. Skip a language to take anything in it."
              onBack={() => setStep(0)}
            >
              <div className="flex flex-col gap-8">
                {activeLangObjects.map((lang) => (
                  <div key={lang.id}>
                    <h3 className="mb-3 font-display text-3xl uppercase tracking-wide text-white/60">
                      {lang.label}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {lang.subtypes
                        .filter((sub) => countSongs(lang.id, sub.id) > 0)
                        .map((sub) => {
                          const key = `${lang.id}:${sub.id}`;
                          const cnt = countSongs(lang.id, sub.id);
                          return (
                            <OptionCard
                              key={key}
                              selected={selectedSubtypes.includes(key)}
                              onClick={() =>
                                setSelectedSubtypes(
                                  toggleInList(selectedSubtypes, key)
                                )
                              }
                              label={sub.label}
                              hint={`${cnt} ready`}
                              dim={cnt === 0}
                              compact
                            />
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
              <FloatingNextButton
                onClick={() => {
                  setStep(2);
                  window.scrollTo(0, 0);
                }}
              />
            </FunnelStepSection>
          )}

          {step === 2 && (
            <FunnelStepSection
              title="Where in the night are we?"
              onBack={() => setStep(1)}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {TIME_CARDS.map((tc) => (
                  <OptionCard
                    key={tc.id}
                    selected={selectedTime === tc.id}
                    label={tc.label}
                    hint={tc.hint}
                    tall
                    onClick={() => {
                      setSelectedTime(tc.id);
                      setStep(3);
                      window.scrollTo(0, 0);
                    }}
                  />
                ))}
              </div>
            </FunnelStepSection>
          )}

          {step === 3 && (
            <FunnelStepSection
              title="How many people?"
              onBack={() => setStep(2)}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {CROWD_CARDS.map((cc) => (
                  <OptionCard
                    key={cc.id}
                    selected={false}
                    label={cc.label}
                    hint={cc.hint}
                    tall
                    onClick={() => {
                      const finalAnswers: FunnelAnswers = {
                        languages: selectedLangs,
                        subtypes: selectedSubtypes,
                        time: selectedTime ?? 'peak',
                        crowd: cc.id,
                      };
                      const built = buildSetlist(playableLibrary, finalAnswers);
                      setAnswers(finalAnswers);
                      setSetlistResult(built);
                      setView('review');
                      window.scrollTo(0, 0);
                    }}
                  />
                ))}
              </div>
            </FunnelStepSection>
          )}
        </main>
      )}

      {/* Live Queue & Playlist Sequencer Drawer (accessible in both Full Player and Minimized Mini-Player) */}
      {engineRef.current && engineState && hasActivePlayback && (
        <QueueDrawer
          open={queueDrawerOpen}
          onClose={() => setQueueDrawerOpen(false)}
          engine={engineRef.current}
          state={engineState}
        />
      )}

      {/* YouTube Music-style Minimized Bottom Mini-Player Bar when browsing outside 'playing' view */}
      {view !== 'playing' &&
        view !== 'echo' &&
        hasActivePlayback &&
        engineRef.current &&
        engineState && (
          <YtMusicMiniPlayer
            engine={engineRef.current}
            state={engineState}
            onExpand={() => setEchoPlayerOpen(true)}
            onOpenQueue={() => setQueueDrawerOpen(true)}
            onExitSet={handleEndPartyToSummary}
          />
        )}

      {/* Full-Screen Echo Music Player (with Auto Best Part Picking & Download Best Part) */}
      {echoPlayerOpen && engineRef.current && engineState && (
        <EchoMusicPlayer
          engine={engineRef.current}
          state={engineState}
          onClose={() => setEchoPlayerOpen(false)}
          onOpenQueue={() => setQueueDrawerOpen(true)}
          onOpenSettings={() => setEchoSettingsOpen(true)}
        />
      )}

      {/* Echo Music Main Settings (with Auto Best Part Picking Configuration) */}
      {echoSettingsOpen && (
        <EchoMusicSettings
          open={echoSettingsOpen}
          onClose={() => setEchoSettingsOpen(false)}
          onSettingsChange={(settings) => {
            if (engineRef.current) {
              engineRef.current.crossfadeDurationMs = Math.round(settings.crossfadeSec * 1000);
            }
          }}
        />
      )}

      {/* Dual-Deck YouTube IFrame Host Container */}
      <div
        ref={playerHostRef}
        aria-hidden="true"
        className="jap-players"
        data-visible={showPlayerTile && view === 'playing' ? 'true' : 'false'}
        key={`players-${engineGeneration}`}
      />
    </>
  );
}
