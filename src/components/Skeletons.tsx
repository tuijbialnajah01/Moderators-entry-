import React from 'react';
import { motion } from 'motion/react';

export const ModCardSkeleton = () => (
  <div className="bg-zinc-900 rounded-3xl border border-white/5 shadow-xl shadow-black/40 overflow-hidden relative">
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
    <div className="p-5 sm:p-8 flex items-center justify-between">
      <div className="flex items-center gap-8 sm:gap-12">
        <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-[2.5rem] sm:rounded-[3.5rem] bg-zinc-800 shrink-0" />
        <div className="h-10 sm:h-12 w-48 sm:w-80 bg-zinc-800 rounded-2xl" />
      </div>
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-zinc-800/50 shrink-0" />
    </div>
  </div>
);

export const ModDetailSkeleton = () => (
  <div className="min-h-screen bg-black p-4 sm:p-10 space-y-12">
    <div className="max-w-6xl mx-auto space-y-12">
      <div className="bg-zinc-900 border border-white/5 rounded-[3rem] p-10 sm:p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-10">
          <div className="w-40 h-40 sm:w-56 sm:h-56 rounded-[2.5rem] sm:rounded-[3.5rem] bg-zinc-800 shrink-0" />
          <div className="space-y-4 w-full max-w-md text-center sm:text-left">
            <div className="h-16 bg-zinc-800 rounded-3xl w-full" />
            <div className="h-6 w-48 bg-zinc-800 rounded-xl mx-auto sm:mx-0" />
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <div className="h-10 w-64 bg-zinc-800 rounded-2xl" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-zinc-900/40 border border-white/5 rounded-[2rem]" />
        ))}
      </div>
    </div>
  </div>
);
