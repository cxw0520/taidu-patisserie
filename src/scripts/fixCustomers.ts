import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// 載入 Firebase 設定檔
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ 找不到 firebase-applet-config.json 設定檔，請確認路徑！');
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
const db = getFirestore(app, dbId);

console.log(`ℹ️ Firebase 初始化成功，使用資料庫 ID: ${dbId}`);

async function runDataFix() {
  try {
    // 1. 獲取所有的 shops
    console.log('🔍 正在獲取 shops 列表...');
    const shopsSnap = await getDocs(collection(db, 'shops'));
    if (shopsSnap.empty) {
      console.log('⚠️ 沒有找到任何 shops！');
      return;
    }

    for (const shopDoc of shopsSnap.docs) {
      const shopId = shopDoc.id;
      console.log(`\n========================================`);
      console.log(`🏬 開始處理商店 [ID: ${shopId}]`);
      console.log(`========================================`);

      // 2. 獲取此商店的所有日報表，收集所有訂單作為「真理之源」
      console.log('🔍 正在獲取日報表中的真實訂單...');
      const dailySnap = await getDocs(collection(db, 'shops', shopId, 'daily'));
      const globalOrders = new Map<string, any>();
      
      for (const dailyDoc of dailySnap.docs) {
        const data = dailyDoc.data();
        const orders = data.orders || [];
        for (const order of orders) {
          if (order && order.id) {
            globalOrders.set(order.id, order);
          }
        }
      }
      console.log(`✅ 已載入 ${globalOrders.size} 筆日報表真實訂單。`);

      // 3. 獲取此商店的所有顧客
      console.log('🔍 正在獲取顧客列表...');
      const customerSnap = await getDocs(collection(db, 'shops', shopId, 'customers'));
      console.log(`✅ 共有 ${customerSnap.size} 位顧客。開始進行分析與校正...`);

      let totalUpdated = 0;

      for (const custDoc of customerSnap.docs) {
        const customer = custDoc.data();
        const purchases = customer.purchases || [];
        
        let needsUpdate = false;
        const purchaseDeltas: string[] = [];

        // a. 去重與狀態校正
        const uniquePurchasesMap = new Map<string, any>();
        
        for (const p of purchases) {
          if (!p.orderId) continue;
          
          // 取得日報表中的真實訂單狀態與金額
          const realOrder = globalOrders.get(p.orderId);
          let updatedPurchase = { ...p };
          
          if (realOrder) {
            if (p.status !== realOrder.status) {
              purchaseDeltas.push(`訂單[${p.orderId}]狀態: ${p.status} ➡️ ${realOrder.status}`);
              updatedPurchase.status = realOrder.status;
              needsUpdate = true;
            }
            if (p.actualAmt !== realOrder.actualAmt) {
              purchaseDeltas.push(`訂單[${p.orderId}]實收: ${p.actualAmt} ➡️ ${realOrder.actualAmt}`);
              updatedPurchase.actualAmt = realOrder.actualAmt;
              needsUpdate = true;
            }
            if (p.prodAmt !== realOrder.prodAmt) {
              updatedPurchase.prodAmt = realOrder.prodAmt;
              needsUpdate = true;
            }
          }

          // 去重邏輯：如果已有該筆訂單
          if (uniquePurchasesMap.has(p.orderId)) {
            const existing = uniquePurchasesMap.get(p.orderId);
            purchaseDeltas.push(`移除重複訂單[${p.orderId}]`);
            needsUpdate = true;
            
            // 如果已存在的那筆是「未結帳款」，而當前這筆是「現結/匯款/儲值金扣款」等已付款狀態，則覆蓋為已付款狀態
            if (existing.status === '未結帳款' && updatedPurchase.status !== '未結帳款') {
              uniquePurchasesMap.set(p.orderId, updatedPurchase);
            }
          } else {
            uniquePurchasesMap.set(p.orderId, updatedPurchase);
          }
        }

        const cleanedPurchases = Array.from(uniquePurchasesMap.values());

        // b. 重新計算財務狀態
        // 應收帳款 (未付款金額)
        let unpaidBalance = 0;
        for (const p of cleanedPurchases) {
          if (p.status === '未結帳款') {
            unpaidBalance += Number(p.actualAmt || 0);
          }
        }

        // 消費總次數
        const totalPurchaseCount = cleanedPurchases.length;
        
        // 消費總金額
        const totalPurchaseAmt = cleanedPurchases.reduce((sum, p) => sum + Number(p.actualAmt || 0), 0);

        // c. 檢查是否有任何欄位需要更新
        const oldUnpaid = Number(customer.unpaidBalance || 0);
        const oldAmt = Number(customer.totalPurchaseAmt || 0);
        const oldCount = Number(customer.totalPurchaseCount || 0);
        const oldPurchasesCount = purchases.length;

        if (
          needsUpdate ||
          oldUnpaid !== unpaidBalance ||
          oldAmt !== totalPurchaseAmt ||
          oldCount !== totalPurchaseCount ||
          oldPurchasesCount !== cleanedPurchases.length
        ) {
          console.log(`\n✏️ 修改顧客: ${customer.name} (電話: ${customer.phone || '無'})`);
          if (oldPurchasesCount !== cleanedPurchases.length) {
            console.log(`   - 消費筆數: ${oldPurchasesCount} ➡️ ${cleanedPurchases.length}`);
          }
          if (oldUnpaid !== unpaidBalance) {
            console.log(`   - 未付款餘額: $${oldUnpaid} ➡️ $${unpaidBalance}`);
          }
          if (oldAmt !== totalPurchaseAmt) {
            console.log(`   - 消費總金額: $${oldAmt} ➡️ $${totalPurchaseAmt}`);
          }
          if (purchaseDeltas.length > 0) {
            console.log(`   - 明細異動:\n     * ${purchaseDeltas.join('\n     * ')}`);
          }

          // 回寫更新
          const updatedCustomer = {
            ...customer,
            purchases: cleanedPurchases,
            unpaidBalance,
            totalPurchaseCount,
            totalPurchaseAmt,
            updatedAt: new Date().toISOString()
          };

          await setDoc(doc(db, 'shops', shopId, 'customers', customer.id), updatedCustomer);
          totalUpdated++;
        }
      }

      console.log(`\n🎉 商店 [${shopId}] 處理完成！共更新了 ${totalUpdated} 位顧客的資料。`);
    }

    console.log('\n🌟 所有商店資料清洗與校正完畢！');
  } catch (error) {
    console.error('❌ 執行修復時發生錯誤:', error);
  }
}

runDataFix();
