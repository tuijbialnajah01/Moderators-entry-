import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, handleFirestoreError, OperationType } from '../types';
import { CountdownTimer } from './CountdownTimer';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function ModList() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModName, setNewModName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'mods'), orderBy('deadlineAt', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedMods: Mod[] = [];
        snapshot.forEach((doc) => {
          fetchedMods.push({ id: doc.id, ...doc.data() } as Mod);
        });
        setMods(fetchedMods);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'mods');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAddMod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModName.trim()) return;

    setIsSubmitting(true);
    try {
      const now = Date.now();
      const modId = crypto.randomUUID();
      const docRef = doc(db, 'mods', modId);
      
      await setDoc(docRef, {
        name: newModName.trim(),
        lastEntryAt: now,
        deadlineAt: now + 7 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });

      setNewModName('');
      setShowAddModal(false);
    } catch (error) {
       console.error("Failed to add mod:", error);
       alert("Failed to add mod. Make sure you are an admin.");
       handleFirestoreError(error, OperationType.CREATE, 'mods');
    } finally {
      setIsSubmitting(false);
    }
  };

  const now = Date.now();

  return (
    <div className="flex flex-col h-full">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Moderator List
            {loading && <span className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse" title="Syncing..."></span>}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-indigo-100 flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              Add Moderator
            </button>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="p-8 flex-1 flex flex-col gap-6 w-full max-w-7xl mx-auto">
        {/* Moderator Timer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mods.map((mod) => {
            const timeLeft = mod.deadlineAt - now;
            const isCritical = timeLeft < 24 * 60 * 60 * 1000;
            const isWarning = timeLeft < 3 * 24 * 60 * 60 * 1000;
            const totalMs = 7 * 24 * 60 * 60 * 1000;
            const progress = Math.max(0, Math.min(100, (timeLeft / totalMs) * 100));

            return (
              <div key={mod.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden border-l-4 ${isCritical ? 'border-l-red-500' : isWarning ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
                <div className="p-5 flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 hover:text-indigo-600 transition-colors">
                      <Link to={`/mod/${mod.id}`}>{mod.name}</Link>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Last Entry: {new Date(mod.lastEntryAt).toLocaleDateString()}</p>
                  </div>
                  {isCritical ? (
                    <span className="bg-red-100 text-red-700 text-[10px] font-black uppercase px-2 py-1 rounded tracking-widest mt-1">Critical</span>
                  ) : isWarning ? (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-black uppercase px-2 py-1 rounded tracking-widest mt-1">Warning</span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase px-2 py-1 rounded tracking-widest mt-1">Safe</span>
                  )}
                </div>
                
                <div className={`flex-1 flex flex-col items-center justify-center py-4 ${isCritical ? 'bg-red-50/30' : 'bg-slate-50/50'}`}>
                  <p className={`text-xs uppercase tracking-widest font-bold mb-2 ${isCritical ? 'text-red-400' : 'text-slate-400'}`}>
                    Demotion Countdown
                  </p>
                  <CountdownTimer deadlineAt={mod.deadlineAt} />
                </div>
                
                <div className="p-4 border-t border-slate-100">
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${isCritical ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {loading ? (
            <div className="col-span-full p-12 text-center text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
               <span className="animate-pulse">Syncing data...</span>
            </div>
          ) : mods.length === 0 ? (
            <div className="col-span-full p-12 text-center text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
               No moderators found in the system.
            </div>
          ) : null}
        </div>
      </div>

      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={() => setShowAddModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all w-full max-w-md border border-slate-200 z-10">
              <form onSubmit={handleAddMod}>
                <div className="bg-white px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-slate-900 mb-6">Create New Moderator</h3>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Moderator Name</label>
                    <input
                      type="text"
                      className="block w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                      placeholder="e.g. Aman Kumar"
                      value={newModName}
                      onChange={(e) => setNewModName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={isSubmitting || !newModName.trim()}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Moderator'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="inline-flex w-full justify-center rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
