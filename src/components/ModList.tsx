import React, { useEffect, useState, useMemo, useDeferredValue, useCallback, useTransition } from 'react';
import { collection, collectionGroup, onSnapshot, query, orderBy, doc, setDoc, where, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mod, handleFirestoreError, OperationType } from '../types';
import { ModCardSkeleton } from './Skeletons';
import { CountdownTimer } from './CountdownTimer';
import { TermsModal } from './TermsModal';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Trophy, Clock, ScrollText, LogOut, LogIn, AlertTriangle, ShieldCheck, ChevronDown, Check, Filter, Menu, Search, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle, PageBreak, TableLayoutType } from 'docx';
import { saveAs } from 'file-saver';

// No extra declarations needed for functional autoTable

type SortMode = 'ranking' | 'timeLeft';
type ViewMode = 'active' | 'blacklisted';
type RankingMetric = 'points' | 'efficiency' | 'honor' | 'deadline';

const ModCardDetails = React.memo(({ 
  mod, 
  relations, 
  draftsCount, 
  isAdmin, 
  handleStatusChange, 
  isCritical 
}: { 
  mod: Mod, 
  relations: any[], 
  draftsCount: number,
  isAdmin: boolean,
  handleStatusChange: (id: string, s: 'active' | 'blacklisted') => void,
  isCritical: boolean
}) => {
  return (
    <div className="flex flex-col md:flex-row border-t border-white/5 relative bg-black/20">
      <div className="p-4 sm:p-6 flex-1 flex flex-col justify-center text-center sm:text-left">
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <div className="bg-black/50 px-4 py-3 rounded-2xl border border-white/5 shadow-inner flex flex-col gap-1 items-center sm:items-start transition-all hover:bg-zinc-800/40">
                <span className="text-zinc-600 text-[9px] uppercase tracking-[0.2em] font-black">Entries</span>
                <strong className="text-xl text-white font-black">{mod.entryCount}</strong>
              </div>
              {draftsCount > 0 && (
                <div className="bg-indigo-500/10 px-4 py-3 rounded-2xl border border-indigo-500/20 shadow-inner flex flex-col gap-1 items-center sm:items-start animate-pulse">
                  <span className="text-indigo-400 text-[9px] uppercase tracking-[0.2em] font-black">Drafts</span>
                  <strong className="text-xl text-indigo-300 font-black">{draftsCount}</strong>
                </div>
              )}
              <div className="bg-black/50 px-4 py-3 rounded-2xl border border-white/5 flex flex-col gap-1 items-center sm:items-start shadow-inner transition-all hover:bg-zinc-800/40">
                <span className="text-zinc-600 text-[9px] uppercase tracking-[0.2em] font-black">Points</span>
                <strong className="text-xl text-amber-400 flex items-center gap-1.5 font-black">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  {mod.totalPoints || 0}
                </strong>
              </div>
              <div className="bg-black/50 px-4 py-3 rounded-2xl border border-white/5 flex flex-col gap-1 items-center sm:items-start shadow-inner transition-all hover:bg-zinc-800/40">
                <span className="text-zinc-600 text-[9px] uppercase tracking-[0.2em] font-black">P/E Ratio</span>
                <strong className="text-xl text-purple-400 font-black">
                  {mod.entryCount > 0 ? ((mod.totalPoints || 0) / mod.entryCount).toFixed(2) : '0.00'}
                </strong>
              </div>
              <div className="bg-black/50 px-4 py-3 rounded-2xl border border-white/5 flex flex-col gap-1 items-center sm:items-start shadow-inner transition-all hover:bg-zinc-800/40">
                <span className="text-zinc-600 text-[9px] uppercase tracking-[0.2em] font-black">Honor</span>
                <strong className="text-xl text-emerald-400 font-black">
                  {mod.honorScore ?? 100}
                </strong>
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4">
             <Link 
               to={`/mod/${mod.id}`}
               className="text-blue-400 hover:text-blue-300 text-[9px] font-black uppercase tracking-widest px-5 py-2.5 bg-blue-400/5 rounded-xl border border-blue-400/10 hover:bg-blue-400/10 transition-all cursor-pointer inline-flex items-center"
             >
               Profile Detials &rarr;
             </Link>

             {isAdmin && (
               <div className="flex gap-2">
                  {mod.status === 'blacklisted' ? (
                     <button 
                       onClick={() => handleStatusChange(mod.id, 'active')}
                       className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white text-[9px] font-black uppercase tracking-widest px-5 py-2 rounded-xl transition-all border border-emerald-600/20 active:scale-95"
                     >
                       Re-Hire Member
                     </button>
                  ) : (
                     <button 
                       onClick={() => handleStatusChange(mod.id, 'blacklisted')}
                       className="bg-red-600/5 hover:bg-red-600 text-red-500 hover:text-white text-[9px] font-black uppercase tracking-widest px-5 py-2 rounded-xl transition-all border border-red-600/10 active:scale-95"
                     >
                       Move to Blacklist
                     </button>
                  )}
               </div>
             )}
          </div>
        </div>
        
        <div className={`w-full md:w-[28rem] flex flex-col border-t md:border-t-0 md:border-l border-white/5 relative z-0 ${mod.status === 'blacklisted' ? 'bg-zinc-900/50 grayscale opacity-75' : mod.role === 'officer' ? 'bg-zinc-900/40' : isCritical ? 'bg-red-950/20' : 'bg-black/20'}`}>
          <div className={`flex-1 flex flex-col p-4 sm:p-6 ${mod.role !== 'officer' ? 'items-center justify-center' : ''}`}>
             <p className={`text-[10px] uppercase tracking-[0.3em] font-black mb-4 ${mod.status === 'blacklisted' ? 'text-zinc-600' : isCritical ? 'text-red-500' : 'text-zinc-500'} text-center`}>
                {mod.role === 'officer' ? 'OFFICER UNITS' : mod.status === 'blacklisted' ? 'Timer Suspended' : 'MODERATOR CLOCK'}
              </p>
            <div className={`${mod.role !== 'officer' ? 'flex justify-center w-full' : 'flex flex-col gap-3'}`}>
              {mod.status === 'blacklisted' ? (
                <div className="text-zinc-700 font-mono text-3xl font-black tracking-widest">00:00:00</div>
              ) : mod.role === 'officer' ? (
                 <div className="flex flex-col gap-2 w-full max-h-[250px] overflow-y-auto custom-scrollbar pr-1 text-left">
                   <ol className="space-y-2 text-sm w-full">
                     {relations.map(m => (
                       <li key={m.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-blue-500/30 transition-colors group/unit">
                           <Link to={`/mod/${m.id}`} className="font-black text-white group-hover/unit:text-blue-400 text-base transition-colors truncate max-w-[140px]">
                             {m.name}
                           </Link>
                           <div className="flex items-center gap-2 shrink-0">
                             <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-500 px-2 py-1 rounded-lg text-[10px] font-black border border-amber-500/20">
                               {m.totalPoints || 0}
                             </div>
                             <span className="text-[10px] bg-zinc-900 px-2 py-1 rounded-lg text-zinc-400 font-mono border border-white/10 shrink-0">
                               <CountdownTimer deadlineAt={m.deadlineAt} compact />
                             </span>
                           </div>
                       </li>
                     ))}
                   </ol>
                   {relations.length === 0 && (
                      <div className="py-8 bg-black/20 rounded-xl border border-dashed border-white/5 flex flex-col items-center justify-center">
                        <span className="text-[10px] text-zinc-700 font-black uppercase tracking-widest">No Active Units</span>
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
});

export function ModList() {
  const [isPending, startTransition] = useTransition();
  const [mods, setMods] = useState<Mod[]>([]);
  const [entriesMap, setEntriesMap] = useState<Record<string, number>>({});
  const [draftsMap, setDraftsMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('ranking');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>('points');
  const { user, isAdmin, loading: authLoading, signIn, logOut } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [newModName, setNewModName] = useState('');
  const [newModPhone, setNewModPhone] = useState('');
  const [newModGroup, setNewModGroup] = useState('Other');
  const [newModGroups, setNewModGroups] = useState<string[]>(['Other']);
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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [expandedModId, setExpandedModId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    // Basic offline/online detection
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        setConnectionError(null);
      },
      (error) => {
        setConnectionError("Could not reach the database. Please check your internet connection.");
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

  const handleDownloadFullPDF = async () => {
    if (!isAdmin || isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    
    try {
      const activeMods = mods.filter(m => m.status !== 'blacklisted'); 

      const modsData = await Promise.all(activeMods.map(async (mod) => {
        const qEntries = query(collection(db, 'mods', mod.id, 'entries'), orderBy('createdAt', 'desc'));
        const snEntries = await getDocs(qEntries);
        const qDrafts = query(collection(db, 'mods', mod.id, 'drafts'), orderBy('createdAt', 'desc'));
        const snDrafts = await getDocs(qDrafts);
        const qHonor = query(collection(db, 'mods', mod.id, 'honor_logs'), orderBy('createdAt', 'desc'));
        const snHonor = await getDocs(qHonor);
        return { 
          mod, 
          entries: snEntries.docs.map(d => ({...d.data(), id: d.id})) as any[],
          drafts: snDrafts.docs.map(d => ({...d.data(), id: d.id})) as any[],
          honorLogs: snHonor.docs.map(d => ({...d.data(), id: d.id})) as any[]
        };
      }));

      const renderIndexSection = () => {
        const sortedMods = [...modsData].sort((a,b) => (b.mod.totalPoints || 0) - (a.mod.totalPoints || 0));
        return [
          new Paragraph({ text: "ALL MEMBERS OFFICIAL INDEX", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "" }),
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [7000, 3000],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MEMBER NAME", bold: true, color: "18181B", size: 18 })] })] }),
                  new TableCell({ shading: { fill: "F4F4F5" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DESIGNATION", bold: true, color: "18181B", size: 18 })] })] }),
                ]
              }),
              ...sortedMods.map((d, i) => new TableRow({
                children: [
                  new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.mod.name.toUpperCase(), bold: true, size: 18 })] })] }),
                  new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (d.mod.role?.toUpperCase() || 'MODERATOR'), size: 18 })] })] }),
                ]
              }))
            ]
          })
        ];
      };

      const renderLeaderboardSection = (type: 'points' | 'pe' | 'honor') => {
        let title = '';
        let headLabel = '';
        let sortedMods = [...modsData];

        if (type === 'points') {
          title = 'ACCOMPLISHMENT: HIGHEST MERIT POINTS';
          headLabel = 'MERITS';
          sortedMods.sort((a,b) => (b.mod.totalPoints || 0) - (a.mod.totalPoints || 0));
        } else if (type === 'pe') {
          title = 'EFFICIENCY: PERFORMANCE RATIO';
          headLabel = 'RATIO';
          sortedMods.sort((a,b) => {
             const peA = a.entries.length > 0 ? ((a.mod.totalPoints || 0) / a.entries.length) : 0;
             const peB = b.entries.length > 0 ? ((b.mod.totalPoints || 0) / b.entries.length) : 0;
             return peB - peA;
          });
        } else if (type === 'honor') {
          title = 'INTEGRITY: HONOR STANDING';
          headLabel = 'HONOR';
          sortedMods.sort((a,b) => (b.mod.honorScore ?? 100) - (a.mod.honorScore ?? 100));
        }

        return [
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "" }),
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [1500, 5500, 3000],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "RANK", bold: true, color: "475569", size: 18 })] })] }),
                  new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MEMBER", bold: true, color: "475569", size: 18 })] })] }),
                  new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headLabel, bold: true, color: "475569", size: 18 })] })] }),
                ]
              }),
              ...sortedMods.map((d, i) => {
                let val = '';
                if (type === 'points') val = `${d.mod.totalPoints || 0}`;
                if (type === 'pe') val = `${d.entries.length > 0 ? ((d.mod.totalPoints || 0) / d.entries.length).toFixed(1) : '0.0'}`;
                if (type === 'honor') val = `${d.mod.honorScore ?? 100}`;
                return new TableRow({
                  children: [
                    new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${i + 1}`, bold: true, size: 18 })] })] }),
                    new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.mod.name.toUpperCase(), bold: true, size: 18 })] })] }),
                    new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: val, color: "059669", bold: true, size: 18 })] })] }),
                  ]
                });
              })
            ]
          })
        ];
      };

      const renderModSection = (data: any) => {
        const { mod, entries, drafts } = data;
        const peRatio = entries.length > 0 ? ((mod.totalPoints || 0) / entries.length).toFixed(1) : '0.0';
        const status = (mod.status || 'ACTIVE').toUpperCase();
        
        const children = [
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ text: mod.name.toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
          new Paragraph({ 
            children: [
              new TextRun({ 
                text: mod.role?.toUpperCase() === 'OFFICER' ? 'OFFICER' : 'MODERATOR', 
                color: "71717A" 
              }),
              ...(mod.role === 'officer' && (mod.groups || mod.group) ? [
                new TextRun({ 
                  text: ` | GROUPS: ${(mod.groups && mod.groups.length > 0 ? mod.groups.join(', ') : mod.group || 'OTHER').toUpperCase()}`,
                  color: "71717A"
                })
              ] : [])
            ], 
            alignment: AlignmentType.CENTER 
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: `UNIQUE ID: ${mod.id?.slice(-12).toUpperCase()}`, bold: true })], alignment: AlignmentType.RIGHT }),
          new Paragraph({ children: [new TextRun({ text: `GENERATED AT: ${new Date().toLocaleString().toUpperCase()}` })], alignment: AlignmentType.RIGHT }),
          new Paragraph({ children: [new TextRun({ text: `CURRENT STATUS: ${status}`, bold: true, color: status === 'BLACKLISTED' ? "DC2626" : "059669" })], alignment: AlignmentType.RIGHT }),
          new Paragraph({ text: "" }),
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [5000, 5000],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
            },
            rows: [
              new TableRow({ children: [new TableCell({ shading: { fill: "F1F5F9" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PERFORMANCE METRIC", bold: true, color: "334155", size: 18 })] })] }), new TableCell({ shading: { fill: "F1F5F9" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CERTIFIED VALUE", bold: true, color: "334155", size: 18 })] })] })] }),
              new TableRow({ children: [new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Accumulated Merit Points", size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${mod.totalPoints || 0}`, bold: true, size: 18 })] })] })] }),
              new TableRow({ children: [new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Verified Activity Logs", size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${entries.length}`, bold: true, size: 18 })] })] })] }),
              new TableRow({ children: [new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Efficiency Ratio (P/E)", size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${peRatio}`, bold: true, size: 18 })] })] })] }),
              new TableRow({ children: [new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Social Honor Standing", size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${mod.honorScore ?? 100} / 100`, bold: true, size: 18 })] })] })] }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" })
        ];

        if (drafts && drafts.length > 0) {
          children.push(
            new Paragraph({ text: "PENDING PERFORMANCE DRAFTS", heading: HeadingLevel.HEADING_3 }),
            new Table({
              layout: TableLayoutType.FIXED,
              width: { size: 9000, type: WidthType.DXA },
              columnWidths: [1800, 1000, 6200],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
              },
              rows: [
                new TableRow({ children: [new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DATE", bold: true, color: "475569", size: 18 })] })] }), new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PTS", bold: true, color: "475569", size: 18 })] })] }), new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DRAFT SPECIFICATIONS", bold: true, color: "475569", size: 18 })] })] })] }),
                ...drafts.map((d: any) => new TableRow({ children: [new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: new Date(d.createdAt).toLocaleDateString(), size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `+${d.points || 0}`, color: "059669", bold: true, size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (d.text || "Detail"), size: 18 })] })] })] }))
              ]
            }),
            new Paragraph({ text: "" })
          );
        }

        if (entries && entries.length > 0) {
          children.push(
            new Paragraph({ text: "ACTIVITY AUDIT LEDGER", heading: HeadingLevel.HEADING_3 }),
            new Table({
              layout: TableLayoutType.FIXED,
              width: { size: 9000, type: WidthType.DXA },
              columnWidths: [1800, 1000, 6200],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
              },
              rows: [
                new TableRow({ children: [new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DATE", bold: true, color: "475569", size: 18 })] })] }), new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PTS", bold: true, color: "475569", size: 18 })] })] }), new TableCell({ shading: { fill: "F8FAFC" }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "LOG DETAILS", bold: true, color: "475569", size: 18 })] })] })] }),
                ...entries.map((e: any) => new TableRow({ children: [new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: new Date(e.createdAt).toLocaleDateString(), size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `+${e.points || 0}`, color: "059669", bold: true, size: 18 })] })] }), new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (e.text || "Detail"), size: 18 })] })] })] }))
              ]
            }),
            new Paragraph({ text: "" })
          );
        }

        return children;
      };

      const sortedContentMods = [...modsData].sort((a,b) => (b.mod.totalPoints || 0) - (a.mod.totalPoints || 0));

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: "Inter", color: "18181b" },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              margin: {
                top: 720,
                right: 500,
                bottom: 720,
                left: 500,
              },
            },
          },
          children: [
            ...renderIndexSection(),
            ...renderLeaderboardSection('points'),
            ...renderLeaderboardSection('pe'),
            ...renderLeaderboardSection('honor'),
            ...sortedContentMods.flatMap(d => renderModSection(d))
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'All_Reports.docx');

    } catch (e) {
      console.error(e);
      alert('Failed to generate full DOCX report');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

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
      const duplicatePhoneMember = mods.find(mod => mod.phoneNumber === targetPhone);

      if (isDuplicateName) {
        setAddModError(`A ${newModRole} with this name already exists.`);
        return;
      }

      if (duplicatePhoneMember) {
        const role = duplicatePhoneMember.role || 'moderator';
        setAddModError(`This phone number is already registered to ${duplicatePhoneMember.name} (${role.toUpperCase()}).`);
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
          ...(newModRole === 'officer' && { groups: newModGroups, group: newModGroups[0] || 'Other' }),
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

  const handleStatusChange = useCallback(async (modId: string, newStatus: 'active' | 'blacklisted') => {
    if (!isAdmin) return;
    setConfirmModal({ show: true, modId, action: newStatus });
  }, [isAdmin]);

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

  const roleCounts = useMemo(() => {
    const activeMods = mods.filter(m => (m.status || 'active') === viewMode);
    return {
      moderator: activeMods.filter(m => (m.role || 'moderator') === 'moderator').length,
      officer: activeMods.filter(m => m.role === 'officer').length
    };
  }, [mods, viewMode]);

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
    
    list.sort((a, b) => {
      if (rankingMetric === 'points') {
        return (b.totalPoints || 0) - (a.totalPoints || 0);
      }
      if (rankingMetric === 'efficiency') {
        const peA = a.entryCount > 0 ? (a.totalPoints || 0) / a.entryCount : 0;
        const peB = b.entryCount > 0 ? (b.totalPoints || 0) / b.entryCount : 0;
        return peB - peA || (b.totalPoints || 0) - (a.totalPoints || 0);
      }
      if (rankingMetric === 'honor') {
        return (b.honorScore ?? 100) - (a.honorScore ?? 100);
      }
      if (rankingMetric === 'deadline') {
        return a.deadlineAt - b.deadlineAt;
      }
      return 0;
    });
    
    return list;
  }, [mods, entriesMap, rankingMetric, viewMode, modRoleView, deferredSearchQuery]);

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
                  transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                  style={{ willChange: "transform, opacity", transformOrigin: "top right" }}
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
                      <button 
                        onClick={() => { handleDownloadFullPDF(); setShowHeaderMenu(false); }}
                        disabled={isGeneratingPDF}
                        className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 mt-4 px-6 py-5 sm:px-8 sm:py-6 rounded-3xl text-2xl sm:text-3xl font-bold flex items-center gap-5 transition-colors shadow-lg shadow-black/20 w-full disabled:opacity-50"
                      >
                        <Download className="w-10 h-10 sm:w-12 sm:h-12" />
                        <span>{isGeneratingPDF ? 'Compiling...' : 'All Reports DOCX'}</span>
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
        {(offline || connectionError) && (
          <div className="w-full max-w-6xl mx-auto mb-6">
            <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 flex items-center gap-4 text-red-500">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-lg">{offline ? 'You are offline' : 'Connection Error'}</h3>
                <p className="text-sm opacity-80">{connectionError || 'Restoring connection...'}</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="ml-auto px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-sm font-bold transition-all"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 mb-10">
          {/* Advanced Search & Leaderboard Controls */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 p-4 bg-zinc-900 border border-white/5 rounded-[2.5rem] w-full shadow-2xl shadow-black/60 relative z-20">
             {/* Search */}
             <div className="relative flex-1 group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
                <input 
                  type="text"
                  placeholder="Search members..."
                  className="w-full bg-black/40 border border-white/5 rounded-3xl py-4 pl-16 pr-6 text-white text-lg placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
             </div>

             {/* Metric Leaderboard Toggles */}
             <div className="flex flex-wrap items-center gap-2 bg-black/40 p-2 rounded-3xl border border-white/5 min-w-fit">
                {[
                  { id: 'points', label: 'Points', icon: Trophy, color: 'text-amber-500' },
                  { id: 'honor', label: 'Honor', icon: ShieldCheck, color: 'text-emerald-500' },
                  { id: 'efficiency', label: 'P/E Leaderboard', icon: Filter, color: 'text-purple-400' },
                  { id: 'deadline', label: 'Timer', icon: Clock, color: 'text-blue-400' }
                ].map((metric) => (
                  <button
                    key={metric.id}
                    onClick={() => setRankingMetric(metric.id as RankingMetric)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      rankingMetric === metric.id 
                      ? 'bg-zinc-800 text-white shadow-xl ring-1 ring-white/10' 
                      : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <metric.icon className={`w-4 h-4 ${rankingMetric === metric.id ? metric.color : 'text-current'}`} />
                    <span className="whitespace-nowrap">{metric.label}</span>
                  </button>
                ))}
             </div>

             {/* View Mode & Extra Filters */}
             <div className="flex items-center gap-2 bg-black/40 p-2 rounded-3xl border border-white/5 min-w-fit">
                <button
                  onClick={() => setViewMode('active')}
                  className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    viewMode === 'active' 
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' 
                    : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${viewMode === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
                  Active
                </button>
                <button
                  onClick={() => setViewMode('blacklisted')}
                  className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    viewMode === 'blacklisted' 
                    ? 'bg-red-600/20 text-red-500 border border-red-500/30' 
                    : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${viewMode === 'blacklisted' ? 'bg-red-500' : 'bg-zinc-700'}`} />
                  Blacklist
                </button>
             </div>
          </div>

          {/* Role Navigation */}
          <div className="flex items-center justify-center gap-12 border-b border-white/5 pb-2">
            {[
              { id: 'moderator', label: 'MODERATORS', count: roleCounts.moderator },
              { id: 'officer', label: 'OFFICERS', count: roleCounts.officer }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  startTransition(() => {
                    setModRoleView(tab.id as 'moderator' | 'officer');
                  });
                }}
                className="relative pb-4 group"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-black uppercase tracking-[0.3em] transition-all ${modRoleView === tab.id ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                    {tab.label}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black transition-all ${modRoleView === tab.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-600'}`}>
                    {tab.count}
                  </span>
                </div>
                {modRoleView === tab.id && (
                  <motion.div 
                    layoutId="roleActiveLine"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-6xl mx-auto pb-16">
          {authLoading || (loading && mods.length === 0) || isPending ? (
            <div className="flex flex-col gap-4">
              <ModCardSkeleton />
              <ModCardSkeleton />
              <ModCardSkeleton />
            </div>
          ) : rankedMods.length === 0 ? (
            <div className="col-span-full p-20 text-center text-zinc-500 bg-zinc-900/30 border border-dashed border-white/10 rounded-[3rem] text-xl">
               No {modRoleView}s found in the system.
            </div>
          ) : (() => {
            const renderCard = (mod: typeof mods[0], index: number) => {
              const timeLeft = mod.deadlineAt - now;
              const isCritical = mod.role === 'officer' ? false : timeLeft < 24 * 60 * 60 * 1000;
              const isWarning = mod.role === 'officer' ? false : timeLeft < 3 * 24 * 60 * 60 * 1000;
              const totalMs = 7 * 24 * 60 * 60 * 1000;
              const progress = mod.role === 'officer' ? 100 : Math.max(0, Math.min(100, (timeLeft / totalMs) * 100));
              const rank = (sortMode === 'ranking' && mod.entryCount > 0) ? index + 1 : null;
              const isRanked = rank !== null && rank <= 3;
              const isExpanded = expandedModId === mod.id;

              return (
                    <motion.div 
                      key={mod.id}
                      layout
                      className={`group bg-zinc-900 rounded-3xl border border-white/5 shadow-xl shadow-black/40 hover:border-blue-500/20 transition-all duration-300 flex flex-col overflow-hidden relative transform-gpu ${
                        rank === 1 ? 'ring-2 ring-blue-500/50 ring-offset-4 ring-offset-black' : 
                        rank === 2 ? 'ring-2 ring-zinc-400/30 ring-offset-2 ring-offset-black' :
                        rank === 3 ? 'ring-2 ring-amber-700/20 ring-offset-2 ring-offset-black' : ''
                      }`}
                    >
                      
                      {/* Compact Header (Clickable) */}
                      <div 
                        className="p-4 sm:p-6 flex items-center justify-between cursor-pointer hover:bg-zinc-800/30 transition-all select-none w-full text-left"
                        onClick={() => setExpandedModId(isExpanded ? null : mod.id)}
                      >
                    <motion.div 
                      layout="position"
                      className="flex items-center gap-3 sm:gap-4 overflow-hidden pr-2"
                    >
                        {sortMode === 'ranking' ? (
                          <span className={`w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl font-black text-base sm:text-xl shrink-0 ${
                            rank === 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 
                            rank === 2 ? 'bg-zinc-600 text-white shadow-lg shadow-zinc-500/20' :
                            rank === 3 ? 'bg-amber-800 text-white shadow-lg shadow-amber-800/10' :
                            'bg-zinc-800 text-zinc-500'
                          }`}>
                            #{index + 1}
                          </span>
                        ) : (
                          <div className="w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl bg-zinc-800 text-zinc-500 shrink-0">
                            <Clock className="w-4 h-4 sm:w-6 sm:h-6" />
                          </div>
                        )}
                        <h3 className="font-black text-lg sm:text-2xl text-white truncate tracking-tight">
                          {mod.name}
                        </h3>
                        {isRanked && (
                          <Trophy className={`w-4 h-4 sm:w-6 sm:h-6 ml-1 drop-shadow-md shrink-0 block ${
                            rank === 1 ? 'text-amber-400' : 
                            rank === 2 ? 'text-zinc-300' : 
                            'text-amber-600'
                          }`} />
                        )}
                    </motion.div>
                    
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        {/* Quick Stats - hidden when expanded */}
                        <div className={`flex items-center gap-1.5 sm:gap-2 transition-[max-width,opacity,margin] duration-300 ease-out overflow-hidden ${isExpanded ? 'max-w-0 opacity-0 !m-0 pointer-events-none' : 'max-w-[400px] opacity-100'}`}>
                           <div className="flex items-center gap-1 sm:gap-2 bg-amber-500/10 text-amber-500 px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-xl text-[10px] sm:text-sm font-black border border-amber-500/20" title="Points">
                             <Trophy className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                             {mod.totalPoints || 0}
                           </div>
                           <div className="flex items-center gap-1 bg-purple-500/10 text-purple-400 px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-xl text-[10px] sm:text-sm font-black border border-purple-500/20" title="P/E Ratio">
                             <span className="text-purple-500 tracking-tighter">P/E</span> {mod.entryCount > 0 ? ((mod.totalPoints || 0) / mod.entryCount).toFixed(1) : '0.0'}
                           </div>
                           {mod.role !== 'officer' && (
                             <span className="flex items-center gap-1 text-[10px] sm:text-sm bg-zinc-900 px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-xl text-zinc-400 font-mono border border-white/10 shadow-inner shrink-0 truncate">
                               <CountdownTimer deadlineAt={mod.deadlineAt} compact />
                             </span>
                           )}
                        </div>

                        <div className="pl-1.5 sm:pl-4 border-l border-white/5 flex items-center">
                            <ChevronDown className={`w-5 h-5 sm:w-8 sm:h-8 text-zinc-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </div>
                  </div>
  
                  {/* Expanded Content Area */}
                  <motion.div 
                    layout
                    initial={false}
                    animate={isExpanded ? "open" : "closed"}
                    variants={{
                      open: {
                        height: ["0px", "160px", "auto"],
                        opacity: [0, 0.8, 1],
                        transition: {
                          height: {
                            times: [0, 0.5, 1], // Stage 1 (shutter) takes 50% of the time
                            duration: 0.7,
                            ease: [0.33, 1, 0.68, 1] // Snappy shutter ease
                          },
                          opacity: { duration: 0.5 }
                        }
                      },
                      closed: {
                        height: ["auto", "160px", "0px"],
                        opacity: [1, 0.5, 0],
                        transition: {
                          height: { 
                            times: [0, 0.4, 1],
                            duration: 0.5, 
                            ease: [0.32, 0, 0.67, 0] 
                          },
                          opacity: { duration: 0.3 }
                        }
                      }
                    }}
                    className="overflow-hidden no-scrollbar bg-white/[0.02]"
                    style={{ willChange: "height, opacity" }}
                  >
                    <ModCardDetails 
                      mod={mod}
                      relations={officerRelationsMap[mod.id] || []}
                      draftsCount={draftsMap[mod.id] || 0}
                      isAdmin={isAdmin}
                      handleStatusChange={handleStatusChange}
                      isCritical={isCritical}
                    />
                  </motion.div>
                </motion.div>
              );
            };

            if (modRoleView === 'officer') {
              const groupSymbols = ['.', '-', ':', '#', '$', '+', '/', '?'];
              const grouped = {} as Record<string, typeof mods>;
              
              rankedMods.forEach(mod => {
                const sym = groupSymbols.find(s => mod.name.includes(s));
                const targetGroups = mod.groups && mod.groups.length > 0 ? mod.groups : [mod.group || sym || 'Other'];
                
                targetGroups.forEach(key => {
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(mod);
                });
              });

              return (
                <div className="flex flex-col gap-12">
                  {[...groupSymbols, 'Other'].map(key => {
                    if (!grouped[key] || grouped[key].length === 0) return null;
                    return (
                      <div key={key} className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                           <span className="text-zinc-500 text-sm font-black uppercase tracking-[0.3em] pl-4 border-l-2 border-zinc-700">Group {key}</span>
                           <span className="flex-1 h-px bg-white/5"></span>
                        </div>
                        <div className="flex flex-col gap-4">
                          {grouped[key].map(mod => renderCard(mod, rankedMods.indexOf(mod)))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <div className="flex flex-col gap-4">
                {rankedMods.map((mod, index) => renderCard(mod, index))}
              </div>
            );
          })()}
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
                    {newModRole === 'officer' && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-zinc-300 mb-3">Officer Groups (Select multiple)</label>
                        <div className="grid grid-cols-3 gap-2 bg-black/40 p-4 rounded-xl border border-white/5">
                          {['Other', '.', '-', ':', '#', '$', '+', '/', '?'].map(group => (
                            <label key={group} className="flex items-center gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={newModGroups.includes(group)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewModGroups(prev => [...prev, group]);
                                  } else {
                                    setNewModGroups(prev => prev.filter(g => g !== group));
                                  }
                                }}
                                className="w-5 h-5 rounded border-white/10 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-black"
                              />
                              <span className="text-zinc-400 group-hover:text-white transition-colors text-sm">
                                {group === 'Other' ? 'Other' : `Group ${group}`}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
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

