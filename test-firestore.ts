import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const dbIdRaw = firebaseConfig.firestoreDatabaseId;
const dbId = !dbIdRaw || dbIdRaw === '(default)' ? '(default)' : dbIdRaw;
const db = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);

async function test() {
  try {
      const snap = await getDocs(collection(db, "shops"));
      console.log("Shops count:", snap.size);
      snap.forEach((d) => {
        console.log(d.id, " => ", d.data());
      });
      const settingsRef = doc(db, 'shops', 'tai_du_2025', 'meta', 'settings');
      const settingsSnap = await getDoc(settingsRef);
      console.log("Settings exists:", settingsSnap.exists());
      if (settingsSnap.exists()) {
          console.log("Settings data:", settingsSnap.data());
      }
      console.log("Database ID used:", dbId);
      process.exit(0);
  } catch (e) {
      console.error("Error:", e);
      process.exit(1);
  }
}
test();
