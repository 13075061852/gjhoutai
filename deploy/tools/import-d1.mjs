import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const [sqlPath, dbPath] = process.argv.slice(2);
if (!sqlPath || !dbPath) {
  console.error('usage: node import-d1.mjs <dump.sql> <target.sqlite>');
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error(`dump not found: ${sqlPath}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(dbPath + suffix, { force: true });
}
const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new Database(dbPath);
const started = Date.now();
db.pragma('foreign_keys = OFF');
db.exec(sql);
db.exec('PRAGMA foreign_keys = ON;');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
for (const table of tables) {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM "${table.name}"`).get().c;
  console.log(`${table.name}\t${count}`);
}
db.close();
console.log(`imported ${sqlPath} -> ${dbPath} in ${Date.now() - started}ms`);
