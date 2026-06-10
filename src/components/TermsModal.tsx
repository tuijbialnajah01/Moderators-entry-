import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScrollText } from 'lucide-react';

interface TermsModalProps {
  show: boolean;
  onClose: () => void;
  roleView: 'moderator' | 'officer';
  onRoleViewChange: (role: 'moderator' | 'officer') => void;
}

export const TermsModal = memo(({ show, onClose, roleView, onRoleViewChange }: TermsModalProps) => {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
              onClick={onClose}
            ></motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative overflow-hidden rounded-[2rem] bg-zinc-900 text-left shadow-2xl w-full max-w-4xl border border-white/5 z-10 mx-auto flex flex-col h-[90vh] sm:h-[85vh] transform-gpu"
            >
              <div className="bg-zinc-900 px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
                <h3 className="text-3xl sm:text-4xl font-bold leading-6 text-white flex items-center gap-4">
                  <ScrollText className="w-10 h-10 text-blue-400" />
                  Terms And Conditions
                </h3>
              </div>
              
              <div className="bg-black px-8 py-6 border-b border-white/5">
                <div className="flex gap-2 p-2 bg-zinc-900 border border-white/5 rounded-2xl">
                  <button
                    onClick={() => onRoleViewChange('moderator')}
                    className={`flex-1 px-6 py-4 rounded-xl text-xl font-bold transition-all ${roleView === 'moderator' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                  >
                    Moderators
                  </button>
                  <button
                    onClick={() => onRoleViewChange('officer')}
                    className={`flex-1 px-6 py-4 rounded-xl text-xl font-bold transition-all ${roleView === 'officer' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                  >
                    Officers
                  </button>
                </div>
              </div>

              <div className="p-8 sm:p-10 overflow-y-auto flex-1 text-zinc-300 text-xl sm:text-2xl space-y-12 custom-scrollbar">
                {roleView === 'moderator' ? (
                  <>
                    <div className="space-y-8">
                      <div className="flex gap-5">
                        <span className="font-bold text-blue-400 text-3xl sm:text-4xl">1.</span>
                        <div className="space-y-10 pt-1 flex-1">
                          <p className="font-bold text-white text-2xl sm:text-4xl tracking-tight">Activity & Points System :-</p>
                          
                          <div className="space-y-12">
                            {/* Table 1: Reports */}
                            <div className="space-y-4">
                              <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-blue-600/10 border-b border-white/10">
                                      <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-blue-400">Reports & Diagnostics</th>
                                      <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-blue-400 text-right">Points</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    <tr className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-5">
                                        <p className="text-zinc-200 font-bold">User Reports</p>
                                        <p className="text-sm text-zinc-500 mt-1">Bad behavior, unauthorized automation, harassment</p>
                                      </td>
                                      <td className="px-6 py-5 text-right font-black text-emerald-400 text-2xl">1 - 5</td>
                                    </tr>
                                    <tr className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-5">
                                        <p className="text-zinc-200 font-bold">Bot Broken Usages</p>
                                        <p className="text-sm text-zinc-500 mt-1">Directly reporting bugs not listed in dev logs</p>
                                      </td>
                                      <td className="px-6 py-5 text-right font-black text-emerald-400 text-2xl">1 - 5</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            <p className="text-lg sm:text-xl text-zinc-300 flex items-start gap-3 pl-2 leading-relaxed">
                                <span className="text-blue-500 font-black uppercase tracking-tighter shrink-0 border-b-2 border-blue-500/30">Note:</span>
                                <span>
                                  Broken Usages will be counted only if they aren't recorded as &lt;in dev&gt; in 
                                  <a href="https://usages-ls.vercel.app" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-black decoration-2 underline-offset-4 ml-1">
                                    usages-ls.vercel.app
                                  </a>
                                </span>
                              </p>
                            </div>

                            {/* Table 2: Suggestions */}
                            <div className="space-y-4">
                              <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-purple-600/10 border-b border-white/10">
                                      <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-purple-400">Development Suggestions</th>
                                      <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-purple-400 text-right">Points</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-5">
                                        <p className="text-zinc-200 font-bold">Feature Proposals</p>
                                        <p className="text-sm text-zinc-500 mt-1">New ideas for bot features or community workflows</p>
                                      </td>
                                      <td className="px-6 py-5 text-right font-black text-emerald-400 text-2xl">1 - 5</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Table 3: Community Activity */}
                            <div className="space-y-4">
                              <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-amber-600/10 border-b border-white/10">
                                      <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-amber-400">Community Engagement</th>
                                      <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-amber-400 text-right">Points</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-5">
                                        <p className="text-zinc-200 font-bold">Group Activation</p>
                                        <p className="text-sm text-zinc-500 mt-1">Make at least one group active for 3+ consecutive days</p>
                                      </td>
                                      <td className="px-6 py-5 text-right font-black text-emerald-400 text-2xl">15</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          <div className="mt-8 inline-block">
                            <p className="text-xl font-bold text-amber-400 px-8 py-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                              ( Any two of these within a week )
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-5">
                      <span className="font-bold text-emerald-400 text-3xl sm:text-4xl">2.</span>
                      <div className="space-y-10 pt-1 flex-1">
                        <p className="font-bold text-white text-2xl sm:text-4xl tracking-tight">Special Moderator Proposals :-</p>
                        
                        <div className="space-y-12">
                          <div className="space-y-4">
                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-emerald-600/10 border-b border-white/10">
                                    <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-emerald-400">Mod-Led Innovations</th>
                                    <th className="px-6 py-4 text-sm font-black uppercase tracking-widest text-emerald-400 text-right">Points</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-5">
                                      <p className="text-zinc-200 font-bold">Strategic Ideas</p>
                                      <p className="text-sm text-zinc-500 mt-1">Providing unique ideas specifically for moderator workflows or community growth</p>
                                    </td>
                                    <td className="px-6 py-5 text-right font-black text-emerald-400 text-2xl">5 - 15</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="text-lg sm:text-xl text-red-400 flex items-start gap-3 pl-2 leading-relaxed font-bold italic">
                              <span className="text-red-500 font-black uppercase tracking-tighter shrink-0 border-b-2 border-red-500/30 not-italic">Warning:</span>
                              <span>Ideas can be rejected immediately if there are excessive flaws or logical inconsistencies.</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-5">
                      <span className="font-bold text-blue-400 text-3xl sm:text-4xl">3.</span>
                      <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                         Help grow the community by bringing in new members (minimum 2)
                      </p>
                    </div>

                    <div className="flex gap-5">
                      <span className="font-bold text-blue-400 text-3xl sm:text-4xl">4.</span>
                      <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                        Organise An Event
                      </p>
                    </div>

                    <div className="flex gap-5">
                      <span className="font-bold text-blue-400 text-3xl sm:text-4xl">5.</span>
                      <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                        Work on any idea and make it successful. Collaborating on these initiatives within the group is fully permitted, and the activity timer will be reset for all contributing members upon successful completion.
                      </p>
                    </div>

                    <div className="mt-12 pt-12 border-t border-white/5 space-y-8">
                      <p className="font-mono font-bold text-blue-300 text-center bg-blue-500/10 p-8 sm:p-10 rounded-3xl border border-blue-500/30 shadow-inner text-xl sm:text-2xl leading-relaxed">
                        ——&gt;Any one of the above contributions is sufficient to remain an active moderator&lt;——
                      </p>
                      <p className="text-xl sm:text-2xl font-medium text-amber-300 bg-amber-500/10 p-8 rounded-3xl border border-amber-500/20 text-center flex flex-col items-center justify-center gap-6">
                        <span className="shrink-0 bg-amber-500 text-amber-950 px-5 py-2.5 rounded-xl text-lg uppercase tracking-bold font-bold">Note</span>
                        <span className="leading-relaxed">Regardless of the number of entries you register, your active status timer will always reset from the exact time of your last entry.</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-10">
                      <div className="flex items-start gap-5">
                        <span className="font-bold text-blue-400 text-3xl sm:text-4xl">1.</span>
                        <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                          Monitor moderators in their job
                        </p>
                      </div>
                      <div className="flex items-start gap-5">
                        <span className="font-bold text-blue-400 text-3xl sm:text-4xl">2.</span>
                        <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                          Always monitor the status of their bot because you don't know if the problem is coming from your bot or not.
                        </p>
                      </div>
                      <div className="flex items-start gap-5">
                        <span className="font-bold text-blue-400 text-3xl sm:text-4xl">3.</span>
                        <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                          Listen Carefully to mods problem or user concerning problems.
                        </p>
                      </div>
                      <div className="flex items-start gap-5">
                        <span className="font-bold text-blue-400 text-3xl sm:text-4xl">4.</span>
                        <p className="pt-1 text-zinc-200 leading-relaxed font-medium">
                          Officers can perform any task assigned to Moderators. While Officers do not have strict time limits for these tasks, they carry much higher accountability and broader responsibilities.
                        </p>
                      </div>
                    </div>
                    <div className="mt-12 pt-12 border-t border-white/5 space-y-8">
                       <p className="text-xl sm:text-2xl font-medium text-amber-300 bg-amber-500/10 p-8 rounded-3xl border border-amber-500/20 text-center flex flex-col items-center justify-center gap-6">
                        <span className="shrink-0 bg-amber-500 text-amber-950 px-5 py-2.5 rounded-xl text-lg uppercase tracking-bold font-bold">Note</span>
                        <span className="leading-relaxed">If there is any critical situation where a user is caught using unauthorized software or broken bot usage that the moderator didn't report, then in that case action will be taken against the officer.</span>
                       </p>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-zinc-900 px-8 py-6 flex justify-center border-t border-white/5 shrink-0">
                <button
                  onClick={onClose}
                  className="px-16 py-5 rounded-2xl bg-blue-600 text-white text-2xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
});
