import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.resolve(process.cwd(), 'may_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('Top-level keys in may_data.json:', Object.keys(data));
if (data.materials) {
  console.log('Materials count in backup:', data.materials.length || Object.keys(data.materials).length);
}
if (data.physicalCounts) {
  console.log('physicalCounts count in backup:', data.physicalCounts.length || Object.keys(data.physicalCounts).length);
}
