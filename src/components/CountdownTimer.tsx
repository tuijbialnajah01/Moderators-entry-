import { useState, useEffect } from 'react';

export function CountdownTimer({ deadlineAt }: { deadlineAt: number }) {
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
    return (
      <div className="flex gap-1.5 sm:gap-3 text-center">
        <div><span className="text-sm sm:text-2xl font-mono font-bold block bg-red-950/30 p-1 sm:p-2 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[28px] sm:min-w-[48px]">00</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">DAYS</span></div>
        <div><span className="text-sm sm:text-2xl font-mono font-bold block bg-red-950/30 p-1 sm:p-2 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[28px] sm:min-w-[48px]">00</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">HRS</span></div>
        <div><span className="text-sm sm:text-2xl font-mono font-bold block bg-red-950/30 p-1 sm:p-2 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[28px] sm:min-w-[48px]">00</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">MINS</span></div>
        <div><span className="text-sm sm:text-2xl font-mono font-bold block bg-red-950/30 p-1 sm:p-2 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[28px] sm:min-w-[48px]">00</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">SECS</span></div>
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
  
  const boxClasses = isCritical 
    ? "text-sm sm:text-2xl font-mono font-bold block bg-red-950/30 p-1 sm:p-2 border border-red-900/50 rounded shadow-sm text-red-500 min-w-[28px] sm:min-w-[48px]"
    : "text-sm sm:text-2xl font-mono font-bold block bg-slate-900 p-1 sm:p-2 border border-slate-800 rounded shadow-sm text-slate-100 min-w-[28px] sm:min-w-[48px]";

  return (
    <div className="flex gap-1.5 sm:gap-3 text-center">
      <div><span className={boxClasses}>{padUrl(d)}</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">DAYS</span></div>
      <div><span className={boxClasses}>{padUrl(h)}</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">HRS</span></div>
      <div><span className={boxClasses}>{padUrl(m)}</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">MINS</span></div>
      <div><span className={boxClasses}>{padUrl(s)}</span><span className="text-[8px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 block">SECS</span></div>
    </div>
  );
}

