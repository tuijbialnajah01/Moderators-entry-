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
      <div className="flex gap-4 sm:gap-6 justify-center text-center items-center">
        <div><span className="text-2xl sm:text-3xl font-mono font-bold block bg-red-950/30 p-2 sm:p-3 border border-red-900/50 rounded-xl shadow-sm text-red-500 w-[56px] sm:w-[72px]">00</span><span className="text-[10px] sm:text-xs uppercase font-bold tracking-widest text-zinc-500 mt-1.5 block">Days</span></div>
        <div><span className="text-2xl sm:text-3xl font-mono font-bold block bg-red-950/30 p-2 sm:p-3 border border-red-900/50 rounded-xl shadow-sm text-red-500 w-[56px] sm:w-[72px]">00</span><span className="text-[10px] sm:text-xs uppercase font-bold tracking-widest text-zinc-500 mt-1.5 block">Hrs</span></div>
        <div><span className="text-2xl sm:text-3xl font-mono font-bold block bg-red-950/30 p-2 sm:p-3 border border-red-900/50 rounded-xl shadow-sm text-red-500 w-[56px] sm:w-[72px]">00</span><span className="text-[10px] sm:text-xs uppercase font-bold tracking-widest text-zinc-500 mt-1.5 block">Mins</span></div>
        <div><span className="text-2xl sm:text-3xl font-mono font-bold block bg-red-950/30 p-2 sm:p-3 border border-red-900/50 rounded-xl shadow-sm text-red-500 w-[56px] sm:w-[72px]">00</span><span className="text-[10px] sm:text-xs uppercase font-bold tracking-widest text-zinc-500 mt-1.5 block">Secs</span></div>
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
    const textColor = isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-zinc-300';
    return (
      <span className={`font-mono font-bold ${textColor}`}>
        {d}d {padUrl(h)}h {padUrl(m)}m {padUrl(s)}s
      </span>
    );
  }

  const boxClasses = isCritical 
    ? "text-2xl sm:text-3xl font-mono font-bold block bg-red-950/30 p-2 sm:p-3 border border-red-900/50 rounded-xl shadow-sm text-red-500 w-[56px] sm:w-[72px]"
    : isWarning
      ? "text-2xl sm:text-3xl font-mono font-bold block bg-amber-950/30 p-2 sm:p-3 border border-amber-900/50 rounded-xl shadow-sm text-amber-500 w-[56px] sm:w-[72px]"
      : "text-2xl sm:text-3xl font-mono font-bold block bg-zinc-900 p-2 sm:p-3 border border-zinc-800 rounded-xl shadow-sm text-zinc-100 w-[56px] sm:w-[72px]";

  const labelClasses = "text-[10px] sm:text-xs uppercase font-bold tracking-widest text-zinc-500 mt-1.5 block";

  return (
    <div className="flex gap-4 sm:gap-6 justify-center text-center items-center">
      <div><span className={boxClasses}>{padUrl(d)}</span><span className={labelClasses}>Days</span></div>
      <div><span className={boxClasses}>{padUrl(h)}</span><span className={labelClasses}>Hrs</span></div>
      <div><span className={boxClasses}>{padUrl(m)}</span><span className={labelClasses}>Mins</span></div>
      <div><span className={boxClasses}>{padUrl(s)}</span><span className={labelClasses}>Secs</span></div>
    </div>
  );
}

