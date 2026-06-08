import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, onSnapshot, query, orderBy, setDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, Entry, handleFirestoreError, OperationType } from '../types';
import { CountdownTimer } from './CountdownTimer';
import { ArrowLeft, Plus, Trash2, Pencil, AlertTriangle, ShieldCheck, Menu } from 'lucide-react';
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
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [entryText, setEntryText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deletion state
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Profile state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean, action: 'active' | 'blacklisted' }>({ show: false, action: 'active' });
  const [roleConfirmModal, setRoleConfirmModal] = useState<{ show: boolean, action: 'promote' | 'demote' }>({ show: false, action: 'promote' });
  const [isRoleUpdating, setIsRoleUpdating] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfilePhone, setEditProfilePhone] = useState('');
  const [editProfileError, setEditProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [allMods, setAllMods] = useState<Mod[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

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

    const allModsRef = collection(db, 'mods');
    const unsubscribeAllMods = onSnapshot(allModsRef, (snapshot) => {
      const fetchedMods: Mod[] = [];
      snapshot.forEach((doc) => {
        fetchedMods.push({ id: doc.id, ...doc.data() } as Mod);
      });
      setAllMods(fetchedMods);
    });

    return () => {
      unsubscribeMod();
      unsubscribeEntries();
      unsubscribeAllMods();
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
      const targetName = editProfileName.trim().toLowerCase();
      const targetPhone = editProfilePhone.trim();
      
      const isDuplicateName = allMods.some(m => m.id !== id && m.name.toLowerCase() === targetName);
      if (isDuplicateName) {
        setEditProfileError('A moderator with this name already exists.');
        setIsSavingProfile(false);
        return;
      }

      const isDuplicatePhone = allMods.some(m => m.id !== id && m.phoneNumber === targetPhone);
      if (isDuplicatePhone) {
        setEditProfileError('This phone number is already registered to another user.');
        setIsSavingProfile(false);
        return;
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

  const handleRoleChange = async (action: 'promote' | 'demote') => {
    if (!id || !isAdmin) return;
    setRoleConfirmModal({ show: true, action });
  };

  const executeRoleChange = async () => {
    if (!id || !isAdmin || isRoleUpdating) return;
    const { action } = roleConfirmModal;

    setIsRoleUpdating(true);
    try {
      const newRole = action === 'promote' ? 'officer' : 'moderator';
      
      // If demoting from officer to moderator, optionally unassign managed mods?
      // Since a mod can have multiple officers, we just remove this officer's id from officerIds.
      if (action === 'demote') {
        const managedMods = allMods.filter(m => m.officerIds?.includes(id) || m.officerId === id);
        if (managedMods.length > 0) {
          const batch = writeBatch(db);
          managedMods.forEach(m => {
            const modRef = doc(db, 'mods', m.id);
            const currentOfficerIds = Array.from(new Set([...(m.officerIds || []), m.officerId].filter(Boolean))) as string[];
            const newOfficerIds = currentOfficerIds.filter(oid => oid !== id);
            batch.update(modRef, { officerIds: newOfficerIds, officerId: null, updatedAt: Date.now() });
          });
          await batch.commit();
        }
      }

      await updateDoc(doc(db, 'mods', id), {
        role: newRole,
        updatedAt: Date.now(),
      });
      
      setRoleConfirmModal({ show: false, action: 'promote' });
    } catch (error) {
      console.error("Failed to update role:", error);
      alert("Failed to update role. Check your connection or permissions.");
      handleFirestoreError(error, OperationType.UPDATE, `mods/${id}`);
    } finally {
      setIsRoleUpdating(false);
    }
  };

  const handleAssignModerator = async (modIdToAssign: string) => {
    setIsAssigning(true);
    try {
      const modRef = doc(db, 'mods', modIdToAssign);
      const modToAssign = allMods.find(m => m.id === modIdToAssign);
      const currentOfficerIds = Array.from(new Set([...(modToAssign?.officerIds || []), modToAssign?.officerId].filter(Boolean)));
      if (id && !currentOfficerIds.includes(id)) {
        currentOfficerIds.push(id);
      }
      await updateDoc(modRef, {
        officerIds: currentOfficerIds,
        officerId: null, // Clear legacy
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Failed to assign moderator', error);
      alert('Failed to assign moderator.');
    } finally {
      setIsAssigning(false);
      setShowAssignModal(false);
    }
  };

  const handleUnassignModerator = async (modIdToUnassign: string) => {
    try {
      const modRef = doc(db, 'mods', modIdToUnassign);
      const modToUnassign = allMods.find(m => m.id === modIdToUnassign);
      const currentOfficerIds = Array.from(new Set([...(modToUnassign?.officerIds || []), modToUnassign?.officerId].filter(Boolean)));
      const newOfficerIds = currentOfficerIds.filter(oid => oid !== id);
      await updateDoc(modRef, {
        officerIds: newOfficerIds,
        officerId: null, // Clear legacy
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Failed to unassign moderator', error);
      alert('Failed to unassign moderator.');
    }
  };

  if ((loading || authLoading) && !mod) {
    return <div className="flex-1 min-h-screen bg-black flex items-center justify-center p-8"><div className="w-full max-w-5xl h-64 bg-zinc-800/50 rounded-xl animate-pulse"></div></div>;
  }

  if (!mod || (mod.status === 'blacklisted' && !isAdmin)) {
    return (
      <div className="flex flex-col h-full bg-black">
        <header className="h-28 sm:h-32 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 sm:px-16 flex-shrink-0">
          <Link to="/" className="text-zinc-400 hover:text-white flex items-center gap-4 text-3xl sm:text-4xl font-semibold transition-colors">
             <ArrowLeft className="w-12 h-12" /> Back to Reports
          </Link>
        </header>
        <div className="flex-1 p-8">
          <div className="bg-zinc-900 p-8 rounded-xl shadow-sm border border-zinc-800 text-center">
              <h2 className="text-xl font-bold text-white">Member Not Found</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden select-none">
      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl transition-opacity backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${confirmModal.action === 'blacklisted' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {confirmModal.action === 'blacklisted' ? <AlertTriangle className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                    {confirmModal.action === 'blacklisted' ? `Blacklist ${mod.role === 'officer' ? 'Officer' : 'Moderator'}?` : `Re-Hire ${mod.role === 'officer' ? 'Officer' : 'Moderator'}?`}
                  </h3>
                  <p className="text-zinc-400 text-sm mb-6">
                    {confirmModal.action === 'blacklisted' 
                      ? `Are you sure you want to blacklist this ${mod.role === 'officer' ? 'officer' : 'moderator'}? They will no longer be visible to regular users.`
                      : `This will restore the ${mod.role === 'officer' ? 'officer' : 'moderator'} and reset their activity timer to 7 days starting from now.`}
                  </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmModal({ show: false, action: 'active' })}
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

        {roleConfirmModal.show && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl transition-opacity backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${roleConfirmModal.action === 'demote' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                  {roleConfirmModal.action === 'demote' ? <AlertTriangle className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                    {roleConfirmModal.action === 'promote' ? 'Promote to Officer?' : 'Demote to Moderator?'}
                  </h3>
                  <p className="text-zinc-400 text-sm mb-6">
                    {roleConfirmModal.action === 'promote' 
                      ? `Are you sure you want to promote ${mod.name} to an Officer? They will be able to manage moderators.`
                      : `Are you sure you want to demote ${mod.name} to a Moderator? Any assigned moderators will be unassigned.`}
                  </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setRoleConfirmModal({ show: false, action: 'promote' })}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={executeRoleChange}
                    disabled={isRoleUpdating}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-white font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center ${roleConfirmModal.action === 'demote' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'} disabled:opacity-50`}
                  >
                    {isRoleUpdating ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="h-28 sm:h-32 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6 sm:px-16 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-400 hover:text-blue-400 flex items-center gap-4 text-3xl sm:text-4xl font-semibold transition-colors">
            <ArrowLeft className="w-12 h-12" /> <span className="hidden sm:inline">Back to Reports</span><span className="inline sm:hidden">Back</span>
          </Link>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="p-4 sm:p-5 rounded-2xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all border border-zinc-700"
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
                  className="absolute right-0 top-full mt-6 w-96 sm:w-[450px] bg-zinc-900 border border-zinc-800 rounded-[2.5rem] shadow-2xl z-[30] p-6 flex flex-col gap-6"
                >
                  {isAdmin && (
                    <button 
                      onClick={() => { setShowEntryModal(true); setShowHeaderMenu(false); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-5 sm:px-8 sm:py-6 rounded-3xl text-2xl sm:text-3xl font-bold flex items-center gap-5 transition-colors shadow-sm w-full"
                    >
                      <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      <span>Create New Entry</span>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Content Area */}
      <div className="p-4 sm:p-8 flex-1 max-w-5xl mx-auto w-full overflow-y-auto pb-10 space-y-4 sm:space-y-6">
        {/* Profile Card */}
        <div className="bg-zinc-900 rounded-xl shadow-sm border border-zinc-800 overflow-hidden flex flex-col md:flex-row shrink-0">
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-zinc-800">
            <div className="flex flex-col mb-4 gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                 <div className="flex items-center gap-3">
                    <h3 className="text-4xl sm:text-5xl font-bold text-white flex-shrink-0">{mod.name}</h3>
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
                          Re-Hire
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange('blacklisted')}
                          className="px-3 py-2 bg-red-600 text-white hover:bg-red-500 rounded-lg transition-colors border border-red-500/50 flex items-center gap-2 text-xs sm:text-sm font-bold shadow-lg shadow-red-900/20"
                        >
                          Add to Blacklist
                        </button>
                      )}
                      
                      {mod.role === 'officer' ? (
                        <button 
                          onClick={() => handleRoleChange('demote')}
                          className="px-3 py-2 bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 rounded-lg transition-colors border border-amber-600/30 flex items-center gap-2 text-xs sm:text-sm font-bold"
                        >
                          Demote to Mod
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleRoleChange('promote')}
                          className="px-3 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-lg transition-colors border border-blue-600/30 flex items-center gap-2 text-xs sm:text-sm font-bold"
                        >
                          Promote to Officer
                        </button>
                      )}

                      <button 
                        onClick={() => { 
                          setShowEditProfileModal(true); 
                          setEditProfileName(mod.name); 
                          setEditProfilePhone(mod.phoneNumber || ''); 
                          setEditProfileError(''); 
                        }} 
                        className="p-1.5 sm:px-3 sm:py-2 bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700 flex items-center gap-2 text-xs sm:text-sm font-semibold"
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
                    <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-500 font-mono text-sm border border-zinc-700 shadow-inner flex items-center gap-2 max-w-fit">
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

            <p className="text-sm text-zinc-400 mb-4 font-medium uppercase tracking-wider">{mod.role === 'officer' ? 'Officer Profile' : 'Moderator Profile'}</p>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className={`w-2 h-2 rounded-full ${mod.status === 'blacklisted' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
              Last Entry: <span className="font-semibold text-white">{new Date(mod.lastEntryAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Total Entries: <span className="font-semibold text-white">{entries.length}</span>
            </div>
          </div>
          <div className={`p-6 md:p-8 flex flex-col items-center justify-center border-t md:border-t-0 border-zinc-800 ${(mod.status === 'blacklisted' || mod.role === 'officer') ? 'bg-zinc-900/50' : 'bg-black/50'}`}>
            <p className="text-xs uppercase tracking-widest font-bold mb-3 text-zinc-500">
              {mod.status === 'blacklisted' ? 'Account Status' : mod.role === 'officer' ? 'Role' : 'Time Remaining'}
            </p>
            {mod.status === 'blacklisted' ? (
              <div className="text-red-500 font-bold text-center px-6 py-4 border border-red-500/20 rounded-xl bg-red-500/5">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                <span className="text-xl uppercase tracking-tighter">Blacklisted</span>
              </div>
            ) : mod.role === 'officer' ? (
               <div className="text-zinc-400 font-bold text-center px-6 py-4 border border-zinc-700/50 rounded-xl bg-zinc-800/30">
                 <ShieldCheck className="w-8 h-8 mx-auto mb-2" />
                 <span className="text-xl uppercase tracking-tighter">Officer</span>
               </div>
            ) : (
              <CountdownTimer deadlineAt={mod.deadlineAt} />
            )}
          </div>
        </div>
        
        {/* Dependent Content Area */}
        {mod.role === 'officer' && (
          <div className="bg-zinc-900 rounded-xl shadow-sm border border-zinc-800 overflow-hidden shrink-0 flex flex-col">
            <div className="px-6 py-5 border-b border-zinc-800 bg-zinc-800/50 flex justify-between items-center">
               <h4 className="text-lg font-bold text-white">Managed Moderators</h4>
               {isAdmin && (
                 <button
                   onClick={() => setShowAssignModal(true)}
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold"
                 >
                   <Plus className="w-4 h-4" />
                   Add Moderator
                 </button>
               )}
            </div>
            
            <div className="p-6">
              {allMods.filter(m => (m.officerIds?.includes(mod.id) || m.officerId === mod.id) && m.role !== 'officer' && m.status !== 'blacklisted').length === 0 ? (
                <div className="text-center py-12 bg-zinc-800/50 rounded-lg border border-dashed border-zinc-700">
                   <p className="text-sm text-zinc-400 font-medium">No moderators assigned to this officer.</p>
                   {isAdmin && <p className="text-xs text-zinc-500 mt-1">Click "Add Moderator" to assign one.</p>}
                </div>
              ) : (
                <ol className="list-decimal list-inside space-y-4 sm:space-y-5">
                  {allMods.filter(m => (m.officerIds?.includes(mod.id) || m.officerId === mod.id) && m.role !== 'officer' && m.status !== 'blacklisted').map((assignedMod, idx) => {
                    const now = Date.now();
                    const timeLeftMs = assignedMod.deadlineAt - now;
                    const isCritical = assignedMod.role === 'officer' ? false : timeLeftMs < 24 * 60 * 60 * 1000;
                    const isWarning = assignedMod.role === 'officer' ? false : timeLeftMs < 3 * 24 * 60 * 60 * 1000;
                    const totalMs = 7 * 24 * 60 * 60 * 1000;
                    const progress = assignedMod.role === 'officer' ? 100 : Math.max(0, Math.min(100, (timeLeftMs / totalMs) * 100));
                    
                    return (
                    <li key={assignedMod.id} className="p-4 bg-black border border-zinc-800 rounded-xl text-zinc-300 font-bold marker:text-zinc-500 overflow-hidden relative">
                      <div className="absolute top-0 left-0 h-1 bg-zinc-800 w-full">
                        <div 
                          className={`h-full transition-all duration-1000 ease-in-out ${isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full inline-flex align-top -ml-1 mt-1 sm:mt-0 pt-2">
                        <div className="mb-3 sm:mb-0 ml-2">
                          <Link to={`/mod/${assignedMod.id}`} className="font-bold text-white hover:text-blue-400 transition-colors text-xl sm:text-2xl block">
                             {assignedMod.name}
                          </Link>
                          {assignedMod.phoneNumber && (
                            <div className="text-xs text-zinc-500 font-mono mt-1 font-normal">{assignedMod.phoneNumber}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto font-normal ml-2 sm:ml-0">
                          <div className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm shadow-inner relative z-10">
                            <CountdownTimer deadlineAt={assignedMod.deadlineAt} compact />
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleUnassignModerator(assignedMod.id)}
                              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20 relative z-10"
                              title="Unassign Moderator"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )})}
                </ol>
              )}
            </div>
          </div>
        )}
        
        <div className="bg-zinc-900 rounded-xl shadow-sm border border-zinc-800 overflow-hidden shrink-0 flex flex-col">
          <div className="px-6 py-5 border-b border-zinc-800 bg-zinc-800/50 flex justify-between items-center">
             <h4 className="text-lg font-bold text-white">Entries Log</h4>
          </div>
          
          <div className="p-6">
            {entries.length === 0 ? (
              <div className="text-center py-12 bg-zinc-800/50 rounded-lg border border-dashed border-zinc-700">
                 <p className="text-sm text-zinc-400 font-medium">No entries recorded for this {mod.role || 'moderator'}.</p>
                 <p className="text-xs text-zinc-500 mt-1">When entries are added, they will appear here.</p>
              </div>
            ) : (
              <div className="pl-8 pr-2 py-2">
                <ol reversed className="list-decimal list-outside space-y-6 text-zinc-300 marker:text-zinc-500 marker:font-bold">
                  {entries.map((entry) => (
                    <li key={entry.id} className="pl-2 border-b border-zinc-800/50 pb-6 last:border-0 last:pb-0 relative group">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-zinc-200 font-medium whitespace-pre-wrap">{entry.text}</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-zinc-400 font-mono text-xs bg-black inline-block px-2 py-1 rounded border border-zinc-800">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => setEntryToDelete(entry.id)}
                              className="text-zinc-500 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 p-1"
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
        <div className="text-[5px] text-zinc-400 flex justify-between uppercase tracking-tighter mt-2">
          <span>Profile View Active</span>
          <span>Log Count: {entries.length}</span>
        </div>
      </div>

      {showEntryModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xl transition-opacity" onClick={() => setShowEntryModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-xl border border-zinc-800 z-10 mx-auto">
              <form onSubmit={handleAddEntry}>
                <div className="bg-zinc-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-white mb-2">New Entry for {mod.name}</h3>
                  <p className="text-sm text-emerald-400 mb-6 bg-emerald-500/10 px-3 py-2 rounded-md border border-emerald-500/20 inline-block font-medium">Adding this will reset the demotion timer to 7 days.</p>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Entry Details</label>
                    <textarea
                      rows={4}
                      className="block w-full rounded-lg border-zinc-700 bg-black text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border resize-none"
                      placeholder="e.g. Activity recorded at link..."
                      value={entryText}
                      onChange={(e) => setEntryText(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-zinc-800">
                  <button
                    type="submit"
                    disabled={isSubmitting || !entryText.trim()}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save & Reset Timer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEntryModal(false)}
                    className="inline-flex w-full justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-sm hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xl transition-opacity" onClick={() => setEntryToDelete(null)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-sm border border-zinc-800 z-10 mx-auto">
                <div className="bg-zinc-900 px-6 pb-6 pt-6 flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 sm:mx-0 sm:h-10 sm:w-10 mb-4 border border-red-500/20">
                    <Trash2 className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold leading-6 text-white mb-2">Delete Entry?</h3>
                  <p className="text-sm text-zinc-400">Are you sure you want to delete this entry? This will revert the timer back to the previous entry state. This action cannot be undone.</p>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-zinc-800">
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
                    className="inline-flex w-full justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-sm hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xl transition-opacity" onClick={() => setShowEditProfileModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-lg border border-zinc-800 z-10 mx-auto">
              <form onSubmit={handleEditProfile}>
                <div className="bg-zinc-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-white mb-6">Edit Profile</h3>
                  
                  {editProfileError && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm font-medium">
                      {editProfileError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">{mod.role === 'officer' ? 'Officer Name' : 'Moderator Name'}</label>
                      <input
                        type="text"
                        className="block w-full rounded-lg border-zinc-700 bg-black text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                        value={editProfileName}
                        onChange={(e) => { setEditProfileName(e.target.value); setEditProfileError(''); }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">WhatsApp Number (with country code)</label>
                      <input
                        type="tel"
                        className="block w-full rounded-lg border-zinc-700 bg-black text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                        placeholder="e.g. +91 9876543210"
                        value={editProfilePhone}
                        onChange={(e) => { setEditProfilePhone(e.target.value); setEditProfileError(''); }}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-zinc-800">
                  <button
                    type="submit"
                    disabled={isSavingProfile || !editProfileName.trim() || !editProfilePhone.trim()}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditProfileModal(false)}
                    className="inline-flex w-full justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-sm hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Assign Moderator Modal */}
      {showAssignModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xl transition-opacity" onClick={() => setShowAssignModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-lg border border-zinc-800 z-10 mx-auto flex flex-col max-h-[80vh]">
              <div className="bg-zinc-900 px-6 py-5 border-b border-zinc-800">
                <h3 className="text-xl font-bold leading-6 text-white">Assign Moderator</h3>
                <p className="text-sm text-zinc-400 mt-1">Select an active moderator to assign to this officer.</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-black">
                {allMods.filter(m => m.role !== 'officer' && m.status !== 'blacklisted' && !m.officerIds?.includes(mod.id) && m.officerId !== mod.id).length === 0 ? (
                  <div className="text-center py-8">
                     <p className="text-sm text-zinc-400 font-medium">No available moderators found.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {allMods.filter(m => m.role !== 'officer' && m.status !== 'blacklisted' && !m.officerIds?.includes(mod.id) && m.officerId !== mod.id).map(unassignedMod => (
                      <div key={unassignedMod.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                        <div>
                          <p className="font-bold text-white text-xl sm:text-2xl">{unassignedMod.name}</p>
                        </div>
                        <button
                          onClick={() => handleAssignModerator(unassignedMod.id)}
                          disabled={isAssigning}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse border-t border-zinc-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="inline-flex w-full justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-sm hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
