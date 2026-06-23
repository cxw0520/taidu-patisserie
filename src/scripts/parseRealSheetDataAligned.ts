const orders = [
  { id: "o8cMAenN", buyer: "楊晴雯", phone: "0909540722", email: "ycw91072@gmail.com", method: "到店自取", date: "2026-06-28", items: { "伯爵可麗露": 1 } },
  { id: "GyXuskUF5k", buyer: "許芯瑋", phone: "0966537899", email: "xu223047@gmail.com", method: "到店自取", date: "2026-06-25", items: { "原味禮盒": 1 } },
  { id: "q3O2BU41", buyer: "傅禹宸", phone: "0978325599", email: "qwer2108@gmail.com", method: "到店自取", date: "2026-06-27", items: { "伯爵可麗露": 1, "杜拜巧克力Q餅": 1 } },
  { id: "HXItCS6n", buyer: "張涵閔", phone: "0900327399", email: "a090000431@gmail.com", method: "冷凍宅配", addr: "宜蘭縣三星鄉", date: "2026-06-25", items: { "伯爵可麗露": 1, "杜拜巧克力Q餅": 6 } },
  { id: "mvOp6LL", buyer: "林涵", phone: "0903096068", email: "shihan1228@gmail.com", method: "到店自取", date: "2026-06-26", items: { "伯爵可麗露": 3, "杜拜巧克力Q餅": 2 } },
  { id: "ZJifZVb9t", buyer: "陳柔均", phone: "0916661159", email: "a0916661159@gmail.com", method: "到店自取", date: "2026-06-24", items: { "伯爵可麗露": 1, "杜拜巧克力Q餅": 1, "原味禮盒": 1 } },
  { id: "j9dzfEJAY", buyer: "曾鈺雯", phone: "0905644258", email: "lp88866888@gmail.com", method: "到店自取", date: "2026-06-27", items: { "伯爵可麗露": 2, "原味禮盒": 1 } },
  { id: "buf19wmc", buyer: "陳昀婕", phone: "0907629631", email: "yunjiechen94@gmail.com", method: "冷凍宅配", addr: "新北市汐止區", date: "2026-06-25", items: { "伯爵可麗露": 5, "杜拜巧克力Q餅": 3 } },
  { id: "aOtwZnBl", buyer: "楊慈瑄", phone: "0968373099", email: "yangcixuan0202@gmail.com", method: "冷凍宅配", addr: "高雄市小港區", date: "2026-06-25", items: { "伯爵可麗露": 2, "杜拜巧克力Q餅": 1, "抹茶禮盒": 1 } },
  { id: "xNFxh4cF", buyer: "張雅婷", phone: "0988564121", email: "miffy8922@gmail.com", method: "到店自取", date: "2026-06-26", items: { "伯爵可麗露": 2, "原味禮盒": 1 } },
  { id: "yMJXbTl3", buyer: "黃儷婷", phone: "0935893699", email: "ting860305@gmail.com", method: "冷凍宅配", addr: "新北市樹林區", date: "2026-06-25", items: { "伯爵可麗露": 3, "杜拜巧克力Q餅": 1 } },
  { id: "0iFqozUF", buyer: "蘇郁恩", phone: "0907316345", email: "yuensu0503@gmail.com", method: "冷凍宅配", addr: "台中市烏日區", date: "2026-06-25", items: { "伯爵可麗露": 1, "杜拜巧克力Q餅": 1, "原味禮盒": 2 } },
  { id: "5Z0Mjz0C", buyer: "林楹誼", phone: "0900005199", email: "a0981796850@gmail.com", method: "到店自取", date: "2026-06-24", items: { "伯爵可麗露": 2, "杜拜巧克力Q餅": 1, "原味禮盒": 1 } },
  { id: "dHyPzqV5", buyer: "葉芯妤", phone: "0953326507", email: "joan860321@gmail.com", method: "冷凍宅配", addr: "台北市松山區", date: "2026-06-25", items: { "伯爵可麗露": 5 } },
  { id: "x3mJUCZ", buyer: "季欣妤", phone: "0976246499", email: "aa0976246499@gmail.com", method: "冷凍宅配", addr: "嘉義市西區", date: "2026-06-25", items: { "伯爵可麗露": 1, "原味禮盒": 1 } },
  { id: "JHyIuAuc", buyer: "張瑀真", phone: "0928861002", email: "cliochang1002@gmail.com", method: "到店自取", date: "2026-06-26", items: { "伯爵可麗露": 2 } },
  { id: "vqo2fyu0F", buyer: "陳烙希", phone: "0908131837", email: "chenming7712@gmail.com", method: "到店自取", date: "2026-06-24", items: { "伯爵可麗露": 3, "原味禮盒": 1 } },
  { id: "0gnsd5f9s", buyer: "馮恩婕", phone: "0978811032", email: "aabbyy1130@gmail.com", method: "到店自取", date: "2026-06-24", items: { "伯爵可麗露": 3 } },
  { id: "dTUeGb8f", buyer: "葉於萱", phone: "0981962533", email: "puba11130@gmail.com", method: "到店自取", date: "2026-06-24", items: { "伯爵可麗露": 2, "原味禮盒": 1 } },
  { id: "Kxv3w8A", buyer: "李亭儀", phone: "0970031908", email: "angelcat789@gmail.com", method: "冷凍宅配", addr: "新北市汐止區", date: "2026-06-25", items: { "伯爵可麗露": 1, "原味禮盒": 1 } },
  { id: "D3pbtJvq", buyer: "何佩茹", phone: "0939416428", email: "color750@gmail.com", method: "冷凍宅配", addr: "宜蘭縣礁溪鄉", date: "2026-06-25", items: { "伯爵可麗露": 2, "原味禮盒": 1, "伯爵禮盒": 1 } },
  { id: "bTE1eSv2", buyer: "彭穎君", phone: "0976510077", email: "mijun80920@gmail.com", method: "冷凍宅配", addr: "新竹縣芎林鄉", date: "2026-06-25", items: { "伯爵可麗露": 5, "原味禮盒": 2 } },
  { id: "1L1TzegO", buyer: "陳思穎", phone: "0983836585", email: "skyying320@gmail.com", method: "冷凍宅配", addr: "台中市太平區", date: "2026-06-25", items: { "伯爵可麗露": 5 } },
  { id: "DjstizNeC", buyer: "洪培薰", phone: "0965630097", email: "whyuyukos@gmail.com", method: "冷凍宅配", addr: "台中市大里區", date: "2026-06-25", items: { "伯爵可麗露": 10 } },
  { id: "k2qS9nSK", buyer: "黃慧婷", phone: "0937739989", email: "shiba.dog0830@gmail.com", method: "到店自取", date: "2026-06-26", items: { "伯爵可麗露": 3, "原味禮盒": 1 } },
  { id: "PzsfmNXyNK", buyer: "黃詩晏", phone: "0977531238", email: "330.leilei@gmail.com", method: "到店自取", date: "2026-06-27", items: { "杜拜巧克力Q餅": 1 } },
  { id: "V3oDutU0ht", buyer: "何佳叡", phone: "0928902781", email: "1629964125@gmail.com", method: "到店自取", date: "2026-06-25", items: { "杜拜巧克力Q餅": 5 } },
  { id: "CQGb9mySFV", buyer: "張訢銣", phone: "0935830403", email: "grace830403@gmail.com", method: "到店自取", date: "2026-06-24", items: { "杜拜巧克力Q餅": 2 } },
  { id: "tal7an4uBh", buyer: "梁賓祐", phone: "0968299052", email: "liangryanr@gmail.com", method: "冷凍宅配", addr: "南投縣草屯鎮", date: "2026-06-25", items: { "杜拜巧克力Q餅": 4 } }
];

const prices: Record<string, number> = {
  "伯爵可麗露": 120,
  "杜拜巧克力Q餅": 160,
  "原味禮盒": 360,
  "伯爵禮盒": 360,
  "抹茶禮盒": 360
};

// Group by date
const byDate: Record<string, any[]> = {};
orders.forEach(o => {
  if (!byDate[o.date]) byDate[o.date] = [];

  let prodAmt = 0;
  Object.entries(o.items).forEach(([name, qty]) => {
    prodAmt += qty * (prices[name] || 0);
  });

  byDate[o.date].push({
    ...o,
    prodAmt
  });
});

console.log('================== 訂單匯入解析報告 ==================');
let totalRevenue = 0;
const totalItemQty: Record<string, number> = {};

Object.keys(byDate).sort().forEach(date => {
  console.log(`\n📅 日期: ${date} (${byDate[date].length} 筆訂單)`);
  let dateRevenue = 0;
  byDate[date].forEach((o, index) => {
    const itemStr = Object.entries(o.items).map(([name, qty]) => `${name} x${qty}`).join(', ');
    const logisticsInfo = o.method === '冷凍宅配' ? ` | 地址: ${o.addr || '無'}` : '';
    console.log(`  ${index + 1}. 訂購人: ${o.buyer.padEnd(4, ' ')} | 電話: ${o.phone} | 方式: ${o.method.padEnd(4, ' ')}${logisticsInfo} | 商品: ${itemStr} | 金額: $${o.prodAmt}`);
    dateRevenue += o.prodAmt;
    totalRevenue += o.prodAmt;

    Object.entries(o.items).forEach(([name, qty]) => {
      totalItemQty[name] = (totalItemQty[name] || 0) + (qty as number);
    });
  });
  console.log(`  💲 當日小計: $${dateRevenue}`);
});

console.log('\n================== 各品項銷量統計 ==================');
Object.entries(totalItemQty).forEach(([name, qty]) => {
  console.log(`- ${name}: 共 ${qty} ${name.includes('禮盒') ? '盒' : '顆'} (總額: $${(qty as number) * (prices[name] || 0)})`);
});

console.log(`\n💵 總銷售金額: $${totalRevenue}`);
