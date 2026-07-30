import { getDB } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function run() {
  const db = getDB();
  const shopId = 'uy9ZzYOrDwhM4c4IcrarRLTrnXx1';
  const snap = await getDocs(collection(db, 'shops', shopId, 'materials'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  console.log(`\nFound ${list.length} materials in database.`);
  let totalVal = 0;
  
  const sorted = list.map((m: any) => {
    const stock = m.stock || 0;
    const avgCost = m.avgCost || 0;
    const value = stock * avgCost;
    totalVal += value;
    return { name: m.name, stock, avgCost, value, category: m.category || '食材' };
  }).sort((a, b) => b.value - a.value);

  console.log('\nTop high-value materials in stock:');
  sorted.slice(0, 15).forEach(m => {
    console.log(`- ${m.name}: stock=${m.stock}, avgCost=${m.avgCost}, value=$${Math.round(m.value)} (category=${m.category})`);
  });

  console.log(`\nSum of all stock values: $${Math.round(totalVal)}\n`);
}

run().catch(console.error);
