import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // Also test default init

async function test() {
  try {
      const ref = doc(db, 'shops', 'test_write');
      await setDoc(ref, { test: 123 });
      console.log("Write successful to standard default db");
      process.exit(0);
  } catch (e) {
      console.error("Write failed:", e);
      process.exit(1);
  }
}
test();
