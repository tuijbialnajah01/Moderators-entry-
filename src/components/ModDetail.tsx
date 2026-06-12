import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, onSnapshot, query, orderBy, setDoc, writeBatch, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, Entry, HonorLog, handleFirestoreError, OperationType } from '../types';
import { ModDetailSkeleton } from './Skeletons';
import { CountdownTimer } from './CountdownTimer';
import { ArrowLeft, Plus, Trash2, Pencil, AlertTriangle, ShieldCheck, Menu, Trophy, Download, RotateCcw, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';

// No extra declarations needed for functional autoTable

export function ModDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mod, setMod] = useState<Mod | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin, loading: authLoading } = useAuth();
  
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  // Edit Entry state
  const [entryToEdit, setEntryToEdit] = useState<Entry | null>(null);
  const [editEntryText, setEditEntryText] = useState('');
  const [editEntryPoints, setEditEntryPoints] = useState<number>(1);
  const [isEditingEntry, setIsEditingEntry] = useState(false);

  // Deletion state
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Profile state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean, action: 'active' | 'blacklisted' }>({ show: false, action: 'active' });
  const [roleConfirmModal, setRoleConfirmModal] = useState<{ show: boolean, action: 'promote' | 'demote' }>({ show: false, action: 'promote' });
  const [isRoleUpdating, setIsRoleUpdating] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfilePhone, setEditProfilePhone] = useState('');
  const [editProfileGroup, setEditProfileGroup] = useState('');
  const [editProfileError, setEditProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [allMods, setAllMods] = useState<Mod[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const [drafts, setDrafts] = useState<Entry[]>([]);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftPoints, setDraftPoints] = useState<number>(1);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [draftToEdit, setDraftToEdit] = useState<Entry | null>(null);
  const [editDraftText, setEditDraftText] = useState('');
  const [editDraftPoints, setEditDraftPoints] = useState<number>(1);
  const [isEditingDraft, setIsEditingDraft] = useState(false);

  // Honor state
  const [honorLogs, setHonorLogs] = useState<HonorLog[]>([]);
  const [showHonorModal, setShowHonorModal] = useState(false);
  const [honorChangeReason, setHonorChangeReason] = useState('');
  const [honorChangeAmount, setHonorChangeAmount] = useState<number>(1);
  const [honorChangeEvidenceUrl, setHonorChangeEvidenceUrl] = useState('');
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(null);
  const [isSubmittingHonor, setIsSubmittingHonor] = useState(false);
  const [logToDelete, setLogToDelete] = useState<HonorLog | null>(null);
  const [logToEdit, setLogToEdit] = useState<HonorLog | null>(null);
  const [editLogAmount, setEditLogAmount] = useState<number>(0);
  const [editLogReason, setEditLogReason] = useState('');
  const [isProcessingLog, setIsProcessingLog] = useState(false);

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

    const draftsRef = collection(db, 'mods', id, 'drafts');
    const qDrafts = query(draftsRef, orderBy('createdAt', 'desc'));
    const unsubscribeDrafts = onSnapshot(qDrafts, (snapshot) => {
      const fetchedDrafts: Entry[] = [];
      snapshot.forEach((doc) => {
        fetchedDrafts.push({ id: doc.id, ...doc.data() } as Entry);
      });
      setDrafts(fetchedDrafts);
    }, (error) => {
      console.error('Failed to subscribe to drafts', error);
    });

    const allModsRef = collection(db, 'mods');
    const unsubscribeAllMods = onSnapshot(allModsRef, (snapshot) => {
      const fetchedMods: Mod[] = [];
      snapshot.forEach((doc) => {
        fetchedMods.push({ id: doc.id, ...doc.data() } as Mod);
      });
      setAllMods(fetchedMods);
    });

    const honorLogsRef = collection(db, 'mods', id, 'honor_logs');
    const qHonor = query(honorLogsRef, orderBy('createdAt', 'desc'));
    const unsubscribeHonorLogs = onSnapshot(qHonor, (snapshot) => {
      const fetchedLogs: HonorLog[] = [];
      snapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as HonorLog);
      });
      setHonorLogs(fetchedLogs);
    }, (error) => {
      console.error('Failed to subscribe to honor logs', error);
    });

    return () => {
      unsubscribeMod();
      unsubscribeEntries();
      unsubscribeDrafts();
      unsubscribeAllMods();
      unsubscribeHonorLogs();
    };
  }, [id, user, isAdmin]);

  const handleAddDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !isAdmin || !draftText.trim() || !mod) return;

    setIsSubmittingDraft(true);
    try {
      const draftId = crypto.randomUUID();
      const draftRef = doc(db, `mods/${id}/drafts/${draftId}`);
      
      const newDraftData = {
        text: draftText.trim(),
        createdAt: Date.now(),
        createdBy: user?.uid || 'admin',
        points: draftPoints
      };

      if (mod.role === 'officer' && drafts.length >= 5) {
        // Auto process the existing max drafts before adding the new 6th one as the 1st
        await handleProcessDrafts(drafts);
        await setDoc(draftRef, newDraftData);
      } else {
        await setDoc(draftRef, newDraftData);
      }

      setDraftText('');
      setDraftPoints(1);
      setShowDraftModal(false);
    } catch (error) {
      console.error('Failed to add draft', error);
      alert('Failed to add draft. Access Denied.');
    } finally {
      setIsSubmittingDraft(false);
    }
  };

  const handleProcessDrafts = async (draftsToProcess: Entry[] = drafts) => {
    if (!id || !user || draftsToProcess.length === 0 || !mod || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const batch = writeBatch(db);
      
      const combinedText = draftsToProcess.map(d => `- ${d.text}`).join('\n');
      const totalDraftPoints = draftsToProcess.reduce((sum, d) => sum + (d.points || 0), 0);
      const draftCount = draftsToProcess.length;
      
      const now = Date.now();
      const entryId = crypto.randomUUID();
      const newEntryRef = doc(db, `mods/${id}/entries/${entryId}`);
      
      batch.set(newEntryRef, {
        text: combinedText,
        createdAt: now,
        createdBy: user.uid,
        points: totalDraftPoints
      });
      
      const modRef = doc(db, 'mods', id);
      const currentHonor = mod.honorScore ?? 100;
      batch.update(modRef, {
        lastEntryAt: now,
        deadlineAt: now + 7 * 24 * 60 * 60 * 1000,
        updatedAt: now,
        totalPoints: (mod.totalPoints || 0) + totalDraftPoints,
        honorScore: currentHonor + draftCount
      });

      const honorLogId = crypto.randomUUID();
      batch.set(doc(db, `mods/${id}/honor_logs/${honorLogId}`), {
        amount: draftCount,
        reason: mod.role === 'officer' ? `Auto-increment for ${draftCount} combined submissions` : `Auto-increment for ${draftCount} submissions over 7 days`,
        createdAt: now,
        createdBy: user.uid,
        type: 'entry_auto'
      });

      draftsToProcess.forEach(d => {
        batch.delete(doc(db, `mods/${id}/drafts/${d.id}`));
      });

      await batch.commit();
    } catch (error) {
      console.error('Failed to process drafts to entry', error);
      // alert('Failed to process drafts.'); // Silent fail for auto-processing
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (user && mod && drafts.length > 0) {
      if (mod.role !== 'officer' && Date.now() >= mod.deadlineAt) {
        handleProcessDrafts();
      }
    }
  }, [mod, drafts, user]);

  const handleExportPDF = async () => {
    if (!mod) return;

    try {
      const peRatio = entries.length > 0 ? ((mod.totalPoints || 0) / entries.length).toFixed(1) : '0.0';
      const status = (mod.status || 'ACTIVE').toUpperCase();
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: mod.name.toUpperCase(),
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({ text: mod.role?.toUpperCase() === 'OFFICER' ? 'COMMANDING OFFICER' : 'SYSTEM MODERATOR', color: "71717A" })
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: `ID: ${mod.id?.slice(-10).toUpperCase()}`, bold: true }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `GENERATED: ${new Date().toLocaleString().toUpperCase()}` }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `STATUS: ${status}`, bold: true, color: status === 'BLACKLISTED' ? "DC2626" : "059669" }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: "100%", type: WidthType.PERCENTAGE },
              columnWidths: [4000, 6000],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "METRIC", bold: true, color: "52525B" })] })] }),
                    new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "VALUE", bold: true, color: "52525B" })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: "Accumulated Merit" })] }),
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: `${mod.totalPoints || 0}`, style: "Strong" })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: "Data Logs Submitted" })] }),
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: `${entries.length}`, style: "Strong" })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: "Performance/Entry Ratio" })] }),
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: `${peRatio}`, style: "Strong" })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: "Honor Standing" })] }),
                    new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: `${mod.honorScore ?? 100} / 100`, style: "Strong" })] }),
                  ],
                }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "" }),
            new Paragraph({
              text: "ACTIVITY LEDGER",
              heading: HeadingLevel.HEADING_3,
            }),
            new Table({
              width: { size: "100%", type: WidthType.PERCENTAGE },
              columnWidths: [3000, 2000, 5000],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "DATE", bold: true, color: "52525B" })] })] }),
                    new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "PTS", bold: true, color: "52525B" })] })] }),
                    new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "LOG DETAILS", bold: true, color: "52525B" })] })] }),
                  ],
                }),
                ...entries.map(e => 
                  new TableRow({
                    children: [
                      new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: new Date(e.createdAt).toLocaleDateString() })] }),
                      new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: `+${e.points || 0}`, color: "059669", bold: true })] })] }),
                      new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ text: e.text || "Detail" })] }),
                    ],
                  })
                )
              ]
            })
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${mod.name.replace(/\s+/g, '_')}_Analytics.docx`);
    } catch (error) {
      console.error('DOCX Generation Error:', error);
      alert('Error generating DOCX.');
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!id || !user) return;
    try {
      const draftRef = doc(db, `mods/${id}/drafts/${draftId}`);
      await updateDoc(doc(db, 'mods', id), { updatedAt: Date.now() });
      const batch = writeBatch(db);
      batch.delete(draftRef);
      await batch.commit();
    } catch (error) {
      console.error('Failed to delete draft', error);
    }
  };

  const handleUpdateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !draftToEdit || !editDraftText.trim()) return;
    setIsEditingDraft(true);
    try {
      const draftRef = doc(db, `mods/${id}/drafts/${draftToEdit.id}`);
      await updateDoc(draftRef, {
        text: editDraftText.trim(),
        points: editDraftPoints,
        updatedAt: Date.now()
      });
      setDraftToEdit(null);
    } catch (error) {
      console.error('Failed to update draft', error);
      alert('Failed to update draft.');
    } finally {
      setIsEditingDraft(false);
    }
  };

  const handleSaveHonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !mod || !honorChangeReason.trim() || isSubmittingHonor) return;

    setIsSubmittingHonor(true);
    try {
      const batch = writeBatch(db);
      const now = Date.now();
      
      if (logToEdit) {
        // Update existing log
        const honorLogRef = doc(db, `mods/${id}/honor_logs/${logToEdit.id}`);
        const amountDifference = honorChangeAmount - logToEdit.amount;
        
        batch.update(honorLogRef, {
          amount: honorChangeAmount,
          reason: honorChangeReason.trim(),
          evidenceUrl: honorChangeEvidenceUrl.trim() || null,
          updatedAt: now,
          updatedBy: user.uid
        });
        
        if (amountDifference !== 0) {
          const modRef = doc(db, 'mods', id);
          batch.update(modRef, {
            honorScore: (mod.honorScore ?? 100) + amountDifference,
            updatedAt: now
          });
        }
      } else {
        // Add new log
        const honorLogId = crypto.randomUUID();
        const honorLogRef = doc(db, `mods/${id}/honor_logs/${honorLogId}`);
        
        batch.set(honorLogRef, {
          amount: honorChangeAmount,
          reason: honorChangeReason.trim(),
          evidenceUrl: honorChangeEvidenceUrl.trim() || null,
          createdAt: now,
          createdBy: user.uid,
          type: 'manual'
        });

        const modRef = doc(db, 'mods', id);
        batch.update(modRef, {
          honorScore: (mod.honorScore ?? 100) + honorChangeAmount,
          updatedAt: now
        });
      }

      await batch.commit();
      setShowHonorModal(false);
      setLogToEdit(null);
      setHonorChangeReason('');
      setHonorChangeAmount(1);
      setHonorChangeEvidenceUrl('');
    } catch (error) {
      console.error('Failed to save honor log', error);
      alert('Failed to save adjustment.');
    } finally {
      setIsSubmittingHonor(false);
    }
  };

  const handleDeleteHonorLog = async (logId: string, amount: number) => {
    if (!id || !isAdmin || !mod) return;
    if (!window.confirm('Delete this log and revert the honor points?')) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, `mods/${id}/honor_logs/${logId}`));
      batch.update(doc(db, 'mods', id), {
        honorScore: (mod.honorScore ?? 100) - amount,
        updatedAt: Date.now()
      });
      await batch.commit();
    } catch (error) {
      console.error('Failed to delete honor log', error);
      alert('Failed to delete log.');
    }
  };

  const handleDeleteEntry = async () => {
    if (!id || !user || !mod || !entryToDelete) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      const entryToDeleteData = entries.find(e => e.id === entryToDelete);
      const pointsToDeduct = entryToDeleteData?.points || 0;

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
        updatedAt: Date.now(),
        totalPoints: Math.max(0, (mod.totalPoints || 0) - pointsToDeduct)
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

  const handleEditEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !mod || !entryToEdit) return;

    setIsEditingEntry(true);
    try {
      const batch = writeBatch(db);
      const entryRef = doc(db, `mods/${id}/entries/${entryToEdit.id}`);
      
      const oldPoints = entryToEdit.points || 0;
      const pointDifference = editEntryPoints - oldPoints;

      batch.update(entryRef, {
        text: editEntryText.trim(),
        points: editEntryPoints,
        updatedAt: Date.now()
      });

      if (pointDifference !== 0) {
        const modRef = doc(db, 'mods', id);
        batch.update(modRef, {
          totalPoints: (mod.totalPoints || 0) + pointDifference,
          updatedAt: Date.now()
        });
      }

      await batch.commit();
      setEntryToEdit(null);
    } catch (error) {
      console.error('Failed to edit entry', error);
      alert('Failed to edit entry.');
    } finally {
      setIsEditingEntry(false);
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

      const duplicatePhoneMember = allMods.find(m => m.id !== id && m.phoneNumber === targetPhone);
      if (duplicatePhoneMember) {
        setEditProfileError(`This phone number is already registered to ${duplicatePhoneMember.name} (${(duplicatePhoneMember.role || 'moderator').toUpperCase()}).`);
        setIsSavingProfile(false);
        return;
      }

      await updateDoc(doc(db, 'mods', id), { 
        name: editProfileName.trim(), 
        phoneNumber: editProfilePhone.trim(), 
        ...(mod.role === 'officer' && { group: editProfileGroup }),
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
    return <ModDetailSkeleton />;
  }

  if (!mod || (mod.status === 'blacklisted' && !isAdmin)) {
    return (
      <div className="flex flex-col h-full bg-black">
        <header className="h-28 sm:h-32 bg-zinc-900 border-b border-white/5 flex items-center px-6 sm:px-16 flex-shrink-0">
          <Link to="/" className="text-zinc-400 hover:text-white flex items-center gap-4 text-3xl sm:text-4xl font-semibold transition-colors">
             <ArrowLeft className="w-12 h-12" /> Back to Reports
          </Link>
        </header>
        <div className="flex-1 p-8">
          <div className="bg-zinc-900 p-8 rounded-xl shadow-lg shadow-black/20 border border-white/5 text-center">
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/5 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform-gpu"
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
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/5 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform-gpu"
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
      <header className="h-28 sm:h-32 bg-zinc-900 border-b border-white/5 flex items-center justify-between px-6 sm:px-16 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-400 hover:text-blue-400 flex items-center gap-4 text-3xl sm:text-4xl font-semibold transition-colors">
            <ArrowLeft className="w-12 h-12" /> <span className="hidden sm:inline">Back to Reports</span><span className="inline sm:hidden">Back</span>
          </Link>
        </div>
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
                  transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                  style={{ willChange: "transform, opacity", transformOrigin: "top right" }}
                  className="absolute right-0 top-full mt-6 w-96 sm:w-[450px] bg-zinc-900 border border-white/5 rounded-[2.5rem] shadow-2xl z-[30] p-6 flex flex-col gap-6 transform-gpu"
                >
                  <div className="flex flex-col gap-3">
                    {isAdmin && (
                      <button 
                        onClick={() => { setShowDraftModal(true); setShowHeaderMenu(false); }}
                        className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 px-6 py-4 sm:px-8 sm:py-5 rounded-3xl text-xl sm:text-2xl font-black tracking-wider uppercase flex items-center gap-4 transition-colors w-full"
                      >
                        <Plus className="w-8 h-8 sm:w-10 sm:h-10" />
                        <span>Add Performance Draft</span>
                      </button>
                    )}
                    <button 
                      onClick={() => { handleExportPDF(); setShowHeaderMenu(false); }}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10 px-6 py-4 sm:px-8 sm:py-5 rounded-3xl text-xl sm:text-2xl font-black tracking-wider uppercase flex items-center gap-4 transition-colors w-full"
                    >
                      <Download className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
                      <span>DOCX Report</span>
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => { setShowHonorModal(true); setShowHeaderMenu(false); }}
                        className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 px-6 py-4 sm:px-8 sm:py-5 rounded-3xl text-xl sm:text-2xl font-black tracking-wider uppercase flex items-center gap-4 transition-colors w-full"
                      >
                        <Trophy className="w-8 h-8 sm:w-10 sm:h-10" />
                        <span>Adjust Honor Score</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Content Area */}
      <div className="p-4 sm:p-12 flex-1 max-w-6xl mx-auto w-full overflow-y-auto pb-20 space-y-8">
        {/* Profile Card */}
        <div className="bg-zinc-900 rounded-[2.5rem] shadow-2xl shadow-black/40 border border-white/5 overflow-hidden flex flex-col md:flex-row shrink-0 transition-all duration-500">
          <div className="p-8 sm:p-12 flex-1 border-b md:border-b-0 md:border-r border-white/5 bg-gradient-to-br from-zinc-900 to-black">
            <div className="flex flex-col mb-8 gap-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                 <div className="flex items-center gap-4">
                    <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none">{mod.name}</h2>
                    {mod.status === 'blacklisted' && (
                      <span className="bg-red-600/20 text-red-500 text-xs font-black uppercase px-4 py-1.5 rounded-xl border border-red-600/30 tracking-widest shadow-lg">Blacklisted</span>
                    )}
                 </div>
                 {isAdmin && (
                     <div className="flex flex-wrap gap-3">
                      {mod.status === 'blacklisted' ? (
                        <button 
                          onClick={() => handleStatusChange('active')}
                          className="px-6 py-4 bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl transition-all border border-emerald-500/50 flex items-center gap-2 text-sm font-black shadow-xl shadow-emerald-900/40 active:scale-95"
                        >
                          Re-Hire Member
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange('blacklisted')}
                          className="px-6 py-4 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-2xl transition-all border border-red-600/20 flex items-center gap-2 text-sm font-black active:scale-95"
                        >
                          Blacklist
                        </button>
                      )}
                      
                      {mod.role === 'officer' ? (
                        <button 
                          onClick={() => handleRoleChange('demote')}
                          className="px-6 py-4 bg-amber-600/10 text-amber-500 hover:bg-amber-600 hover:text-white rounded-2xl transition-all border border-amber-600/20 flex items-center gap-2 text-sm font-black"
                        >
                          Demote to Mod
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleRoleChange('promote')}
                          className="px-6 py-4 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-2xl transition-all border border-blue-600/20 flex items-center gap-2 text-sm font-black"
                        >
                          Promote to Officer
                        </button>
                      )}

                      <button 
                        onClick={() => { 
                          setShowEditProfileModal(true); 
                          setEditProfileName(mod.name); 
                          setEditProfilePhone(mod.phoneNumber || ''); 
                          if (mod.role === 'officer') {
                            const groupSymbols = ['.', '-', ':', '#', '$', '+', '/', '?'];
                            const sym = groupSymbols.find(s => mod.name.includes(s));
                            setEditProfileGroup(mod.group || sym || 'Other');
                          }
                          setEditProfileError(''); 
                        }} 
                        className="p-4 bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-2xl transition-all border border-white/10 flex items-center gap-3 text-sm font-bold shadow-lg"
                        title="Edit Profile"
                      >
                        <Pencil className="w-6 h-6" />
                      </button>
                    </div>
                 )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                  {mod.phoneNumber ? (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <div className="px-6 py-4 rounded-2xl bg-zinc-800/50 text-zinc-400 font-mono text-lg border border-white/5 shadow-inner flex items-center gap-4 flex-1 sm:flex-none font-black tracking-widest uppercase">
                        <svg className="w-6 h-6 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        {mod.phoneNumber}
                      </div>
                      <a 
                        href={`https://wa.me/${mod.phoneNumber.replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-base px-8 py-4 rounded-2xl transition-all font-black border border-emerald-500/50 shadow-xl shadow-emerald-900/30 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap"
                      >
                        Message Now
                      </a>
                    </div>
                  ) : (
                    <span className="px-6 py-4 rounded-2xl bg-zinc-800 text-zinc-500 font-mono text-lg border border-white/10 shadow-inner flex items-center gap-4">
                      Contact Data Unavailable
                    </span>
                  )}
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.4em] flex items-center gap-4">
                 Intelligence Overview
                 <span className="flex-1 h-px bg-white/5"></span>
              </p>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-black/40 p-6 rounded-[2rem] border border-white/5 shadow-inner flex flex-col items-center justify-center aspect-square group hover:border-blue-500/30 transition-all text-center">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-50">Status</span>
                  <div className="flex flex-col items-center gap-2">
                    <span className={`w-3 h-3 rounded-full mb-1 ${mod.status === 'blacklisted' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]'}`}></span>
                    <span className="font-black text-white text-3xl sm:text-4xl tracking-tighter uppercase whitespace-nowrap">
                      {mod.status === 'blacklisted' ? 'Offline' : 'Online'}
                    </span>
                  </div>
                </div>

                <div className="bg-black/40 p-6 rounded-[2rem] border border-white/5 shadow-inner flex flex-col items-center justify-center aspect-square group hover:border-blue-500/30 transition-all text-center">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-50">Data Logs</span>
                  <span className="font-black text-white text-5xl sm:text-7xl group-hover:text-blue-400 transition-colors tracking-tighter">{entries.length}</span>
                </div>

                <div className="bg-black/40 p-6 rounded-[2rem] border border-white/5 shadow-inner flex flex-col items-center justify-center aspect-square group hover:border-blue-500/30 transition-all text-center">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-50">P/E Ratio</span>
                  <span className="font-black text-white text-5xl sm:text-7xl group-hover:text-purple-400 transition-colors tracking-tighter">
                    {entries.length > 0 ? ((mod.totalPoints || 0) / entries.length).toFixed(1) : '0.0'}
                  </span>
                </div>

                <div className="bg-black/40 p-6 rounded-[2rem] border border-white/5 shadow-inner flex flex-col items-center justify-center aspect-square group hover:border-blue-500/30 transition-all text-center">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-50">Honor Score</span>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="font-black text-emerald-400 text-5xl sm:text-7xl tracking-tighter">{mod.honorScore ?? 100}</span>
                    <span className="text-zinc-700 text-sm font-black opacity-40">/100</span>
                  </div>
                </div>

                <div className="bg-amber-500/5 p-8 rounded-[2.5rem] border border-amber-500/10 shadow-2xl col-span-full flex items-center justify-between group hover:bg-amber-500/10 transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-amber-500/70 text-[10px] font-black uppercase tracking-[0.3em]">Accumulated Merit</span>
                    <span className="text-zinc-500 text-xs font-medium">Total performance points earned across sessions</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <Trophy className="w-12 h-12 text-amber-500/20 group-hover:text-amber-500/40 transition-all" />
                    <span className="font-black text-amber-400 text-6xl sm:text-8xl tracking-tighter">{mod.totalPoints || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={`p-8 sm:p-12 md:w-[28rem] flex flex-col items-center justify-center border-t md:border-t-0 border-white/5 ${(mod.status === 'blacklisted' || mod.role === 'officer') ? 'bg-zinc-900/60' : 'bg-black/40'}`}>
            <p className="text-xs uppercase tracking-[0.3em] font-black mb-8 text-zinc-500 text-center">
              {mod.status === 'blacklisted' ? 'System Status' : mod.role === 'officer' ? 'Rank' : 'Time Remaining'}
            </p>
            {mod.status === 'blacklisted' ? (
              <div className="text-red-500 font-black text-center px-8 py-6 border border-red-500/20 rounded-3xl bg-red-500/5 shadow-2xl shadow-red-950/20 flex flex-col gap-4">
                <AlertTriangle className="w-12 h-12 mx-auto" />
                <span className="text-2xl uppercase tracking-[0.2em]">Blacklisted</span>
              </div>
            ) : mod.role === 'officer' ? (
               <div className="text-blue-400 font-black text-center px-8 py-6 border border-blue-500/20 rounded-3xl bg-blue-500/5 shadow-2xl shadow-blue-950/20 flex flex-col gap-4">
                 <ShieldCheck className="w-12 h-12 mx-auto" />
                 <span className="text-2xl uppercase tracking-[0.2em]">Officer Rank</span>
               </div>
            ) : (
              <div className="scale-110 sm:scale-125">
                <CountdownTimer deadlineAt={mod.deadlineAt} />
              </div>
            )}
          </div>
        </div>
        
        {/* Dependent Content Area */}
        {mod.role === 'officer' && (
          <div className="bg-zinc-900 rounded-xl shadow-lg shadow-black/20 border border-white/5 overflow-hidden shrink-0 flex flex-col">
            <div className="px-6 py-5 border-b border-white/5 bg-zinc-800/50 flex justify-between items-center">
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
                <div className="text-center py-12 bg-zinc-800/50 rounded-lg border border-dashed border-white/10">
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
                    <li key={assignedMod.id} className="p-4 bg-black border border-white/5 rounded-xl text-zinc-300 font-bold marker:text-zinc-500 overflow-hidden relative">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full inline-flex align-top -ml-1 mt-1 sm:mt-0 pt-2">
                        <div className="mb-3 sm:mb-0 ml-2">
                          <Link to={`/mod/${assignedMod.id}`} className="font-bold text-white hover:text-blue-400 transition-colors text-xl sm:text-2xl block">
                             {assignedMod.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-1">
                            {assignedMod.phoneNumber && (
                              <div className="text-xs text-zinc-500 font-mono font-normal">{assignedMod.phoneNumber}</div>
                            )}
                            <div className="flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/20" title="Points">
                              <Trophy className="w-2.5 h-2.5" />
                              {assignedMod.totalPoints || 0} pts
                            </div>
                            <div className="flex items-center gap-1 bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded text-[10px] font-bold border border-purple-500/20" title="P/E Ratio">
                              P/E {assignedMod.entryCount > 0 ? ((assignedMod.totalPoints || 0) / assignedMod.entryCount).toFixed(1) : '0.0'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto font-normal ml-2 sm:ml-0">
                          <div className="bg-zinc-900 border border-white/5 rounded px-2 py-1 text-sm shadow-inner relative z-10">
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
        
        <div className="bg-zinc-900 rounded-xl shadow-lg shadow-black/20 border border-white/5 overflow-hidden shrink-0 flex flex-col">
          <div className="px-6 py-5 border-b border-white/5 bg-zinc-800/50 flex justify-between items-center">
             <h4 className="text-lg font-bold text-white">Performance Logs</h4>
          </div>
          
          <div className="p-6">
            {entries.length === 0 ? (
              <div className="text-center py-12 bg-zinc-800/50 rounded-lg border border-dashed border-white/10">
                 <p className="text-sm text-zinc-400 font-medium">No performance records for this {mod.role || 'moderator'}.</p>
                 <p className="text-xs text-zinc-500 mt-1">When drafts are submitted, they will appear here as entries.</p>
              </div>
            ) : (
              <div className="pl-8 pr-2 py-2">
                <ol reversed className="list-decimal list-outside space-y-6 text-zinc-300 marker:text-zinc-500 marker:font-bold">
                  {entries.map((entry) => (
                    <li key={entry.id} className="pl-2 border-b border-white/5/50 pb-6 last:border-0 last:pb-0 relative group">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-200 font-medium whitespace-pre-wrap">{entry.text}</span>
                          {entry.points && (
                            <span className="bg-amber-500 text-amber-950 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm ml-2 shrink-0">
                              +{entry.points} pts
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-zinc-400 font-mono text-xs bg-black inline-block px-2 py-1 rounded border border-white/5">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                          {isAdmin && (
                            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEntryToEdit(entry);
                                  setEditEntryText(entry.text);
                                  setEditEntryPoints(entry.points || 1);
                                }}
                                className="text-zinc-500 hover:text-blue-500 transition-colors p-1"
                                title="Edit entry"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEntryToDelete(entry.id)}
                                className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                                title="Delete entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
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

        {drafts.length > 0 && (
          <div className="bg-[#1e1b4b] rounded-xl shadow-lg shadow-black/20 border border-indigo-500/20 overflow-hidden shrink-0 flex flex-col relative">
            <div className="px-6 py-5 border-b border-indigo-500/20 bg-indigo-900/30 flex justify-between items-center">
               <h4 className="text-lg font-bold text-indigo-300 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div> Local Draft Manager</h4>
               {isAdmin && (
                 <button 
                   onClick={() => handleProcessDrafts()} 
                   disabled={isSubmitting || (mod.role === 'officer' && drafts.length < 3)} 
                   className="text-xs bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-1.5 px-3 rounded-lg shadow-md transition-colors disabled:opacity-50 font-black"
                 >
                   {mod.role === 'officer' ? 'Submit Drafts (Min 3)' : 'Submit & Reset Timer Now'}
                 </button>
               )}
            </div>
            
            <div className="p-6">
              <div className="pl-8 pr-2 py-2">
                <ol className="list-decimal list-outside space-y-6 text-indigo-200 marker:text-indigo-500 marker:font-bold">
                  {drafts.map((draft) => (
                    <li key={draft.id} className="pl-2 border-b border-indigo-500/20 pb-6 last:border-0 last:pb-0 relative group">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-indigo-100 font-medium whitespace-pre-wrap">{draft.text}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {draft.points && (
                              <span className="bg-amber-500 text-amber-950 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm">
                                +{draft.points} pts
                              </span>
                            )}
                            {user && (
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    setDraftToEdit(draft);
                                    setEditDraftText(draft.text || '');
                                    setEditDraftPoints(draft.points || 1);
                                  }}
                                  className="bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white px-3 py-1 rounded-lg border border-blue-500/20 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95 flex items-center gap-1.5"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button 
                                  onClick={() => handleDeleteDraft(draft.id!)}
                                  className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1 rounded-lg border border-red-500/20 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95 flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-indigo-400 font-mono text-xs bg-indigo-950 inline-block px-2 py-1 rounded border border-indigo-500/20">
                            Drafted {new Date(draft.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
        
        {/* Honor Adjustment Logs */}
        <div className="shrink-0 space-y-6 pt-12 border-t border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-3xl font-black text-white uppercase tracking-[0.2em] flex items-center gap-4">
              <Trophy className="w-10 h-10 text-emerald-400" strokeWidth={3} />
              Honor Standing Ledger
            </h3>
            <span className="bg-zinc-800 text-zinc-500 text-xs font-black px-4 py-1.5 rounded-full border border-white/5 uppercase tracking-[0.2em]">
              Verified Records: {honorLogs.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {honorLogs.length === 0 ? (
              <div className="bg-zinc-900/30 border border-dashed border-white/10 rounded-[2rem] p-16 text-center">
                <Trophy className="w-16 h-16 text-zinc-800 mx-auto mb-4 opacity-50" />
                <p className="text-zinc-600 font-black text-xl uppercase tracking-widest">No honor standing adjustments recorded.</p>
              </div>
            ) : (
              honorLogs.map((log) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={log.id}
                  className="bg-zinc-900/40 border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl hover:bg-zinc-900/60 transition-all group"
                >
                  <div className="p-8 sm:p-10 flex items-start gap-8">
                    <div className={`w-20 h-20 rounded-[1.5rem] shrink-0 flex items-center justify-center text-3xl font-black shadow-2xl ${log.amount >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                      {log.amount > 0 ? `+${log.amount}` : log.amount}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4 mb-3">
                         <div className="flex items-center gap-3">
                            <span className="text-zinc-500 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                              <RotateCcw className="w-4 h-4" />
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                            {log.type === 'entry_auto' && (
                              <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-tighter">Automated System Log</span>
                            )}
                         </div>
                         {isAdmin && (
                           <div className="flex items-center gap-2">
                             <button 
                               onClick={() => {
                                 setLogToEdit(log);
                                 setHonorChangeAmount(log.amount);
                                 setHonorChangeReason(log.reason);
                                 setHonorChangeEvidenceUrl(log.evidenceUrl || '');
                               }}
                               className="text-zinc-700 hover:text-blue-500 transition-all p-2 bg-black/20 rounded-xl border border-transparent hover:border-blue-500/20"
                               title="Edit Log"
                             >
                               <Pencil className="w-6 h-6" />
                             </button>
                             <button 
                               onClick={() => handleDeleteHonorLog(log.id!, log.amount)}
                               className="text-zinc-700 hover:text-red-500 transition-all p-2 bg-black/20 rounded-xl border border-transparent hover:border-red-500/20"
                               title="Delete Log"
                             >
                               <Trash2 className="w-6 h-6" />
                             </button>
                           </div>
                         )}
                      </div>
                      <p className="text-zinc-100 text-2xl leading-relaxed font-bold tracking-tight">{log.reason}</p>
                      
                      {log.evidenceUrl && (
                        <div className="mt-4 flex">
                          <button 
                            onClick={() => setEvidencePreviewUrl(log.evidenceUrl!)}
                            className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-6 py-3 rounded-xl border border-blue-600/30 text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 active:scale-95 group/btn"
                          >
                            <ExternalLink className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                            View Evidence
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Footer System Info */}
        <div className="text-[5px] text-zinc-400 flex justify-between uppercase tracking-tighter mt-2">
          <span>Profile View Active</span>
          <span>Log Count: {entries.length}</span>
        </div>
      </div>

      {showDraftModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowDraftModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-xl border border-indigo-500/20 z-10 mx-auto transform-gpu">
              <form onSubmit={handleAddDraft}>
                <div className="bg-zinc-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-indigo-300 mb-2">New Draft Mode Add</h3>
                  <p className="text-sm text-indigo-400 mb-6 bg-indigo-500/10 px-3 py-2 rounded-md border border-indigo-500/20 inline-block font-medium">
                    {mod?.role === 'officer' 
                       ? 'Officers have NO time limit. Drafts save locally and must reach a minimum of 3 before submission. Upon adding a 6th draft, the first 5 will automatically submit.' 
                       : 'Adding this WILL NOT reset the timer. It saves locally to be processed automatically after 7 days.'
                    }
                  </p>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Draft Details</label>
                    <textarea
                      rows={4}
                      className="block w-full rounded-lg border-indigo-500/10 bg-black text-white shadow-lg shadow-black/20 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border resize-none"
                      placeholder="e.g. Draft recorded at link..."
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-medium text-zinc-300 mb-4">Choose Points for this Draft</label>
                    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                      {[1, 2, 3, 5, 10, 15, 20, 25].map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() => setDraftPoints(pts)}
                          className={`px-4 py-3 rounded-xl border text-lg font-bold transition-all ${draftPoints === pts ? 'bg-indigo-500 border-indigo-400 text-indigo-50 scale-105 shadow-lg shadow-indigo-500/20' : 'bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white'}`}
                        >
                          {pts}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <span className="text-zinc-500 font-bold text-xs uppercase tracking-[0.2em]">Custom Points</span>
                      <input 
                        type="number" 
                        min="0"
                        value={draftPoints.toString()}
                        onChange={(e) => setDraftPoints(e.target.value ? parseInt(e.target.value) : 0)}
                        className="w-full sm:w-32 bg-black border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all hover:border-white/20"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={isSubmittingDraft || !draftText.trim()}
                    className="inline-flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-500 sm:w-auto disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingDraft ? 'Saving Draft...' : 'Save Draft Mode'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-xl bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-300 shadow-sm border border-white/10 hover:bg-zinc-800 sm:mt-0 sm:w-auto transition-colors"
                    onClick={() => setShowDraftModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {draftToEdit && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setDraftToEdit(null)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-xl border border-blue-500/20 z-10 mx-auto transform-gpu">
              <form onSubmit={handleUpdateDraft}>
                <div className="bg-zinc-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-blue-300 mb-2">Edit Draft Entry</h3>
                  <p className="text-sm text-blue-400 mb-6 bg-blue-500/10 px-3 py-2 rounded-md border border-blue-500/20 inline-block font-medium">Updating this will modify the local draft without affecting the timer.</p>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Draft Details</label>
                    <textarea
                      rows={4}
                      className="block w-full rounded-lg border-blue-500/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border resize-none"
                      value={editDraftText}
                      onChange={(e) => setEditDraftText(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-medium text-zinc-300 mb-4">Choose Points for this Draft</label>
                    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                      {[1, 2, 3, 5, 10, 15, 20, 25].map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() => setEditDraftPoints(pts)}
                          className={`px-4 py-3 rounded-xl border text-lg font-bold transition-all ${editDraftPoints === pts ? 'bg-blue-500 border-blue-400 text-blue-50 scale-105 shadow-lg shadow-blue-500/20' : 'bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white'}`}
                        >
                          {pts}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <span className="text-zinc-500 font-bold text-xs uppercase tracking-[0.2em]">Custom Points</span>
                      <input 
                        type="number" 
                        min="0"
                        value={editDraftPoints.toString()}
                        onChange={(e) => setEditDraftPoints(e.target.value ? parseInt(e.target.value) : 0)}
                        className="w-full sm:w-32 bg-black border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all hover:border-white/20"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={isEditingDraft || !editDraftText.trim()}
                    className="inline-flex w-full justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-500 sm:w-auto disabled:opacity-50 transition-colors"
                  >
                    {isEditingDraft ? 'Updating Draft...' : 'Update Draft'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-xl bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-300 shadow-sm border border-white/10 hover:bg-zinc-800 sm:mt-0 sm:w-auto transition-colors"
                    onClick={() => setDraftToEdit(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Background Cache for Evidence URLs */}
      <div className="hidden" aria-hidden="true">
        {honorLogs.map((log) => 
          log.evidenceUrl && <link key={`prefetch-${log.id}`} rel="prefetch" href={log.evidenceUrl} as="document" />
        )}
      </div>

      {/* Evidence Preview Modal */}
      <AnimatePresence>
        {evidencePreviewUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 sm:p-8 border-b border-white/5 bg-black/50">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <ExternalLink className="w-6 h-6 text-blue-400" />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-wider">Evidence Explorer</h3>
                    <p className="text-zinc-500 text-xs font-bold truncate max-w-[200px] sm:max-w-md">{evidencePreviewUrl}</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                <a 
                  href={evidencePreviewUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
                >
                   Open Link
                </a>
                <button 
                  onClick={() => setEvidencePreviewUrl(null)}
                  className="bg-zinc-800 hover:bg-red-600 text-white p-4 rounded-xl transition-all active:scale-95 shadow-xl group"
                >
                  <RotateCcw className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 w-full h-full p-4 sm:p-8 flex items-center justify-center overflow-hidden">
               <div className="w-full h-full rounded-3xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl relative group">
                  <iframe 
                    src={evidencePreviewUrl}
                    className="w-full h-full border-none bg-zinc-100"
                    title="Evidence View"
                    sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  />
                  
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8 text-center bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="max-w-xs space-y-4">
                        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
                        <p className="text-white font-black uppercase text-xl">Preview Blocked?</p>
                        <p className="text-zinc-400 text-sm font-bold">External sites may block in-app previews for security. If the screen above is blank, please open the link directly.</p>
                        <a 
                          href={evidencePreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs pointer-events-auto active:scale-95 transition-transform"
                        >
                          Open Link Directly
                        </a>
                      </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Honor Modal */}
      {(showHonorModal || logToEdit) && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => { setShowHonorModal(false); setLogToEdit(null); }}></div>
            <div className="relative transform overflow-hidden rounded-[2rem] bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-xl border border-white/5 z-10 mx-auto transform-gpu">
              <form onSubmit={handleSaveHonor}>
                <div className="bg-zinc-900 px-8 pb-8 pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <Trophy className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black leading-6 text-white uppercase tracking-wider">{logToEdit ? 'Edit Honor Record' : 'Adjust Honor Standing'}</h3>
                      <p className="text-zinc-500 text-sm font-bold mt-1">Current Score: <span className="text-white">{mod.honorScore ?? 100}</span></p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <label className="block text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-3">Adjustment Reason</label>
                      <textarea
                        rows={3}
                        className="block w-full rounded-2xl border-white/10 bg-black text-white shadow-inner focus:border-emerald-500 focus:ring-emerald-500 text-lg p-5 border resize-none transition-all placeholder:text-zinc-700 font-bold"
                        placeholder="Why is this adjustment being made? (e.g. Community behavior, event performance...)"
                        value={honorChangeReason}
                        onChange={(e) => setHonorChangeReason(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-3">Evidence URL (Optional)</label>
                      <input
                        type="url"
                        className="block w-full rounded-2xl border-white/10 bg-black text-white shadow-inner focus:border-emerald-500 focus:ring-emerald-500 text-lg p-5 border transition-all placeholder:text-zinc-700 font-bold"
                        placeholder="https://evidence-link.com/..."
                        value={honorChangeEvidenceUrl}
                        onChange={(e) => setHonorChangeEvidenceUrl(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">Points Adjustment</label>
                      <div className="flex items-center gap-6">
                        <div className="flex-1 flex gap-2">
                          {[ -10, -5, -2, 2, 5, 10 ].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setHonorChangeAmount(amt)}
                              className={`flex-1 py-4 rounded-xl border text-xl font-black transition-all active:scale-95 ${honorChangeAmount === amt ? 'bg-emerald-600 border-white/20 text-white shadow-xl shadow-emerald-900/40' : 'bg-black border-white/5 text-zinc-500 hover:border-white/20 hover:text-white'}`}
                            >
                              {amt > 0 ? `+${amt}` : amt}
                            </button>
                          ))}
                        </div>
                        <div className="w-32 bg-zinc-950 p-2 rounded-2xl border border-white/10 flex flex-col items-center">
                          <span className="text-[10px] font-black text-zinc-600 uppercase mb-1">Custom</span>
                          <input 
                            type="number"
                            value={honorChangeAmount.toString()}
                            onChange={(e) => setHonorChangeAmount(parseInt(e.target.value) || 0)}
                            className="bg-transparent text-white font-black text-2xl w-full text-center focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-8 py-6 flex flex-row-reverse gap-4 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={isSubmittingHonor || !honorChangeReason.trim()}
                    className="flex-1 sm:flex-none inline-flex justify-center rounded-2xl border border-transparent bg-emerald-600 px-8 py-4 text-lg font-black text-white shadow-xl shadow-emerald-900/20 hover:bg-emerald-500 focus:outline-none transition-all active:scale-95 uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSubmittingHonor ? 'Verifying...' : logToEdit ? 'Update Record' : 'Finalize Adjustment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowHonorModal(false); setLogToEdit(null); }}
                    className="flex-1 sm:flex-none inline-flex justify-center rounded-2xl border border-white/10 bg-zinc-800 px-8 py-4 text-lg font-black text-zinc-300 shadow-lg hover:bg-zinc-700 focus:outline-none transition-all active:scale-95 uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {entryToEdit && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto w-full">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setEntryToEdit(null)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-xl border border-white/5 z-10 mx-auto transform-gpu">
              <form onSubmit={handleEditEntry}>
                <div className="bg-zinc-900 px-6 pb-6 pt-6">
                  <h3 className="text-xl font-bold leading-6 text-white mb-6">Edit Entry Log</h3>
                  
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Entry Details</label>
                    <textarea
                      rows={4}
                      className="block w-full rounded-lg border-white/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border resize-none"
                      value={editEntryText}
                      onChange={(e) => setEditEntryText(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-medium text-zinc-300 mb-4">Update Points</label>
                    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                      {[1, 2, 3, 5, 10, 15, 20, 25].map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() => setEditEntryPoints(pts)}
                          className={`px-4 py-3 rounded-xl border text-lg font-bold transition-all ${editEntryPoints === pts ? 'bg-amber-500 border-amber-400 text-amber-950 scale-105 shadow-lg shadow-amber-500/20' : 'bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white'}`}
                        >
                          {pts}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <span className="text-zinc-500 font-bold text-xs uppercase tracking-[0.2em]">Custom Points</span>
                      <input 
                        type="number" 
                        min="0"
                        value={editEntryPoints.toString()}
                        onChange={(e) => setEditEntryPoints(e.target.value ? parseInt(e.target.value) : 0)}
                        className="w-full sm:w-32 bg-black border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all hover:border-white/20"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={isEditingEntry || !editEntryText.trim()}
                    className="inline-flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50"
                  >
                    {isEditingEntry ? 'Updating...' : 'Update Entry'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryToEdit(null)}
                    className="inline-flex w-full justify-center rounded-lg border border-white/10 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-lg shadow-black/20 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setEntryToDelete(null)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-sm border border-white/5 z-10 mx-auto transform-gpu">
                <div className="bg-zinc-900 px-6 pb-6 pt-6 flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 sm:mx-0 sm:h-10 sm:w-10 mb-4 border border-red-500/20">
                    <Trash2 className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold leading-6 text-white mb-2">Delete Entry?</h3>
                  <p className="text-sm text-zinc-400">Are you sure you want to delete this entry? This will revert the timer back to the previous entry state. This action cannot be undone.</p>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-white/5">
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
                    className="inline-flex w-full justify-center rounded-lg border border-white/10 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-lg shadow-black/20 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setShowEditProfileModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-lg border border-white/5 z-10 mx-auto transform-gpu">
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
                        className="block w-full rounded-lg border-white/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                        value={editProfileName}
                        onChange={(e) => { setEditProfileName(e.target.value); setEditProfileError(''); }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">WhatsApp Number (with country code)</label>
                      <input
                        type="tel"
                        className="block w-full rounded-lg border-white/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                        placeholder="e.g. +91 9876543210"
                        value={editProfilePhone}
                        onChange={(e) => { setEditProfilePhone(e.target.value); setEditProfileError(''); }}
                        required
                      />
                    </div>
                    {mod.role === 'officer' && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Officer Group</label>
                        <select
                          className="block w-full rounded-lg border-white/10 bg-black text-white shadow-lg shadow-black/20 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                          value={editProfileGroup}
                          onChange={(e) => setEditProfileGroup(e.target.value)}
                        >
                          {['Other', '.', '-', ':', '#', '$', '+', '/', '?'].map(group => (
                            <option key={group} value={group}>
                              {group === 'Other' ? 'None (Other)' : `Group ${group}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-white/5">
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
                    className="inline-flex w-full justify-center rounded-lg border border-white/10 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-lg shadow-black/20 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
            <div className="relative transform overflow-hidden rounded-xl bg-zinc-900 text-left shadow-2xl transition-all w-full max-w-lg border border-white/5 z-10 mx-auto flex flex-col max-h-[80vh]">
              <div className="bg-zinc-900 px-6 py-5 border-b border-white/5">
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
                      <div key={unassignedMod.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-white/5 rounded-xl hover:border-white/10 transition-colors">
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
              <div className="bg-zinc-800/50 px-6 py-4 flex flex-row-reverse border-t border-white/5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="inline-flex w-full justify-center rounded-lg border border-white/10 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-300 shadow-lg shadow-black/20 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
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
