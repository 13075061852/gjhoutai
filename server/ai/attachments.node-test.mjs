import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  attachmentStoragePath,
  buildPromptWithAttachments,
  classifyAttachment,
  isSafeUploadId,
  readTextAttachment,
  safeAttachmentName,
  toImageContent,
  validateAttachment,
} from './attachments.mjs';

test('classifies images, text files and binary documents', () => {
  assert.equal(classifyAttachment({ name: 'a.png', type: 'image/png' }), 'image');
  assert.equal(classifyAttachment({ name: 'a.HEIC', type: 'image/heic' }), 'binary');
  assert.equal(classifyAttachment({ name: 'data.csv', type: '' }), 'text');
  assert.equal(classifyAttachment({ name: 'note.md', type: 'text/markdown' }), 'text');
  assert.equal(classifyAttachment({ name: 'rows.json', type: 'application/json' }), 'text');
  assert.equal(classifyAttachment({ name: '测试数据.xlsx', type: '' }), 'binary');
  assert.equal(classifyAttachment({ name: '报告.pdf', type: 'application/pdf' }), 'binary');
});

test('sanitizes dangerous file names', () => {
  assert.equal(safeAttachmentName('../../etc/passwd'), 'passwd');
  assert.equal(safeAttachmentName('C:\\tmp\\图 谱.png'), '图 谱.png');
  assert.equal(safeAttachmentName('a"b<c>|d.txt'), 'abcd.txt');
  assert.equal(safeAttachmentName(''), '附件');
  assert.equal(safeAttachmentName('x'.repeat(300)).length, 160);
  assert.equal(attachmentStoragePath('/tmp/uploads', '../bad user', 'id-1', 'a b.csv'), path.join('/tmp/uploads', 'baduser', 'id-1.csv'));
  assert.equal(isSafeUploadId('8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8'), true);
  assert.equal(isSafeUploadId('../etc/passwd'), false);
});

test('rejects empty and oversized attachments', () => {
  assert.equal(validateAttachment({ name: 'a.png', type: 'image/png', size: 0 }).ok, false);
  assert.equal(validateAttachment({ name: 'a.png', type: 'image/png', size: 9 * 1024 * 1024 }).ok, false);
  assert.equal(validateAttachment({ name: 'a.png', type: 'image/png', size: 7 * 1024 * 1024 }).ok, false);
  assert.deepEqual(validateAttachment({ name: 'a.png', type: 'image/png', size: 2000 }), { ok: true, kind: 'image' });
  assert.deepEqual(validateAttachment({ name: 'a.csv', type: 'text/csv', size: 2000 }), { ok: true, kind: 'text' });
});

test('reads text attachments and turns images into pi image content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gjh-attach-'));
  try {
    const csv = path.join(dir, 'data.csv');
    await writeFile(csv, '\uFEFF型号,批号\n320G6-B1S,A604201\n', 'utf8');
    assert.equal(await readTextAttachment(csv, { name: 'data.csv', type: 'text/csv' }), '型号,批号\n320G6-B1S,A604201\n');
    const xlsx = path.join(dir, 'x.xlsx');
    await writeFile(xlsx, 'binary');
    assert.equal(await readTextAttachment(xlsx, { name: 'x.xlsx', type: '' }), '');
    const png = path.join(dir, 'p.png');
    await writeFile(png, Buffer.from([137, 80, 78, 71]));
    assert.deepEqual(await toImageContent(png, { name: 'p.png', type: 'image/png' }), {
      type: 'image',
      data: Buffer.from([137, 80, 78, 71]).toString('base64'),
      mimeType: 'image/png',
    });
    assert.equal(await toImageContent(png, { name: 'p.xlsx', type: '' }), null);
    const long = path.join(dir, 'long.txt');
    await writeFile(long, 'a'.repeat(70_000), 'utf8');
    const trimmed = await readTextAttachment(long, { name: 'long.txt', type: 'text/plain' });
    assert.ok(trimmed.length < 61_000 && trimmed.includes('附件过长已截断'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('builds the prompt with attachment sections and never invents content', () => {
  const prompt = buildPromptWithAttachments({
    prompt: '这个型号怎么样',
    texts: [{ name: '../tmp/data.csv', text: '型号,灰份\n320G6,4.19' }],
    binaries: [{ name: '测试数据.xlsx', size: 20480, type: '' }],
  });
  assert.ok(prompt.startsWith('这个型号怎么样'));
  assert.match(prompt, /【附件 data\.csv 的完整内容（服务器已读出，直接使用，不要说读不到）】/);
  assert.ok(prompt.includes('型号,灰份\n320G6,4.19'));
  assert.match(prompt, /【以下文件只有文件名，服务器无法解析其内容】\n- 测试数据\.xlsx（20 KB，未知类型）/);
  assert.equal(buildPromptWithAttachments({ prompt: '  ' }), '');
  assert.equal(buildPromptWithAttachments({ prompt: 'hi', texts: [{ name: 'a.txt', text: '' }] }), 'hi');
});
