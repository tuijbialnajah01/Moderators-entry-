import React, { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { collection, collectionGroup, onSnapshot, query, orderBy, doc, setDoc, where, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, handleFirestoreError, OperationType } from '../types';
import { ModCardSkeleton } from './Skeletons';
import { CountdownTimer } from './CountdownTimer';
import { TermsModal } from './TermsModal';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Trophy, Clock, ScrollText, LogOut, LogIn, AlertTriangle, ShieldCheck, ChevronDown, Check, Filter, Menu, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// No extra declarations needed for functional autoTable

type SortMode = 'ranking' | 'timeLeft';
type ViewMode = 'active' | 'blacklisted';

export function ModList() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [entriesMap, setEntriesMap] = useState<Record<string, number>>({});
  const [draftsMap, setDraftsMap] = useState<Record<string, number>>({});
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
  const deferredSearchQuery = useDeferredValue(searchQuery);
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

    const unsubscribeDraftsMap = onSnapshot(
      collectionGroup(db, 'drafts'),
      (snapshot) => {
        const counts: Record<string, number> = {};
        snapshot.forEach((doc) => {
          const modId = doc.ref.parent.parent?.id;
          if (modId) {
            counts[modId] = (counts[modId] || 0) + 1;
          }
        });
        setDraftsMap(counts);
      },
      (error) => {
        console.warn("Could not fetch drafts for global view", error);
      }
    );

    return () => {
      unsubscribeMods();
      unsubscribeEntries();
      unsubscribeDraftsMap();
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
          totalPoints: 0,
          honorScore: 100,
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

  const officerRelationsMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    mods.forEach(m => {
      if (m.role !== 'officer' && m.status !== 'blacklisted') {
        const ids = m.officerIds || (m.officerId ? [m.officerId] : []);
        ids.forEach(oid => {
          if (!map[oid]) map[oid] = [];
          map[oid].push({
            ...m,
            entryCount: entriesMap[m.id] || 0
          });
        });
      }
    });
    return map;
  }, [mods, entriesMap]);

  const rankedMods = useMemo(() => {
    let filtered = mods.filter(mod => {
      const status = mod.status || 'active';
      const role = mod.role || 'moderator';
      return status === viewMode && role === modRoleView;
    });

    let list = filtered.map(mod => ({ ...mod, entryCount: entriesMap[mod.id] || 0 }));
    
    if (deferredSearchQuery.trim()) {
      const normalizeText = (str: string) => {
        return str
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[\u0300-\u036f]/g, '');
      };
      const q = normalizeText(deferredSearchQuery.trim());
      list = list.filter(mod => 
        normalizeText(mod.name).includes(q) || 
        (mod.phoneNumber && mod.phoneNumber.includes(q))
      );
    }
    
    if (sortMode === 'ranking') {
      list.sort((a, b) => {
        const pointsA = a.totalPoints || 0;
        const pointsB = b.totalPoints || 0;
        
        if (pointsB !== pointsA) {
          return pointsB - pointsA;
        }
        if (b.entryCount !== a.entryCount) {
          return b.entryCount - a.entryCount;
        }
        return a.deadlineAt - b.deadlineAt;
      });
    } else {
      list.sort((a, b) => b.deadlineAt - a.deadlineAt);
    }
    
    return list;
  }, [mods, entriesMap, sortMode, viewMode, modRoleView, deferredSearchQuery]);

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/5 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform-gpu"
            >
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${confirmModal.action === 'blacklisted' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {confirmModal.action === 'blacklisted' ? <AlertTriangle className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {confirmModal.action === 'blacklisted' ? 'Blacklist Moderator?' : 'Re-Hire Moderator?'}
                </h3>
                <p className="text-zinc-400 text-sm mb-6">
                  {confirmModal.action === 'blacklisted' 
                    ? 'Are you sure you want to blacklist this moderator? They will no longer be visible to regular users.'
                    : 'This will restore the moderator and reset their activity timer to 7 days starting from now.'}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmModal({ show: false, modId: '', action: 'active' })}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition-all active:scale-95"
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
      <header className="h-28 sm:h-32 bg-zinc-900 border-b border-white/5 flex items-center justify-between px-6 sm:px-16 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-white flex items-center gap-4">
            Moderators Report
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowTermsModal(true)}
            className="p-4 sm:p-5 rounded-2xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all border border-white/10 flex items-center gap-3 group"
            title="Rules & Guidelines"
          >
            <ScrollText className="w-8 h-8 sm:w-12 sm:h-12 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="hidden lg:block text-xl font-bold">Rules</span>
          </button>
          <div className="relative">
            <button 
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              className="p-4 sm:p-5 rounded-2xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all border border-white/10"
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
                  className="absolute right-0 top-full mt-6 w-96 sm:w-[450px] bg-zinc-900 border border-white/5 rounded-[2.5rem] shadow-2xl z-[30] p-6 flex flex-col gap-6 transform-gpu"
                >

                  {user ? (
                    <button 
                      onClick={() => { logOut(); setShowHeaderMenu(false); }} 
                      className="flex items-center gap-5 px-6 py-5 sm:px-8 sm:py-6 text-2xl sm:text-3xl font-bold rounded-3xl bg-zinc-800/60 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-all w-full border border-transparent hover:border-red-500/30"
                    >
                      <LogOut className="w-10 h-10 sm:w-12 sm:h-12" />
                      <span>Logout</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => { signIn(); setShowHeaderMenu(false); }} 
                      className="flex items-center gap-5 px-6 py-5 sm:px-8 sm:py-6 text-2xl sm:text-3xl font-bold rounded-3xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all w-full border border-transparent hover:border-blue-500/30"
                    >
                      <LogIn className="w-10 h-10 sm:w-12 sm:h-12" />
                      <span>Login</span>
                    </button>
                  )}
                  
                  {isAdmin && (
                    <div className="pt-6 mt-2 border-t border-white/5">
                      <button 
                        onClick={() => { setShowAddModal(true); setAddModError(''); setNewModName(''); setNewModPhone(''); setShowHeaderMenu(false); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-5 sm:px-8 sm:py-6 rounded-3xl text-2xl sm:text-3xl font-bold flex items-center gap-5 transition-colors shadow-lg shadow-black/20 w-full"
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
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto w-full p-4 sm:p-10">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 mb-8">
          <div className="flex items-center p-2 bg-zinc-900 border border-white/5 rounded-[2.5rem] w-full shadow-xl shadow-black/40">
             <button
                onClick={() => setModRoleView('moderator')}
                className={`flex-1 px-6 py-4 sm:py-5 rounded-[2rem] text-xl sm:text-2xl font-bold transition-all ${modRoleView === 'moderator' ? 'bg-blue-600 text-white shadow-lg scale-[1.01]' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50 scale-100'}`}
             >
                Moderators
             </button>
             <button
                onClick={() => setModRoleView('officer')}
                className={`flex-1 px-6 py-4 sm:py-5 rounded-[2rem] text-xl sm:text-2xl font-bold transition-all ${modRoleView === 'officer' ? 'bg-blue-600 text-white shadow-lg scale-[1.01]' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50 scale-100'}`}
             >
                Officers
             </button>
          </div>

          <div className="relative flex flex-col lg:flex-row items-center justify-between gap-4 w-full">
            <div className="relative w-full lg:flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-500" />
              <input
                type="text"
                placeholder="Search member by name or number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-16 pr-6 py-4 sm:py-5 bg-zinc-900 border border-white/5 rounded-[2rem] text-lg sm:text-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-lg shadow-black/20 transition-all focus:bg-zinc-800/80 placeholder:text-zinc-500"
              />
            </div>
            <div className="relative flex justify-end w-full lg:w-auto gap-4">
              <button 
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center justify-center w-full lg:w-auto gap-4 px-8 py-4 sm:py-5 rounded-[2rem] bg-zinc-900 border border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all font-bold text-lg sm:text-xl shadow-lg shadow-black/20"
              >
                <Filter className="w-6 h-6 text-blue-400" />
                <span>Filters & Sort</span>
                <ChevronDown className={`w-6 h-6 transition-transform duration-200 ${showFilterDropdown ? 'rotate-180' : ''}`} />
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
                      className="absolute right-0 mt-4 w-full sm:w-96 bg-zinc-900 border border-white/5 rounded-[2rem] shadow-2xl z-[30] p-4 transform-gpu"
                    >
                    {isAdmin && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-4 py-3">Status View</p>
                        <button 
                          onClick={() => { setViewMode('active'); setShowFilterDropdown(false); }}
                          className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl transition-colors ${viewMode === 'active' ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                        >
                          <span className="flex items-center gap-4 font-bold text-xl sm:text-2xl">Active {modRoleView === 'moderator' ? 'Moderators' : 'Officers'}</span>
                          {viewMode === 'active' && <Check className="w-8 h-8" />}
                        </button>
                        <button 
                          onClick={() => { setViewMode('blacklisted'); setShowFilterDropdown(false); }}
                          className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl font-bold transition-colors ${viewMode === 'blacklisted' ? 'bg-red-500/10 text-red-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                        >
                          <span className="flex items-center gap-4 text-xl sm:text-2xl">Blacklisted</span>
                          {viewMode === 'blacklisted' && <Check className="w-8 h-8" />}
                        </button>
                      </div>
                    )}

                    <div className={isAdmin ? "pt-4 border-t border-white/5/50" : ""}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-4 py-3">Sort By</p>
                      <button 
                        onClick={() => { setSortMode('ranking'); setShowFilterDropdown(false); }}
                        className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl transition-colors ${sortMode === 'ranking' ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                      >
                        <span className="flex items-center gap-4 font-bold text-xl sm:text-2xl"><Trophy className="w-8 h-8" /> Ranking</span>
                        {sortMode === 'ranking' && <Check className="w-8 h-8" />}
                      </button>
                      <button 
                        onClick={() => { setSortMode('timeLeft'); setShowFilterDropdown(false); }}
                        className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl transition-colors ${sortMode === 'timeLeft' ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
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

        <div className="grid grid-cols-1 gap-8 w-full max-w-6xl mx-auto pb-16">
          {authLoading || (loading && mods.length === 0) ? (
            <>
              <ModCardSkeleton />
              <ModCardSkeleton />
              <ModCardSkeleton />
            </>
          ) : rankedMods.length === 0 ? (
            <div className="col-span-full p-20 text-center text-zinc-500 bg-zinc-900/30 border border-dashed border-white/10 rounded-[3rem] text-xl">
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
              <div key={mod.id} className={`group bg-zinc-900 rounded-[2.5rem] border border-white/5 hover:border-blue-500/20 shadow-2xl shadow-black/40 hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500 flex flex-col md:flex-row overflow-hidden relative transform-gpu ${isTopRank ? 'ring-2 ring-blue-500/50 ring-offset-4 ring-offset-black' : ''}`}>
                <div className="p-8 sm:p-10 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-5 mb-4">
                      {sortMode === 'ranking' ? (
                        <span className={`w-12 h-12 flex items-center justify-center rounded-2xl font-black text-xl shrink-0 ${isTopRank ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
                          #{index + 1}
                        </span>
                      ) : (
                        <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500 shrink-0">
                          <Clock className="w-6 h-6" />
                        </div>
                      )}
                      <h3 className="font-black text-3xl sm:text-4xl lg:text-5xl text-white hover:text-blue-400 transition-colors truncate tracking-tight">
                        <Link to={`/mod/${mod.id}`} className="block w-full truncate">{mod.name}</Link>
                      </h3>
                      {isTopRank && <Trophy className="w-7 h-7 text-amber-400 ml-1 drop-shadow-md" />}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 mt-8">
                      <p className="bg-black/50 px-6 py-4 rounded-2xl border border-white/5 shadow-inner flex flex-col gap-1 min-w-[140px]">
                        <span className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-black">Entries</span>
                        <strong className="text-xl sm:text-3xl text-white font-black">{mod.entryCount}</strong>
                      </p>
                      {draftsMap[mod.id] > 0 && (
                        <p className="bg-indigo-500/10 px-6 py-4 rounded-2xl border border-indigo-500/20 shadow-inner flex flex-col gap-1 min-w-[140px] animate-pulse">
                          <span className="text-indigo-400 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-black">Drafts</span>
                          <strong className="text-xl sm:text-3xl text-indigo-300 font-black">{draftsMap[mod.id]}</strong>
                        </p>
                      )}
                      <p className="bg-black/50 px-6 py-4 rounded-2xl border border-white/5 flex flex-col gap-1 shadow-inner min-w-[140px]">
                        <span className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-black">Points</span>
                        <strong className="text-xl sm:text-3xl text-amber-400 flex items-center gap-3 font-black">
                          <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-amber-500" />
                          {mod.totalPoints || 0}
                        </strong>
                      </p>
                      <p className="bg-black/50 px-6 py-4 rounded-2xl border border-white/5 flex flex-col gap-1 shadow-inner min-w-[140px]">
                        <span className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-black">P/E</span>
                        <strong className="text-xl sm:text-3xl text-purple-400 font-black">
                          {mod.entryCount > 0 ? ((mod.totalPoints || 0) / mod.entryCount).toFixed(2) : '0.00'}
                        </strong>
                      </p>
                      <p className="bg-black/50 px-6 py-4 rounded-2xl border border-white/5 flex flex-col gap-1 shadow-inner min-w-[140px]">
                        <span className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-black">Honor</span>
                        <strong className="text-xl sm:text-3xl text-emerald-400 font-black">
                          {mod.honorScore ?? 100}
                        </strong>
                      </p>
                      <p className="bg-black/50 px-6 py-4 rounded-2xl border border-white/5 shadow-inner flex flex-col gap-1 min-w-[160px]">
                        <span className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-black">Last Active</span>
                        <strong className="text-xl sm:text-2xl text-white font-black truncate">{new Date(mod.lastEntryAt).toLocaleDateString()}</strong>
                      </p>
                      
                      <div className="flex gap-3 ml-auto self-end">
                        {mod.status !== 'blacklisted' && (
                          <>
                            {mod.role === 'officer' ? (
                              <span className="bg-blue-500/10 text-blue-400 text-xs sm:text-sm font-black uppercase px-5 py-2.5 rounded-xl tracking-wider border border-blue-500/20 shadow-lg">Officer</span>
                            ) : isCritical ? (
                              <span className="bg-red-500/10 text-red-400 text-xs sm:text-sm font-black uppercase px-5 py-2.5 rounded-xl tracking-wider border border-red-500/20 shadow-lg animate-pulse">Critical</span>
                            ) : isWarning ? (
                              <span className="bg-amber-500/10 text-amber-400 text-xs sm:text-sm font-black uppercase px-5 py-2.5 rounded-xl tracking-wider border border-amber-500/20 shadow-lg">Warning</span>
                            ) : null}
                          </>
                        )}
                        {mod.status === 'blacklisted' && (
                          <span className="bg-red-600/20 text-red-500 text-xs sm:text-sm font-black uppercase px-5 py-2.5 rounded-xl border border-red-600/30 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" /> Blacklisted
                          </span>
                        )}
                      </div>
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
                
                <div className={`w-full md:w-[32rem] flex flex-col border-t md:border-t-0 md:border-l border-white/5 relative z-0 ${mod.status === 'blacklisted' ? 'bg-zinc-900/50 grayscale opacity-75' : mod.role === 'officer' ? 'bg-zinc-900/40' : isCritical ? 'bg-red-950/20' : 'bg-black/20'}`}>
                  <div className={`flex-1 flex flex-col p-8 ${mod.role !== 'officer' ? 'items-center justify-center' : ''}`}>
                    {mod.role !== 'officer' && (
                      <p className={`text-xs uppercase tracking-[0.3em] font-black mb-6 ${mod.status === 'blacklisted' ? 'text-zinc-600' : isCritical ? 'text-red-500' : 'text-zinc-500'} text-center`}>
                        {mod.status === 'blacklisted' ? 'Timer Suspended' : 'Time Remaining'}
                      </p>
                    )}
                    <div className={`${mod.role !== 'officer' ? 'flex justify-center w-full' : 'flex flex-col gap-4'}`}>
                      {mod.status === 'blacklisted' ? (
                        <div className="text-zinc-700 font-mono text-4xl font-black tracking-widest">--:--:--</div>
                      ) : mod.role === 'officer' ? (
                        <div className="flex flex-col gap-3 w-full max-h-[300px] overflow-y-auto custom-scrollbar pr-2 text-left">
                           <p className="text-[10px] uppercase tracking-[0.3em] font-black text-zinc-500 mb-2 px-1">Managed Units</p>
                           <ol className="space-y-3 text-sm w-full">
                             {(officerRelationsMap[mod.id] || []).map(m => (
                               <li key={m.id} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-blue-500/30 transition-colors group/unit">
                                   <Link to={`/mod/${m.id}`} className="font-black text-white group-hover/unit:text-blue-400 text-lg transition-colors truncate max-w-[180px]">
                                     {m.name}
                                   </Link>
                                   <div className="flex items-center gap-3 shrink-0">
                                     <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-xl text-xs font-black border border-amber-500/20" title="Points">
                                       <Trophy className="w-3.5 h-3.5" />
                                       {m.totalPoints || 0}
                                     </div>
                                     <div className="flex items-center gap-2 bg-purple-500/10 text-purple-400 px-3 py-1.5 rounded-xl text-xs font-black border border-purple-500/20" title="P/E Ratio">
                                       P/E {m.entryCount > 0 ? ((m.totalPoints || 0) / m.entryCount).toFixed(1) : '0.0'}
                                     </div>
                                     {draftsMap[m.id] > 0 && (
                                       <div className="flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-xl text-xs font-black border border-indigo-500/20 animate-pulse" title="Pending Drafts">
                                         D {draftsMap[m.id]}
                                       </div>
                                     )}
                                     <span className="text-xs bg-zinc-900 px-3 py-1.5 rounded-xl text-zinc-400 font-mono border border-white/10 shadow-inner shrink-0">
                                       <CountdownTimer deadlineAt={m.deadlineAt} compact />
                                     </span>
                                   </div>
                               </li>
                             ))}
                           </ol>
                           {(!officerRelationsMap[mod.id] || officerRelationsMap[mod.id].length === 0) && (
                              <div className="py-12 bg-black/20 rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center">
                                <span className="text-sm text-zinc-600 font-bold uppercase tracking-widest">No Active Units</span>
                              </div>
                           )}
                        </div>
                      ) : (
                        <CountdownTimer deadlineAt={mod.deadlineAt} />
                      )}
                    </div>
                  </div>
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
                className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
                onClick={() => setShowAddModal(false)}
              ></motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-md border border-white/5 z-10 transform-gpu"
              >
                <form onSubmit={handleAddMod}>
                  <div className="bg-zinc-900 px-6 pb-6 pt-6">
                    <h3 className="text-xl font-bold leading-6 text-white mb-6">Create New Member</h3>
                    <div className="flex gap-2 mb-6 p-1 rounded-xl bg-black border border-white/5">
                      <button
                        type="button"
                        onClick={() => { setNewModRole('moderator'); setAddModError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${newModRole === 'moderator' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                      >
                        Moderator
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNewModRole('officer'); setAddModError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${newModRole === 'officer' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                      >
                        Officer
                      </button>
                    </div>
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-zinc-300 mb-2">{newModRole === 'moderator' ? 'Moderator' : 'Officer'} Name</label>
                      <input
                        type="text"
                        className={`block w-full rounded-lg border-white/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border ${addModError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
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
                      <label className="block text-sm font-medium text-zinc-300 mb-2">WhatsApp Number (with country code)</label>
                      <input
                        type="tel"
                        className="block w-full rounded-lg border-white/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                        placeholder="e.g. +91 9876543210"
                        value={newModPhone}
                        onChange={(e) => { setNewModPhone(e.target.value); setAddModError(''); }}
                        required
                      />
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-white/5">
                    <button
                      type="submit"
                      disabled={isSubmitting || !newModName.trim() || !newModPhone.trim()}
                      className="inline-flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                    >
                      {isSubmitting ? 'Creating...' : `Create ${newModRole === 'moderator' ? 'Moderator' : 'Officer'}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="inline-flex w-full justify-center rounded-lg border border-white/10 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-lg shadow-black/20 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
      <TermsModal 
        show={showTermsModal} 
        onClose={() => setShowTermsModal(false)}
        roleView={termsRoleView}
        onRoleViewChange={setTermsRoleView}
      />
    </div>
  );
}

