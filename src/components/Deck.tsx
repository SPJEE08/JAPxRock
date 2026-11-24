import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Cue, DeckId, DeckSlot, DeckStatus } from '../types/jap';
import { Waveform } from './Waveform';

export interface DeckProps {
  id: DeckId;
  slot: DeckSlot;
  cue: Cue | null;
  position: number | null;
  duration: number | null;
  cutAt: number | null;
  playFull: boolean;
  finished: boolean;
  status: DeckStatus;
  showPlayerTile?: boolean;
  onSeek?: (sec: number) => void;
  hint?: boolean;
}

/**
 * JAP Deck component.
 * Implements the 4-state spatial choreography (`live`, `cue`, `out`, `enter`)
 * and dynamic font-fitting for giant Anton track titles.
 */
export const Deck: React.FC<DeckProps> = ({
  id,
  slot,
  cue,
  position,
  duration,
  cutAt,
  playFull,
  finished,
  status,
  showPlayerTile = false,
  onSeek,
  hint = false,
}) => {
  const [renderedSlot, setRenderedSlot] = useState<DeckSlot>(slot);
  const prevSlotRef = useRef<DeckSlot>(slot);

  useEffect(() => {
    if (prevSlotRef.current === 'out' && slot === 'cue') {
      setRenderedSlot('enter');
      prevSlotRef.current = slot;
      const t = setTimeout(() => setRenderedSlot('cue'), 50);
      return () => clearTimeout(t);
    }
    prevSlotRef.current = slot;
    setRenderedSlot(slot);
  }, [slot]);

  const isLive = slot === 'live';
  const titleText = cue?.title ?? (finished ? 'End of set' : '');
  const isLongTitle = titleText.length > 16;

  const sectionRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const fitHeadingSize = useCallback(() => {
    const hEl = headingRef.current;
    const secEl = sectionRef.current;
    const parentEl = secEl?.parentElement;
    if (!hEl || !secEl || !parentEl) return;
    hEl.style.fontSize = '';
    if (!window.matchMedia('(min-width: 768px)').matches) return;

    let currentPx = parseFloat(getComputedStyle(hEl).fontSize);
    const minPx = Math.min(currentPx, 36);
    for (
      let iter = 0;
      iter < 30 && secEl.offsetHeight > parentEl.clientHeight && currentPx > minPx;
      iter++
    ) {
      currentPx = Math.max(minPx, 0.93 * currentPx);
      hEl.style.fontSize = `${currentPx}px`;
    }
  }, []);

  useLayoutEffect(fitHeadingSize, [fitHeadingSize, titleText, cue?.artist, slot]);

  useEffect(() => {
    const parentEl = sectionRef.current?.parentElement;
    if (!parentEl) return;
    const ro = new ResizeObserver(() => fitHeadingSize());
    ro.observe(parentEl);
    document.fonts?.ready.then(fitHeadingSize).catch(() => {});
    return () => ro.disconnect();
  }, [fitHeadingSize]);

  return (
    <section
      ref={sectionRef}
      data-slot={renderedSlot}
      data-testid={`deck-${id}`}
      className="deck absolute left-0 top-0 flex w-full flex-col gap-2 sm:gap-3 md:gap-[clamp(6px,1.6vh,24px)] md:w-[58%]"
      aria-hidden={!isLive}
    >
      <header className="flex items-center gap-3 font-display text-sm tracking-wide sm:text-base md:text-2xl">
        <span className="text-sky/75">DECK {id}</span>
        {isLive && status === 'live' ? (
          <span className="flex items-center gap-2 text-gold">
            <span className="h-[0.55em] w-[0.55em] animate-pulse rounded-full bg-gold shadow-[0_0_14px_rgba(250,204,21,0.9)]" />
            LIVE{playFull ? ' · FULL' : ''}
          </span>
        ) : (
          <span className="text-white/70">
            ○{' '}
            {slot === 'out'
              ? 'OUT'
              : isLive
                ? cue
                  ? 'STARTING'
                  : 'STANDBY'
                : cue
                  ? 'CUEING'
                  : 'STANDBY'}
          </span>
        )}
      </header>

      <div className="flex items-start gap-[2.5vw]">
        <div className="min-w-0 flex-1">
          <h2
            ref={headingRef}
            key={`${cue?.song_id}-${isLive}`}
            className={`font-display uppercase leading-[0.9] tracking-[-0.01em] [overflow-wrap:anywhere] ${
              isLive ? 'title-land' : ''
            } text-2xl sm:text-4xl md:text-5xl lg:text-7xl xl:text-8xl`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {titleText}
          </h2>
          {cue && (
            <p className="mt-1 truncate font-sans text-sm font-semibold leading-tight text-white/75 sm:text-lg md:text-2xl">
              {cue.artist}
            </p>
          )}
        </div>

        {showPlayerTile && cue && slot !== 'cue' && (
          <div
            data-player-slot="true"
            className="aspect-video w-[max(200px,16vw)] shrink-0 rounded-[16px] sm:w-[max(280px,19vw)]"
          />
        )}
      </div>

      {cue && slot !== 'cue' && (
        <Waveform
          cue={cue}
          position={position}
          duration={duration}
          cutAt={cutAt}
          playFull={playFull}
          onSeek={isLive ? onSeek : undefined}
          hint={isLive && hint}
        />
      )}
    </section>
  );
};
