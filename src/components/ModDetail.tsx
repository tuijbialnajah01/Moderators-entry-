import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, onSnapshot, query, orderBy, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, Entry, handleFirestoreError, OperationType } from '../types';
import { CountdownTimer } from './CountdownTimer';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function ModDetail() {
  const { id } = useParams<{ id: string }>();
  const [mod, setMod] = useState<Mod | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuth();
  
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryText, setEntryText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id || !user) return;

    const modRef = doc(db, 'mods', id);
    const unsubscribeMod = onSnapshot(modRef, (docSnap) => {
      if (docSnap.exists()) {
        setMod({ id: docSnap.id, ...docSnap.data() } as Mod);
      } else {
        setMod(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `mods/${id}`);
    });

    const entriesRef = collection(db, 'mods', id, 'entries');
    const q = query(entriesRef, orderBy('createdAt', 'desc'));
    const unsubscribeEntries = onSnapshot(q, (snapshot) => {
      const fetchedEntries: Entry[] = [];
      snapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as Entry);
      });
      setEntries(fetchedEntries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `mods/${id}/entries`);
    });

    return () => {
      unsubscribeMod();
      unsubscribeEntries();
    };
  }, [id, user]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !entryText.trim() || !mod) return;

    setIsSubmitting(true);
    try {
      const now = Date.now();
      const entryId = crypto.randomUUID();
      
      const batch = writeBatch(db);
      
      const newEntryRef = doc(db, `mods/${id}/entries/${entryId}`);
      batch.set(newEntryRef, {
        text: entryText.trim(),
        createdAt: now,
        createdBy: user.uid
      });
      
      const modRef = doc(db, 'mods', id);
      batch.update(modRef, {
        lastEntryAt: now,
        deadlineAt: now + 7 * 24 * 60 * 60 * 1000,
        updatedAt: now
      });

      await batch.commit();

      setEntryText('');
      setShowEntryModal(false);
    } catch (error) {
      console.error('Failed to add entry', error);
      alert('Failed to add entry. Only Admins can modify.');
      handleFirestoreError(error, OperationType.WRITE, `mods/${id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // We keep showing the previous valid data while syncing. If initially no data, we will just show 'loading details' inline or handle smoothly.
  if (loading && !mod) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">Syncing details...</div>;
  }

  if (!mod) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 flex-shrink-0">
          <Link to="/mods" className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium transition-colors">
             <ArrowLeft className="w-4 h-4" /> Back to Moderators
          </Link>
        </header>
        <div className="flex-1 p-8">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
              <h2 className="text-xl font-bold text-slate-900">Moderator Not Found</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/mods" className="text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-sm font-semibold transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Moderators
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <button 
              onClick={() => setShowEntryModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-indigo-100 flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              Create New Entry
            </button>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="p-8 flex-1 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-slate-200">
            <h3 className="text-3xl font-bold text-slate-900 mb-2">{mod.name}</h3>
            <p className="text-sm text-slate-500 mb-4 font-medium uppercase tracking-wider">Moderator Profile</p>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Last Entry: <span className="font-semibold text-slate-900">{new Date(mod.lastEntryAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              Total Entries: <span className="font-semibold text-slate-900">{entries.length}</span>
            </div>
          </div>
          <div className="p-6 md:p-8 flex flex-col items-center justify-center bg-slate-50/50">
            <p className="text-xs uppercase tracking-widest font-bold mb-3 text-slate-400">Time Bacha Hai</p>
            <CountdownTimer deadlineAt={mod.deadlineAt} />
          </div>
        </div>
        
        {/* Log Area */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
             <h4 className="text-lg font-bold text-slate-900">Entries Log</h4>
             {loading && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" title="Syncing..."></span>}
          </div>
          
          <div className="flex-1 p-6">
            {entries.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                 <p className="text-sm text-slate-500 font-medium">No entries recorded for this moderator.</p>
                 <p className="text-xs text-slate-400 mt-1">When entries are added, they will appear here.</p>
              </div>
            ) : (
              <div className="pl-8 pr-2 py-2">
                <ol reversed className="list-decimal list-outside space-y-6 text-slate-900 marker:text-slate-400 marker:font-bold">
                  {entries.map((entry) => (
                    <li key={entry.id} className="pl-2 border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-slate-800 font-medium whitespace-pre-wrap">{entry.text}</span>
                        <span className="text-slate-400 font-mono text-xs mt-1 bg-slate-50 inline-block w-max px-2 py-1 rounded border border-slate-100">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer System Info */}
        <div className="text-[10px] text-slate-400 flex justify-between uppercase tracking-tighter mt-2">
          <span>Profile View Active</span>
          <span>Log Count: {entries.length}</span>
        </div>
      </div>

      {showEntryModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={() => setShowEntryModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all w-full max-w-xl border border-slate-200 z-10">
              <form onSubmit={handleAddEntry}>
                <div className="bg-white px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-slate-900 mb-2">New Entry for {mod.name}</h3>
                  <p className="text-sm text-emerald-600 mb-6 bg-emerald-50 px-3 py-2 rounded-md border border-emerald-100 inline-block font-medium">Adding this will reset the demotion timer to 7 days.</p>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Entry Details</label>
                    <textarea
                      rows={4}
                      className="block w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border resize-none"
                      placeholder="e.g. Activity recorded at link..."
                      value={entryText}
                      onChange={(e) => setEntryText(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={isSubmitting || !entryText.trim()}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save & Reset Timer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEntryModal(false)}
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
