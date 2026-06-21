import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, initAuthCreds, BufferJSON, Browsers } from "@whiskeysockets/baileys";
import pino from "pino";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, updateDoc, writeBatch } from "firebase/firestore";
import fs from "fs";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };
import crypto from "crypto";

// Initialize Firebase for backend
const appFirebase = initializeApp(firebaseConfig, "backend");
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

// Basic mapping of WhatsApp owners
const OWNERS = [
  "919891478164@s.whatsapp.net",
  "2349060947343@s.whatsapp.net"
];

// Custom Auth State using Firestore
async function useFirestoreAuthState(collectionName: string) {
  const writeData = async (data: any, id: string) => {
    try {
      const docRef = doc(db, collectionName, id.replace(/\//g, '-'));
      await setDoc(docRef, { data: JSON.stringify(data, BufferJSON.replacer, 2) });
    } catch (error) {
      console.error("Error writing auth state to Firestore", error);
    }
  };

  const readData = async (id: string) => {
    try {
      const docRef = doc(db, collectionName, id.replace(/\//g, '-'));
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        return JSON.parse(data.data, BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      console.error("Error reading auth state from Firestore", id, error);
      return null;
    }
  };

  const removeData = async (id: string) => {
    try {
      const docRef = doc(db, collectionName, id.replace(/\//g, '-'));
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error removing auth state from Firestore", error);
    }
  };

  const creds = await readData("creds") || initAuthCreds();

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
              let fileId = `${category}-${id}`;
              if (value) {
                let saveValue = value;
                if (category === 'app-state-sync-key' && value.syncKey) {
                  saveValue = { ...value, syncKey: value.syncKey.toString('base64') };
                }
                tasks.push(writeData(saveValue, fileId));
              } else {
                tasks.push(removeData(fileId));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, "creds")
  };
}

const sessions = new Map<string, any>();
const pendingCommands = new Map<string, any>();

async function syncProfilePictures(sock: any) {
  try {
    const snap = await getDocs(collection(db, 'mods'));
    for (const d of snap.docs) {
      const mod = d.data();
      const p = mod.phone || mod.phoneNumber;
      if (p) {
        const jid = p.includes('@') ? p : `${p.replace(/\D/g, '')}@s.whatsapp.net`;
        try {
          const url = await sock.profilePictureUrl(jid, 'image');
          if (url) {
            await updateDoc(d.ref, { avatarUrl: url, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          }
        } catch (e) {
          // No profile pic or error
        }
      }
    }
  } catch (e) {
    console.error("Profile sync error:", e);
  }
}

async function startWhatsAppBot() {
  const { state, saveCreds } = await useFirestoreAuthState('whatsapp_sessions');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }) as any,
    browser: Browsers.ubuntu('Chrome')
  });

  sessions.set('default', sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startWhatsAppBot();
      }
    } else if (connection === 'open') {
      console.log('WhatsApp connection opened successfully');
      await syncProfilePictures(sock);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    if (!sender || !OWNERS.includes(sender)) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text.startsWith('_')) return;

    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    if (cmd === '_yes') {
      const pending = pendingCommands.get(sender);
      if (!pending) {
        await sock.sendMessage(sender, { text: "✧ ɴᴏ ᴘᴇɴᴅɪɴɢ ᴄᴏᴍᴍᴀɴᴅꜱ ꜰᴏᴜɴᴅ ᴛᴏ ᴄᴏɴꜰɪʀᴍ." });
        return;
      }
      pendingCommands.delete(sender);
      
      try {
        await pending.execute();
        await sock.sendMessage(sender, { text: `✦ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ᴇxᴇᴄᴜᴛᴇᴅ: *${pending.desc}*` });
      } catch (e: any) {
        await sock.sendMessage(sender, { text: `✕ ᴇxᴇᴄᴜᴛɪᴏɴ ꜰᴀɪʟᴇᴅ: ${e.message}` });
      }
      return;
    }

    if (cmd === '_no') {
      pendingCommands.delete(sender);
      await sock.sendMessage(sender, { text: "✕ ᴄᴏᴍᴍᴀɴᴅ ʜᴀꜱ ʙᴇᴇɴ ᴄᴀɴᴄᴇʟʟᴇᴅ." });
      return;
    }

    const findMod = async (targetPart?: string) => {
      const snap = await getDocs(collection(db, 'mods'));
      const allMods = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, ref: doc.ref }));
      
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (mentionedJids.length > 0) {
        const phone = mentionedJids[0].split('@')[0];
        const m = allMods.find(m => {
          const p = m.phone || m.phoneNumber;
          return p && p.replace(/\D/g, '') === phone.replace(/\D/g, '');
        });
        if (m) return m;
        return 'NOT_FOUND';
      }

      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (quotedParticipant) {
        const phone = quotedParticipant.split('@')[0];
        const m = allMods.find(m => {
          const p = m.phone || m.phoneNumber;
          return p && p.replace(/\D/g, '') === phone.replace(/\D/g, '');
        });
        if (m) return m;
        return 'NOT_FOUND';
      }

      if (targetPart) {
        const cleanPart = targetPart.replace(/^@/, '').toLowerCase();
        const m = allMods.find(m => m.name.toLowerCase() === cleanPart);
        if (m) return m;
        return 'NOT_FOUND';
      }
      return null;
    };

    if (cmd === '_sync') {
       await syncProfilePictures(sock);
       await sock.sendMessage(sender, { text: "✦ ᴘʀᴏꜰɪʟᴇ ᴘɪᴄᴛᴜʀᴇꜱ ꜱʏɴᴄᴇᴅ." });
       return;
    }

    if (cmd === '_menu') {
      await sock.sendMessage(sender, { text: `❖ *ꜱʏꜱᴛᴇᴍ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ʙᴏᴛ* ❖
──────────────────
ᴘʀᴇꜰɪx: \`_\`

*ᴄᴏʀᴇ ᴄᴏᴍᴍᴀɴᴅꜱ:*
- _list : ᴠɪᴇᴡ ᴀʟʟ ᴍᴇᴍʙᴇʀꜱ
- _info : ᴅᴇᴛᴀɪʟᴇᴅ ᴘʀᴏꜰɪʟᴇ
- _draft [ᴛᴇxᴛ] [ᴘᴛꜱ] : ᴀᴅᴅ ᴅʀᴀꜰᴛ
- _entry [ᴘᴛꜱ] [ᴛᴇxᴛ] : ᴅɪʀᴇᴄᴛ ᴇɴᴛʀʏ
- _submit : ᴘʀᴏᴄᴇꜱꜱ ᴘᴇɴᴅɪɴɢ ᴅʀᴀꜰᴛꜱ
- _honor [+/-ᴘᴛꜱ] [ʀᴇᴀꜱᴏɴ]
- _status [ᴀᴄᴛɪᴠᴇ/ʙʟᴀᴄᴋʟɪꜱᴛ]
- _role [ᴍᴏᴅ/ᴏꜰꜰɪᴄᴇʀ]
- _addmod [ɴᴀᴍᴇ] [ᴘʜᴏɴᴇ] [ɢʀᴏᴜᴘ]
- _delete : ʀᴇᴍᴏᴠᴇ ᴍᴇᴍʙᴇʀ
- _sync : ꜱʏɴᴄ ᴀᴠᴀᴛᴀʀꜱ

*ᴜꜱᴀɢᴇ ᴍᴇᴛʜᴏᴅꜱ:*
✦ ʀᴇᴘʟʏ ᴛᴏ ᴍᴇꜱꜱᴀɢᴇ
✦ ᴛᴀɢ @ᴜꜱᴇʀ
✦ ᴜꜱᴇ ɴᴀᴍᴇ ᴅɪʀᴇᴄᴛʟʏ

──────────────────
*ᴄᴏɴꜰɪʀᴍᴀᴛɪᴏɴ:* ᴜꜱᴇ \`_yes\` or \`_no\`` });
      return;
    }

    if (cmd === '_list') {
      try {
        const snap = await getDocs(collection(db, 'mods'));
        let res = `👥 *ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ᴅɪʀᴇᴄᴛᴏʀʏ*\n\n`;
        snap.docs.forEach((d, idx) => {
          const m = d.data();
          const role = m.role === 'officer' ? '⭐' : '🛡️';
          const stat = m.status === 'blacklisted' ? '🚫' : '✅';
          res += `${idx+1}. ${stat} [${role}] *${m.name}* | ᴘᴛꜱ: ${m.totalPoints || 0}\n`;
        });
        await sock.sendMessage(sender, { text: res });
      } catch (e) { await sock.sendMessage(sender, { text: `✕ ᴇʀʀᴏʀ ꜰᴇᴛᴄʜɪɴɢ ʟɪꜱᴛ.` }); }
      return;
    }

    const modResult = await findMod(parts[1]);
    if (modResult === 'NOT_FOUND') {
       await sock.sendMessage(sender, { text: "✕ ᴛʜɪꜱ ᴘᴇʀꜱᴏɴ ɪꜱ ɴᴏᴛ ᴘᴀʀᴛ ᴏꜰ ᴛʜᴇ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ." });
       return;
    }
    const mod = modResult;

    if (!mod && ['_info', '_draft', '_entry', '_submit', '_honor', '_status', '_role', '_group', '_delete'].includes(cmd)) {
       await sock.sendMessage(sender, { text: "✕ ᴘʟᴇᴀꜱᴇ ᴛᴀɢ ᴀ ᴜꜱᴇʀ ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇꜱꜱᴀɢᴇ." });
       return;
    }

    try {
      if (cmd === '_info') {
        await sock.sendMessage(sender, { text: `👤 *ᴍᴇᴍʙᴇʀ ᴘʀᴏꜰɪʟᴇ:* \n\nɴᴀᴍᴇ: ${mod.name}\nʀᴏʟᴇ: ${mod.role.toUpperCase()}\nꜱᴛᴀᴛᴜꜱ: ${mod.status.toUpperCase()}\nᴘᴏɪɴᴛꜱ: ${mod.totalPoints || 0}\nʜᴏɴᴏʀ: ${mod.honorScore || 100}` });
      }
      else if (cmd === '_draft') {
        const isNamed = parts[1]?.toLowerCase() === mod.name.toLowerCase() || parts[1]?.startsWith('@');
        const remainingParts = parts.slice(isNamed ? 2 : 1);
        
        let points = 1.0;
        let draftText = remainingParts.join(' ');
        
        if (remainingParts.length > 1) {
          const possiblePts = parseFloat(remainingParts[remainingParts.length - 1]);
          if (!isNaN(possiblePts)) {
            points = possiblePts;
            draftText = remainingParts.slice(0, -1).join(' ');
          }
        }

        if (draftText) {
          pendingCommands.set(sender, {
            desc: `ᴀᴅᴅ ᴅʀᴀꜰᴛ ᴛᴏ ${mod.name}: "${draftText}" (${points} ᴘᴛꜱ)`,
            execute: async () => {
              const draftId = crypto.randomUUID();
              await setDoc(doc(db, `mods/${mod.id}/drafts/${draftId}`), { text: draftText, createdAt: Date.now(), createdBy: 'whatsapp_bot', points: points, bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
            }
          });
          await sock.sendMessage(sender, { text: `❓ *ᴄᴏɴꜰɪʀᴍ ᴅʀᴀꜰᴛ ꜰᴏʀ ${mod.name.toUpperCase()}?*\n\nᴅᴇᴛᴀɪʟꜱ: "${draftText}"\nᴘᴏɪɴᴛꜱ: ${points}\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
        }
      }
      else if (cmd === '_submit') {
        const draftsSnap = await getDocs(collection(db, `mods/${mod.id}/drafts`));
        if (draftsSnap.empty) { await sock.sendMessage(sender, { text: `✕ ɴᴏ ᴘᴇɴᴅɪɴɢ ᴅʀᴀꜰᴛꜱ ꜰᴏʀ ${mod.name}.` }); return; }
        pendingCommands.set(sender, {
           desc: `ꜱᴜʙᴍɪᴛ ᴀʟʟ ᴅʀᴀꜰᴛꜱ ꜰᴏʀ ${mod.name}`,
           execute: async () => {
              let tp = 0; let ct = ''; const batch = writeBatch(db);
              draftsSnap.forEach(d => { tp += d.data().points || 0; ct += d.data().text + '\n'; batch.delete(d.ref); });
              const eid = crypto.randomUUID();
              batch.set(doc(db, `mods/${mod.id}/entries/${eid}`), { text: ct, points: tp, createdAt: Date.now(), createdBy: 'whatsapp_bot', bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
              batch.update(mod.ref, { totalPoints: (mod.totalPoints || 0) + tp, entryCount: (mod.entryCount || 0) + 1, lastEntryAt: Date.now(), deadlineAt: Date.now() + 7 * 24 * 60 * 60 * 1000, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
              await batch.commit();
           }
        });
        await sock.sendMessage(sender, { text: `❓ *ꜱᴜʙᴍɪᴛ ᴀʟʟ ᴘᴇɴᴅɪɴɢ ᴅʀᴀꜰᴛꜱ ꜰᴏʀ ${mod.name.toUpperCase()}?*\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
      }
      else if (cmd === '_entry') {
        const isNamed = parts[1]?.toLowerCase() === mod.name.toLowerCase() || parts[1]?.startsWith('@');
        const pts = parseFloat(parts[isNamed ? 2 : 1]);
        const txt = parts.slice(isNamed ? 3 : 2).join(' ');
        if (!isNaN(pts) && txt) {
          pendingCommands.set(sender, {
            desc: `ᴀᴅᴅ ᴅɪʀᴇᴄᴛ ᴇɴᴛʀʏ ᴛᴏ ${mod.name}: ${pts} ᴘᴛꜱ`,
            execute: async () => {
              const eid = crypto.randomUUID(); const batch = writeBatch(db);
              batch.set(doc(db, `mods/${mod.id}/entries/${eid}`), { text: txt, points: pts, createdAt: Date.now(), createdBy: 'whatsapp_bot', bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
              batch.update(mod.ref, { totalPoints: (mod.totalPoints || 0) + pts, entryCount: (mod.entryCount || 0) + 1, lastEntryAt: Date.now(), deadlineAt: Date.now() + 7 * 24 * 60 * 60 * 1000, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
              await batch.commit();
            }
          });
          await sock.sendMessage(sender, { text: `❓ *ᴄᴏɴꜰɪʀᴍ ᴅɪʀᴇᴄᴛ ᴇɴᴛʀʏ ꜰᴏʀ ${mod.name.toUpperCase()}?*\nᴘᴏɪɴᴛꜱ: ${pts}\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
        }
      }
      else if (cmd === '_honor') {
          const isNamed = parts[1]?.toLowerCase() === mod.name.toLowerCase() || parts[1]?.startsWith('@');
          const amount = parseInt(parts[isNamed ? 2 : 1]);
          const reason = parts.slice(isNamed ? 3 : 2).join(' ');
          if (!isNaN(amount) && reason) {
            pendingCommands.set(sender, {
              desc: `ᴜᴘᴅᴀᴛᴇ ʜᴏɴᴏʀ ꜰᴏʀ ${mod.name} ʙʏ ${amount}`,
              execute: async () => {
                const batch = writeBatch(db); const honorLogId = crypto.randomUUID();
                batch.set(doc(db, `mods/${mod.id}/honor_logs/${honorLogId}`), { changeAmount: amount, reason: reason, createdAt: Date.now(), createdBy: 'whatsapp_bot', type: 'manual', bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
                batch.update(mod.ref, { honorScore: (mod.honorScore || 100) + amount, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
                await batch.commit();
              }
            });
            await sock.sendMessage(sender, { text: `❓ *ᴜᴘᴅᴀᴛᴇ ʜᴏɴᴏʀ ꜱᴄᴏʀᴇ ꜰᴏʀ ${mod.name.toUpperCase()}?*\nᴀᴍᴏᴜɴᴛ: ${amount}\nʀᴇᴀꜱᴏɴ: ${reason}\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
          }
      }
      else if (cmd === '_status') {
         const isNamed = parts[1]?.toLowerCase() === mod.name.toLowerCase() || parts[1]?.startsWith('@');
         const status = parts[isNamed ? 2 : 1]?.toLowerCase();
         if (status === 'active' || status === 'blacklisted') {
           pendingCommands.set(sender, {
             desc: `ᴄʜᴀɴɢᴇ ꜱᴛᴀᴛᴜꜱ ᴏꜰ ${mod.name} ᴛᴏ ${status.toUpperCase()}`,
             execute: async () => {
               await updateDoc(mod.ref, { status, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
             }
           });
           await sock.sendMessage(sender, { text: `❓ *ᴄʜᴀɴɢᴇ ꜱᴛᴀᴛᴜꜱ ᴏꜰ ${mod.name.toUpperCase()} ᴛᴏ ${status.toUpperCase()}?*\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
         }
      }
      else if (cmd === '_delete') {
        pendingCommands.set(sender, {
          desc: `ᴅᴇʟᴇᴛᴇ ᴍᴇᴍʙᴇʀ ${mod.name}`,
          execute: async () => { await deleteDoc(mod.ref); }
        });
        await sock.sendMessage(sender, { text: `⚠ *ᴅᴀɴɢᴇʀ: ᴘᴇʀᴍᴀɴᴇɴᴛʟʏ ᴅᴇʟᴇᴛᴇ ${mod.name.toUpperCase()}?*\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
      }
    } catch (e: any) { await sock.sendMessage(sender, { text: `✕ ᴇʀʀᴏʀ: ${e.message}` }); }

    if (cmd === '_addmod') {
      const name = parts[1]; const phone = parts[2]?.replace(/\D/g, ''); const group = parts.slice(3).join(' ');
      if (name && phone) {
        pendingCommands.set(sender, {
           desc: `ᴀᴅᴅ ɴᴇᴡ ᴍᴇᴍʙᴇʀ ${name} (${phone})`,
           execute: async () => {
             const id = crypto.randomUUID();
             await setDoc(doc(db, `mods/${id}`), { name, phone, phoneNumber: phone, groups: [group], role: 'moderator', status: 'active', totalPoints: 0, honorScore: 100, entryCount: 0, officerId: null, createdAt: Date.now(), updatedAt: Date.now(), lastEntryAt: Date.now(), deadlineAt: Date.now() + 7 * 24 * 60 * 60 * 1000, bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
           }
        });
        await sock.sendMessage(sender, { text: `❓ *ᴀᴅᴅ ɴᴇᴡ ᴍᴇᴍʙᴇʀ: ${name.toUpperCase()}?*\nᴘʜᴏɴᴇ: ${phone}\nɢʀᴏᴜᴘ: ${group}\n\nʀᴇᴘʟʏ ᴡɪᴛʜ _yes ᴏʀ _no` });
      }
    }
  });

  // Hourly Report
  setInterval(async () => {
    const now = new Date();
    if (now.getMinutes() === 0) {
      const sock = sessions.get('default');
      if (sock?.user) {
        try {
          const snap = await getDocs(collection(db, 'mods'));
          let report = `📢 *ʜᴏᴜʀʟʏ ꜱʏꜱᴛᴇᴍ ʀᴇᴘᴏʀᴛ (${now.getHours()}:00)*\n\n`;
          snap.docs.forEach(d => { const m = d.data(); report += `${m.status === 'active' ? '✅' : '🚫'} *${m.name}* | ᴘᴛꜱ: ${m.totalPoints || 0}\n`; });
          await sock.sendMessage(sock.user.id, { text: report });
        } catch (e) { }
      }
    }
  }, 60000);
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  app.post('/api/whatsapp/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    const sock = sessions.get('default');
    if (sock && !sock.authState.creds.registered) {
      try {
        const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(formattedNumber);
        res.json({ success: true, code });
      } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
    } else { res.status(400).json({ success: false, error: 'Not ready' }); }
  });

  app.get('/api/whatsapp/status', (req, res) => {
    const sock = sessions.get('default');
    res.json({ registered: !!sock?.authState.creds.registered });
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
    console.log(`Server running on port ${PORT}`);
    startWhatsAppBot().catch(console.error);
  });
}

startServer();
