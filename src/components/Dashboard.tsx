import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, handleFirestoreError, OperationType } from '../types';
import { useAuth } from '../lib/auth';

export function Dashboard() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, logOut } = useAuth();

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

  const now = Date.now();
  const pendingDemotions = mods.filter(m => m.deadlineAt - now < 3 * 24 * 60 * 60 * 1000).length;

  return (
    <div className="flex flex-col h-full">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            System Dashboard
            {loading && <span className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse" title="Syncing..."></span>}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {user && (
             <button 
              onClick={logOut}
              className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="p-8 flex-1 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-1">Active Moderators</p>
            <p className="text-5xl font-bold mt-1 text-slate-900">{mods.length}</p>
          </div>
          
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-1">Reset Window</p>
            <p className="text-5xl font-bold mt-1 text-slate-900">7 Days</p>
          </div>
        </div>
        
        {pendingDemotions > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 p-6 rounded-xl flex items-center gap-4">
            <div className="bg-amber-200/50 p-4 rounded-full text-amber-600 flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <div>
              <h4 className="font-bold text-amber-900 text-lg mb-1">Demotion Alerts</h4>
              <p className="text-amber-700">{pendingDemotions} moderator{pendingDemotions > 1 ? 's are' : ' is'} close to demotion. Check the Moderators list in the sidebar.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
