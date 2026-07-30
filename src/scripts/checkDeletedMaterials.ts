import * as fs from 'fs';
import * as path from 'path';

function run() {
  const deletedPath = path.resolve(process.cwd(), 'deleted_materials.json');
  const backupPath = path.resolve(process.cwd(), 'may_data.json');

  if (!fs.existsSync(deletedPath)) {
    console.log('Error: deleted_materials.json does not exist yet. Please open the count sheet in the browser to trigger the report!');
    return;
  }

  const report = JSON.parse(fs.readFileSync(deletedPath, 'utf8'));
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

  const backupMaterials = backup.materials || [];
  const materialsMap = new Map<string, string>();
  
  // Build a map of ID -> Name from the backup
  backupMaterials.forEach((m: any) => {
    materialsMap.set(m.id, m.name);
  });

  console.log(`\n--- 盤點報告分析 ---`);
  console.log(`盤點月份: ${report.month}`);
  console.log(`已刪除但存在於盤點記錄中的物料 ID 數量: ${report.deletedIds.length}`);
  console.log(`\n具體刪除的物料名稱列表:`);
  
  report.deletedIds.forEach((id: string) => {
    const name = materialsMap.get(id) || `未知物料 (${id})`;
    console.log(`- ${name} (ID: ${id})`);
  });
  console.log(`--------------------\n`);
}

run();
