import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { 
  makeWASocket, 
  DisconnectReason, 
  initAuthCreds, 
  BufferJSON, 
  Browsers, 
  WASocket,
  AuthenticationState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  updateDoc, 
  writeBatch 
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };
import crypto from "crypto";
import cron from "node-cron";

// Initialize Firebase
const appFirebase = initializeApp(firebaseConfig, "backend-v2");
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

// Global anti-crash wrapper
process.on('uncaughtException', (err) => {
  console.error(">>> [SYSTEM] Uncaught Exception Blocked:", err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(">>> [SYSTEM] Unhandled Rejection Blocked:", reason);
});

const OWNERS = [
  "919891478164",
  "2349060947343",
  "51780729753751", // lid or number
  "20886912561205"  // lid
];

// Helper to sanitize Firestore IDs
const sanitizeId = (id: string) => id.replace(/\//g, '-');

/**
 * Enhanced Firestore Auth State for Baileys
 * Correctly handles nested buffers and state clearing
 */
async function useFirestoreAuthState(collectionName: string) {
  const writeData = async (data: any, id: string) => {
    try {
      const docRef = doc(db, collectionName, sanitizeId(id));
      const content = JSON.stringify(data, BufferJSON.replacer, 2);
      await setDoc(docRef, { data: content, updatedAt: Date.now() });
    } catch (e) {
      console.error("Auth Write Error:", e);
    }
  };

  const readData = async (id: string) => {
    try {
      const docRef = doc(db, collectionName, sanitizeId(id));
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return JSON.parse(snapshot.data().data, BufferJSON.reviver);
      }
    } catch (e) {
      // console.error("Auth Read Error:", id, e);
    }
    return null;
  };

  const removeData = async (id: string) => {
    try {
      await deleteDoc(doc(db, collectionName, sanitizeId(id)));
    } catch (e) {}
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = { ...value, syncKey: Buffer.from(value.syncKey, 'base64') };
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<any>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const keyId = `${category}-${id}`;
              if (value) {
                let saveValue = value;
                if (category === 'app-state-sync-key' && value.syncKey) {
                  saveValue = { ...value, syncKey: value.syncKey.toString('base64') };
                }
                tasks.push(writeData(saveValue, keyId));
              } else {
                tasks.push(removeData(keyId));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    } as AuthenticationState,
    saveCreds: () => writeData(creds, "creds")
  };
}

let sock: WASocket | null = null;
let lastQR: string | null = null;
let connectionStatus: 'connecting' | 'open' | 'close' = 'close';
const pendingCommands = new Map<string, any>();

async function syncProfilePictures(s: WASocket) {
  try {
    const snap = await getDocs(collection(db, 'mods'));
    for (const d of snap.docs) {
      const mod = d.data();
      const p = mod.phone || mod.phoneNumber;
      if (p) {
        const jid = p.includes('@') ? p : `${p.replace(/\D/g, '')}@s.whatsapp.net`;
        try {
          const url = await s.profilePictureUrl(jid, 'image');
          if (url) {
            await updateDoc(d.ref, { avatarUrl: url, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error("Profile sync error:", e);
  }
}

const MANAGEMENT_GROUP_ID = '120363423564933431@g.us';
const getOwnersToTag = () => OWNERS.filter(o => !o.includes('51780729753751') && !o.includes('20886912561205')).map(o => `${o.replace(/\D/g, '')}@s.whatsapp.net`);

// Helper to check flexible phone matching
const isPhoneMatch = (dbPhone: string, input: string) => {
  const p1 = dbPhone.split('@')[0].split(':')[0].replace(/\D/g, '');
  const p2 = input.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!p1 || !p2) return false;
  if (p1 === p2) return true;
  if (p1.length >= 8 && p2.endsWith(p1)) return true;
  if (p2.length >= 8 && p1.endsWith(p2)) return true;
  return false;
};

async function syncAllJids() {
  if (!sock) return;
  try {
    const groupMeta = await sock.groupMetadata(MANAGEMENT_GROUP_ID).catch(() => null);
    if (!groupMeta) return;
    const snap = await getDocs(collection(db, 'mods'));
    const allMods = snap.docs.map(d => ({ id: d.id, ...d.data() as any, ref: d.ref }));

    for (const p of groupMeta.participants) {
      const cleanJid = p.id.split(':')[0] + '@s.whatsapp.net';
      const match = allMods.find(m => m.whatsappJid === cleanJid || isPhoneMatch(m.phone || m.phoneNumber || '', cleanJid));
      if (match && match.whatsappJid !== cleanJid) {
        await updateDoc(match.ref, { whatsappJid: cleanJid, bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
      }
    }
  } catch (e) {
    console.error("JID Sync Error:", e);
  }
}

async function runAbsentCheck(triggerChatId?: string) {
  if (!sock || connectionStatus !== 'open') return;
  try {
    await syncAllJids();

    const groupMeta = await sock.groupMetadata(MANAGEMENT_GROUP_ID).catch(() => null);
    if (!groupMeta) {
      if (triggerChatId) await sock.sendMessage(triggerChatId, { text: "✕ ᴜɴᴀʙʟᴇ ᴛᴏ ʀᴇᴀᴅ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ɢʀᴏᴜᴘ ᴍᴇᴛᴀᴅᴀᴛᴀ." });
      return;
    }

    const groupParticipants = groupMeta.participants.map(p => p.id.split(':')[0] + '@s.whatsapp.net');
    const snap = await getDocs(collection(db, 'mods'));
    const allMods = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const missingMods = allMods.filter(m => {
      if (m.status === 'blacklisted') return false; 
      const jidToUse = m.whatsappJid || `${(m.phone || m.phoneNumber || '').replace(/\D/g, '')}@s.whatsapp.net`;
      if (!jidToUse || jidToUse === '@s.whatsapp.net') return false;
      return !groupParticipants.includes(jidToUse);
    });

    if (missingMods.length > 0) {
       let text = `╔═════════════════════════╗\n`;
       text += `║  ⚠️ *𝗠𝗜𝗦𝗦𝗜𝗡𝗚 𝗠𝗘𝗠𝗕𝗘𝗥𝗦 𝗔𝗟𝗘𝗥𝗧* ⚠️  ║\n`;
       text += `╚═════════════════════════╝\n\n`;
       text += `Attention! The following members are registered in the system but are currently *absent* from this management group:\n\n`;
       
       const mentions: string[] = [];
       missingMods.forEach((m, idx) => {
          const jidToUse = m.whatsappJid || `${(m.phone || m.phoneNumber || '').replace(/\D/g, '')}@s.whatsapp.net`;
          const shortJid = jidToUse.split('@')[0];
          text += `${idx+1}. @${shortJid} (${m.role || 'Moderator'})\n`;
          mentions.push(jidToUse);
       });
       
       text += `\n*Notifying Owners:*\n`;
       getOwnersToTag().forEach(o => {
         text += `@${o.split('@')[0]} `;
         mentions.push(o);
       });

       await sock.sendMessage(triggerChatId || MANAGEMENT_GROUP_ID, { text, mentions });
    } else {
       if (triggerChatId) {
         await sock.sendMessage(triggerChatId, { text: "✦ ᴀʟʟ ᴀᴄᴛɪᴠᴇ ᴍᴇᴍʙᴇʀꜱ ᴀʀᴇ ᴘʀᴇꜱᴇɴᴛ ɪɴ ᴛʜᴇ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ɢʀᴏᴜᴘ." });
       }
    }
  } catch(e) { console.error("Absent Check Error:", e); }
}

async function runTimerWarning(triggerChatId?: string) {
  if (!sock || connectionStatus !== 'open') return;
  try {
    const snap = await getDocs(collection(db, 'mods'));
    const allMods = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const warnings: any[] = [];
    const now = Date.now();
    const WARNING_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

    allMods.forEach(m => {
      // Exclude blacklisted and officers
      if (m.status === 'blacklisted') return;
      if (m.role?.toLowerCase() === 'officer') return;
      if (!m.deadlineAt) return;

      const diff = m.deadlineAt - now;
      if (diff <= WARNING_THRESHOLD) {
        warnings.push(m);
      }
    });

    if (warnings.length > 0) {
       let text = `╔═════════════════════════╗\n`;
       text += `║  ⏳ *𝗧𝗜𝗠𝗘𝗥 𝗪𝗔𝗥𝗡𝗜𝗡𝗚* ⏳  ║\n`;
       text += `╚═════════════════════════╝\n\n`;
       text += `The activity timer for the following moderators has either expired or is critically low. \n\nPlease submit your work reports to the owners as soon as possible.\n\n`;
       
       const mentions: string[] = [];
       warnings.forEach((m, idx) => {
          const jidToUse = m.whatsappJid || `${(m.phone || m.phoneNumber || '').replace(/\D/g, '')}@s.whatsapp.net`;
          const shortJid = jidToUse.split('@')[0];
          
          const diff = m.deadlineAt - now;
          let tmrStr = "";
          if (diff <= 0) tmrStr = "🚨 EXPIRED";
          else {
              const d = Math.floor(diff / (1000 * 60 * 60 * 24));
              const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
              tmrStr = `⏱ ${d}d ${h}h`;
          }

          text += `${idx+1}. @${shortJid} - [${tmrStr}]\n`;
          mentions.push(jidToUse);
       });
       
       text += `\n*CC Owners:* `;
       getOwnersToTag().forEach(o => {
         text += `@${o.split('@')[0]} `;
         mentions.push(o);
       });

       await sock.sendMessage(triggerChatId || MANAGEMENT_GROUP_ID, { text, mentions });
    } else {
       if (triggerChatId) {
         await sock.sendMessage(triggerChatId, { text: "✦ ɴᴏ ᴍᴏᴅᴇʀᴀᴛᴏʀꜱ ᴀʀᴇ ᴄᴜʀʀᴇɴᴛʟʏ ᴜɴᴅᴇʀ ᴛɪᴍᴇʀ ᴡᴀʀɴɪɴɢ." });
       }
    }
  } catch(e) { console.error("Timer Warning Error:", e); }
}

function setupCronJobs() {
  // Task A: Absent Check - Every 4 hours at xx:00 (e.g. 12:00, 4:00, 8:00)
  cron.schedule('0 0,4,8,12,16,20 * * *', () => runAbsentCheck(), { timezone: "Asia/Kolkata" });

  // Task B: Timer Warning - Every 4 hours at xx:30 (e.g. 12:30, 4:30, 8:30)
  cron.schedule('30 0,4,8,12,16,20 * * *', () => runTimerWarning(), { timezone: "Asia/Kolkata" });
}

const nameCache = new Map<string, string>();
async function safelySyncName(jid: string, pushName: string) {
  if (nameCache.get(jid) === pushName) return;
  nameCache.set(jid, pushName);
  try {
    const phone = jid.split('@')[0];
    const snap = await getDocs(collection(db, 'mods'));
    const doc = snap.docs.find(d => {
       const p = d.data().phone || d.data().phoneNumber || '';
       return isPhoneMatch(p, phone);
    });
    if (doc) {
       if (doc.data().whatsappName !== pushName) {
           await updateDoc(doc.ref, { whatsappName: pushName, bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
       }
    }
  } catch (e) {}
}

async function startWhatsAppBot() {
  if (sock && connectionStatus !== 'close') return;

  console.log(">>> [BOT] Starting WhatsApp Engine...");
  connectionStatus = 'connecting';
  
  const { state, saveCreds } = await useFirestoreAuthState('whatsapp_sessions_v2');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }) as any,
    browser: ["Mac OS", "Chrome", "121.0.6167.160"],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    retryRequestDelayMs: 5000,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      lastQR = qr;
      console.log('>>> [BOT] New Pair Request Ready');
    }

    if (connection === 'close') {
      const error = (lastDisconnect?.error as any);
      const statusCode = error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`>>> [BOT] Connection Closed [Code: ${statusCode}]. Reconnecting: ${shouldReconnect}`);
      connectionStatus = 'close';
      sock = null;
      lastQR = null;

      if (shouldReconnect) {
        console.log(">>> [BOT] Aggressive reconnect enabled. Engine restarting in 2 seconds...");
        setTimeout(startWhatsAppBot, 2000);
      } else {
        console.log(">>> [BOT] Logged out successfully. Device unlinked.");
      }
    } else if (connection === 'open') {
      console.log('>>> [BOT] Connection Live!');
      connectionStatus = 'open';
      lastQR = null;
      if (sock) await syncProfilePictures(sock);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message || !sock) return;

    const chatId = msg.key.remoteJid;
    if (!chatId) return;

    // Determine the actual author of the message for permission checking
    const author = msg.key.fromMe ? (sock.user?.id || chatId) : (msg.key.participant || chatId);
    
    // Fallback original sender concept for pending logic tied to the user
    const sender = author; 

    if (author && msg.pushName) {
      safelySyncName(author, msg.pushName);
    }

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text.startsWith('_')) return; // Prevents recursive bot triggers

    if (!OWNERS.some(owner => author.includes(owner))) {
      return;
    }

    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    // Command Logic
    if (cmd === '_yes') {
      const pending = pendingCommands.get(sender);
      if (!pending) {
        await sock.sendMessage(chatId, { text: "✧ ɴᴏ ᴀᴄᴛɪᴠᴇ ᴄᴏᴍᴍᴀɴᴅ ᴀᴡᴀɪᴛɪɴɢ ᴄᴏɴꜰɪʀᴍᴀᴛɪᴏɴ." });
        return;
      }
      pendingCommands.delete(sender);
      try {
        await pending.execute();
        await sock.sendMessage(chatId, { text: `✦ *ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ᴇxᴇᴄᴜᴛᴇᴅ:* ${pending.desc}` });
      } catch (e: any) {
        await sock.sendMessage(chatId, { text: `✕ *ᴇxᴇᴄᴜᴛɪᴏɴ ꜰᴀɪʟᴇᴅ:* ${e.message}` });
      }
      return;
    }

    if (cmd === '_no') {
      pendingCommands.delete(sender);
      await sock.sendMessage(chatId, { text: "✕ ᴄᴏᴍᴍᴀɴᴅ ᴅɪꜱᴄᴀʀᴅᴇᴅ." });
      return;
    }

    const findMod = async (targetPart?: string) => {
      const snap = await getDocs(collection(db, 'mods'));
      const allMods = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, ref: doc.ref }));
      
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (mentionedJids.length > 0) {
        for (const jid of mentionedJids) {
          const phone = jid.split('@')[0];
          const match = allMods.find(m => isPhoneMatch(m.phone || m.phoneNumber || '', phone));
          if (match) return match;
        }
      }

      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (quotedParticipant) {
        const phone = quotedParticipant.split('@')[0];
        const match = allMods.find(m => isPhoneMatch(m.phone || m.phoneNumber || '', phone));
        if (match) return match;
      }

      if (targetPart) {
        const idxVal = parseInt(targetPart);
        if (!quotedParticipant && mentionedJids.length === 0 && !isNaN(idxVal) && idxVal > 0 && targetPart === idxVal.toString()) {
           allMods.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
           const officers = allMods.filter(m => m.role?.toLowerCase() === 'officer');
           const moderators = allMods.filter(m => m.status !== 'blacklisted' && m.role?.toLowerCase() !== 'officer');
           const combined = [...officers, ...moderators];
           if (idxVal <= combined.length) {
             return combined[idxVal - 1];
           }
        }
        
        const cleanPart = targetPart.replace(/^@/, '').toLowerCase();
        const match = allMods.find(m => m.name.toLowerCase() === cleanPart || isPhoneMatch(m.phone || m.phoneNumber || '', cleanPart));
        if (match) return match;
      }
      return 'NOT_FOUND';
    };

    if (cmd === '_del' || cmd === '_delete_msg') {
      const targetMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (targetMsg) {
        try {
          await sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: msg.message?.extendedTextMessage?.contextInfo?.participant === sock.user?.id, id: targetMsg, participant: msg.message?.extendedTextMessage?.contextInfo?.participant } });
        } catch (e) {}
      } else {
        await sock.sendMessage(chatId, { text: "✦ ᴘʟᴇᴀꜱᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇꜱꜱᴀɢᴇ ᴛᴏ ᴅᴇʟᴇᴛᴇ ɪᴛ." });
      }
      return;
    }

    if (cmd === '_checkstatus' || cmd === '_cs') {
      await sock.sendMessage(chatId, { text: "✦ ʀᴜɴɴɪɴɢ ᴀʙꜱᴇɴᴛ ᴍᴇᴍʙᴇʀꜱ ᴄʜᴇᴄᴋ..." });
      await runAbsentCheck(chatId);
      return;
    }

    if (cmd === '_warn') {
      await sock.sendMessage(chatId, { text: "✦ ʀᴜɴɴɪɴɢ ᴛɪᴍᴇʀ ᴡᴀʀɴɪɴɢ ᴄʜᴇᴄᴋ..." });
      await runTimerWarning(chatId);
      return;
    }

    if (cmd === '_gid') {

      await sock.sendMessage(chatId, { text: `✦ *ɢʀᴏᴜᴘ/ᴄʜᴀᴛ ɪᴅ:* \`${chatId}\`` });
      return;
    }

    if (cmd === '_id') {
      let targetId = '';
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (quotedParticipant) {
        targetId = quotedParticipant;
      } else {
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentionedJids.length > 0) {
          targetId = mentionedJids[0];
        }
      }

      if (targetId) {
        await sock.sendMessage(chatId, { text: `✦ *ᴜꜱᴇʀ ɪᴅ:* \`${targetId}\`` });
      } else {
        // If neither replied nor tagged, just give the sender's ID
        await sock.sendMessage(chatId, { text: `✦ *ʏᴏᴜʀ ɪᴅ:* \`${author}\`` });
      }
      return;
    }

    if (cmd === '_sync') {
       await syncProfilePictures(sock);
       await sock.sendMessage(chatId, { text: "✦ *ᴀᴠᴀᴛᴀʀ ꜱʏɴᴄʜʀᴏɴɪᴢᴀᴛɪᴏɴ ᴄᴏᴍᴘʟᴇᴛᴇ.*" });
       return;
    }

    if (cmd === '_menu') {
      const menu = `❖ *ꜱʏꜱᴛᴇᴍ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ᴍᴇɴᴜ* ❖
──────────────────────
ᴘʀᴇꜰɪx: \`_\`

✦ *ᴄᴏʀᴇ ᴄᴏᴍᴍᴀɴᴅꜱ:*
- \`_list\` : ꜱʜᴏᴡ ᴀʟʟ ᴍᴇᴍʙᴇʀꜱ & ᴛɪᴍᴇʀꜱ
- \`_info <tag/sn>\` : ᴠɪᴇᴡ ᴍᴇᴍʙᴇʀ ᴘʀᴏꜰɪʟᴇ
- \`_pdfinfo <tag/sn>\` : ɢᴇɴᴇʀᴀᴛᴇ ᴘᴅꜰ ʀᴇᴘᴏʀᴛ
- \`_draft <tag> [text] [pts]\` : ᴀᴅᴅ ᴅʀᴀꜰᴛ ᴇɴᴛʀʏ
- \`_entry <tag> [pts] [text]\` : ᴀᴅᴅ ᴅɪʀᴇᴄᴛ ᴇɴᴛʀʏ
- \`_status <tag> [active/blacklisted]\`
- \`_honor <tag> [+/-pts] [reason]\`
- \`_addmod <tag/reply> [name]\`
- \`_addsudo <tag/reply> [name]\`
- \`_delete <tag>\` : ʀᴇᴍᴏᴠᴇ ᴍᴇᴍʙᴇʀ

✦ *ᴜᴛɪʟɪᴛɪᴇꜱ & ᴍᴀɴᴀɢᴇᴍᴇɴᴛ:*
- \`_cs\` | \`_checkstatus\` : ᴄʜᴇᴄᴋ ᴀʙꜱᴇɴᴛ ᴍᴇᴍʙᴇʀꜱ
- \`_warn\` : ᴡᴀʀɴɪɴɢ ꜰᴏʀ ᴇxᴘɪʀɪɴɢ ᴛɪᴍᴇʀꜱ
- \`_blacklist\` | \`_bl\` : ꜱʜᴏᴡ ʙʟᴀᴄᴋʟɪꜱᴛᴇᴅ ᴍᴇᴍʙᴇʀꜱ
- \`_del\` : ᴅᴇʟᴇᴛᴇꜱ ᴀ ʀᴇᴘʟɪᴇᴅ ᴍᴇꜱꜱᴀɢᴇ
- \`_gid\` : ɢᴇᴛ ᴛʜɪꜱ ɢʀᴏᴜᴘ'ꜱ ɪᴅ
- \`_id <tag>\` : ɢᴇᴛ ᴜꜱᴇʀ ɪᴅ (ʀᴇᴘʟʏ/ᴛᴀɢ)
- \`_sync\` : ꜱʏɴᴄ ᴘʀᴏꜰɪʟᴇ ᴘɪᴄᴛᴜʀᴇꜱ

──────────────────────
*ᴄᴏɴꜰɪʀᴍᴀᴛɪᴏɴ:* \`_yes\` or \`_no\``;
      await sock.sendMessage(chatId, { text: menu });
      return;
    }

    if (cmd === '_blacklist' || cmd === '_bl') {
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const allMods = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        
        allMods.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
        const blacklisted = allMods.filter(m => m.status === 'blacklisted');

        if (blacklisted.length === 0) {
           await sock.sendMessage(chatId, { text: "✦ ɴᴏ ᴍᴇᴍʙᴇʀꜱ ᴀʀᴇ ᴄᴜʀʀᴇɴᴛʟʏ ꜱᴜꜱᴘᴇɴᴅᴇᴅ/ʙʟᴀᴄᴋʟɪꜱᴛᴇᴅ." });
           return;
        }

        let res = `╔═════════════════════════╗\n`;
        res    += `║   🚫 *𝗕𝗟𝗔𝗖𝗞𝗟𝗜𝗦𝗧𝗘𝗗* 🚫     ║\n`;
        res    += `╚═════════════════════════╝\n\n`;

        blacklisted.forEach((m, idx) => {
           res += `  ${idx+1}. 🚫 *${m.name.toUpperCase()}*\n`;
        });
        
        res += `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sock.sendMessage(chatId, { text: res });
      } catch (e) { await sock.sendMessage(chatId, { text: `✕ Error retrieving blacklist.` }); }
      return;
    }

    if (cmd === '_list') {
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const allMods = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        
        // Sort by points descending
        allMods.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

        const activeMods = allMods.filter(m => m.status !== 'blacklisted');
        const officers = activeMods.filter(m => m.role?.toLowerCase() === 'officer');
        const moderators = activeMods.filter(m => m.role?.toLowerCase() !== 'officer');

        const formatTimerInline = (deadline: number | undefined) => {
           if (!deadline) return "∞";
           const diff = deadline - Date.now();
           if (diff <= 0) return "🚨 EXPIRED";
           const d = Math.floor(diff / (1000 * 60 * 60 * 24));
           const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
           return `⏱ ${d}d ${h}h`;
        };

        let res = `╔═════════════════════════╗\n`;
        res    += `║   ❖ 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧 𝗗𝗜𝗥𝗘𝗖𝗧𝗢𝗥𝗬 ❖   ║\n`;
        res    += `╚═════════════════════════╝\n\n`;

        let counter = 1;

        if (officers.length > 0) {
          res += `  「 👑 *𝗢𝗙𝗙𝗜𝗖𝗘𝗥𝗦* 」\n`;
          res += `  ──────────────────\n`;
          officers.forEach((m) => {
             const stat = m.status === 'blacklisted' ? '🚫' : '✅';
             res += `  ${counter++}. ${stat} *${m.name.toUpperCase()}*\n`;
             res += `     └─ 🏆 ᴘᴛꜱ: ${m.totalPoints || 0}\n\n`;
          });
        }

        if (moderators.length > 0) {
          res += `  「 🛡️ *𝗠𝗢𝗗𝗘𝗥𝗔𝗧𝗢𝗥𝗦* 」\n`;
          res += `  ──────────────────\n`;
          moderators.forEach((m) => {
             const stat = m.status === 'blacklisted' ? '🚫' : '✅';
             const tmr = m.status === 'blacklisted' ? '🛑 SUSPENDED' : formatTimerInline(m.deadlineAt);
             res += `  ${counter++}. ${stat} *${m.name.toUpperCase()}*\n`;
             res += `     └─ 🏆 ᴘᴛꜱ: ${m.totalPoints || 0} | ${tmr}\n\n`;
          });
        }
        
        res += `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sock.sendMessage(chatId, { text: res });
      } catch (e) { await sock.sendMessage(chatId, { text: `✕ Error retrieving directory.` }); }
      return;
    }

    const modResult = await findMod(parts[1]);
    if (modResult === 'NOT_FOUND') {
       await sock.sendMessage(chatId, { text: `✕ ${parts[1] || 'This user'} is not the part of management.` });
       return;
    }
    const targetMod = modResult;

    if (!targetMod && ['_info', '_pdfinfo', '_draft', '_entry', '_submit', '_honor', '_status', '_delete'].includes(cmd)) {
       await sock.sendMessage(chatId, { text: "✦ ᴘʟᴇᴀꜱᴇ target ᴀ ᴜꜱᴇʀ (reply, tag, or name)." });
       return;
    }

    try {
      if (cmd === '_info') {
        const m = targetMod;
        await sock.sendMessage(chatId, { text: `👤 *ᴍᴇᴍʙᴇʀ ɪɴꜰᴏ:* ${m.name.toUpperCase()}\n──────────────────\nʀᴏʟᴇ: ${m.role || 'MOD'}\nꜱᴛᴀᴛᴜꜱ: ${m.status || 'ACTIVE'}\nᴘᴏɪɴᴛꜱ: ${m.totalPoints || 0}\nʜᴏɴᴏʀ: ${m.honorScore || 100}` });
      }
      else if (cmd === '_pdfinfo') {
        const m = targetMod;
        await sock.sendMessage(chatId, { text: "✦ ɢᴇɴᴇʀᴀᴛɪɴɢ ᴘᴅꜰ ʀᴇᴘᴏʀᴛ... ᴘʟᴇᴀꜱᴇ ᴡᴀɪᴛ." });
        
        try {
          const PDFDocument = require('pdfkit');
          const pdfBuffer = await new Promise<Buffer>((resolve) => {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            
            // Background
            doc.rect(0, 0, doc.page.width, doc.page.height).fill('#111111');
            doc.fillColor('#FFFFFF');
            
            doc.font('Helvetica-Bold').fontSize(24).text('MEMBER REPORT', { align: 'center' });
            doc.moveDown();
            
            doc.font('Helvetica').fontSize(14).text(`Name: ${m.name.toUpperCase()}`);
            doc.moveDown(0.5);
            doc.text(`Phone: ${m.phone || m.phoneNumber}`);
            doc.moveDown(0.5);
            doc.text(`Role: ${m.role || 'MODERATOR'}`);
            doc.moveDown(0.5);
            doc.text(`Status: ${m.status || 'ACTIVE'}`);
            doc.moveDown(0.5);
            doc.text(`Total Points: ${m.totalPoints || 0}`);
            doc.moveDown(0.5);
            doc.text(`Honor Score: ${m.honorScore || 100}`);
            doc.moveDown(0.5);
            
            const diff = m.deadlineAt ? m.deadlineAt - Date.now() : null;
            let timerStr = "NO DEADLINE";
            if (diff !== null) {
               if (diff <= 0) { timerStr = "EXPIRED"; }
               else {
                 const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                 const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                 timerStr = `${d}d ${h}h`;
               }
            }
            doc.text(`Timer: ${timerStr}`);
            
            // Get entries / drafts info optionally
            doc.end();
          });
          
          await sock.sendMessage(chatId, { 
            document: pdfBuffer, 
            mimetype: 'application/pdf', 
            fileName: `${m.name.toUpperCase()}_REPORT.pdf`,
            caption: `📄 *ᴘᴅꜰ ʀᴇᴘᴏʀᴛ ꜰᴏʀ ${m.name.toUpperCase()}*`
          });
        } catch (err: any) {
             await sock.sendMessage(chatId, { text: `✕ ᴘᴅꜰ ɢᴇɴᴇʀᴀᴛɪᴏɴ ꜰᴀɪʟᴇᴅ: ${err.message}` });
        }
      }
      else if (cmd === '_draft') {
        const isNamed = parts[1]?.toLowerCase() === targetMod.name.toLowerCase() || parts[1]?.startsWith('@');
        const remaining = parts.slice(isNamed ? 2 : 1);
        let points = 1.0;
        let draftText = remaining.join(' ');
        if (remaining.length > 1) {
          const lp = remaining[remaining.length - 1];
          const pts = parseFloat(lp);
          if (!isNaN(pts)) { points = pts; draftText = remaining.slice(0, -1).join(' '); }
        }
        if (draftText) {
          pendingCommands.set(sender, {
            desc: `ᴀᴅᴅ ᴅʀᴀꜰᴛ ᴛᴏ ${targetMod.name.toUpperCase()} (${points} ᴘᴛꜱ)`,
            execute: async () => {
              const id = crypto.randomUUID();
              await setDoc(doc(db, `mods/${targetMod.id}/drafts/${id}`), { 
                text: draftText, 
                createdAt: Date.now(), 
                points: points,
                bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
              });
            }
          });
          await sock.sendMessage(chatId, { text: `❓ *ᴄᴏɴꜰɪʀᴍ ᴅʀᴀꜰᴛ ꜰᴏʀ ${targetMod.name.toUpperCase()}?*\n\nᴅᴇᴛᴀɪʟꜱ: "${draftText}"\nᴘᴏɪɴᴛꜱ: ${points}\n\n_yes / _no` });
        }
      }
      else if (cmd === '_addmod') {
        let name = parts[1]; 
        let phone = parts[2]?.replace(/\D/g, '');
        
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        if (quotedParticipant) {
           phone = quotedParticipant.split('@')[0];
        } else if (mentionedJids.length > 0) {
           phone = mentionedJids[0].split('@')[0];
        }
        
        if (!name || name.startsWith('@')) name = "Moderator";

        if (name && phone) {
           pendingCommands.set(sender, {
              desc: `ʀᴇɢɪꜱᴛᴇʀ: ${name.toUpperCase()} (${phone})`,
              execute: async () => {
                const id = crypto.randomUUID();
                await setDoc(doc(db, `mods/${id}`), { 
                  name, 
                  phone, 
                  phoneNumber: phone, 
                  whatsappJid: `${phone}@s.whatsapp.net`,
                  role: 'moderator', 
                  status: 'active', 
                  totalPoints: 0, 
                  createdAt: Date.now(),
                  bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
                });
              }
           });
           await sock.sendMessage(chatId, { text: `❓ *ʀᴇɢɪꜱᴛᴇʀ ${name.toUpperCase()}?*\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes / _no` });
        } else {
           await sock.sendMessage(chatId, { text: `✕ ᴘʟᴇᴀꜱᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ɴᴜᴍʙᴇʀ, ᴏʀ ʀᴇᴘʟʏ/ᴛᴀɢ ᴛʜᴇ ᴜꜱᴇʀ.` });
        }
      }
      else if (cmd === '_addsudo' || cmd === '_addofficer') {
        let name = parts[1]; 
        let phone = parts[2]?.replace(/\D/g, '');
        
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        if (quotedParticipant) {
           phone = quotedParticipant.split('@')[0];
        } else if (mentionedJids.length > 0) {
           phone = mentionedJids[0].split('@')[0];
        }
        
        if (!name || name.startsWith('@')) name = "Officer";

        if (name && phone) {
           pendingCommands.set(sender, {
              desc: `ʀᴇɢɪꜱᴛᴇʀ ᴏꜰꜰɪᴄᴇʀ: ${name.toUpperCase()} (${phone})`,
              execute: async () => {
                const id = crypto.randomUUID();
                await setDoc(doc(db, `mods/${id}`), { 
                  name, 
                  phone, 
                  phoneNumber: phone, 
                  whatsappJid: `${phone}@s.whatsapp.net`,
                  role: 'officer', 
                  status: 'active', 
                  totalPoints: 0, 
                  createdAt: Date.now(),
                  bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
                });
              }
           });
           await sock.sendMessage(chatId, { text: `❓ *ʀᴇɢɪꜱᴛᴇʀ ᴏꜰꜰɪᴄᴇʀ ${name.toUpperCase()}?*\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes / _no` });
        } else {
           await sock.sendMessage(chatId, { text: `✕ ᴘʟᴇᴀꜱᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ɴᴜᴍʙᴇʀ, ᴏʀ ʀᴇᴘʟʏ/ᴛᴀɢ ᴛʜᴇ ᴜꜱᴇʀ.` });
        }
      }
    } catch (e: any) { await sock.sendMessage(chatId, { text: `✕ Error: ${e.message}` }); }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // API Routes
  app.get('/api/whatsapp/status', (req, res) => {
    res.json({ 
      connected: connectionStatus === 'open',
      registered: !!sock?.user,
      initialising: connectionStatus === 'connecting'
    });
  });

  app.post('/api/whatsapp/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false, error: "Phone number required" });
    const formattedNumber = phoneNumber.replace(/\D/g, '');

    try {
      // 1. Ensure fresh start if closed
      if (!sock || connectionStatus === 'close') {
        console.log(">>> [API] Booting engine...");
        await startWhatsAppBot();
      }

      // 2. WAIT FOR READINESS (QR must be emitted at least once)
      let wait = 0;
      console.log(">>> [API] Waiting for handshake readiness...");
      while (!lastQR && !sock?.user && wait < 45) {
        await new Promise(r => setTimeout(r, 1000));
        wait++;
      }

      if (sock?.user) return res.status(400).json({ success: false, error: "Bot is already connected." });
      if (!lastQR) throw new Error("Connection timed out. Please try Reset and try again.");

      // 3. Stabilization delay before code request
      await new Promise(r => setTimeout(r, 2000));

      // 4. Request Pairing
      console.log(`>>> [API] Requesting Code for: ${formattedNumber}`);
      try {
        const code = await sock.requestPairingCode(formattedNumber);
        console.log(`>>> [API] VALID CODE GENERATED: ${code}`);
        res.json({ success: true, code });
      } catch (err: any) {
        if (err.message.includes('already connected')) {
           return res.status(400).json({ success: false, error: "Bot already linked." });
        }
        throw err;
      }
    } catch (e: any) {
      console.error(">>> [API] Pairing Failed:", e);
      res.status(500).json({ success: false, error: e.message || "Failed to generate pairing code." });
    }
  });

  app.post('/api/whatsapp/logout', async (req, res) => {
    try {
      console.log(">>> [API] Full Reset Sequence Initiated...");
      if (sock) {
        try { await sock.logout(); } catch(e){}
        try { sock.end(undefined); } catch(e){}
      }
      
      connectionStatus = 'close';
      sock = null;
      lastQR = null;

      // Wipe Firestore
      const snap = await getDocs(collection(db, 'whatsapp_sessions_v2'));
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();

      res.json({ success: true });
      setTimeout(startWhatsAppBot, 3000);
    } catch (e: any) {
      console.error(">>> [API] Logout Error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> [SERVER] Running on Port ${PORT}`);
    setupCronJobs();
    startWhatsAppBot().catch(console.error);
  });
}

startServer();
