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
      <div className="flex gap-3 text-center">
        <div><span className="text-2xl font-mono font-bold block bg-white p-2 border border-red-100 rounded shadow-sm text-red-600">00</span><span className="text-[10px] text-slate-400">DAYS</span></div>
        <div><span className="text-2xl font-mono font-bold block bg-white p-2 border border-red-100 rounded shadow-sm text-red-600">00</span><span className="text-[10px] text-slate-400">HRS</span></div>
        <div><span className="text-2xl font-mono font-bold block bg-white p-2 border border-red-100 rounded shadow-sm text-red-600">00</span><span className="text-[10px] text-slate-400">MINS</span></div>
        <div><span className="text-2xl font-mono font-bold block bg-white p-2 border border-red-100 rounded shadow-sm text-red-600">00</span><span className="text-[10px] text-slate-400">SECS</span></div>
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
    ? "text-2xl font-mono font-bold block bg-white p-2 border border-red-100 rounded shadow-sm text-red-600"
    : "text-2xl font-mono font-bold block bg-white p-2 border border-slate-200 rounded shadow-sm text-slate-900";

  return (
    <div className="flex gap-3 text-center">
      <div><span className={boxClasses}>{padUrl(d)}</span><span className="text-[10px] text-slate-400">DAYS</span></div>
      <div><span className={boxClasses}>{padUrl(h)}</span><span className="text-[10px] text-slate-400">HRS</span></div>
      <div><span className={boxClasses}>{padUrl(m)}</span><span className="text-[10px] text-slate-400">MINS</span></div>
      <div><span className={boxClasses}>{padUrl(s)}</span><span className="text-[10px] text-slate-400">SECS</span></div>
    </div>
  );
}

