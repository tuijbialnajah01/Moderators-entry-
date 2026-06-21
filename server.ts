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

// Initialize Firebase
const appFirebase = initializeApp(firebaseConfig, "backend-v2");
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

const OWNERS = [
  "919891478164@s.whatsapp.net",
  "2349060947343@s.whatsapp.net"
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
            await updateDoc(d.ref, { avatarUrl: url, updatedAt: Date.now() });
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error("Profile sync error:", e);
  }
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
    browser: ["Chrome (Linux)", "Chrome", "110.0.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
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
        setTimeout(startWhatsAppBot, 5000);
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
    if (!msg.message || msg.key.fromMe || !sock) return;

    const sender = msg.key.remoteJid;
    if (!sender) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text.startsWith('_')) return;

    if (!OWNERS.includes(sender)) {
      // Optional: Inform non-owners they lack access
      // await sock.sendMessage(sender, { text: "✕ Access Denied." });
      return;
    }

    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    // Command Logic
    if (cmd === '_yes') {
      const pending = pendingCommands.get(sender);
      if (!pending) {
        await sock.sendMessage(sender, { text: "✧ ɴᴏ ᴀᴄᴛɪᴠᴇ ᴄᴏᴍᴍᴀɴᴅ ᴀᴡᴀɪᴛɪɴɢ ᴄᴏɴꜰɪʀᴍᴀᴛɪᴏɴ." });
        return;
      }
      pendingCommands.delete(sender);
      try {
        await pending.execute();
        await sock.sendMessage(sender, { text: `✦ *ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ᴇxᴇᴄᴜᴛᴇᴅ:* ${pending.desc}` });
      } catch (e: any) {
        await sock.sendMessage(sender, { text: `✕ *ᴇxᴇᴄᴜᴛɪᴏɴ ꜰᴀɪʟᴇᴅ:* ${e.message}` });
      }
      return;
    }

    if (cmd === '_no') {
      pendingCommands.delete(sender);
      await sock.sendMessage(sender, { text: "✕ ᴄᴏᴍᴍᴀɴᴅ ᴅɪꜱᴄᴀʀᴅᴇᴅ." });
      return;
    }

    const findMod = async (targetPart?: string) => {
      const snap = await getDocs(collection(db, 'mods'));
      const allMods = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, ref: doc.ref }));
      
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (quotedParticipant) {
        const phone = quotedParticipant.split('@')[0];
        return allMods.find(m => (m.phone || m.phoneNumber || '').replace(/\D/g, '') === phone.replace(/\D/g, '')) || 'NOT_FOUND';
      }

      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (mentionedJids.length > 0) {
        const phone = mentionedJids[0].split('@')[0];
        return allMods.find(m => (m.phone || m.phoneNumber || '').replace(/\D/g, '') === phone.replace(/\D/g, '')) || 'NOT_FOUND';
      }

      if (targetPart) {
        const cleanPart = targetPart.replace(/^@/, '').toLowerCase();
        return allMods.find(m => m.name.toLowerCase() === cleanPart || (m.phone || m.phoneNumber || '').replace(/\D/g, '') === cleanPart.replace(/\D/g, '')) || 'NOT_FOUND';
      }
      return null;
    };

    if (cmd === '_sync') {
       await syncProfilePictures(sock);
       await sock.sendMessage(sender, { text: "✦ *ᴀᴠᴀᴛᴀʀ ꜱʏɴᴄʜʀᴏɴɪᴢᴀᴛɪᴏɴ ᴄᴏᴍᴘʟᴇᴛᴇ.*" });
       return;
    }

    if (cmd === '_menu') {
      await sock.sendMessage(sender, { text: `❖ *ꜱʏꜱᴛᴇᴍ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ᴍᴇɴᴜ* ❖\n──────────────────────\nᴘʀᴇꜰɪx: \`_\`\n\n✦ *ᴄᴏʀᴇ ᴄᴏᴍᴍᴀɴᴅꜱ:*\n- _list : ᴍᴇᴍʙᴇʀ ʟɪꜱᴛ\n- _info : ᴘʀᴏꜰɪʟᴇ ᴅᴇᴛᴀɪʟꜱ\n- _draft [ᴛᴇxᴛ] [ᴘᴛꜱ] : ᴀᴅᴅ ᴅʀᴀꜰᴛ\n- _entry [ᴘᴛꜱ] [ᴛᴇxᴛ] : ᴅɪʀᴇᴄᴛ ᴇɴᴛʀʏ\n- _submit : ᴘʀᴏᴄᴇꜱꜱ ᴅʀᴀꜰᴛꜱ\n- _honor [+/-ᴘᴛꜱ] [ʀᴇᴀꜱᴏɴ]\n- _status [ᴀᴄᴛɪᴠᴇ/ʙʟᴀᴄᴋʟɪꜱᴛ]\n- _addmod [ɴᴀᴍᴇ] [ᴘʜᴏɴᴇ]\n- _delete : ᴛᴇʀᴍɪɴᴀᴛᴇ\n- _sync : ᴜᴘᴅᴀᴛᴇ ᴘɪᴄꜱ\n\n──────────────────────\n*ᴄᴏɴꜰɪʀᴍᴀᴛɪᴏɴ:* \`_yes\` or \`_no\`` });
      return;
    }

    if (cmd === '_list') {
      try {
        const snap = await getDocs(collection(db, 'mods'));
        let res = `👥 *ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ᴅɪʀᴇᴄᴛᴏʀʏ*\n──────────────────\n\n`;
        snap.docs.forEach((d, idx) => {
          const m = d.data();
          const stat = m.status === 'blacklisted' ? '🚫' : '✅';
          res += `${idx+1}. ${stat} *${m.name.toUpperCase()}*\n   └─ ᴘᴛꜱ: ${m.totalPoints || 0}\n\n`;
        });
        await sock.sendMessage(sender, { text: res });
      } catch (e) { await sock.sendMessage(sender, { text: `✕ Error retrieving directory.` }); }
      return;
    }

    const modResult = await findMod(parts[1]);
    if (modResult === 'NOT_FOUND') {
       await sock.sendMessage(sender, { text: "✕ ᴛʜɪꜱ ɪɴᴅɪᴠɪᴅᴜᴀʟ ɪꜱ ɴᴏᴛ ɪɴ ᴛʜᴇ ꜱʏꜱᴛᴇᴍ." });
       return;
    }
    const targetMod = modResult;

    if (!targetMod && ['_info', '_draft', '_entry', '_submit', '_honor', '_status', '_delete'].includes(cmd)) {
       await sock.sendMessage(sender, { text: "✦ ᴘʟᴇᴀꜱᴇ target ᴀ ᴜꜱᴇʀ (reply, tag, or name)." });
       return;
    }

    try {
      if (cmd === '_info') {
        const m = targetMod;
        await sock.sendMessage(sender, { text: `👤 *ᴍᴇᴍʙᴇʀ ɪɴꜰᴏ:* ${m.name.toUpperCase()}\n──────────────────\nʀᴏʟᴇ: ${m.role || 'MOD'}\nꜱᴛᴀᴛᴜꜱ: ${m.status || 'ACTIVE'}\nᴘᴏɪɴᴛꜱ: ${m.totalPoints || 0}\nʜᴏɴᴏʀ: ${m.honorScore || 100}` });
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
              await setDoc(doc(db, `mods/${targetMod.id}/drafts/${id}`), { text: draftText, createdAt: Date.now(), points: points });
            }
          });
          await sock.sendMessage(sender, { text: `❓ *ᴄᴏɴꜰɪʀᴍ ᴅʀᴀꜰᴛ ꜰᴏʀ ${targetMod.name.toUpperCase()}?*\n\nᴅᴇᴛᴀɪʟꜱ: "${draftText}"\nᴘᴏɪɴᴛꜱ: ${points}\n\n_yes / _no` });
        }
      }
      else if (cmd === '_addmod') {
        const name = parts[1]; const phone = parts[2]?.replace(/\D/g, '');
        if (name && phone) {
          pendingCommands.set(sender, {
             desc: `ʀᴇɢɪꜱᴛᴇʀ: ${name.toUpperCase()} (${phone})`,
             execute: async () => {
               const id = crypto.randomUUID();
               await setDoc(doc(db, `mods/${id}`), { name, phone, phoneNumber: phone, role: 'moderator', status: 'active', totalPoints: 0, createdAt: Date.now() });
             }
          });
          await sock.sendMessage(sender, { text: `❓ *ʀᴇɢɪꜱᴛᴇʀ ${name.toUpperCase()}?*` });
        }
      }
    } catch (e: any) { await sock.sendMessage(sender, { text: `✕ Error: ${e.message}` }); }
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
      // 1. If connection found, checks if already logged in
      if (sock?.user) return res.status(400).json({ success: false, error: "Already connected." });

      // 2. Ensure engine is warming up
      if (!sock || connectionStatus === 'close') {
        console.log(">>> [API] Booting engine for pairing...");
        startWhatsAppBot().catch(console.error);
      }

      // 3. Wait for readiness
      let wait = 0;
      while (!lastQR && !sock?.user && wait < 45) {
        await new Promise(r => setTimeout(r, 1000));
        wait++;
      }

      if (sock?.user) return res.status(400).json({ success: false, error: "Logged in automatically." });
      if (!lastQR || !sock) throw new Error("Connection failed to warm up. Please refresh and try again.");

      // 4. Request Pairing
      console.log(`>>> [API] Generating code for: ${formattedNumber}`);
      await new Promise(r => setTimeout(r, 2000));
      const code = await sock.requestPairingCode(formattedNumber);
      
      res.json({ success: true, code });
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
    startWhatsAppBot().catch(console.error);
  });
}

startServer();
