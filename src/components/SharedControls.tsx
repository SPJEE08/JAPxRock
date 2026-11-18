import React, { useEffect, useRef, useState } from 'react';
import { saveGuestRequestClient } from '../utils/clientApi';

export interface ExitButtonProps {
  onExit: () => void;
  confirm?: boolean;
  label?: string;
  size?: 'md' | 'lg';
}

export const ExitButton: React.FC<ExitButtonProps> = ({
  onExit,
  confirm = false,
  label = 'END PARTY?',
  size = 'md',
}) => {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePress = () => {
    if (!confirm || confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      onExit();
      return;
    }
    setConfirming(true);
    timerRef.current = setTimeout(() => setConfirming(false), 2500);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handlePress();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      onClick={handlePress}
      aria-label={confirming ? 'Tap again to end the party' : 'Exit to home'}
      className={`${
        size === 'lg'
          ? 'h-[clamp(52px,7vh,72px)] min-w-[clamp(52px,7vh,72px)]'
          : 'h-14 min-w-14'
      } flex items-center justify-center gap-3 rounded-full border-2 font-display leading-none tracking-wide transition-all duration-200 active:scale-95 ${
        confirming
          ? 'bg-brand-mix border-gold px-6 text-[clamp(22px,2.2vw,34px)] text-ink'
          : 'border-white/30 text-white/70 hover:border-sky hover:text-white'
      }`}
    >
      {confirming ? (
        <>
          {label} <span className="text-[0.7em] opacity-70">TAP AGAIN</span>
        </>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-[42%] w-[42%]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )}
    </button>
  );
};

export const SongRequestBox: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  );

  const submit = async () => {
    if (text.trim().length < 2) return;
    setStatus('sending');
    const ok = saveGuestRequestClient(text);
    setStatus(ok ? 'sent' : 'error');
    if (ok) setText('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-full border-2 border-white/25 px-5 py-2 text-lg text-white/80 transition hover:border-sky hover:text-white"
      >
        <span className="text-gold">＋</span> Missing a song? Request it
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {status === 'sent' ? (
        <p className="text-xl text-gold">
          Got it. JAPxRock will find the official version and add it, usually
          within a day.
        </p>
      ) : (
        <>
          <label
            className="text-xl text-white/70"
            htmlFor="japxrock-request"
          >
            Which song? Add the artist if you know it.
          </label>
          <div className="flex gap-3">
            <input
              id="japxrock-request"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              maxLength={200}
              placeholder="e.g. Tauba Tauba, Karan Aujla"
              className="h-16 flex-1 rounded-2xl border-2 border-white/25 bg-transparent px-5 text-xl text-white placeholder:text-white/30 focus:border-sky focus:outline-none"
            />
            <button
              onClick={submit}
              disabled={status === 'sending' || text.trim().length < 2}
              className="bg-brand-mix h-16 rounded-2xl px-7 font-display text-3xl text-ink disabled:opacity-40"
            >
              {status === 'sending' ? '…' : 'SEND'}
            </button>
          </div>
          {status === 'error' && (
            <p className="text-lg text-white/60">
              Couldn&apos;t send that. Try again in a moment.
            </p>
          )}
        </>
      )}
    </div>
  );
};
