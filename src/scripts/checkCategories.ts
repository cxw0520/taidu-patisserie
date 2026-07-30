import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.resolve(process.cwd(), 'may_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const categories = new Set();
data.materials.forEach((m: any) => {
  categories.add(m.category);
});

console.log('Categories in backup materials:', Array.from(categories));
