import { useState, useEffect } from 'react';

export function CountdownTimer({ deadlineAt, compact = false }: { deadlineAt: number, compact?: boolean }) {
  const [timeLeft, setTimeLeft] = useState(deadlineAt - Date.now());

  useEffect(() => {
    setTimeLeft(deadlineAt - Date.now());
    const timer = setInterval(() => {
      setTimeLeft(deadlineAt - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [deadlineAt]);

  const isExpired = timeLeft <= 0;

  if (isExpired) {
    if (compact) {
      return <span className="font-mono text-red-500 font-bold">00d 00h 00m 00s</span>;
    }
    return (
      <div className="flex gap-3 sm:gap-6 text-center">
        <div><span className="text-3xl sm:text-5xl font-mono font-bold block bg-red-950/30 p-2 sm:p-4 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[56px] sm:min-w-[96px]">00</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">DAYS</span></div>
        <div><span className="text-3xl sm:text-5xl font-mono font-bold block bg-red-950/30 p-2 sm:p-4 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[56px] sm:min-w-[96px]">00</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">HRS</span></div>
        <div><span className="text-3xl sm:text-5xl font-mono font-bold block bg-red-950/30 p-2 sm:p-4 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[56px] sm:min-w-[96px]">00</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">MINS</span></div>
        <div><span className="text-3xl sm:text-5xl font-mono font-bold block bg-red-950/30 p-2 sm:p-4 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[56px] sm:min-w-[96px]">00</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">SECS</span></div>
      </div>
    );
  }

  const d = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const h = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
  const m = Math.floor((timeLeft / 1000 / 60) % 60);
  const s = Math.floor((timeLeft / 1000) % 60);

  const padUrl = (num: number) => num.toString().padStart(2, '0');

  // Determine severity based on days left
  const isCritical = d < 1;
  const isWarning = d < 3;
  
  if (compact) {
    const textColor = isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-slate-300';
    return (
      <span className={`font-mono font-bold ${textColor}`}>
        {d}d {padUrl(h)}h {padUrl(m)}m {padUrl(s)}s
      </span>
    );
  }

  const boxClasses = isCritical 
    ? "text-3xl sm:text-5xl font-mono font-bold block bg-red-950/30 p-2 sm:p-4 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[56px] sm:min-w-[96px]"
    : "text-3xl sm:text-5xl font-mono font-bold block bg-slate-900 p-2 sm:p-4 border border-slate-800 rounded shadow-sm text-slate-100 min-w-[56px] sm:min-w-[96px]";

  return (
    <div className="flex gap-3 sm:gap-6 text-center">
      <div><span className={boxClasses}>{padUrl(d)}</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">DAYS</span></div>
      <div><span className={boxClasses}>{padUrl(h)}</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">HRS</span></div>
      <div><span className={boxClasses}>{padUrl(m)}</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">MINS</span></div>
      <div><span className={boxClasses}>{padUrl(s)}</span><span className="text-base sm:text-xl uppercase font-semibold tracking-wider text-slate-500 mt-1 block">SECS</span></div>
    </div>
  );
}

