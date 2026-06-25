import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.resolve(process.cwd(), 'may_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('Root keys of may_data.json:', Object.keys(data));
if (data.materials) {
  console.log('Materials list length:', data.materials.length);
  if (data.materials.length > 0) {
    console.log('Sample material:', JSON.stringify(data.materials[0], null, 2));
  }
} else {
  console.log('Materials not found in may_data.json.');
}
