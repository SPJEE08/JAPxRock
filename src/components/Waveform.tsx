import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Cue } from '../types/jap';
import { fmtTime, synthesizeWaveformBars } from '../utils/japSeed';

interface BoundaryPinProps {
  left: string;
  label: string | null;
  align: 'left' | 'right';
}

function BoundaryPin({ left, label, align }: BoundaryPinProps) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0"
      style={{ left }}
    >
      <div className="absolute bottom-0 top-10 w-[3px] -translate-x-1/2 bg-gold shadow-[0_0_12px_rgba(250,204,21,0.65)]" />
      {label && (
        <div
          className={`absolute top-0 whitespace-nowrap font-display text-[clamp(20px,1.9vw,30px)] leading-none tracking-wide text-gold ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export interface WaveformProps {
  cue: Cue;
  position: number | null;
  duration: number | null;
  cutAt: number | null;
  playFull: boolean;
  onSeek?: (seconds: number) => void;
  hint?: boolean;
}

/**
 * JAPxRock Waveform component.
 * Renders 100-bar Most-Replayed heat or 88-bar FNV-1a/Murmur3 synthesized waveform,
 * IN / OUT yellow/sky cut boundary pins, interactive pointer-capture scrubbing, and onboarding drag hint.
 */
export const Waveform: React.FC<WaveformProps> = ({
  cue,
  position,
  duration,
  cutAt,
  playFull,
  onSeek,
  hint = false,
}) => {
  const bars = useMemo(() => synthesizeWaveformBars(cue), [cue]);

  const totalDur = duration && duration > 0 ? duration : cue.duration_sec;
  const inSec = cue.play_full ? 0 : cue.entry_sec;
  const outSec =
    playFull || cue.play_full ? totalDur : cutAt ?? cue.exit_sec ?? totalDur;

  const pct = (sec: number) =>
    `${Math.min(100, Math.max(0, (sec / totalDur) * 100))}%`;

  const isNarrowWindow = ((outSec - inSec) / totalDur) * 100 < 30;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widthPx, setWidthPx] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidthPx(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasOutPin = outSec < totalDur - 1;
  const combineLabels =
    hasOutPin &&
    widthPx > 0 &&
    widthPx < 600 &&
    ((outSec - inSec) / totalDur) * widthPx < 170;

  const [dragSec, setDragSec] = useState<number | null>(null);

  const clientXToSeconds = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * totalDur);
  };

  const interactive = Boolean(onSeek) && position !== null;
  const activePos = dragSec ?? position;
  const draggingPastCut =
    dragSec !== null && dragSec >= outSec - 3 && outSec < totalDur - 1;
  const showHint = hint && interactive && dragSec === null && activePos !== null;

  return (
    <div className="relative w-full select-none pt-12" data-testid="japxrock-waveform">
      {combineLabels ? (
        <>
          <BoundaryPin
            left={pct(inSec)}
            label={
              showHint || inSec / totalDur >= 0.5
                ? null
                : `IN ${fmtTime(inSec)} · OUT ${fmtTime(outSec)}`
            }
            align="left"
          />
          <BoundaryPin
            left={pct(outSec)}
            label={
              showHint || inSec / totalDur < 0.5
                ? null
                : `IN ${fmtTime(inSec)} · OUT ${fmtTime(outSec)}`
            }
            align="right"
          />
        </>
      ) : (
        <>
          <BoundaryPin
            left={pct(inSec)}
            label={showHint ? null : `IN ${fmtTime(inSec)}`}
            align={isNarrowWindow ? 'right' : 'left'}
          />
          {hasOutPin && (
            <BoundaryPin
              left={pct(outSec)}
              label={showHint ? null : `OUT ${fmtTime(outSec)}`}
              align={isNarrowWindow ? 'left' : 'right'}
            />
          )}
        </>
      )}

      <div
        ref={containerRef}
        role={interactive ? 'slider' : undefined}
        aria-label={interactive ? `Seek ${cue.title}` : undefined}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? Math.round(totalDur) : undefined}
        aria-valuenow={
          interactive && activePos !== null ? Math.round(activePos) : undefined
        }
        className={`relative flex h-[clamp(56px,11vh,150px)] items-center gap-px md:gap-[3px] ${
          interactive ? 'cursor-grab touch-none active:cursor-grabbing' : ''
        }`}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragSec(clientXToSeconds(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragSec !== null) {
            setDragSec(clientXToSeconds(e.clientX));
          }
        }}
        onPointerUp={() => {
          if (dragSec !== null) {
            onSeek?.(dragSec);
          }
          setDragSec(null);
        }}
        onPointerCancel={() => setDragSec(null)}
      >
        {bars.map((barHeight, idx) => {
          const barSec = ((idx + 0.5) / bars.length) * totalDur;
          const inActiveWindow = barSec >= inSec && barSec <= outSec;
          const isPlayed = activePos !== null && barSec <= activePos;
          return (
            <div
              key={idx}
              className={`flex-1 rounded-full transition-colors duration-200 ${
                !inActiveWindow
                  ? 'bg-white/15'
                  : isPlayed
                    ? 'bg-gradient-to-t from-sky via-[#7dd3fc] to-gold'
                    : 'bg-white/80'
              }`}
              style={{ height: `${100 * barHeight}%` }}
            />
          );
        })}
      </div>

      {activePos !== null && (
        <div
          className={`pointer-events-none absolute bottom-0 top-10 -translate-x-1/2 ${
            dragSec !== null
              ? 'w-[5px] bg-gold shadow-[0_0_24px_rgba(250,204,21,0.9)]'
              : 'w-[3px] bg-white shadow-[0_0_18px_rgba(56,189,248,0.9)]'
          }`}
          style={{ left: pct(activePos) }}
        />
      )}

      {showHint && activePos !== null && (
        <>
          <div
            className="drag-hint-ring pointer-events-none absolute top-[calc(3rem+clamp(56px,11vh,150px)/2)] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-gold"
            style={{ left: pct(activePos) }}
          />
          <div className="drag-hint-bubble pointer-events-none absolute left-0 top-0 z-10 flex h-9 max-w-full items-center overflow-hidden whitespace-nowrap rounded-full border-2 border-sky bg-ink/95 px-3 text-[clamp(13px,1.05vw,16px)] font-semibold text-white shadow-[0_0_24px_rgba(56,189,248,0.28)] md:px-4">
            <span className="drag-hint-arrows mr-2 inline-block shrink-0 font-display text-gold">
              ← →
            </span>
            <span className="truncate">
              <span className="hidden md:inline">
                Don&apos;t like where it started?{' '}
              </span>
              Drag to your favourite part. I&apos;ll learn.
            </span>
          </div>
          <div
            className="drag-hint-bubble pointer-events-none absolute top-9 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[8px] border-x-transparent border-t-sky"
            style={{ left: pct(activePos) }}
          />
        </>
      )}

      {dragSec !== null && (
        <div
          className="bg-brand-mix pointer-events-none absolute -top-[clamp(40px,7vh,72px)] -translate-x-1/2 whitespace-nowrap rounded-xl px-4 py-1 font-display text-[clamp(28px,3vw,52px)] leading-none text-ink"
          style={{ left: pct(dragSec) }}
        >
          {fmtTime(dragSec)}
          {draggingPastCut && ' · PLAY FULL'}
        </div>
      )}
    </div>
  );
};
