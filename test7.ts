import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import config from "./firebase-applet-config.json" with { type: "json" };
const app = initializeApp(config, "test");
const db = getFirestore(app, config.firestoreDatabaseId);

const ref = doc(db, 'whatsapp_sessions', 'test_doc');
getDoc(ref).then(() => {
  console.log('success read whatsapp_sessions');
  process.exit(0);
}).catch(e => {
  console.error(e.code, e.message);
  process.exit(1);
});
