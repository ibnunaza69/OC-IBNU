#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const here = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const envPath = path.join(here, '.env');
const outputsDir = path.join(here, 'outputs');
fs.mkdirSync(outputsDir, { recursive: true });
loadEnvFile(envPath);

const GC_API_KEY = process.env.GC_API_KEY;
const GC_BASE_URL = (process.env.GC_BASE_URL || 'https://ai.growthcircle.id').replace(/\/$/, '');
const GC_ASSET_BASE_URL = (process.env.GC_ASSET_BASE_URL || 'https://growthcircle.id').replace(/\/$/, '');
const GC_DEFAULT_MODEL = process.env.GC_DEFAULT_MODEL || 'gpt-image-2';
const GC_DEFAULT_SIZE = process.env.GC_DEFAULT_SIZE || '1:1';
const GC_DEFAULT_N = Number(process.env.GC_DEFAULT_N || '1');
const GC_POLL_INTERVAL_MS = Number(process.env.GC_POLL_INTERVAL_MS || '3000');
const GC_POLL_TIMEOUT_MS = Number(process.env.GC_POLL_TIMEOUT_MS || '180000');

if (!GC_API_KEY) {
  console.error('Missing GC_API_KEY. Fill growthcircle_image/.env first.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const command = argv[0] || 'generate';

const PRESETS = {
  faceless: 'Create a faceless cinematic portrait of a person from behind in a clean modern setting, no visible face, no text, high detail, soft natural lighting, realistic composition.',
  product: 'Create a premium product showcase image with clean studio lighting, realistic shadows, elegant composition, no text.',
  poster: 'Create a bold promotional poster-style image with strong composition, dramatic lighting, and space for headline placement, but do not render any text.',
  thumbnail: 'Create a high-contrast thumbnail-style image with a strong focal subject, dramatic lighting, and clean background, no text.'
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});

async function main() {
  if (command === 'models') {
    const data = await api('/v1/models');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'poll') {
    const taskId = getOption('--task-id');
    if (!taskId) throw new Error('Missing --task-id');
    const task = await pollTask(taskId);
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  if (command === 'download') {
    const assetUrl = getOption('--url');
    if (!assetUrl) throw new Error('Missing --url');
    const output = getOption('--output') || path.join(outputsDir, buildOutputName('downloaded', 'png'));
    const saved = await downloadAsset(assetUrl, output);
    console.log(JSON.stringify(saved, null, 2));
    return;
  }

  if (command === 'generate') {
    const preset = getOption('--preset');
    const prompt = getOption('--prompt') || (preset ? PRESETS[preset] : null);
    if (!prompt) {
      throw new Error('Missing --prompt or --preset. Available presets: ' + Object.keys(PRESETS).join(', '));
    }
    const size = getOption('--size') || GC_DEFAULT_SIZE;
    const n = Number(getOption('--n') || GC_DEFAULT_N);
    const model = getOption('--model') || GC_DEFAULT_MODEL;
    const output = getOption('--output');
    const imageUrls = getMultiOption('--image-url');

    if (n !== 1) throw new Error('gpt-image-2 helper currently supports n=1 only.');

    const submitPayload = { model, prompt, size, n };
    if (imageUrls.length) submitPayload.image_urls = imageUrls;

    const submitted = await api('/v1/images/generations', {
      method: 'POST',
      body: JSON.stringify(submitPayload)
    });

    const taskId = submitted?.data?.[0]?.task_id;
    if (!taskId) {
      console.log(JSON.stringify(submitted, null, 2));
      throw new Error('Submit succeeded but task_id was not found in response.');
    }

    const task = await pollTask(taskId);
    const imageUrl = extractImageUrl(task);
    if (!imageUrl) {
      console.log(JSON.stringify(task, null, 2));
      throw new Error('Task completed but no image URL found in result.');
    }

    const inferredExt = guessExtension(imageUrl) || 'png';
    const finalOutput = output || path.join(outputsDir, buildOutputName(slugify(preset || prompt).slice(0, 40) || 'image', inferredExt));
    const saved = await downloadAsset(imageUrl, finalOutput);

    console.log(JSON.stringify({
      submit: submitted,
      task,
      saved
    }, null, 2));
    return;
  }

  console.error('Unknown command:', command);
  console.error('Commands:');
  console.error('  node generate-image.mjs models');
  console.error('  node generate-image.mjs generate --preset faceless');
  console.error('  node generate-image.mjs generate --prompt "..." [--size 1:1] [--output outputs/file.png] [--image-url URL]');
  console.error('  node generate-image.mjs poll --task-id imgtask_xxx');
  console.error('  node generate-image.mjs download --url https://... --output outputs/file.png');
  process.exit(1);
}

async function api(endpoint, init = {}) {
  const response = await fetch(`${GC_BASE_URL}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GC_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`API ${endpoint} failed with ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function pollTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < GC_POLL_TIMEOUT_MS) {
    const task = await api(`/v1/tasks/${taskId}`, { method: 'GET' });
    const status = task?.data?.status;
    if (status === 'completed') return task;
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(`Task ${taskId} ended with status ${status}: ${JSON.stringify(task)}`);
    }
    await sleep(GC_POLL_INTERVAL_MS);
  }
  throw new Error(`Polling timeout after ${GC_POLL_TIMEOUT_MS}ms for task ${taskId}`);
}

function extractImageUrl(task) {
  const raw = task?.data?.result?.images?.[0]?.url;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return null;
  if (/^https?:\/\//i.test(first)) return first;
  if (first.startsWith('/')) return `${GC_ASSET_BASE_URL}${first}`;
  return `${GC_ASSET_BASE_URL}/${first}`;
}

async function downloadAsset(url, outputPath) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Asset download failed with ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return {
    url,
    outputPath,
    bytes: buffer.length,
    contentType: response.headers.get('content-type')
  };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function getOption(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function getMultiOption(name) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name && argv[i + 1]) values.push(argv[i + 1]);
  }
  return values;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildOutputName(base, ext) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${base}-${stamp}.${ext}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function guessExtension(url) {
  const clean = url.split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}
