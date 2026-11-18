import React, { useState } from 'react';
import type {
  Cue,
  FunnelAnswers,
  HookWindowMode,
  SetlistResult,
  TimeOfNight,
} from '../types/jap';
import { analyzeYouTubeInputClient } from '../utils/clientApi';

export interface YtPlaylistImporterProps {
  onPlaylistAnalyzed: (result: SetlistResult, answers: FunnelAnswers) => void;
  onAppendToActiveQueue?: (cues: Cue[], playlistTitle: string) => void;
  compact?: boolean;
}

const YT_PLAYLIST_PRESETS = [
  {
    id: 'PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
    label: 'Global Pop Anthems (Live YT)',
    sub: 'Lady Gaga · Bruno Mars · ROSÉ · Dua Lipa',
    url: 'https://music.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
    lang: 'english',
  },
  {
    id: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    label: 'YouTube Top 100 Global (Live YT)',
    sub: 'Live YouTube Charts Playlist',
    url: 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    lang: 'english',
  },
  {
    id: 'RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs',
    label: 'YT Music Hit List (Live YT)',
    sub: '50+ Featured YT Music Hits',
    url: 'https://music.youtube.com/playlist?list=RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs',
    lang: 'english',
  },
  {
    id: 'jap-preset:punjabi-club',
    label: 'Punjabi Club Bangers',
    sub: 'AP Dhillon · Karan Aujla · Diljit',
    url: 'jap-preset:punjabi-club',
    lang: 'punjabi',
  },
  {
    id: 'jap-preset:bollywood-peak',
    label: 'Bollywood Peak Dancefloor',
    sub: '22 High-Energy Party Hooks',
    url: 'jap-preset:bollywood-peak',
    lang: 'hindi',
  },
];

const HOOK_MODES: Array<{ id: HookWindowMode; label: string; desc: string }> = [
  {
    id: 'tight',
    label: 'Tight Hook (~35s)',
    desc: 'Fast peak chorus cuts',
  },
  {
    id: 'verse-hook',
    label: 'Best Verse + Hook (~50s)',
    desc: 'JAPxRock signature riser + best verse + drop',
  },
  {
    id: 'extended',
    label: 'Extended Mix (~75s)',
    desc: 'Two verses & chorus for club sets',
  },
  {
    id: 'full',
    label: 'Full Song',
    desc: 'No mid-song cut, only end crossfade',
  },
];

const TIME_MODES: Array<{ id: TimeOfNight; label: string }> = [
  { id: 'peak', label: 'Peak Wave' },
  { id: 'bangers', label: 'Only Bangers' },
  { id: 'warmup', label: 'Warm-Up Ramp' },
  { id: 'winddown', label: 'Wind Down' },
];

export const YtPlaylistImporter: React.FC<YtPlaylistImporterProps> = ({
  onPlaylistAnalyzed,
  onAppendToActiveQueue,
  compact = false,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [hookMode, setHookMode] = useState<HookWindowMode>('verse-hook');
  const [timeMode, setTimeMode] = useState<TimeOfNight>('peak');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const [showAdvancedMath, setShowAdvancedMath] = useState(false);

  const handleAppendActive = async () => {
    const finalUrl = urlInput.trim();
    if (!finalUrl || !onAppendToActiveQueue) {
      setError('Paste a YouTube Music playlist link or video URL first.');
      return;
    }
    setLoading(true);
    setError(null);
    setAddedMsg(null);
    try {
      const data = await analyzeYouTubeInputClient({
        url: finalUrl,
        hookMode,
        timeMode,
        optimizeOrder: false,
      });
      if (!data.ok || !Array.isArray(data.cues) || data.cues.length === 0) {
        throw new Error(data.error || 'Could not analyze link.');
      }
      const isPlaylist =
        finalUrl.includes('list=') ||
        finalUrl.includes('/playlist') ||
        finalUrl.includes('/browse/');
      const cuesToAdd: Cue[] = isPlaylist ? data.cues : [data.cues[0]];
      onAppendToActiveQueue(cuesToAdd, data.playlistTitle || 'YouTube Track');
      setAddedMsg(
        cuesToAdd.length === 1
          ? `Added "${cuesToAdd[0].title}" to active queue!`
          : `Added ${cuesToAdd.length} tracks from "${data.playlistTitle}" to active queue!`
      );
      setUrlInput('');
    } catch (e: any) {
      setError(e?.message || 'Failed to add YouTube URL to active queue.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (targetUrl?: string) => {
    const finalUrl = (targetUrl ?? urlInput).trim();
    if (!finalUrl) {
      setError('Paste a YouTube Music playlist link, YouTube URL, or artist name first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await analyzeYouTubeInputClient({
        url: finalUrl,
        hookMode,
        timeMode,
        optimizeOrder: false,
      });
      if (!data.ok || !Array.isArray(data.cues)) {
        throw new Error(data.error || 'Could not analyze playlist link.');
      }

      const cues: Cue[] = data.cues;
      const detectedLangs = Array.from(
        new Set(cues.map((c) => c.language).filter(Boolean))
      );

      onPlaylistAnalyzed(
        {
          cues,
          fillers: new Set(),
          note: `${data.playlistTitle} · Mathematical Hook Engine isolated the best verse & drop on ${cues.length} tracks (saved ${Math.round(
            (data.totalTimeSavedSec || 0) / 60
          )} mins of slow intros/outros · avg hook score J* = ${data.avgHookScore}).`,
          playlistMeta: {
            title: data.playlistTitle,
            sourceUrl: finalUrl,
            hookMode,
            avgHookScore: data.avgHookScore,
            totalTimeSavedSec: data.totalTimeSavedSec,
          },
        },
        {
          languages: detectedLangs.length ? detectedLangs : ['hindi', 'punjabi'],
          subtypes: [],
          time: timeMode,
          crowd: 'medium',
        }
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to analyze YouTube Music playlist.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-3xl border-4 border-sky/60 bg-gradient-to-br from-sky/[0.08] via-white/[0.03] to-gold/[0.08] p-4 shadow-[0_0_40px_rgba(56,189,248,0.12)] transition-colors hover:border-gold md:p-5 ${
        compact ? '' : 'mb-6'
      }`}
      data-testid="yt-playlist-importer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-brand-mix font-display text-xl uppercase tracking-wide md:text-2xl">
            PASTE ANY YOUTUBE MUSIC OR YOUTUBE PLAYLIST LINK
          </p>
          <p className="mt-0.5 text-sm text-white/75 md:text-base">
            Drop any{' '}
            <span className="font-mono text-white">
              music.youtube.com/playlist?list=...
            </span>{' '}
            link or video URL — JAPxRock computes the optimal best-verse hook window{' '}
            <span className="font-mono font-semibold text-gold">[t_in*, t_out*]</span> and
            crossfades automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvancedMath((v) => !v)}
          className="rounded-full border-2 border-sky/40 bg-white/5 px-3.5 py-1 font-display text-sm tracking-wide text-white/90 transition hover:border-gold hover:text-gold md:text-base"
        >
          {showAdvancedMath ? 'HIDE HOOK MATH ▲' : 'HOOK ENGINE SETTINGS ⚙'}
        </button>
      </div>

      {/* URL Input Row */}
      <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="yt-playlist-url-input" className="sr-only">
          YouTube Music or YouTube Playlist URL
        </label>
        <input
          id="yt-playlist-url-input"
          type="text"
          value={urlInput}
          onChange={(e) => {
            setUrlInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAnalyze();
            }
          }}
          placeholder="Paste https://music.youtube.com/playlist?list=... or YouTube watch link"
          className="h-13 flex-1 rounded-2xl border-2 border-white/25 bg-ink px-4 text-base text-white placeholder:text-white/40 focus:border-gold focus:outline-none md:text-lg"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => handleAnalyze()}
          className="bg-brand-mix h-13 shrink-0 rounded-2xl px-6 font-display text-xl tracking-wide text-ink shadow-[0_6px_24px_rgba(250,204,21,0.22)] transition active:scale-[0.98] disabled:opacity-50 md:text-2xl"
        >
          {loading ? 'ANALYZING HOOKS…' : 'EXTRACT HOOKS & PLAY →'}
        </button>
        {onAppendToActiveQueue && (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleAppendActive()}
            data-testid="home-add-to-queue-btn"
            className="h-13 shrink-0 rounded-2xl border-2 border-gold bg-gold/15 px-5 font-display text-lg tracking-wide text-gold transition hover:bg-gold hover:text-ink active:scale-[0.98] disabled:opacity-50 md:text-xl"
          >
            ＋ ADD TO CURRENT QUEUE
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-base font-medium text-lime">
          {error}
        </p>
      )}
      {addedMsg && (
        <p role="status" className="mt-3 font-mono text-sm font-semibold text-sky">
          {addedMsg}
        </p>
      )}

      {/* Hook Math & Energy Trajectory Settings */}
      {showAdvancedMath && (
        <div className="mt-5 grid gap-5 border-t-2 border-white/10 pt-5 md:grid-cols-2">
          <div>
            <p className="mb-2 font-display text-lg uppercase tracking-wide text-white/50">
              Hook Window Target Length L = [t_in*, t_out*]
            </p>
            <div className="grid grid-cols-2 gap-2">
              {HOOK_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setHookMode(m.id)}
                  className={`flex flex-col rounded-2xl border-2 p-3 text-left transition ${
                    hookMode === m.id
                      ? 'border-lime bg-lime text-ink'
                      : 'border-white/20 text-white/80 hover:border-white/50'
                  }`}
                >
                  <span className="font-display text-lg uppercase leading-none">
                    {m.label}
                  </span>
                  <span
                    className={`mt-1 text-xs ${
                      hookMode === m.id ? 'text-ink/75' : 'text-white/50'
                    }`}
                  >
                    {m.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 font-display text-lg uppercase tracking-wide text-white/50">
              TSP Energy-Arc Sequencing Mode
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIME_MODES.map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  onClick={() => setTimeMode(tm.id)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left font-display text-xl uppercase tracking-wide transition ${
                    timeMode === tm.id
                      ? 'border-lime bg-lime text-ink'
                      : 'border-white/20 text-white/80 hover:border-white/50'
                  }`}
                >
                  {tm.label}
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-xs text-white/45">
              Objective: J(t_in,t_out) = 0.50·μ_w + 0.22·∇⁺H(t_in) + 0.20·P_pos(t_in/D) -
              0.12·σ_w²
            </p>
          </div>
        </div>
      )}

      {/* Instant 1-Click YouTube Music Playlist Presets */}
      <div className="mt-5">
        <p className="mb-2.5 font-display text-base uppercase tracking-wide text-white/45">
          OR LOAD AN INSTANT YOUTUBE MUSIC PARTY PLAYLIST:
        </p>
        <div className="flex flex-wrap gap-2.5">
          {YT_PLAYLIST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={loading}
              onClick={() => {
                setUrlInput(preset.url);
                handleAnalyze(preset.url);
              }}
              className="group flex flex-col rounded-2xl border-2 border-white/20 bg-white/[0.02] px-4 py-2.5 text-left transition hover:border-gold hover:bg-sky/10 active:scale-[0.98]"
            >
              <span className="font-display text-lg uppercase tracking-wide text-white group-hover:text-gold">
                ▶ {preset.label}
              </span>
              <span className="text-xs text-white/55">{preset.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
