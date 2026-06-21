import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, initAuthCreds, BufferJSON, Browsers } from "@whiskeysockets/baileys";
import pino from "pino";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, updateDoc, writeBatch } from "firebase/firestore";
import fs from "fs";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

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
              let value = await readData(`\${type}-\${id}`);
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
              let fileId = `\${category}-\${id}`;
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
let pairingCodeRequested = false;
let globalPairingCode = "";

async function startWhatsAppBot() {
  const { state, saveCreds } = await useFirestoreAuthState('whatsapp_sessions');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }) as any,
    browser: Browsers.ubuntu('Chrome')
  });

  sessions.set('default', sock);

  if (!sock.authState.creds.registered && !pairingCodeRequested) {
    pairingCodeRequested = true;
    setTimeout(async () => {
      try {
        // Automatically request pairing code for a typical primary number if needed, 
        // but better to trigger via API.
        console.log("Waiting for pairing code request...");
      } catch (err) {
        console.error("Pairing code error", err);
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        pairingCodeRequested = false;
        startWhatsAppBot();
      }
    } else if (connection === 'open') {
      console.log('opened connection');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    if (!sender || !OWNERS.includes(sender)) {
      console.log(`Ignored message from non-owner: \${sender}`);
      return;
    }

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text) return;

    if (text.startsWith('.menu')) {
      await sock.sendMessage(sender, { text: `📋 *Bot Menu - Mod Management*
      
*Core Commands*
1. .list : View all Mods and their basic details
2. .info [ModName] : Get full profile of a specific Mod
3. .draft [ModName] [Text] : Add a draft entry
4. .submit [ModName] : Process drafts into official entries
5. .entry [ModName] [Points] [Text] : Directly add an official entry

*Admin & Management*
6. .addmod [Name] [Phone] [Group] : Add a new Mod to the database
7. .status [ModName] [active|blacklisted] : Change Mod's status
8. .role [ModName] [moderator|officer] : Change Mod's role
9. .honor [ModName] [Amount] [Reason] : Adjust Honor Score
10. .group [ModName] [GroupName] : Update Mod's Group
11. .assign [ModName] [OfficerName] : Assign an Officer
12. .unassign [ModName] : Remove assigned Officer
13. .delete [ModName] : Completely remove a Mod

*Only registered owners can use these commands.*` });
      return;
    }
    
    // Command parser
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    
    if (cmd === '.list') {
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const list = snap.docs.map(d => d.data());
        let res = `👥 *Mods List*\n\n`;
        list.forEach((m: any, idx) => {
          res += `\${idx+1}. \${m.name} (\${m.role || 'moderator'}) \${m.status === 'blacklisted' ? '[B]' : ''}\n`;
        });
        await sock.sendMessage(sender, { text: res });
      } catch (e) {
        console.error(e);
        await sock.sendMessage(sender, { text: `Error fetching list.` });
      }
      return;
    }
    
    if (cmd === '.info') {
      const name = parts.slice(1).join(' ').trim().toLowerCase();
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const modDoc = snap.docs.find(d => d.data().name.toLowerCase() === name);
        if (modDoc) {
          const mod = modDoc.data() as any;
          await sock.sendMessage(sender, { text: `👤 *Mod Info: \${mod.name}*
          
Role: \${mod.role || 'moderator'}
Status: \${mod.status || 'active'}
Group: \${Array.isArray(mod.groups) ? mod.groups.join(', ') : (mod.group || 'Other')}
Officer Assigned: \${mod.officerId || 'None'}
Total Points: \${mod.totalPoints || 0}
Entries: \${mod.entryCount || 0}
Honor: \${mod.honorScore || 100}
Last Entry: \${new Date(mod.lastEntryAt || Date.now()).toLocaleDateString()}`});
        } else {
          await sock.sendMessage(sender, { text: `Mod "\${name}" not found.` });
        }
      } catch (e) {
        await sock.sendMessage(sender, { text: `Error fetching info.` });
      }
      return;
    }

    if (cmd === '.draft') {
      if (parts.length < 3) {
        await sock.sendMessage(sender, { text: `Usage: .draft [ModName] [Text]` });
        return;
      }
      const name = parts[1].toLowerCase();
      const draftText = parts.slice(2).join(' ');
      
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const modDoc = snap.docs.find(d => d.data().name.toLowerCase() === name);
        if (modDoc) {
          const draftId = crypto.randomUUID();
          await setDoc(doc(db, `mods/\${modDoc.id}/drafts/\${draftId}`), {
            text: draftText,
            createdAt: Date.now(),
            createdBy: 'whatsapp_bot',
            points: 1.0,
            bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          await sock.sendMessage(sender, { text: `✅ Draft added for \${modDoc.data().name}` });
        } else {
          await sock.sendMessage(sender, { text: `Mod "\${name}" not found.` });
        }
      } catch (e) {
        await sock.sendMessage(sender, { text: `Error adding draft.` });
      }
      return;
    }

    if (cmd === '.submit') {
      const name = parts.slice(1).join(' ').trim().toLowerCase();
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const modDoc = snap.docs.find(d => d.data().name.toLowerCase() === name);
        if (modDoc) {
          const draftsSnap = await getDocs(collection(db, `mods/\${modDoc.id}/drafts`));
          if (draftsSnap.empty) {
            await sock.sendMessage(sender, { text: `No drafts found for \${modDoc.data().name}` });
            return;
          }
          
          let totalPoints = 0;
          let combinedText = '';
          const batch = writeBatch(db);
          
          draftsSnap.forEach(d => {
            const data = d.data();
            totalPoints += (data.points || 0);
            combinedText += `- \${data.text}\n`;
            batch.delete(d.ref);
          });
          
          const entryId = crypto.randomUUID();
          batch.set(doc(db, `mods/\${modDoc.id}/entries/\${entryId}`), {
             text: combinedText,
             points: totalPoints,
             createdAt: Date.now(),
             createdBy: 'whatsapp_bot',
             bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          
          const mod = modDoc.data();
          batch.update(modDoc.ref, {
             totalPoints: (mod.totalPoints || 0) + totalPoints,
             entryCount: (mod.entryCount || 0) + 1,
             lastEntryAt: Date.now(),
             deadlineAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
             updatedAt: Date.now(),
             bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          
          await batch.commit();
          await sock.sendMessage(sender, { text: `✅ Submitted \${draftsSnap.docs.length} drafts for \${modDoc.data().name}. Clock reset to 7 days.` });
        } else {
          await sock.sendMessage(sender, { text: `Mod "\${name}" not found.` });
        }
      } catch(e: any) {
        await sock.sendMessage(sender, { text: `Error submitting drafts: \${e.message}` });
      }
      return;
    }

    if (cmd === '.addmod') {
      if (parts.length < 4) {
        await sock.sendMessage(sender, { text: `Usage: .addmod [Name] [Phone] [Group]` });
        return;
      }
      const newName = parts[1];
      const phone = parts[2];
      const group = parts.slice(3).join(' ');
      
      try {
        const modId = crypto.randomUUID();
        await setDoc(doc(db, `mods/\${modId}`), {
          name: newName,
          phone: phone,
          groups: [group],
          role: 'moderator',
          status: 'active',
          totalPoints: 0,
          honorScore: 100,
          entryCount: 0,
          officerId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastEntryAt: Date.now(),
          deadlineAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
        });
        await sock.sendMessage(sender, { text: `✅ Mod \${newName} added successfully.` });
      } catch(e: any) {
        await sock.sendMessage(sender, { text: `Error adding mod: \${e.message}` });
      }
      return;
    }

    if (cmd === '.status' || cmd === '.role' || cmd === '.group' || cmd === '.assign' || cmd === '.unassign' || cmd === '.delete') {
      if (parts.length < 2) {
        await sock.sendMessage(sender, { text: `Usage details missing for command.` });
        return;
      }
      const name = parts[1].toLowerCase();
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const modDoc = snap.docs.find(d => d.data().name.toLowerCase() === name);
        if (!modDoc) {
          await sock.sendMessage(sender, { text: `Mod "\${name}" not found.` });
          return;
        }

        if (cmd === '.status') {
          const status = parts[2]?.toLowerCase();
          if (status !== 'active' && status !== 'blacklisted') {
            await sock.sendMessage(sender, { text: `Status must be active or blacklisted` });
            return;
          }
          await updateDoc(modDoc.ref, { status, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          await sock.sendMessage(sender, { text: `✅ \${modDoc.data().name}'s status changed to \${status}` });
        } 
        else if (cmd === '.role') {
          const role = parts[2]?.toLowerCase();
          if (role !== 'moderator' && role !== 'officer') {
            await sock.sendMessage(sender, { text: `Role must be moderator or officer` });
            return;
          }
          await updateDoc(modDoc.ref, { role, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          await sock.sendMessage(sender, { text: `✅ \${modDoc.data().name}'s role changed to \${role}` });
        }
        else if (cmd === '.group') {
          const groupName = parts.slice(2).join(' ');
          await updateDoc(modDoc.ref, { groups: [groupName], updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          await sock.sendMessage(sender, { text: `✅ \${modDoc.data().name}'s group changed to \${groupName}` });
        }
        else if (cmd === '.assign') {
          const officerName = parts.slice(2).join(' ').toLowerCase();
          const officerDoc = snap.docs.find(d => d.data().name.toLowerCase() === officerName && d.data().role === 'officer');
          if (!officerDoc) {
             await sock.sendMessage(sender, { text: `Officer "\${officerName}" not found.` });
             return;
          }
          await updateDoc(modDoc.ref, { officerId: officerDoc.id, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          await sock.sendMessage(sender, { text: `✅ \${officerDoc.data().name} assigned as officer to \${modDoc.data().name}` });
        }
        else if (cmd === '.unassign') {
          await updateDoc(modDoc.ref, { officerId: null, updatedAt: Date.now(), bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#' });
          await sock.sendMessage(sender, { text: `✅ Removed officer from \${modDoc.data().name}` });
        }
        else if (cmd === '.delete') {
          await deleteDoc(modDoc.ref);
          await sock.sendMessage(sender, { text: `✅ Mod \${modDoc.data().name} completely deleted.` });
        }
      } catch (e: any) {
         await sock.sendMessage(sender, { text: `Error updating mod: \${e.message}` });
      }
      return;
    }
    
    if (cmd === '.entry') {
      if (parts.length < 4) {
        await sock.sendMessage(sender, { text: `Usage: .entry [ModName] [Points] [Text]` });
        return;
      }
      const name = parts[1].toLowerCase();
      const points = parseFloat(parts[2]);
      const entryText = parts.slice(3).join(' ');
      
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const modDoc = snap.docs.find(d => d.data().name.toLowerCase() === name);
        if (modDoc) {
          const entryId = crypto.randomUUID();
          const batch = writeBatch(db);
          
          batch.set(doc(db, `mods/\${modDoc.id}/entries/\${entryId}`), {
             text: entryText,
             points: points || 0,
             createdAt: Date.now(),
             createdBy: 'whatsapp_bot',
             bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          
          const mod = modDoc.data();
          batch.update(modDoc.ref, {
             totalPoints: (mod.totalPoints || 0) + (points || 0),
             entryCount: (mod.entryCount || 0) + 1,
             lastEntryAt: Date.now(),
             deadlineAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
             updatedAt: Date.now(),
             bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          
          await batch.commit();
          await sock.sendMessage(sender, { text: `✅ Official entry added for \${modDoc.data().name}. Clock reset to 7 days.` });
        } else {
          await sock.sendMessage(sender, { text: `Mod "\${name}" not found.` });
        }
      } catch (e: any) {
        await sock.sendMessage(sender, { text: `Error adding entry: \${e.message}` });
      }
      return;
    }

    if (cmd === '.honor') {
      if (parts.length < 4) {
        await sock.sendMessage(sender, { text: `Usage: .honor [ModName] [+Amount|-Amount] [Reason]` });
        return;
      }
      const name = parts[1].toLowerCase();
      const amount = parseInt(parts[2]);
      const reason = parts.slice(3).join(' ');
      
      try {
        const snap = await getDocs(collection(db, 'mods'));
        const modDoc = snap.docs.find(d => d.data().name.toLowerCase() === name);
        if (modDoc) {
          const batch = writeBatch(db);
          const honorLogId = crypto.randomUUID();
          
          batch.set(doc(db, `mods/\${modDoc.id}/honor_logs/\${honorLogId}`), {
             changeAmount: amount,
             reason: reason,
             createdAt: Date.now(),
             createdBy: 'whatsapp_bot',
             type: 'manual',
             bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          
          const mod = modDoc.data();
          const currentHonor = mod.honorScore ?? 100;
          batch.update(modDoc.ref, {
             honorScore: currentHonor + amount,
             updatedAt: Date.now(),
             bot_token: 'b0t_s3cr3t_WhatsApp_2026_XYZ!@#'
          });
          
          await batch.commit();
          await sock.sendMessage(sender, { text: `✅ Honor score adjusted for \${modDoc.data().name} by \${amount}. Reason: \${reason}` });
        } else {
          await sock.sendMessage(sender, { text: `Mod "\${name}" not found.` });
        }
      } catch (e: any) {
        await sock.sendMessage(sender, { text: `Error adjusting honor: \${e.message}` });
      }
      return;
    }
  });
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
        let code = '';
        for (let i = 0; i < 3; i++) {
          try {
            code = await sock.requestPairingCode(formattedNumber);
            break;
          } catch (e: any) {
            if (e.message !== 'Connection Closed' && i === 2) {
              throw e;
            }
            await new Promise(r => setTimeout(r, 3000));
          }
        }
        res.json({ success: true, code });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    } else {
      res.status(400).json({ success: false, error: 'Already registered or bot not initialized' });
    }
  });

  app.get('/api/whatsapp/status', (req, res) => {
    const sock = sessions.get('default');
    const registered = sock ? !!sock.authState.creds.registered : false;
    res.json({ registered, pairingCodeRequested });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:\${PORT}`);
    startWhatsAppBot().catch(console.error);
  });
}

startServer();
