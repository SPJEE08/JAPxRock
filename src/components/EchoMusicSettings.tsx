import React, { useEffect, useState } from 'react';

export interface EchoHookSettings {
  autoBestPartEnabled: boolean;
  hookWindowMode: 'verse-hook' | 'quick-drop' | 'climax' | 'full';
  crossfadeSec: number;
  equalPowerCurve: boolean;
  autoDownloadOnLike: boolean;
  exportFormat: 'wav' | 'mp3';
  audioQuality: 'lossless' | 'high' | 'standard';
  theme: 'dark-red' | 'pitch-black' | 'burgundy';
  wavyButton: boolean;
}

export const DEFAULT_ECHO_SETTINGS: EchoHookSettings = {
  autoBestPartEnabled: true,
  hookWindowMode: 'verse-hook',
  crossfadeSec: 2.2,
  equalPowerCurve: true,
  autoDownloadOnLike: false,
  exportFormat: 'wav',
  audioQuality: 'lossless',
  theme: 'dark-red',
  wavyButton: true,
};

const ECHO_SETTINGS_STORAGE_KEY = 'echomusic.settings';

export function getEchoMusicSettings(): EchoHookSettings {
  try {
    const raw = localStorage.getItem(ECHO_SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_ECHO_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_ECHO_SETTINGS;
}

export function saveEchoMusicSettings(settings: EchoHookSettings): void {
  try {
    localStorage.setItem(ECHO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export interface EchoMusicSettingsProps {
  open: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: EchoHookSettings) => void;
}

export const EchoMusicSettings: React.FC<EchoMusicSettingsProps> = ({
  open,
  onClose,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<EchoHookSettings>(getEchoMusicSettings);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    setSettings(getEchoMusicSettings());
  }, [open]);

  if (!open) return null;

  const update = <K extends keyof EchoHookSettings>(key: K, val: EchoHookSettings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    saveEchoMusicSettings(updated);
    onSettingsChange?.(updated);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md font-sans text-white"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-[#ff3b30]/30 bg-[#160a0c] shadow-[0_20px_60px_rgba(255,59,48,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#1f0e11]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff3b30] text-black">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="9" />
                <ellipse cx="12" cy="12" rx="4" ry="7" fill="#160a0c" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Echo Music Settings</h2>
              <p className="text-xs text-white/50">Playback &amp; Best Part Hook Configuration</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-lg text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content list */}
        <div className="jap-scroll flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {savedFeedback && (
            <div className="rounded-xl border border-lime/40 bg-lime/10 px-4 py-2 text-xs font-mono text-lime">
              ✓ Settings saved and applied!
            </div>
          )}

          {/* SECTION 1: AUTO BEST PART OF SONG PICKING (CORE FEATURE) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ff3b30] text-[10px] font-bold text-white">
                ⚡
              </span>
              <h3 className="font-mono text-xs uppercase tracking-wider text-[#ff5b50] font-semibold">
                Auto Best Part / Hook Engine
              </h3>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/10">
              <div className="pr-4">
                <p className="text-sm font-semibold text-white">Auto Best Part of Song Picking</p>
                <p className="text-xs text-white/60 mt-0.5">
                  Automatically skips intros and drops straight into the detected best chorus &amp; verse climax.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoBestPartEnabled}
                onClick={() => update('autoBestPartEnabled', !settings.autoBestPartEnabled)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  settings.autoBestPartEnabled ? 'bg-[#ff3b30]' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                    settings.autoBestPartEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Hook Window Mode */}
            <div className="rounded-2xl bg-white/[0.03] p-4 border border-white/10 space-y-2">
              <label className="text-sm font-semibold text-white">Best Part Window Mode</label>
              <p className="text-xs text-white/60">
                Choose the duration and intensity of the automatically selected best part:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  { id: 'verse-hook', label: 'Verse & Chorus', hint: '30s – 75s (Recommended)' },
                  { id: 'quick-drop', label: 'Quick Drop', hint: '20s – 45s (Fast Party)' },
                  { id: 'climax', label: 'Peak Climax', hint: '15s – 35s (Only Bangers)' },
                  { id: 'full', label: 'Full Song', hint: 'Plays complete track' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => update('hookWindowMode', mode.id as any)}
                    className={`flex flex-col items-start rounded-xl p-3 text-left border transition ${
                      settings.hookWindowMode === mode.id
                        ? 'border-[#ff3b30] bg-[#ff3b30]/15 text-white'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs font-semibold">{mode.label}</span>
                    <span className="text-[10px] text-white/50 mt-0.5">{mode.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Crossfade Duration Slider */}
            <div className="rounded-2xl bg-white/[0.03] p-4 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Crossfade Duration</span>
                <span className="font-mono text-xs text-[#ff5b50] font-bold">
                  {settings.crossfadeSec.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.1"
                value={settings.crossfadeSec}
                onChange={(e) => update('crossfadeSec', parseFloat(e.target.value))}
                className="w-full accent-[#ff3b30]"
              />
              <div className="flex justify-between text-[10px] text-white/40 font-mono">
                <span>0.5s (Sharp Cut)</span>
                <span>2.2s (Standard DJ)</span>
                <span>5.0s (Club Blend)</span>
              </div>
            </div>

            {/* Equal Power Curve */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/10">
              <div className="pr-4">
                <p className="text-sm font-semibold text-white">Equal-Power Trigonometric S-Curve</p>
                <p className="text-xs text-white/60 mt-0.5">
                  Maintains constant acoustic volume (sin² + cos² = 1) to eliminate volume dips during transitions.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.equalPowerCurve}
                onClick={() => update('equalPowerCurve', !settings.equalPowerCurve)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  settings.equalPowerCurve ? 'bg-[#ff3b30]' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                    settings.equalPowerCurve ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* SECTION 2: DOWNLOAD & EXPORT OPTIONS */}
          <div className="space-y-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-white/50 font-semibold">
              Download &amp; Export Format
            </h3>

            {/* Export Format */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/10">
              <div>
                <p className="text-sm font-semibold text-white">Best Part Clip Download Format</p>
                <p className="text-xs text-white/60">Choose output audio format when saving hook clips:</p>
              </div>
              <div className="flex rounded-lg border border-white/20 bg-white/5 p-1">
                {(['wav', 'mp3'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => update('exportFormat', fmt)}
                    className={`rounded-md px-3 py-1 text-xs uppercase font-mono font-bold transition ${
                      settings.exportFormat === fmt ? 'bg-[#ff3b30] text-white' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto download on like */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/10">
              <div className="pr-4">
                <p className="text-sm font-semibold text-white">Auto-Download Best Part on Like</p>
                <p className="text-xs text-white/60 mt-0.5">
                  Automatically export and download the best part hook clip whenever you heart a song.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoDownloadOnLike}
                onClick={() => update('autoDownloadOnLike', !settings.autoDownloadOnLike)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  settings.autoDownloadOnLike ? 'bg-[#ff3b30]' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                    settings.autoDownloadOnLike ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* SECTION 3: AUDIO & APPEARANCE */}
          <div className="space-y-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-white/50 font-semibold">
              Player Aesthetics &amp; Audio Quality
            </h3>

            {/* Audio Quality */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/10">
              <div>
                <p className="text-sm font-semibold text-white">Streaming Audio Quality</p>
                <p className="text-xs text-white/60">High-bitrate studio audio processing</p>
              </div>
              <select
                value={settings.audioQuality}
                onChange={(e) => update('audioQuality', e.target.value as any)}
                className="rounded-lg border border-white/20 bg-[#1f0e11] px-3 py-1.5 text-xs font-sans text-white focus:outline-none"
              >
                <option value="lossless">Lossless (320kbps)</option>
                <option value="high">High (256kbps)</option>
                <option value="standard">Normal (160kbps)</option>
              </select>
            </div>

            {/* Wavy Rotating Button */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/10">
              <div className="pr-4">
                <p className="text-sm font-semibold text-white">Wavy 9-Petal Play/Pause Shape</p>
                <p className="text-xs text-white/60 mt-0.5">
                  Signature Echo Music animated flower cookie button that rotates during playback.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.wavyButton}
                onClick={() => update('wavyButton', !settings.wavyButton)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  settings.wavyButton ? 'bg-[#ff3b30]' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                    settings.wavyButton ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 bg-[#1f0e11] px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-white/40 font-mono">Echo Music Engine v2.4</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-black hover:bg-white/90 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
