import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import config from "./firebase-applet-config.json" with { type: "json" };
const app = initializeApp(config, "test2");
const db = getFirestore(app, config.firestoreDatabaseId);

const ref = collection(db, 'mods');
getDocs(ref).then((snap) => {
  console.log('success mods length:', snap.docs.length);
  process.exit(0);
}).catch(e => {
  console.error(e.code, e.message);
  process.exit(1);
});
