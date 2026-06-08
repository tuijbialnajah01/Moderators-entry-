import React, { useEffect, useState, useMemo } from 'react';
import { collection, collectionGroup, onSnapshot, query, orderBy, doc, setDoc, where, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, handleFirestoreError, OperationType } from '../types';
import { CountdownTimer } from './CountdownTimer';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Trophy, Clock, ScrollText, LogOut, LogIn, AlertTriangle, ShieldCheck, ChevronDown, Check, Filter, Menu, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type SortMode = 'ranking' | 'timeLeft';
type ViewMode = 'active' | 'blacklisted';

export function ModList() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [entriesMap, setEntriesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('ranking');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const { user, isAdmin, loading: authLoading, signIn, logOut } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [newModName, setNewModName] = useState('');
  const [newModPhone, setNewModPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [addModError, setAddModError] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; modId: string; action: 'active' | 'blacklisted' }>({ show: false, modId: '', action: 'active' });
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [modRoleView, setModRoleView] = useState<'moderator' | 'officer'>('moderator');
  const [newModRole, setNewModRole] = useState<'moderator' | 'officer'>('moderator');
  const [termsRoleView, setTermsRoleView] = useState<'moderator' | 'officer'>('moderator');

  useEffect(() => {
    // Regular users can only see active mods.
    // If we want to support legacy docs without 'status', we'd need multiple queries or just update data.
    // For now, we assume we keep status updated or use separate logic.
    const modsRef = collection(db, 'mods');
    const q = query(modsRef);

    const unsubscribeMods = onSnapshot(
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

    const unsubscribeEntries = onSnapshot(
      collectionGroup(db, 'entries'),
      (snapshot) => {
        const counts: Record<string, number> = {};
        snapshot.forEach((doc) => {
          const modId = doc.ref.parent.parent?.id;
          if (modId) {
            counts[modId] = (counts[modId] || 0) + 1;
          }
        });
        setEntriesMap(counts);
      },
      (error) => {
        console.warn("Could not fetch entries for ranking", error);
      }
    );

    return () => {
      unsubscribeMods();
      unsubscribeEntries();
    };
  }, [isAdmin]);

  const handleAddMod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModName.trim() || !newModPhone.trim()) return;

    if (!newModPhone.trim().startsWith('+')) {
      setAddModError('Phone number must include country code (e.g., +91)');
      return;
    }

      const targetName = newModName.trim().toLowerCase();
      const targetPhone = newModPhone.trim();
      const isDuplicateName = mods.some(mod => mod.name.toLowerCase() === targetName && (mod.role || 'moderator') === newModRole);
      const isDuplicatePhone = mods.some(mod => mod.phoneNumber === targetPhone);

      if (isDuplicateName) {
        setAddModError(`A ${newModRole} with this name already exists.`);
        return;
      }

      if (isDuplicatePhone) {
        setAddModError(`This phone number is already registered to another ${newModRole}.`);
        return;
      }

      setIsSubmitting(true);
      setAddModError('');
      try {
        const now = Date.now();
        const modId = crypto.randomUUID();
        const docRef = doc(db, 'mods', modId);
        
        await setDoc(docRef, {
          name: newModName.trim(),
          phoneNumber: newModPhone.trim(),
          lastEntryAt: now,
          deadlineAt: now + 7 * 24 * 60 * 60 * 1000,
          createdAt: now,
          updatedAt: now,
          status: 'active',
          role: newModRole,
        });

        setNewModName('');
        setNewModPhone('');
        setShowAddModal(false);
    } catch (error) {
       console.error("Failed to add mod:", error);
       alert("Failed to add mod. Make sure you are an admin.");
       handleFirestoreError(error, OperationType.CREATE, 'mods');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (modId: string, newStatus: 'active' | 'blacklisted') => {
    if (!isAdmin) return;
    
    // Open confirmation first
    setConfirmModal({ show: true, modId, action: newStatus });
  };

  const executeStatusChange = async () => {
    const { modId, action } = confirmModal;
    if (!modId || isStatusUpdating) return;

    setIsStatusUpdating(true);
    try {
      const now = Date.now();
      const modRef = doc(db, 'mods', modId);
      const updates: any = {
        status: action,
        updatedAt: now,
      };

      if (action === 'active') {
        updates.deadlineAt = now + 7 * 24 * 60 * 60 * 1000;
        updates.lastEntryAt = now;
      }

      await updateDoc(modRef, updates);
      
      // Close modal and reset
      setConfirmModal({ show: false, modId: '', action: 'active' });
      
      // Automatically switch view mode to show where the mod moved
      setViewMode(action === 'active' ? 'active' : 'blacklisted');
      
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status. Check your connection or permissions.");
      handleFirestoreError(error, OperationType.UPDATE, `mods/${modId}`);
    } finally {
      setIsStatusUpdating(false);
    }
  };

  const now = Date.now();

  const rankedMods = useMemo(() => {
    let filtered = mods.filter(mod => {
      const status = mod.status || 'active';
      const role = mod.role || 'moderator';
      return status === viewMode && role === modRoleView;
    });

    let list = filtered.map(mod => ({ ...mod, entryCount: entriesMap[mod.id] || 0 }));
    
    if (searchQuery.trim()) {
      const normalizeText = (str: string) => {
        return str
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[\u0300-\u036f]/g, '');
      };
      const q = normalizeText(searchQuery.trim());
      list = list.filter(mod => 
        normalizeText(mod.name).includes(q) || 
        (mod.phoneNumber && mod.phoneNumber.includes(q))
      );
    }
    
    if (sortMode === 'ranking') {
      list.sort((a, b) => {
        if (b.entryCount !== a.entryCount) {
          return b.entryCount - a.entryCount;
        }
        return a.deadlineAt - b.deadlineAt;
      });
    } else {
      list.sort((a, b) => b.deadlineAt - a.deadlineAt);
    }
    
    return list;
  }, [mods, entriesMap, sortMode, viewMode, modRoleView, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
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
                    onClick={() => setConfirmModal({ show: false, modId: '', action: 'active' })}
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
      <header className="h-28 sm:h-32 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 sm:px-16 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-white flex items-center gap-4">
            Moderators Report
          </h1>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="p-4 sm:p-5 rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all border border-slate-700"
          >
            <Menu className="w-8 h-8 sm:w-12 sm:h-12" />
          </button>

          <AnimatePresence>
            {showHeaderMenu && (
              <>
                <div 
                  className="fixed inset-0 z-[20]" 
                  onClick={() => setShowHeaderMenu(false)}
                ></div>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-6 w-96 sm:w-[450px] bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl z-[30] p-6 flex flex-col gap-6"
                >
                  <button 
                    onClick={() => { setShowTermsModal(true); setShowHeaderMenu(false); }}
                    className="flex items-center gap-5 px-6 py-5 sm:px-8 sm:py-6 text-2xl sm:text-3xl font-bold rounded-3xl bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white transition-all w-full"
                  >
                    <ScrollText className="w-10 h-10 sm:w-12 sm:h-12" />
                    <span>Rules & Guidelines</span>
                  </button>
                  
                  {user ? (
                    <button 
                      onClick={() => { logOut(); setShowHeaderMenu(false); }} 
                      className="flex items-center gap-5 px-6 py-5 sm:px-8 sm:py-6 text-2xl sm:text-3xl font-bold rounded-3xl bg-slate-800/60 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all w-full border border-transparent hover:border-red-500/30"
                    >
                      <LogOut className="w-10 h-10 sm:w-12 sm:h-12" />
                      <span>Logout</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => { signIn(); setShowHeaderMenu(false); }} 
                      className="flex items-center gap-5 px-6 py-5 sm:px-8 sm:py-6 text-2xl sm:text-3xl font-bold rounded-3xl bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all w-full border border-transparent hover:border-indigo-500/30"
                    >
                      <LogIn className="w-10 h-10 sm:w-12 sm:h-12" />
                      <span>Login</span>
                    </button>
                  )}
                  
                  {isAdmin && (
                    <div className="pt-6 mt-2 border-t border-slate-800">
                      <button 
                        onClick={() => { setShowAddModal(true); setAddModError(''); setNewModName(''); setNewModPhone(''); setShowHeaderMenu(false); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-5 sm:px-8 sm:py-6 rounded-3xl text-2xl sm:text-3xl font-bold flex items-center gap-5 transition-colors shadow-sm w-full"
                      >
                        <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        <span>Add Moderator</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto w-full p-3 sm:p-8">
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 mb-4 sm:mb-6">
          <div className="flex items-center p-2 bg-slate-900 border border-slate-800 rounded-[2rem] w-full shadow-sm">
             <button
                onClick={() => setModRoleView('moderator')}
                className={`flex-1 px-10 py-5 sm:py-6 rounded-2xl text-2xl sm:text-3xl font-bold transition-all ${modRoleView === 'moderator' ? 'bg-indigo-600 text-white shadow-md scale-[1.02]' : 'text-slate-400 hover:text-white hover:bg-slate-800/50 scale-100'}`}
             >
                Moderators
             </button>
             <button
                onClick={() => setModRoleView('officer')}
                className={`flex-1 px-10 py-5 sm:py-6 rounded-2xl text-2xl sm:text-3xl font-bold transition-all ${modRoleView === 'officer' ? 'bg-indigo-600 text-white shadow-md scale-[1.02]' : 'text-slate-400 hover:text-white hover:bg-slate-800/50 scale-100'}`}
             >
                Officers
             </button>
          </div>

          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-7 h-7 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name or number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-16 pr-6 py-5 sm:py-6 bg-slate-900 border border-slate-800 rounded-[2rem] text-xl sm:text-2xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm transition-all focus:bg-slate-800/80 placeholder:text-slate-500"
              />
            </div>
            <div className="relative flex justify-end w-full sm:w-auto">
              <button 
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center justify-center w-full sm:w-auto gap-4 px-8 py-5 sm:py-6 rounded-[2rem] bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all font-bold text-xl sm:text-2xl shadow-sm"
              >
                <Filter className="w-8 h-8 text-indigo-400" />
                <span>Filters & Sort</span>
                <ChevronDown className={`w-8 h-8 transition-transform duration-200 ${showFilterDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showFilterDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-[20]" 
                      onClick={() => setShowFilterDropdown(false)}
                    ></div>
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-4 w-full sm:w-96 bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl z-[30] p-4"
                    >
                    {isAdmin && (
                      <div className="mb-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-4 py-3">Status View</p>
                        <button 
                          onClick={() => { setViewMode('active'); setShowFilterDropdown(false); }}
                          className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl transition-colors ${viewMode === 'active' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                        >
                          <span className="flex items-center gap-4 font-bold text-xl sm:text-2xl">Active {modRoleView === 'moderator' ? 'Moderators' : 'Officers'}</span>
                          {viewMode === 'active' && <Check className="w-8 h-8" />}
                        </button>
                        <button 
                          onClick={() => { setViewMode('blacklisted'); setShowFilterDropdown(false); }}
                          className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl font-bold transition-colors ${viewMode === 'blacklisted' ? 'bg-red-500/10 text-red-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                        >
                          <span className="flex items-center gap-4 text-xl sm:text-2xl">Blacklisted</span>
                          {viewMode === 'blacklisted' && <Check className="w-8 h-8" />}
                        </button>
                      </div>
                    )}

                    <div className={isAdmin ? "pt-4 border-t border-slate-800/50" : ""}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-4 py-3">Sort By</p>
                      <button 
                        onClick={() => { setSortMode('ranking'); setShowFilterDropdown(false); }}
                        className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl transition-colors ${sortMode === 'ranking' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                      >
                        <span className="flex items-center gap-4 font-bold text-xl sm:text-2xl"><Trophy className="w-8 h-8" /> Ranking</span>
                        {sortMode === 'ranking' && <Check className="w-8 h-8" />}
                      </button>
                      <button 
                        onClick={() => { setSortMode('timeLeft'); setShowFilterDropdown(false); }}
                        className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl transition-colors ${sortMode === 'timeLeft' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                      >
                        <span className="flex items-center gap-4 font-bold text-xl sm:text-2xl"><Clock className="w-8 h-8" /> Time Left</span>
                        {sortMode === 'timeLeft' && <Check className="w-8 h-8" />}
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 w-full max-w-4xl mx-auto pb-10">
          {authLoading || (loading && mods.length === 0) ? (
            <div className="col-span-full h-40 rounded-2xl bg-slate-800/50 animate-pulse"></div>
          ) : rankedMods.length === 0 ? (
            <div className="col-span-full p-8 sm:p-16 text-center text-slate-400 bg-slate-900 border border-dashed border-slate-700 rounded-2xl text-sm sm:text-base">
               No {modRoleView}s found in the system.
            </div>
          ) : rankedMods.map((mod, index) => {
            const timeLeft = mod.deadlineAt - now;
            const isCritical = mod.role === 'officer' ? false : timeLeft < 24 * 60 * 60 * 1000;
            const isWarning = mod.role === 'officer' ? false : timeLeft < 3 * 24 * 60 * 60 * 1000;
            const totalMs = 7 * 24 * 60 * 60 * 1000;
            const progress = mod.role === 'officer' ? 100 : Math.max(0, Math.min(100, (timeLeft / totalMs) * 100));
            const isTopRank = sortMode === 'ranking' && index === 0 && mod.entryCount > 0;

            return (
              <div key={mod.id} className={`bg-slate-900 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row overflow-hidden border-l-[2px] relative ${mod.role === 'officer' ? 'border-l-indigo-500' : isCritical ? 'border-l-red-500' : isWarning ? 'border-l-amber-500' : 'border-l-emerald-500'} ${isTopRank ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950' : ''}`}>
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      {sortMode === 'ranking' ? (
                        <span className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl font-bold text-lg sm:text-xl shrink-0 ${isTopRank ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 text-slate-400'}`}>
                          #{index + 1}
                        </span>
                      ) : (
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 shrink-0`}>
                          <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                      )}
                      <h3 className="font-bold text-3xl sm:text-4xl text-white hover:text-indigo-400 transition-colors truncate">
                        <Link to={`/mod/${mod.id}`} className="block w-full truncate">{mod.name}</Link>
                      </h3>
                      {isTopRank && <Trophy className="w-5 h-5 text-indigo-400 ml-1" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <p className="text-xs sm:text-sm text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                        Total Entries: <strong className="text-white ml-1">{mod.entryCount}</strong>
                      </p>
                      <p className="text-xs sm:text-sm text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                        Last Active: <strong className="text-white ml-1">{new Date(mod.lastEntryAt).toLocaleDateString()}</strong>
                      </p>
                      {mod.status !== 'blacklisted' && (
                        <>
                          {mod.role === 'officer' ? (
                            <span className="bg-indigo-500/10 text-indigo-400 text-[5px] sm:text-[6px] font-black uppercase px-2 py-1.5 rounded-lg tracking-widest flex-shrink-0 border border-indigo-500/20">Officer</span>
                          ) : isCritical ? (
                            <span className="bg-red-500/10 text-red-400 text-[5px] sm:text-[6px] font-black uppercase px-2 py-1.5 rounded-lg tracking-widest flex-shrink-0 border border-red-500/20">Critical</span>
                          ) : isWarning ? (
                            <span className="bg-amber-500/10 text-amber-400 text-[5px] sm:text-[6px] font-black uppercase px-2 py-1.5 rounded-lg tracking-widest flex-shrink-0 border border-amber-500/20">Warning</span>
                          ) : (
                            <span className="bg-emerald-500/10 text-emerald-400 text-[5px] sm:text-[6px] font-black uppercase px-2 py-1.5 rounded-lg tracking-widest flex-shrink-0 border border-emerald-500/20">Safe</span>
                          )}
                        </>
                      )}
                      {mod.status === 'blacklisted' && (
                        <span className="bg-red-600/20 text-red-500 text-xs font-bold uppercase px-3 py-1.5 rounded-lg border border-red-600/30 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" /> Blacklisted
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="mt-4 flex gap-2">
                       {mod.status === 'blacklisted' ? (
                          <button 
                            onClick={() => handleStatusChange(mod.id, 'active')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
                          >
                            Re-Hire
                          </button>
                       ) : (
                          <button 
                            onClick={() => handleStatusChange(mod.id, 'blacklisted')}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-lg shadow-red-900/20"
                          >
                            Move to Blacklist
                          </button>
                       )}
                    </div>
                  )}
                </div>
                
                <div className={`w-full md:w-[22rem] flex flex-col border-t md:border-t-0 md:border-l border-slate-800 ${mod.status === 'blacklisted' ? 'bg-slate-900/50 grayscale opacity-75' : mod.role === 'officer' ? 'bg-slate-900/50' : isCritical ? 'bg-red-950/20' : 'bg-slate-950/50'}`}>
                  <div className={`flex-1 flex flex-col p-6 min-h-[70px] ${mod.role !== 'officer' ? 'items-center justify-center' : ''}`}>
                    <p className={`text-[5px] sm:text-xs uppercase tracking-widest font-bold mb-3 ${(mod.status === 'blacklisted' || mod.role === 'officer') ? 'text-slate-500' : isCritical ? 'text-red-500' : 'text-slate-500'} ${mod.role !== 'officer' ? 'text-center' : ''}`}>
                      {mod.status === 'blacklisted' ? 'Timer Suspended' : mod.role === 'officer' ? 'Moderators Managed' : 'Time Remaining'}
                    </p>
                    <div className={`${mod.role !== 'officer' ? 'whitespace-nowrap flex justify-center w-full scale-110' : 'flex flex-col gap-2'}`}>
                      {mod.status === 'blacklisted' ? (
                        <div className="text-slate-500 font-mono text-2xl font-bold">-- : -- : --</div>
                      ) : mod.role === 'officer' ? (
                        <div className="flex flex-col gap-2 w-full max-h-[140px] overflow-y-auto custom-scrollbar pr-2 text-left">
                           <ol className="list-decimal list-outside ml-4 space-y-2 text-sm w-full">
                             {mods.filter(m => m.officerId === mod.id && m.role !== 'officer' && m.status !== 'blacklisted').map(m => (
                               <li key={m.id} className="text-slate-300 font-bold marker:text-slate-500 pl-1">
                                 <div className="flex flex-row justify-between items-center w-full max-w-[280px]">
                                   <Link to={`/mod/${m.id}`} className="font-semibold text-white hover:text-indigo-400 text-base transition-colors mr-2 truncate">
                                     {m.name}
                                   </Link>
                                   <span className="text-[10px] sm:text-xs bg-slate-900 px-2 py-1 rounded text-slate-400 font-mono border border-slate-700/50 shadow-inner -ml-2 sm:ml-0 shrink-0">
                                     <CountdownTimer deadlineAt={m.deadlineAt} compact />
                                   </span>
                                 </div>
                               </li>
                             ))}
                           </ol>
                           {mods.filter(m => m.officerId === mod.id && m.role !== 'officer' && m.status !== 'blacklisted').length === 0 && (
                              <span className="text-xs text-slate-500 italic block mt-2 px-2 text-center">No moderators assigned</span>
                           )}
                        </div>
                      ) : (
                        <CountdownTimer deadlineAt={mod.deadlineAt} />
                      )}
                    </div>
                  </div>
                  {mod.role !== 'officer' && (
                    <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${mod.status === 'blacklisted' ? 'bg-slate-700' : isCritical ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${mod.status === 'blacklisted' ? 0 : progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && isAdmin && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-slate-950/80 transition-opacity" 
                onClick={() => setShowAddModal(false)}
              ></motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative transform overflow-hidden rounded-xl bg-slate-900 text-left shadow-2xl transition-all w-full max-w-md border border-slate-800 z-10"
              >
                <form onSubmit={handleAddMod}>
                  <div className="bg-slate-900 px-6 pb-6 pt-6">
                    <h3 className="text-xl font-bold leading-6 text-white mb-6">Create New Member</h3>
                    <div className="flex gap-2 mb-6 p-1 rounded-xl bg-slate-950 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => { setNewModRole('moderator'); setAddModError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${newModRole === 'moderator' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                      >
                        Moderator
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNewModRole('officer'); setAddModError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${newModRole === 'officer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                      >
                        Officer
                      </button>
                    </div>
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-slate-300 mb-2">{newModRole === 'moderator' ? 'Moderator' : 'Officer'} Name</label>
                      <input
                        type="text"
                        className={`block w-full rounded-lg border-slate-700 bg-slate-950 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border ${addModError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                        placeholder="e.g. Aman Kumar"
                        value={newModName}
                        onChange={(e) => { setNewModName(e.target.value); setAddModError(''); }}
                        required
                      />
                      {addModError && (
                        <p className="mt-2 text-sm text-red-400">{addModError}</p>
                      )}
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-300 mb-2">WhatsApp Number (with country code)</label>
                      <input
                        type="tel"
                        className="block w-full rounded-lg border-slate-700 bg-slate-950 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                        placeholder="e.g. +91 9876543210"
                        value={newModPhone}
                        onChange={(e) => { setNewModPhone(e.target.value); setAddModError(''); }}
                        required
                      />
                    </div>
                  </div>
                  <div className="bg-slate-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-800">
                    <button
                      type="submit"
                      disabled={isSubmitting || !newModName.trim() || !newModPhone.trim()}
                      className="inline-flex w-full justify-center rounded-lg border border-transparent bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                    >
                      {isSubmitting ? 'Creating...' : `Create ${newModRole === 'moderator' ? 'Moderator' : 'Officer'}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="inline-flex w-full justify-center rounded-lg border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-300 shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTermsModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto w-full">
            <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-slate-950/80 transition-opacity" 
                onClick={() => setShowTermsModal(false)}
              ></motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative overflow-hidden rounded-[2rem] bg-slate-900 text-left shadow-2xl w-full max-w-4xl border border-slate-800 z-10 mx-auto flex flex-col h-[90vh] sm:h-[85vh]"
              >
                <div className="bg-slate-900 px-8 py-6 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <h3 className="text-3xl sm:text-4xl font-bold leading-6 text-white flex items-center gap-4">
                    <ScrollText className="w-10 h-10 text-indigo-400" />
                    Terms And Conditions
                  </h3>
                </div>
                
                <div className="bg-slate-950 px-8 py-6 border-b border-slate-800">
                  <div className="flex gap-2 p-2 bg-slate-900 border border-slate-800 rounded-2xl">
                    <button
                      onClick={() => setTermsRoleView('moderator')}
                      className={`flex-1 px-6 py-4 rounded-xl text-xl font-bold transition-all ${termsRoleView === 'moderator' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                    >
                      Moderators
                    </button>
                    <button
                      onClick={() => setTermsRoleView('officer')}
                      className={`flex-1 px-6 py-4 rounded-xl text-xl font-bold transition-all ${termsRoleView === 'officer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                    >
                      Officers
                    </button>
                  </div>
                </div>

                <div className="p-8 sm:p-10 overflow-y-auto flex-1 text-slate-300 text-2xl sm:text-3xl space-y-12">
                  {termsRoleView === 'moderator' ? (
                    <>
                      <div className="space-y-8">
                        <div className="flex gap-5">
                          <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">1.</span>
                          <div className="space-y-6 pt-1">
                            <p className="font-bold text-white text-2xl sm:text-3xl">Provide updates or reports :-</p>
                            
                            <div className="pl-6 sm:pl-8 space-y-8">
                              <div>
                                <p className="text-slate-200 font-semibold flex items-center gap-4"><span className="w-3 h-3 rounded-full bg-slate-500"></span> user reports</p>
                                <ul className="pl-10 mt-4 space-y-4 text-slate-400 leading-relaxed">
                                  <li className="flex items-center gap-4"><span className="text-indigo-500 font-bold">→</span> Bad behaviour of users</li>
                                  <li className="flex items-center gap-4"><span className="text-indigo-500 font-bold">→</span> unauthorised automation</li>
                                </ul>
                              </div>

                              <div>
                                <p className="text-slate-200 font-semibold flex items-center gap-4"><span className="w-3 h-3 rounded-full bg-slate-500"></span> Bot Broken Usages</p>
                                <ul className="pl-10 mt-4 space-y-4 text-slate-400 border-l-4 border-slate-800 ml-4">
                                  <li className="flex items-start gap-4"><span className="text-indigo-500 font-bold mt-1">→</span> <span className="leading-relaxed">Broken Usages will be counted only if they aren't recorded as &lt;in dev&gt; in <a href="https://usages-ls.vercel.app" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline font-medium mix-blend-plus-lighter">usages-ls.vercel.app</a></span></li>
                                </ul>
                              </div>

                              <div>
                                <p className="text-slate-200 font-semibold flex items-center gap-4"><span className="w-3 h-3 rounded-full bg-slate-500"></span> user concerns / suggestions for Bot feature</p>
                              </div>

                              <div>
                                <p className="text-slate-200 font-semibold flex items-center gap-4"><span className="w-3 h-3 rounded-full bg-slate-500"></span> community activity</p>
                                <ul className="pl-10 mt-4 space-y-4 text-slate-400 leading-relaxed">
                                  <li className="flex items-start gap-4"><span className="text-indigo-500 font-bold mt-1">→</span> participate in community activity</li>
                                  <li className="flex items-start gap-4"><span className="text-indigo-500 font-bold mt-1">→</span> Make at least one group active for three days</li>
                                </ul>
                              </div>
                            </div>

                            <div className="mt-8 inline-block">
                              <p className="text-2xl font-bold text-amber-400 px-8 py-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                                ( Any two of these )
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-5">
                        <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">2.</span>
                        <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                          Suggest new ideas or improvements that can benefit the community ( Specially By Mods )
                        </p>
                      </div>

                      <div className="flex gap-5">
                        <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">3.</span>
                        <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                           Help grow the community by bringing in new members (minimum 2)
                        </p>
                      </div>

                      <div className="mt-12 pt-12 border-t border-slate-800 space-y-8">
                        <p className="font-mono font-bold text-indigo-300 text-center bg-indigo-500/10 p-8 sm:p-10 rounded-3xl border border-indigo-500/30 shadow-inner text-xl sm:text-2xl leading-relaxed">
                          ——&gt;Any one of the above contributions is sufficient to remain an active moderator&lt;——
                        </p>
                        <p className="text-xl sm:text-2xl font-medium text-amber-300 bg-amber-500/10 p-8 rounded-3xl border border-amber-500/20 text-center flex flex-col items-center justify-center gap-6">
                          <span className="shrink-0 bg-amber-500 text-amber-950 px-5 py-2.5 rounded-xl text-lg uppercase tracking-bold font-black">Note</span>
                          <span className="leading-relaxed">Regardless of the number of entries you register, your active status timer will always reset from the exact time of your last entry.</span>
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-10">
                        <div className="flex items-start gap-5">
                          <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">1.</span>
                          <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                            Monitor moderators in their job
                          </p>
                        </div>
                        <div className="flex items-start gap-5">
                          <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">2.</span>
                          <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                            Always monitor the status of their bot because you don't know if the problem is coming from you
                          </p>
                        </div>
                        <div className="flex items-start gap-5">
                          <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">3.</span>
                          <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                            Settle disputes between moderators
                          </p>
                        </div>
                        <div className="flex items-start gap-5">
                          <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">4.</span>
                          <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                            Handle what the moderators can't handle
                          </p>
                        </div>
                        <div className="flex items-start gap-5">
                          <span className="font-bold text-indigo-400 text-3xl sm:text-4xl">5.</span>
                          <p className="pt-1 text-slate-200 leading-relaxed font-medium">
                            Ensuring moderators are not abusing their power to harm others
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-12 pt-12 border-t border-slate-800">
                        <p className="font-mono font-bold text-amber-300 text-center bg-amber-500/10 p-8 sm:p-10 rounded-3xl border border-amber-500/30 shadow-inner flex flex-col sm:flex-row items-center justify-center gap-6 text-xl sm:text-2xl leading-relaxed">
                          <ShieldCheck className="w-10 h-10 sm:w-12 sm:h-12 shrink-0" />
                          Officers hold the highest accountability in upholding these standards.
                        </p>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="bg-slate-900 px-8 py-6 flex justify-center border-t border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(false)}
                    className="w-full sm:w-auto min-w-[200px] justify-center rounded-2xl border border-transparent bg-indigo-600 px-10 py-5 text-xl sm:text-2xl font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all active:scale-[0.98]"
                  >
                    I finished reading
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

