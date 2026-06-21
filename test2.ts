import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import config from './firebase-applet-config.json' assert { type: 'json' };

async function test() {
  try {
    initializeApp({ projectId: config.projectId });
    const db = getFirestore(config.firestoreDatabaseId); // getFirestore returns the specific db
    const snapshot = await db.collection('mods').limit(1).get();
    console.log("SUCCESS length:", snapshot.docs.length);
  } catch(e: any) {
    console.error("FAIL", e);
  }
}
test();
