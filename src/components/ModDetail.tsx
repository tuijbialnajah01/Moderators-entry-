import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, onSnapshot, query, orderBy, setDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, Entry, handleFirestoreError, OperationType } from '../types';
import { CountdownTimer } from './CountdownTimer';
import { ArrowLeft, Plus, Trash2, Pencil, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';

export function ModDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mod, setMod] = useState<Mod | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin, loading: authLoading } = useAuth();
  
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryText, setEntryText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deletion state
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Profile state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean, action: 'active' | 'blacklisted' }>({ show: false, action: 'active' });
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfilePhone, setEditProfilePhone] = useState('');
  const [editProfileError, setEditProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (!id) return;

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
      setLoading(false);
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
  }, [id, user, isAdmin]);

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

  const handleDeleteEntry = async () => {
    if (!id || !user || !mod || !entryToDelete) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      // Delete the entry explicitly
      const entryRef = doc(db, `mods/${id}/entries/${entryToDelete}`);
      batch.delete(entryRef);

      // Recalculate mod timers based on remaining entries
      const remainingEntries = entries.filter(e => e.id !== entryToDelete);
      const newLastEntryAt = remainingEntries.length > 0 
         ? remainingEntries[0].createdAt 
         : mod.createdAt;

      const newDeadlineAt = newLastEntryAt + 7 * 24 * 60 * 60 * 1000;

      const modRef = doc(db, 'mods', id);
      batch.update(modRef, {
        lastEntryAt: newLastEntryAt,
        deadlineAt: newDeadlineAt,
        updatedAt: Date.now()
      });

      await batch.commit();
      setEntryToDelete(null);
    } catch (error) {
      console.error('Failed to delete entry', error);
      alert('Failed to delete entry. Only Admins can modify.');
      handleFirestoreError(error, OperationType.WRITE, `mods/${id}/entries`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !mod) return;

    if (!editProfileName.trim() || !editProfilePhone.trim()) {
      setEditProfileError('Both name and phone number are required.');
      return;
    }

    if (!editProfilePhone.trim().startsWith('+')) {
      setEditProfileError('Phone number must include country code (e.g., +91)');
      return;
    }

    setIsSavingProfile(true);
    setEditProfileError('');

    try {
      if (editProfileName.trim() !== mod.name) {
        const q = query(collection(db, 'mods'));
        const qs = await getDocs(q);
        const isDuplicate = qs.docs.some(d => d.id !== id && d.data().name.toLowerCase() === editProfileName.trim().toLowerCase());
        
        if (isDuplicate) {
           setEditProfileError('A moderator with this name already exists.');
           setIsSavingProfile(false);
           return;
        }
      }

      await updateDoc(doc(db, 'mods', id), { 
        name: editProfileName.trim(), 
        phoneNumber: editProfilePhone.trim(), 
        updatedAt: Date.now() 
      });
      setShowEditProfileModal(false);
    } catch (err) {
       console.error('Failed to update profile', err);
       setEditProfileError('Failed to update profile. Please try again.');
    } finally {
       setIsSavingProfile(false);
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'blacklisted') => {
    if (!id || !isAdmin) return;
    setConfirmModal({ show: true, action: newStatus });
  };

  const executeStatusChange = async () => {
    if (!id || !isAdmin || isStatusUpdating) return;
    const { action } = confirmModal;

    setIsStatusUpdating(true);
    try {
      const now = Date.now();
      const updates: any = {
        status: action,
        updatedAt: now,
      };

      if (action === 'active') {
        updates.deadlineAt = now + 7 * 24 * 60 * 60 * 1000;
        updates.lastEntryAt = now;
      }

      await updateDoc(doc(db, 'mods', id), updates);
      
      // Close modal first
      setConfirmModal({ show: false, action: 'active' });
      
      // If blacklisting, navigate back to home
      if (action === 'blacklisted') {
        navigate('/');
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status. Check your connection or permissions.");
      handleFirestoreError(error, OperationType.UPDATE, `mods/${id}`);
    } finally {
      setIsStatusUpdating(false);
    }
  };

  if ((loading || authLoading) && !mod) {
    return <div className="flex-1 min-h-screen bg-slate-950 flex items-center justify-center p-8"><div className="w-full max-w-5xl h-64 bg-slate-800/50 rounded-xl animate-pulse"></div></div>;
  }

  if (!mod || (mod.status === 'blacklisted' && !isAdmin)) {
    return (
      <div className="flex flex-col h-full bg-slate-950">
        <header className="h-14 sm:h-16 bg-slate-900 border-b border-slate-800 flex items-center px-4 sm:px-8 flex-shrink-0">
          <Link to="/" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors">
             <ArrowLeft className="w-4 h-4" /> Back to Reports
          </Link>
        </header>
        <div className="flex-1 p-8">
          <div className="bg-slate-900 p-8 rounded-xl shadow-sm border border-slate-800 text-center">
              <h2 className="text-xl font-bold text-white">Moderator Not Found</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${confirmModal.action === 'blacklisted' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {confirmModal.action === 'blacklisted' ? <AlertTriangle className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {confirmModal.action === 'blacklisted' ? 'Blacklist Moderator?' : 'Re-Hire Moderator?'}
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  {confirmModal.action === 'blacklisted' 
                    ? 'Are you sure you want to blacklist this moderator? They will no longer be visible to regular users.'
                    : 'This will restore the moderator and reset their activity timer to 7 days starting from now.'}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmModal({ show: false, action: 'active' })}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={executeStatusChange}
                    disabled={isStatusUpdating}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-white font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center ${confirmModal.action === 'blacklisted' ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'} disabled:opacity-50`}
                  >
                    {isStatusUpdating ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="h-14 sm:h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 sm:px-8 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-indigo-400 flex items-center gap-2 text-sm font-semibold transition-colors">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Reports</span><span className="inline sm:hidden">Back</span>
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {isAdmin && (
            <button 
              onClick={() => setShowEntryModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1 sm:gap-2 transition-colors"
            >
              <svg className="w-4 h-4 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              <span className="hidden sm:inline">Create New Entry</span>
              <span className="inline sm:hidden">New Entry</span>
            </button>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="p-4 sm:p-8 flex-1 flex flex-col gap-4 sm:gap-6 max-w-5xl mx-auto w-full overflow-y-auto pb-10">
        {/* Profile Card */}
        <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden flex flex-col md:flex-row">
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-slate-800">
            <div className="flex flex-col mb-4 gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                 <div className="flex items-center gap-3">
                    <h3 className="text-3xl font-bold text-white flex-shrink-0">{mod.name}</h3>
                    {mod.status === 'blacklisted' && (
                      <span className="bg-red-600/20 text-red-500 text-xs font-bold uppercase px-3 py-1 rounded-lg border border-red-600/30">Blacklisted</span>
                    )}
                 </div>
                 {isAdmin && (
                    <div className="flex gap-2">
                      {mod.status === 'blacklisted' ? (
                        <button 
                          onClick={() => handleStatusChange('active')}
                          className="px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg transition-colors border border-emerald-500/50 flex items-center gap-2 text-xs sm:text-sm font-bold shadow-lg shadow-emerald-900/20"
                        >
                          Re-Hire Moderator
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange('blacklisted')}
                          className="px-3 py-2 bg-red-600 text-white hover:bg-red-500 rounded-lg transition-colors border border-red-500/50 flex items-center gap-2 text-xs sm:text-sm font-bold shadow-lg shadow-red-900/20"
                        >
                          Add to Blacklist
                        </button>
                      )}
                      <button 
                        onClick={() => { 
                          setShowEditProfileModal(true); 
                          setEditProfileName(mod.name); 
                          setEditProfilePhone(mod.phoneNumber || ''); 
                          setEditProfileError(''); 
                        }} 
                        className="p-1.5 sm:px-3 sm:py-2 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 flex items-center gap-2 text-xs sm:text-sm font-semibold"
                        title="Edit Profile"
                      >
                        <Pencil className="w-4 h-4" />
                        <span className="hidden sm:inline">Edit Profile</span>
                      </button>
                    </div>
                 )}
              </div>
              <div className="flex items-center gap-2 group">
                  {mod.phoneNumber ? (
                    <a 
                      href={`https://wa.me/${mod.phoneNumber.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 font-mono text-sm border border-emerald-500/20 shadow-inner flex items-center gap-2 max-w-fit hover:bg-emerald-500/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                      {mod.phoneNumber}
                    </a>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-500 font-mono text-sm border border-slate-700 shadow-inner flex items-center gap-2 max-w-fit">
                      No phone added
                    </span>
                  )}
                  {mod.phoneNumber && (
                    <a 
                      href={`https://wa.me/${mod.phoneNumber.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2 sm:px-3 py-1.5 rounded-md transition-all font-medium border border-emerald-500/50 shadow-sm ml-1 flex items-center gap-1.5 active:scale-95"
                    >
                      Message
                    </a>
                  )}
              </div>
            </div>

            <p className="text-sm text-slate-400 mb-4 font-medium uppercase tracking-wider">Moderator Profile</p>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className={`w-2 h-2 rounded-full ${mod.status === 'blacklisted' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
              Last Entry: <span className="font-semibold text-white">{new Date(mod.lastEntryAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              Total Entries: <span className="font-semibold text-white">{entries.length}</span>
            </div>
          </div>
          <div className={`p-6 md:p-8 flex flex-col items-center justify-center border-t md:border-t-0 border-slate-800 ${mod.status === 'blacklisted' ? 'bg-slate-900/50' : 'bg-slate-950/50'}`}>
            <p className="text-xs uppercase tracking-widest font-bold mb-3 text-slate-500">
              {mod.status === 'blacklisted' ? 'Account Status' : 'Time Remaining'}
            </p>
            {mod.status === 'blacklisted' ? (
              <div className="text-red-500 font-bold text-center px-6 py-4 border border-red-500/20 rounded-xl bg-red-500/5">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                <span className="text-xl uppercase tracking-tighter">Blacklisted</span>
              </div>
            ) : (
              <CountdownTimer deadlineAt={mod.deadlineAt} />
            )}
          </div>
        </div>
        
        {/* Log Area */}
        <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden flex-1 flex flex-col">
          <div className="px-6 py-5 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
             <h4 className="text-lg font-bold text-white">Entries Log</h4>
          </div>
          
          <div className="flex-1 p-6">
            {entries.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-dashed border-slate-700">
                 <p className="text-sm text-slate-400 font-medium">No entries recorded for this moderator.</p>
                 <p className="text-xs text-slate-500 mt-1">When entries are added, they will appear here.</p>
              </div>
            ) : (
              <div className="pl-8 pr-2 py-2">
                <ol reversed className="list-decimal list-outside space-y-6 text-slate-300 marker:text-slate-500 marker:font-bold">
                  {entries.map((entry) => (
                    <li key={entry.id} className="pl-2 border-b border-slate-800/50 pb-6 last:border-0 last:pb-0 relative group">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-slate-200 font-medium whitespace-pre-wrap">{entry.text}</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-slate-400 font-mono text-xs bg-slate-950 inline-block px-2 py-1 rounded border border-slate-800">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => setEntryToDelete(entry.id)}
                              className="text-slate-500 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 p-1"
                              title="Delete entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-slate-950 bg-opacity-80 transition-opacity" onClick={() => setShowEntryModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-slate-900 text-left shadow-2xl transition-all w-full max-w-xl border border-slate-800 z-10 mx-auto">
              <form onSubmit={handleAddEntry}>
                <div className="bg-slate-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-white mb-2">New Entry for {mod.name}</h3>
                  <p className="text-sm text-emerald-400 mb-6 bg-emerald-500/10 px-3 py-2 rounded-md border border-emerald-500/20 inline-block font-medium">Adding this will reset the demotion timer to 7 days.</p>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Entry Details</label>
                    <textarea
                      rows={4}
                      className="block w-full rounded-lg border-slate-700 bg-slate-950 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border resize-none"
                      placeholder="e.g. Activity recorded at link..."
                      value={entryText}
                      onChange={(e) => setEntryText(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="bg-slate-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-800">
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
                    className="inline-flex w-full justify-center rounded-lg border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-300 shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {entryToDelete && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-slate-950 bg-opacity-80 transition-opacity" onClick={() => setEntryToDelete(null)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-slate-900 text-left shadow-2xl transition-all w-full max-w-sm border border-slate-800 z-10 mx-auto">
                <div className="bg-slate-900 px-6 pb-6 pt-6 flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 sm:mx-0 sm:h-10 sm:w-10 mb-4 border border-red-500/20">
                    <Trash2 className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold leading-6 text-white mb-2">Delete Entry?</h3>
                  <p className="text-sm text-slate-400">Are you sure you want to delete this entry? This will revert the timer back to the previous entry state. This action cannot be undone.</p>
                </div>
                <div className="bg-slate-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDeleteEntry}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryToDelete(null)}
                    className="inline-flex w-full justify-center rounded-lg border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-300 shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Profile Modal */}
      {showEditProfileModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-slate-950 bg-opacity-80 transition-opacity" onClick={() => setShowEditProfileModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-slate-900 text-left shadow-2xl transition-all w-full max-w-lg border border-slate-800 z-10 mx-auto">
              <form onSubmit={handleEditProfile}>
                <div className="bg-slate-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-white mb-6">Edit Profile</h3>
                  
                  {editProfileError && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm font-medium">
                      {editProfileError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Moderator Name</label>
                      <input
                        type="text"
                        className="block w-full rounded-lg border-slate-700 bg-slate-950 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                        value={editProfileName}
                        onChange={(e) => { setEditProfileName(e.target.value); setEditProfileError(''); }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">WhatsApp Number (with country code)</label>
                      <input
                        type="tel"
                        className="block w-full rounded-lg border-slate-700 bg-slate-950 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                        placeholder="e.g. +91 9876543210"
                        value={editProfilePhone}
                        onChange={(e) => { setEditProfilePhone(e.target.value); setEditProfileError(''); }}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-800">
                  <button
                    type="submit"
                    disabled={isSavingProfile || !editProfileName.trim() || !editProfilePhone.trim()}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditProfileModal(false)}
                    className="inline-flex w-full justify-center rounded-lg border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-300 shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
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
