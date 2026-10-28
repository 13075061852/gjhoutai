import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, test } from 'node:test';
import { createBusinessActions, propertyRowRef } from './business-actions.mjs';

let db, actions, blobs, oldFetch;
const token = 'action-test-login';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const pdf = Buffer.from('%PDF-1.7 test file');
const attachmentId = '12345678-1234-1234-1234-123456789abc';
const keys = { ash_records: 'gjh-ash-records-v1', office_records: 'gjh-office-records-v1', spectrum_records: 'gjh-spectrum-user-images-v2', report_ranges: 'gjh-property-report-ranges-v1' };
const state = (key, value, double = true) => db.prepare('INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, double ? JSON.stringify(JSON.stringify(value)) : JSON.stringify(value));
const read = (key) => { let value = db.prepare('SELECT value FROM app_state WHERE key=?').get(key)?.value; while (typeof value === 'string') value = JSON.parse(value); return value; };
const headers = () => ({ cookie: `gjh_session=${token}`, origin: 'http://127.0.0.1:5001', 'content-type': 'application/json' });
async function request(path, body, extra = {}) {
  const response = await actions.handle(new Request(`http://localhost/api/business-actions/${path}`, { method: body ? 'POST' : 'GET', headers: headers(), ...(body ? { body: JSON.stringify(body) } : {}), ...extra }));
  return { status: response.status, body: await response.json(), response };
}
const prepare = (dataset, operation, items, extra = {}) => request('prepare', { dataset, operation, items, threadId: 'thread1', ...extra });
const commit = (proposal, threadId = 'thread1') => request(`${proposal.id}/commit`, { threadId });

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  for (const file of readdirSync(new URL('../../migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO users(id,username,display_name,role,department,password_hash,password_salt) VALUES(?,?,?,?,?,?,?)').run('u1','admin','管理员','system_admin','系统管理员','x','y');
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').run('s1','u1',hash(token),new Date(Date.now()+3600_000).toISOString());
  blobs = new Map();
  const files = { put: async (key, bytes, options) => { blobs.set(key, { bytes, options }); }, delete: async (key) => { blobs.delete(key); } };
  actions = createBusinessActions({ db, files, allowedOrigins: 'http://127.0.0.1:5001', readOnly: false });
  oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.cookie, `gjh_session=${token}`);
    assert.equal(String(url), `http://127.0.0.1:8790/gjhoutai/api/ai/uploads/${attachmentId}`);
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  };
});
afterEach(() => { db.close(); globalThis.fetch = oldFetch; });

test('production default read-only rejects new prepares and historical commits without data writes', async () => {
  const p = await prepare('ash_records', 'create', [{ data: { date:'2026-10-10', name:'fixture', rows:[{content:'25%'}] } }]);
  assert.equal(p.status,201);
  actions = createBusinessActions({ db, files: {}, allowedOrigins: 'http://127.0.0.1:5001' });
  assert.equal((await commit(p.body.proposal)).status,403);
  assert.equal((await prepare('ash_records','create',[{data:{}}])).status,403);
  assert.equal(read(keys.ash_records),undefined);
});

const ash = { date: '2026-10-10', name: '测试材料', batch: '', rows: [{ cupWeight: '10', materialWeight: '2', residueWeight: '10.5' }] };

test('灰份新增只有确认后写入，称重计算、页面格式与审计一致，重复确认幂等', async () => {
  const prepared = await prepare('ash_records', 'create', [{ data: ash }]);
  assert.equal(prepared.status, 201);
  assert.equal(read(keys.ash_records), undefined);
  assert.equal(prepared.body.proposal.changes[0].after.rows[0].content, '25%');
  const result = await commit(prepared.body.proposal);
  assert.equal(result.status, 200);
  assert.equal(result.body.proposal.status, 'committed');
  assert.equal(read(keys.ash_records).length, 1);
  assert.equal(read(keys.ash_records)[0].name, '测试材料');
  const replay = await commit(prepared.body.proposal);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(read(keys.ash_records).length, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_logs').get().n, 1);
});

test('灰份修改/删除使用精确id；先预览后提交，保留可恢复的before快照', async () => {
  state(keys.ash_records, [{ ...ash, id: 'ASH-1', rows: [{ content: '25%' }] }]);
  const updated = await prepare('ash_records', 'update', [{ id: 'ASH-1', data: { name: '更正名称' } }]);
  assert.equal(updated.status, 201);
  assert.equal((await commit(updated.body.proposal)).status, 200);
  assert.equal(read(keys.ash_records)[0].name, '更正名称');
  const deleted = await prepare('ash_records', 'delete', [{ id: 'ASH-1' }]);
  assert.equal(read(keys.ash_records).length, 1);
  assert.equal((await commit(deleted.body.proposal)).status, 200);
  assert.deepEqual(read(keys.ash_records), []);
  const backup = JSON.parse(db.prepare('SELECT plan_json FROM ai_business_actions WHERE id=?').get(deleted.body.proposal.id).plan_json);
  assert.equal(backup.changes[0].before.name, '更正名称');
  assert.equal((await prepare('ash_records','delete',[{id:'does-not-exist'}])).status, 409);
});

test('数据变化后不能以旧预览覆盖，新权限变化也会在提交时重新检查', async () => {
  const draft = await prepare('ash_records', 'create', [{ data: ash }]);
  state(keys.ash_records, [{ ...ash, id: 'someone-else' }]);
  assert.equal((await commit(draft.body.proposal)).status, 409);
  assert.equal(read(keys.ash_records)[0].id, 'someone-else');
  const next = await prepare('ash_records', 'create', [{ data: { ...ash, name: '其他名称' } }]);
  db.prepare('UPDATE users SET department=? WHERE id=?').run('研发部','u1');
  assert.equal((await commit(next.body.proposal)).status, 403);
});

test('拒绝过期、取消、跨用户或跨会话提交；来源与登录验证不能绕过', async () => {
  const p = (await prepare('ash_records', 'create', [{ data: ash }])).body.proposal;
  assert.equal((await commit(p, 'other-thread')).status, 404);
  db.prepare('INSERT INTO users(id,username,display_name,role,department,password_hash,password_salt) VALUES(?,?,?,?,?,?,?)').run('u2','other','其他','system_admin','系统管理员','x','y');
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').run('s2','u2',hash('other-token'),new Date(Date.now()+3600_000).toISOString());
  assert.equal((await request(`${p.id}/commit`, { threadId: 'thread1' }, { headers: { ...headers(), cookie: 'gjh_session=other-token' } })).status, 404);
  assert.equal((await request('prepare', { dataset:'ash_records' }, { headers: { 'content-type': 'application/json' } })).status, 401);
  assert.equal((await request(`${p.id}/commit`, { threadId:'thread1' }, { headers: { ...headers(), origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request(`${p.id}/commit`, { threadId:'thread1' }, { headers: { cookie: `gjh_session=${token}`, 'content-type': 'application/json' } })).status, 403);
  db.prepare('UPDATE ai_business_actions SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z',p.id);
  assert.equal((await commit(p)).status, 409);
  const next = (await prepare('ash_records','create',[{data:ash}])).body.proposal;
  assert.equal((await request(`${next.id}/cancel`, {threadId:'thread1'})).status, 200);
  assert.equal((await commit(next)).status, 409);
  assert.equal(read(keys.ash_records), undefined);
});

test('字段未知/日期模糊/称重冲突/重复录入一律拒绝，不生成猜测数据', async () => {
  for (const data of [{...ash,date:'2026-02-30'}, {...ash,name:''}, {...ash,rows:[{content:'101%'}]}, {...ash,rows:[{cupWeight:'10',materialWeight:'2',residueWeight:'10.5',content:'30%'}]}, {...ash,admin:true}]) {
    assert.equal((await prepare('ash_records','create',[{data}])).status, 400);
  }
  state(keys.ash_records,[{...ash,id:'existing'}]);
  assert.equal((await prepare('ash_records','create',[{data:ash}])).status,409);
  assert.equal((await prepare('gjh-role-page-permissions-v1','delete',[{id:'x'}])).status,400);
});

test('一次批量只要一条无效就整体不写，审计失败也回滚业务与状态', async () => {
  assert.equal((await prepare('ash_records','create',[{data:ash},{data:{...ash,name:''}}])).status,400);
  assert.equal(read(keys.ash_records),undefined);
  const p=(await prepare('ash_records','create',[{data:ash}])).body.proposal;
  db.exec('DROP TABLE audit_logs');
  const original=console.error; console.error=()=>{};
  try { assert.equal((await commit(p)).status,500); } finally { console.error=original; }
  assert.equal(read(keys.ash_records),undefined);
  assert.equal(db.prepare('SELECT status FROM ai_business_actions WHERE id=?').get(p.id).status,'pending');
});

test('送样/配色与报告判定范围完整增删改，保留双层JSON存储格式', async () => {
  for (const [dataset,data,update] of [
    ['office_records',{type:'sampling',project:'测试项目',date:'2026-10-10',tableColumns:['型号','数量'],tableRows:[['PBT','2']]},{project:'更正项目'}],
    ['report_ranges',{model:'PBT-1',metricKey:'灰份',item:'灰份',unit:'%',range:'23~27'},{range:'24~26'}],
  ]) {
    state(keys[dataset],[]);
    const p=(await prepare(dataset,'create',[{data}])).body.proposal;
    assert.equal((await commit(p)).status,200);
    const stored=read(keys[dataset]); assert.equal(stored.length,1);
    assert.equal(typeof JSON.parse(db.prepare('SELECT value FROM app_state WHERE key=?').get(keys[dataset]).value),'string');
    if(dataset==='office_records') assert.equal(stored[0].tableColumns[0],'编号');
    const u=await prepare(dataset,'update',[{id:stored[0].id,data:update}]);
    assert.equal(u.status,201); assert.equal((await commit(u.body.proposal)).status,200);
    const d=await prepare(dataset,'delete',[{id:stored[0].id}]);
    assert.equal((await commit(d.body.proposal)).status,200); assert.deepEqual(read(keys[dataset]),[]);
  }
});

test('物性行使用真实分表和内容指纹，更新视图但保留原始raw文件快照', async () => {
  const initial={型号:'PBT-1',批次:'B1',灰份:'25',日期:'2026-10-10'};
  const data={project:{activeSheetName:'测试表'},sheets:{merged:{测试表:[initial]},raw:{测试表:[initial]}},currentView:{processedData:[initial],compareItems:[]}};
  db.prepare('INSERT INTO property_data(id,data_json,source_file_name) VALUES(1,?,?)').run(JSON.stringify(data),'测试.xlsx');
  const u=await prepare('property_rows','update',[{id:propertyRowRef(initial),data:{灰份:'26'}}],{sheet:'测试表'});
  assert.equal(u.status,201); assert.equal((await commit(u.body.proposal)).status,200);
  const stored=JSON.parse(db.prepare('SELECT data_json FROM property_data').get().data_json);
  assert.equal(stored.sheets.merged.测试表[0].灰份,'26'); assert.equal(stored.currentView.processedData[0].灰份,'26'); assert.equal(stored.sheets.raw.测试表[0].灰份,'25');
  assert.equal((await prepare('property_rows','update',[{id:propertyRowRef(initial),data:{灰份:'27'}}],{sheet:'测试表'})).status,409);
  const c=await prepare('property_rows','create',[{data:{...initial,批次:'B2'}}],{sheet:'测试表'}); assert.equal((await commit(c.body.proposal)).status,200);
  const d=await prepare('property_rows','delete',[{id:propertyRowRef({...initial,批次:'B2'})}],{sheet:'测试表'}); assert.equal((await commit(d.body.proposal)).status,200);
});

test('图谱新增拷贝用户附件，修改合并手工覆盖，删除不破坏原图，可取消未提交文件', async () => {
  const data={title:'测试DSC',spectrumType:'DSC',date:'2026-10-10',category:'测试',tags:[]};
  const c=await prepare('spectrum_records','create',[{data,attachmentId}]); assert.equal(c.status,201);
  const p=c.body.proposal; assert.equal(blobs.size,1); assert.equal(read(keys.spectrum_records),undefined);
  assert.equal((await commit(p)).status,200);
  const id=read(keys.spectrum_records)[0].id;
  state('gjh-spectrum-edits-v2',{[id]:{title:'手工更名'}});
  const u=await prepare('spectrum_records','update',[{id,data:{note:'新增备注'}}]); assert.equal(u.body.proposal.changes[0].after.title,'手工更名');
  assert.equal((await commit(u.body.proposal)).status,200); assert.deepEqual(read('gjh-spectrum-edits-v2'),{});
  const d=await prepare('spectrum_records','delete',[{id}]); assert.equal((await commit(d.body.proposal)).status,200); assert.equal(blobs.size,1);
  const c2=await prepare('spectrum_records','create',[{data,attachmentId}]); assert.equal(blobs.size,2);
  assert.equal((await request(`${c2.body.proposal.id}/cancel`,{threadId:'thread1'})).status,200); assert.equal(blobs.size,1);
});

test('过期的未确认文件自动清理，但已确认记录与原文件不受影响', async () => {
  const c=await prepare('spectrum_records','create',[{data:{title:'待取消',spectrumType:'DSC',date:'2026-10-10',tags:[]},attachmentId}]);
  assert.equal(blobs.size,1);
  db.prepare('UPDATE ai_business_actions SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z',c.body.proposal.id);
  assert.equal((await prepare('ash_records','create',[{data:ash}])).status,201);
  assert.equal(blobs.size,0);
  assert.equal(db.prepare('SELECT status FROM ai_business_actions WHERE id=?').get(c.body.proposal.id).status,'expired');
  assert.equal((await commit(c.body.proposal)).status,409);
});

test('部门权限优先于旧role，退休权限覆盖无效，确认体不能篡改变更内容', async () => {
  db.prepare('UPDATE users SET department=? WHERE id=?').run('研发部','u1');
  assert.equal((await prepare('ash_records','create',[{data:ash}])).status,403);
  state('gjh-role-page-permissions-v1',{'department:研发部':{'office-records':{view:true,edit:true}}});
  assert.equal((await prepare('ash_records','create',[{data:ash}])).status,403);
  db.prepare('UPDATE users SET department=? WHERE id=?').run('系统管理员','u1');
  const p=(await prepare('ash_records','create',[{data:ash}])).body.proposal;
  assert.ok(p?.id);
  assert.equal((await request(`${p.id}/commit`,{threadId:'thread1',data:{name:'篡改'}})).status,400);
  assert.equal(read(keys.ash_records),undefined);
  assert.equal((await commit(p)).status,200);
  assert.equal(read(keys.ash_records)[0].name,ash.name);
});

test('检测报告必须是用户真实PDF附件，支持元信息修改和删除，原文件保留供恢复', async () => {
  const bad=await prepare('inspection_reports','create',[{data:{title:'测试报告'},attachmentId}]); assert.equal(bad.status,400);
  globalThis.fetch=async()=>new Response(pdf,{headers:{'content-type':'application/pdf'}});
  const c=await prepare('inspection_reports','create',[{data:{title:'测试报告',category:'PBT',notes:'备注',fileName:'测试.pdf'},attachmentId}]); assert.equal(c.status,201);
  assert.equal((await commit(c.body.proposal)).status,200);
  const row=db.prepare('SELECT * FROM inspection_reports').get(); assert.equal(row.file_name,'测试.pdf'); assert.equal(row.created_by,'u1');
  const u=await prepare('inspection_reports','update',[{id:row.id,data:{title:'更正报告'}}]); assert.equal((await commit(u.body.proposal)).status,200); assert.equal(db.prepare('SELECT title FROM inspection_reports').get().title,'更正报告');
  const d=await prepare('inspection_reports','delete',[{id:row.id}]); assert.equal((await commit(d.body.proposal)).status,200); assert.equal(db.prepare('SELECT count(*) AS n FROM inspection_reports').get().n,0); assert.equal(blobs.size,1);
});
