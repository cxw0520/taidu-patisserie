import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.resolve(process.cwd(), 'may_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// We want to scan data.entries for lines that are raw materials (accountId 1301 or 5101)
// or check lines with accountName including "原料" or "進貨"
const materialPurchases = new Set<string>();

if (data.entries) {
  for (const entry of data.entries) {
    if (entry.lines) {
      for (const line of entry.lines) {
        if (
          line.accountId === '1301' || 
          line.accountId === '5101' ||
          (line.accountName && (line.accountName.includes('原料') || line.accountName.includes('進貨') || line.accountName.includes('消耗')))
        ) {
          if (line.lineDescription) {
            materialPurchases.add(line.lineDescription);
          }
        }
      }
    }
  }
}

console.log('--- Material purchases descriptions from entries ---');
Array.from(materialPurchases).forEach(desc => {
  console.log(`- ${desc}`);
});
