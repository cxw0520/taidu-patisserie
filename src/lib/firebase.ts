import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { collection, getDocs, query, limit } from 'firebase/firestore'; // <- 補這行

export async function debugFirestoreBinding() {
  const app = getTaiduApp();
  const db = getDB();

  console.group('🔥 Firebase Binding');
  console.log('projectId:', app.options.projectId);
  console.log('authDomain:', app.options.authDomain);
  console.log('databaseId(from config):', (firebaseConfig as any).firestoreDatabaseId ?? '(default)');
  console.log('db app projectId:', db.app.options.projectId);
  console.groupEnd();
}

export async function testShopsRead() {
  try {
    const db = getDB();
    const snap = await getDocs(query(collection(db, 'shops'), limit(5)));
    console.log(`✅ shops readable, count=${snap.size}`);
    snap.forEach((d) => console.log('shop:', d.id, d.data()));
  } catch (error: any) {
    handleFirestoreError(error, 'list', 'shops');
  }
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  if (error && (error.code === 'permission-denied' || error.message?.includes('insufficient permissions'))) {
    const auth = getTaiduAuth();
    const user = auth.currentUser;
    
    const errorInfo: FirestoreErrorInfo = {
      error: error.message || 'Permission denied',
      operationType,
      path,
      authInfo: {
        userId: user?.uid || 'anonymous',
        email: user?.email || '',
        emailVerified: user?.emailVerified || false,
        isAnonymous: user?.isAnonymous || true,
        providerInfo: user?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        })) || []
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
}

// Singleton instances
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getTaiduApp() {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getTaiduAuth(): Auth {
  if (!authInstance) {
    const app = getTaiduApp();
    authInstance = getAuth(app);
  }
  return authInstance;
}

export function getDB(): Firestore {
  if (!dbInstance) {
    const app = getTaiduApp();

    const dbIdRaw = (firebaseConfig as any).firestoreDatabaseId;
    const dbId = !dbIdRaw || dbIdRaw === '(default)' ? '(default)' : dbIdRaw;

    dbInstance = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);
  }
  return dbInstance;
}

// Diagnostic helper
export async function testConnection() {
  try {
    const db = getDB();
    // Non-existent path is fine for a metadata check
    await getDocFromServer(doc(db, '_diagnostics_', 'connection'));
    console.log("✅ Firebase Connectivity: Success");
  } catch (error: any) {
    console.group("❌ Firebase Connectivity Alert");
    console.error("Error Code:", error.code || 'unknown');
    console.error("Error Message:", error.message || 'Check your network');
    console.log("Domain whitelisting needed:", window.location.hostname);
    console.groupEnd();
  }
}

// For convenience in existing code
export const db = getDB();
export const auth = getTaiduAuth();

testConnection();
debugFirestoreBinding();
testShopsRead();
