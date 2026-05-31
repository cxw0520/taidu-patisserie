import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = getFirestore();

async function test() {
  try {
    const shopsSnap = await db.collection('shops').get();
    console.log('Shops count:', shopsSnap.size);
    if (shopsSnap.size > 0) {
      const shopId = shopsSnap.docs[0].id;
      console.log('Shop ID:', shopId);
      const dailySnap = await db.collection('shops').doc(shopId).collection('daily').get();
      console.log('Daily reports count:', dailySnap.size);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
