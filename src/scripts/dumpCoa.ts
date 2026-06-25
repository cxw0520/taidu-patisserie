import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.resolve(process.cwd(), 'may_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('COA:', JSON.stringify(data.coa, null, 2));
