import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const withEnv = async (values, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('writes the custom endpoint model with declared input modalities and image limits', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gjh-ai-config-'));
  try {
    const payload = await withEnv({
      DATA_DIR: dir,
      AI_AGENT_DIR: path.join(dir, 'pi'),
      AI_BASE_URL: 'https://api.deepseek.com/v1',
      AI_PROVIDER_ID: 'deepseek',
      AI_MODEL: 'deepseek:deepseek-chat',
      AI_MODEL_INPUT: undefined,
    }, async () => {
      const { ensureAgentDir, modelsPath } = await import(`./config.mjs?case=${Date.now()}`);
      await ensureAgentDir();
      return JSON.parse(await readFile(modelsPath, 'utf8'));
    });
    const provider = payload.providers.deepseek;
    assert.equal(provider.models[0].id, 'deepseek-chat');
    assert.deepEqual(provider.models[0].input, ['text', 'image']);
    assert.equal(provider.models[0].inputLimits.images.resize.maxWidth, 1568);
    assert.equal(provider.apiKey, '${AI_API_KEY}');
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
});

test('honours a text-only AI_MODEL_INPUT so a non-vision model is not sent images', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gjh-ai-config-'));
  try {
    const payload = await withEnv({
      DATA_DIR: dir,
      AI_AGENT_DIR: path.join(dir, 'pi'),
      AI_BASE_URL: 'https://api.example.com/v1',
      AI_PROVIDER_ID: 'demo',
      AI_MODEL: 'demo:deepseek-v4-pro',
      AI_MODEL_INPUT: 'text',
    }, async () => {
      const { ensureAgentDir, modelsPath } = await import(`./config.mjs?case=${Date.now()}`);
      await ensureAgentDir();
      return JSON.parse(await readFile(modelsPath, 'utf8'));
    });
    assert.deepEqual(payload.providers.demo.models[0].input, ['text']);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
});
