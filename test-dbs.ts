import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);

async function probeDb(dbId) {
    console.log(`\n--- Probing Database: ${dbId} ---`);
    const db = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);
    const ref = doc(db, '_diagnostics_', 'ping');
    
    // Create a timeout promise to prevent hanging
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000));
    
    try {
        await Promise.race([getDoc(ref), timeout]);
        console.log(`✅ [${dbId}] SUCCESS: Connected instantly!`);
        return true;
    } catch (e) {
        if (e.message === 'TIMEOUT') {
             console.log(`❌ [${dbId}] FAILED: Connection timed out (Client offline / DB doesn't exist)`);
        } else {
             console.log(`❌ [${dbId}] FAILED: Error -`, e.message);
        }
        return false;
    }
}

async function run() {
    await probeDb('(default)');
    await probeDb('default');
    await probeDb('ai-studio-7292480b-af01-40de-9c5b-d4dc4203c320');
    process.exit(0);
}

run();
