const fs = require('fs');
let file = fs.readFileSync('src/components/DailyView.tsx', 'utf-8');

// 1. Insert functions
const insertText = `
  const updateOrderInDb = (orderId: string, patch: Partial<Order>) => {
    let targetKey = '';
    setDailyData(prev => {
      if (!prev) return prev;
      targetKey = normalizeDateKey(currentDate);
      if (!loadedDateKey || loadedDateKey !== targetKey) return prev;
      const nextOrders = [...(prev.orders || [])];
      const idx = nextOrders.findIndex(o => o.id === orderId);
      if (idx >= 0) {
        nextOrders[idx] = { ...nextOrders[idx], ...patch };
      }
      return { ...prev, orders: nextOrders };
    });

    if (targetKey && shopId) {
      runTransaction(db, async (tx) => {
        const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
        const snap = await tx.get(docRef);
        if (snap.exists()) {
          const sData = snap.data() as any;
          const sOrders = sData.orders || [];
          const idx = sOrders.findIndex((o: any) => o.id === orderId);
          if (idx >= 0) {
            sOrders[idx] = { ...sOrders[idx], ...patch };
            tx.set(docRef, { orders: sOrders }, { merge: true });
          }
        }
      }).catch(e => console.error('Order update tx failed:', e));
    }
  };

  const deleteOrderInDb = (orderId: string) => {
    let targetKey = '';
    setDailyData(prev => {
      if (!prev) return prev;
      targetKey = normalizeDateKey(currentDate);
      return { ...prev, orders: (prev.orders || []).filter(o => o.id !== orderId) };
    });

    if (targetKey && shopId) {
      runTransaction(db, async (tx) => {
        const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
        const snap = await tx.get(docRef);
        if (snap.exists()) {
           tx.set(docRef, { orders: (snap.data().orders || []).filter((o: any) => o.id !== orderId) }, { merge: true });
        }
      }).catch(e => console.error('Delete order tx failed:', e));
    }
  };

  const metrics = useMemo(() => {
`;

file = file.replace('  const metrics = useMemo(() => {', insertText);

// 2. Replace all the inline onChange stuff
// E.g.: onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].buyer = e.target.value; updateDaily({ orders }); }}
// To: onChange={(e) => { updateOrderInDb(order.id, { buyer: e.target.value }); }}

file = file.replace(/onChange=\{\(e\) => \{ const orders = \[\.\.\.dailyData\.orders\]; orders\[idx\]\.([a-zA-Z0-9_]+) = e\.target\.value( as any)?; updateDaily\(\{ orders \}\); \}\}/g, 
  "onChange={(e) => { updateOrderInDb(order.id, { $1: e.target.value$2 }); }}");

file = file.replace(/onChange=\{\(e\) => \{ const orders = \[\.\.\.dailyData\.orders\]; orders\[idx\]\.([a-zA-Z0-9_]+) = parseNum\(e\.target\.value\); orders\[idx\]\.actualAmt = orders\[idx\]\.prodAmt \+ orders\[idx\]\.shipAmt \- orders\[idx\]\.discAmt; updateDaily\(\{ orders \}\); \}\}/g,
  "onChange={(e) => { const num = parseNum(e.target.value); updateOrderInDb(order.id, { $1: num, actualAmt: (order.prodAmt || 0) + (order.shipAmt || 0) - (order.discAmt || 0) + (num - (order.$1 || 0)) }); }}");

file = file.replace(/onClick=\{\(\) => \{ const orders = \[\.\.\.dailyData\.orders\]; orders\[idx\]\.deliveryMethod = '宅配'; updateDaily\(\{ orders \}\); \}\}/g,
  "onClick={() => { updateOrderInDb(order.id, { deliveryMethod: '宅配' }); }}");

file = file.replace(/onClick=\{\(\) => \{ const orders = \[\.\.\.dailyData\.orders\]; orders\[idx\]\.deliveryMethod = '自取'; updateDaily\(\{ orders \}\); \}\}/g,
  "onClick={() => { updateOrderInDb(order.id, { deliveryMethod: '自取' }); }}");

file = file.replace(/onClick=\{\(\) => \{ const orders = \[\.\.\.dailyData\.orders\]; orders\[idx\]\.isPickedUp = !orders\[idx\]\.isPickedUp; updateDaily\(\{ orders \}\); \}\}/g,
  "onClick={() => { updateOrderInDb(order.id, { isPickedUp: !order.isPickedUp }); }}");

file = file.replace(/updateDaily\(\{ orders: dailyData\.orders\.filter\(o => o\.id !== order\.id\) \}\)/g,
  "deleteOrderInDb(order.id)");

file = file.replace(/const orders = dailyData\.orders\.map\(o => o\.id === updated\.id \? updated : o\);\s+updateDaily\(\{ orders \}\);/g,
  "updateOrderInDb(updated.id, updated);");

file = file.replace(/onChange=\{\(e\) => \{\s+const orders = \[\.\.\.dailyData\.orders\];\s+if \(!orders\[idx\]\.items\) orders\[idx\]\.items = \{\};\s+orders\[idx\]\.items\[i\.id\] = parseNum\(e\.target\.value\);\s+let pAmt = 0;\s+\[\.\.\.\(settings\.giftItems \|\| \[\]\), \.\.\.\(settings\.singleItems \|\| \[\]\)\]\.forEach\(item => \{ pAmt \+= \(orders\[idx\]\.items\?\.\[item\.id\] \|\| 0\) \* item\.price; \}\);\s+orders\[idx\]\.prodAmt = pAmt;\s+orders\[idx\]\.actualAmt = pAmt \+ \(orders\[idx\]\.shipAmt \|\| 0\) \- \(orders\[idx\]\.discAmt \|\| 0\);\s+updateDaily\(\{ orders \}\);\s+\}\}/g,
  "onChange={(e) => { const num = parseNum(e.target.value); const newItems = { ...(order.items || {}), [i.id]: num }; let pAmt = 0; [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => { pAmt += (newItems[item.id] || 0) * item.price; }); updateOrderInDb(order.id, { items: newItems, prodAmt: pAmt, actualAmt: pAmt + (order.shipAmt || 0) - (order.discAmt || 0) }); }}");

fs.writeFileSync('src/components/DailyView.tsx', file);
console.log('Done');
