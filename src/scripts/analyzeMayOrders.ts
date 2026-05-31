import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ Cannot find firebase-applet-config.json config file!');
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
const db = getFirestore(app, dbId);

function parseNum(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

async function runAnalysis() {
  try {
    const shopsSnap = await getDocs(collection(db, 'shops'));
    if (shopsSnap.empty) {
      console.log('❌ No shops found!');
      return;
    }

    const shopId = shopsSnap.docs[0].id;
    console.log(`🏬 Analyzing shop: ${shopId}`);

    const dailySnap = await getDocs(collection(db, 'shops', shopId, 'daily'));
    
    let salesTotal = 0;
    let discTotal = 0;
    let prTotal = 0;
    let remit = 0;
    let cash = 0;
    let ar = 0;
    let shipTotal = 0;
    let normalShip = 0;
    let prShip = 0;

    const otherStatuses = new Map<string, number>();
    const orderDetails: any[] = [];

    for (const dailyDoc of dailySnap.docs) {
      const dateKey = dailyDoc.id; // YYYY-MM-DD
      if (!dateKey.startsWith('2026-05')) continue;

      const data = dailyDoc.data();
      const orders = data.orders || [];

      for (const o of orders) {
        if (!o) continue;
        const status = o.status;
        const prodAmt = parseNum(o.prodAmt);
        const actualAmt = parseNum(o.actualAmt);
        const discAmt = parseNum(o.discAmt);
        const shipAmt = parseNum(o.shipAmt);
        const collCash = parseNum(o.arCollectedCash);
        const collRemit = parseNum(o.arCollectedRemit);

        if (status === '公關品') {
          prTotal += prodAmt;
          prShip += shipAmt;
        } else {
          salesTotal += prodAmt;
          discTotal += discAmt;
          normalShip += shipAmt;

          if (status === '匯款') remit += actualAmt;
          else if (status === '現結') cash += actualAmt;
          else {
            otherStatuses.set(status, (otherStatuses.get(status) || 0) + actualAmt);
          }

          cash += collCash;
          remit += collRemit;

          if (status === '未結帳款' || status === '已收帳款') {
            const remaining = Math.max(0, actualAmt - collCash - collRemit);
            ar += remaining;
          }
        }

        shipTotal += shipAmt;

        orderDetails.push({
          id: o.id,
          date: o.createdAt || dateKey,
          status,
          prodAmt,
          discAmt,
          shipAmt,
          actualAmt,
          collCash,
          collRemit,
          buyer: o.buyer || 'Unknown'
        });
      }
    }

    const calculatedNetRevenue = salesTotal - discTotal - prTotal;
    const cashRemitArSum = cash + remit + ar;

    console.log(`\n================== SUMMARY ==================`);
    console.log(`salesTotal (prodAmt for non-PR): ${salesTotal}`);
    console.log(`discTotal: ${discTotal}`);
    console.log(`prTotal (prodAmt for PR): ${prTotal}`);
    console.log(`Net Revenue (salesTotal - discTotal - prTotal): ${calculatedNetRevenue}`);
    console.log(`Cash: ${cash}`);
    console.log(`Remittance (匯款): ${remit}`);
    console.log(`AR (應收帳款): ${ar}`);
    console.log(`Cash + Remittance + AR = ${cashRemitArSum}`);
    console.log(`Difference (Net Revenue - (Cash + Remittance + AR)): ${calculatedNetRevenue - cashRemitArSum}`);
    console.log(`\n================ OTHER INFO =================`);
    console.log(`Total Shipping Fee (shipTotal): ${shipTotal}`);
    console.log(`Normal Shipping Fee (normalShip): ${normalShip}`);
    console.log(`PR Shipping Fee (prShip): ${prShip}`);
    console.log(`Other Statuses totals (actualAmt):`, Object.fromEntries(otherStatuses.entries()));
    
    console.log(`\n============= ALL ORDERS DETAIL =============`);
    console.table(orderDetails);

  } catch (error) {
    console.error('Error running analysis:', error);
  }
}

runAnalysis();
