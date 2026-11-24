import React, { useState } from 'react';
import type { Cue } from '../types/jap';

export interface EchoMusicHomeProps {
  onPlaySong: (cue: Cue, title: string) => void;
  onOpenPlayer: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenQueue: () => void;
  activeCue: Cue | null;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  library: Cue[];
}

export const EchoMusicHome: React.FC<EchoMusicHomeProps> = ({
  onPlaySong,
  onOpenPlayer,
  onOpenSettings,
  onOpenSearch,
  onOpenQueue,
  activeCue,
  isPlaying,
  onTogglePlayPause,
  onNext,
  onPrev,
  library,
}) => {
  const [activeFilter, setActiveFilter] = useState<'Podcasts' | 'Romance' | 'Feel good' | 'Relax' | 'Party' | 'Dance'>('Party');
  const [showReplay, setShowReplay] = useState(true);

  // Curated collections matching screenshot
  const danceSections = [
    {
      title: 'Bollywood Recharger',
      artist: 'Tanishk Bagchi',
      tag: 'Bollywood Recharger',
      thumbnail: 'https://i.ytimg.com/vi/aoIhamvZKdQ/hqdefault.jpg',
      query: 'tanishk',
    },
    {
      title: 'Punjabi Party',
      artist: 'Karan Aujla',
      tag: 'PUNJABI PARTY',
      thumbnail: 'https://i.ytimg.com/vi/kPa7bsKwL-c/hqdefault.jpg',
      query: 'karan aujla',
    },
    {
      title: 'Tollywood Party',
      artist: 'Nakash Aziz',
      tag: 'TOLLYWOOD PARTY',
      thumbnail: 'https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg',
      query: 'nakash',
    },
  ];

  const hindiHits = [
    {
      title: '00s Bollywood Romance',
      artist: 'Alka Yagnik',
      tag: '00s Bollywood Romance',
      thumbnail: 'https://i.ytimg.com/vi/CEbB9kdu8ng/hqdefault.jpg',
      query: 'alka yagnik',
    },
    {
      title: 'Bollywood Romance Uncut',
      artist: 'Arijit Singh',
      tag: 'UNCUT BOLLYWOOD',
      thumbnail: 'https://i.ytimg.com/vi/gvyUuxdRdAk/hqdefault.jpg',
      query: 'arijit',
    },
    {
      title: '90s Bollywood Romance',
      artist: 'Alka Yagnik',
      tag: '90s Bollywood Romance',
      thumbnail: 'https://i.ytimg.com/vi/CEbB9kdu8ng/hqdefault.jpg',
      query: 'udit narayan',
    },
  ];

  const handleCardClick = (title: string, queryText: string) => {
    const q = queryText.toLowerCase();
    const matched = library.filter(
      (c) => c.title.toLowerCase().includes(q) || c.artist.toLowerCase().includes(q)
    );
    if (matched.length > 0) {
      onPlaySong(matched[0], title);
      onOpenPlayer();
    } else if (library.length > 0) {
      onPlaySong(library[0], title);
      onOpenPlayer();
    }
  };

  return (
    <div className="min-h-dvh bg-[#0d0708] text-white font-sans selection:bg-[#ff3b30] selection:text-white pb-36">
      {/* 1:1 Echo Music Top Bar (From Screenshot 1) */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-[#0d0708]/95 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3">
          <span className="font-sans text-xl sm:text-2xl font-black tracking-tight text-white">
            Echo Music
          </span>
          {/* Red circular/oval Echo Music logo */}
          <div className="flex h-7 w-10 items-center justify-center rounded-full bg-[#ff3b30] text-black shadow-[0_0_15px_#ff3b30]">
            <svg className="h-4 w-6" viewBox="0 0 28 16" fill="currentColor">
              <ellipse cx="14" cy="8" rx="13" ry="7" fill="#ff3b30" />
              <ellipse cx="14" cy="8" rx="5" ry="3" fill="#0d0708" />
            </svg>
          </div>
        </div>

        {/* Top Right Action Icons */}
        <div className="flex items-center gap-2 sm:gap-3 text-white/80">
          {/* History */}
          <button
            type="button"
            onClick={onOpenQueue}
            title="History / Queue"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>

          {/* Trending */}
          <button
            type="button"
            onClick={onOpenSearch}
            title="Trending & Charts"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </button>

          {/* Settings Gear */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Echo Music Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition active:scale-95"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Filter Chips Bar (Screenshot 1: Podcasts, Romance, Feel good, Relax) */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 no-scrollbar sm:px-8">
        {(['Podcasts', 'Romance', 'Feel good', 'Relax', 'Party', 'Dance'] as const).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveFilter(tag)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold shrink-0 transition ${
              activeFilter === tag
                ? 'bg-white text-black shadow'
                : 'bg-[#221013] text-white/80 hover:bg-[#30171b]'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-2 space-y-7 sm:px-8">
        {/* 2026 REPLAY BANNER (Screenshot 1) */}
        {showReplay && (
          <div className="relative flex items-center justify-between rounded-2xl border border-white/10 bg-[#35181e]/80 p-4 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#592732] text-xl shadow">
                🧃
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#ff8078]">
                  2026 REPLAY
                </span>
                <h3 className="font-sans text-base font-bold text-white">Your Year in Music</h3>
                <p className="text-xs text-white/60">Tap to explore your top songs, artists &amp; stats</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowReplay(false)}
              className="text-white/40 hover:text-white text-sm p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* SECTION 1: DANCE YOUR STRESS AWAY */}
        <div className="space-y-3">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-white/40 font-bold">
              DANCE YOUR STRESS AWAY
            </span>
            <h2 className="font-sans text-xl font-bold tracking-tight text-white mt-0.5">
              DANCING ON YOUR OWN
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
            {danceSections.map((item, i) => (
              <div
                key={i}
                onClick={() => handleCardClick(item.title, item.query)}
                className="group cursor-pointer space-y-2 rounded-2xl bg-white/[0.02] p-2.5 transition hover:bg-white/[0.06]"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#220d11] shadow-md">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono font-bold text-white backdrop-blur-sm">
                    {item.tag}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff3b30] text-white text-lg shadow">
                      ▶
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="truncate font-sans text-sm font-bold text-white group-hover:text-[#ff5b50]">
                    {item.title}
                  </h4>
                  <p className="truncate text-xs text-white/50">{item.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 2: HINDI HITS */}
        <div className="space-y-3">
          <h2 className="font-sans text-xl font-bold tracking-tight text-white">
            HINDI HITS
          </h2>

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
            {hindiHits.map((item, i) => (
              <div
                key={i}
                onClick={() => handleCardClick(item.title, item.query)}
                className="group cursor-pointer space-y-2 rounded-2xl bg-white/[0.02] p-2.5 transition hover:bg-white/[0.06]"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#220d11] shadow-md">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono font-bold text-white backdrop-blur-sm">
                    {item.tag}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff3b30] text-white text-lg shadow">
                      ▶
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="truncate font-sans text-sm font-bold text-white group-hover:text-[#ff5b50]">
                    {item.title}
                  </h4>
                  <p className="truncate text-xs text-white/50">{item.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FLOATING MINI PLAYER (Screenshot 1) */}
      {activeCue && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-xl">
          <div
            onClick={onOpenPlayer}
            className="flex items-center justify-between rounded-full border border-white/10 bg-[#250e12]/95 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl cursor-pointer hover:bg-[#2c1217] transition"
          >
            {/* Left: Artwork with vinyl ring */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#ff3b30] shadow">
                <img
                  src={
                    activeCue.art ||
                    (activeCue.youtube_ids?.[0]
                      ? `https://i.ytimg.com/vi/${activeCue.youtube_ids[0]}/hqdefault.jpg`
                      : 'https://placehold.co/100x100/160508/ffffff?text=♫')
                  }
                  alt={activeCue.title}
                  className={`h-full w-full object-cover ${isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-sm font-bold text-white">
                  {activeCue.title}
                </p>
                <p className="truncate text-xs text-white/60">
                  {activeCue.artist}
                </p>
              </div>
            </div>

            {/* Right: Transport Controls */}
            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onPrev}
                className="flex h-9 w-9 items-center justify-center text-white/80 hover:text-white"
              >
                ⏮
              </button>

              {/* Wavy cookie flower play/pause */}
              <button
                type="button"
                onClick={onTogglePlayPause}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black font-bold shadow active:scale-95 transition"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              <button
                type="button"
                onClick={onNext}
                className="flex h-9 w-9 items-center justify-center text-white/80 hover:text-white"
              >
                ⏭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING BOTTOM PILL NAVIGATION (Screenshot 1: Home, Search, Voice, Library, More) */}
      <nav className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-max items-center rounded-full border border-white/10 bg-[#160608]/90 px-4 py-2 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => {}}
          className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs font-bold text-white shadow-sm"
        >
          <span>🏠</span>
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          title="Search"
          className="flex h-9 w-11 items-center justify-center text-white/70 hover:text-white transition"
        >
          🔍
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          title="Voice Search"
          className="flex h-9 w-11 items-center justify-center text-white/70 hover:text-white transition"
        >
          🎙️
        </button>

        <button
          type="button"
          onClick={onOpenQueue}
          title="Library & Queue"
          className="flex h-9 w-11 items-center justify-center text-white/70 hover:text-white transition"
        >
          🎵
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings & More"
          className="flex h-9 w-11 items-center justify-center text-white/70 hover:text-white transition"
        >
          ⋯
        </button>
      </nav>
    </div>
  );
};
