#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = '/root/.openclaw/workspace';
const globalEnvPath = '/root/.openclaw/.env';
const configPath = path.join(workspaceRoot, 'repliz/slot-config.json');

loadSimpleEnv(globalEnvPath);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const topicsCatalog = loadTopicsCatalog(config.dailyTopicFile);
const args = process.argv.slice(2);
const command = args[0] ?? 'next';

const baseUrl = process.env.REPLIZ_BASE_URL ?? 'https://api.repliz.com';
const accessKey = process.env.REPLIZ_ACCESS_KEY;
const secretKey = process.env.REPLIZ_SECRET_KEY;

if (!accessKey || !secretKey) {
  console.error('Missing REPLIZ_ACCESS_KEY or REPLIZ_SECRET_KEY');
  process.exit(1);
}

const headers = {
  Authorization: `Basic ${Buffer.from(`${accessKey}:${secretKey}`).toString('base64')}`,
  'Content-Type': 'application/json'
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});

async function main() {
  if (command === 'next') {
    const accountId = getOption('--account-id');
    const result = await getNextAvailableSlot({ accountId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'schedule') {
    const descriptionRaw = getOption('--text') ?? getOption('--description');
    if (!descriptionRaw) {
      console.error('Missing --text');
      process.exit(1);
    }

    const accountId = getOption('--account-id');
    const title = getOption('--title') ?? config.defaultTitle ?? '';
    const type = getOption('--type') ?? config.defaultType ?? 'text';
    const dryRun = hasFlag('--dry-run');
    const description = sanitizeText(descriptionRaw);
    const next = await getNextAvailableSlot({ accountId });

    const payload = {
      title,
      description,
      type,
      medias: [],
      scheduleAt: next.slot.scheduleAtUtc,
      accountId: next.account._id
    };

    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, selectedSlot: next.slot, payload }, null, 2));
      return;
    }

    const created = await api('/public/schedule', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    console.log(JSON.stringify({ dryRun: false, selectedSlot: next.slot, payload, created }, null, 2));
    return;
  }

  if (command === 'schedule-daily-nested') {
    const accountId = getOption('--account-id');
    const dryRun = hasFlag('--dry-run');
    const forceSlug = getOption('--slug');
    const next = await getNextAvailableSlot({ accountId });
    const topic = pickTopicForDate(new Date(next.slot.scheduleAtUtc), forceSlug);
    const payload = buildNestedPayload(topic, next);

    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, selectedSlot: next.slot, topic, payload }, null, 2));
      return;
    }

    const created = await api('/public/schedule', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    console.log(JSON.stringify({ dryRun: false, selectedSlot: next.slot, topic, payload, created }, null, 2));
    return;
  }

  if (command === 'preview-daily-nested') {
    const accountId = getOption('--account-id');
    const forceSlug = getOption('--slug');
    const next = await getNextAvailableSlot({ accountId });
    const topic = pickTopicForDate(new Date(next.slot.scheduleAtUtc), forceSlug);
    const payload = buildNestedPayload(topic, next);
    console.log(JSON.stringify({ selectedSlot: next.slot, topic, payload }, null, 2));
    return;
  }

  if (command === 'topics') {
    console.log(JSON.stringify(topicsCatalog, null, 2));
    return;
  }

  if (command === 'slots') {
    const accountId = getOption('--account-id');
    const result = await inspectSlots({ accountId, days: Number(getOption('--days') ?? '3') });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Usage:');
  console.error('  node scripts/repliz-slot-scheduler.mjs next [--account-id ID]');
  console.error('  node scripts/repliz-slot-scheduler.mjs slots [--account-id ID] [--days 3]');
  console.error('  node scripts/repliz-slot-scheduler.mjs topics');
  console.error('  node scripts/repliz-slot-scheduler.mjs schedule --text "..." [--account-id ID] [--title "..."] [--type text] [--dry-run]');
  console.error('  node scripts/repliz-slot-scheduler.mjs preview-daily-nested [--account-id ID] [--slug TOPIC_SLUG]');
  console.error('  node scripts/repliz-slot-scheduler.mjs schedule-daily-nested [--account-id ID] [--slug TOPIC_SLUG] [--dry-run]');
  process.exit(1);
}

async function getNextAvailableSlot({ accountId }) {
  const account = await resolveAccount(accountId);
  const schedules = await fetchSchedules(account._id, 200);
  const occupied = buildOccupiedSlotKeySet(schedules.docs ?? []);

  const now = new Date();
  const maxDaysToSearch = 30;
  for (let dayOffset = 0; dayOffset < maxDaysToSearch; dayOffset += 1) {
    const slots = buildDaySlots(now, dayOffset);
    for (const slot of slots) {
      if (slot.utcMs <= Date.now()) continue;
      if (!occupied.has(slot.slotKey)) {
        return {
          account,
          slot,
          slotRules: config,
          checkedScheduleCount: schedules.docs?.length ?? 0
        };
      }
    }
  }

  throw new Error('No empty slot found in the next 30 days');
}

async function inspectSlots({ accountId, days }) {
  const account = await resolveAccount(accountId);
  const schedules = await fetchSchedules(account._id, 200);
  const occupied = buildOccupiedSlotKeySet(schedules.docs ?? []);
  const today = new Date();
  const output = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    for (const slot of buildDaySlots(today, dayOffset)) {
      output.push({
        ...slot,
        occupied: occupied.has(slot.slotKey)
      });
    }
  }

  return {
    account,
    slotRules: config,
    checkedScheduleCount: schedules.docs?.length ?? 0,
    slots: output
  };
}

async function resolveAccount(accountId) {
  if (accountId) {
    return api(`/public/account/${accountId}`);
  }

  const accounts = await api('/public/account?limit=100&page=1');
  const connected = (accounts.docs ?? []).filter((item) => item.isConnected);

  if (connected.length === 1) {
    return connected[0];
  }

  if (connected.length === 0) {
    throw new Error('No connected Repliz account found');
  }

  throw new Error('Multiple connected accounts found. Pass --account-id explicitly.');
}

async function fetchSchedules(accountId, limit) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('page', '1');
  params.append('accountIds[]', accountId);
  return api(`/public/schedule?${params.toString()}`);
}

function loadTopicsCatalog(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { niche: [], threadLength: config.nestedThreadLength ?? 4, topics: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    niche: parsed.niche ?? [],
    threadLength: parsed.threadLength ?? config.nestedThreadLength ?? 4,
    topics: Array.isArray(parsed.topics) ? parsed.topics : []
  };
}

function pickTopicForDate(date, forceSlug) {
  if (!topicsCatalog.topics.length) {
    throw new Error('No daily topics configured');
  }

  if (forceSlug) {
    const found = topicsCatalog.topics.find((item) => item.slug === forceSlug);
    if (!found) {
      throw new Error(`Topic slug not found: ${forceSlug}`);
    }
    return found;
  }

  const parts = toOffsetDateParts(date, config.timezoneOffsetMinutes);
  const daySeed = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0) / 86400000;
  const index = Math.abs(daySeed) % topicsCatalog.topics.length;
  return topicsCatalog.topics[index];
}

function buildNestedPayload(topic, next) {
  const threadLength = config.nestedThreadLength ?? topicsCatalog.threadLength ?? 4;
  const posts = (topic.posts ?? []).slice(0, threadLength).map((text) => sanitizeText(text));

  if (!posts.length) {
    throw new Error(`Topic has no posts: ${topic.slug}`);
  }

  return {
    title: sanitizeText(topic.title ?? ''),
    description: posts[0],
    type: config.defaultType ?? 'text',
    medias: [],
    scheduleAt: next.slot.scheduleAtUtc,
    accountId: next.account._id,
    replies: posts.slice(1).map((text) => ({
      title: '',
      description: text,
      type: 'text',
      medias: []
    }))
  };
}

function buildOccupiedSlotKeySet(schedules) {
  const set = new Set();
  for (const item of schedules) {
    const when = item.scheduleAt ?? item.createdAt;
    if (!when) continue;
    const slot = mapDateToSlot(new Date(when));
    if (slot) set.add(slot.slotKey);
  }
  return set;
}

function buildDaySlots(referenceDate, dayOffset) {
  const localBase = toOffsetDateParts(referenceDate, config.timezoneOffsetMinutes);
  const targetDay = addLocalDays(localBase, dayOffset);
  const slots = [];

  for (let i = 0; i < config.slotCount; i += 1) {
    const hour = config.startHour + (i * config.intervalHours);
    const slotLocal = {
      year: targetDay.year,
      month: targetDay.month,
      day: targetDay.day,
      hour,
      minute: 0,
      second: 0,
      ms: 0
    };
    const utcMs = localPartsToUtcMs(slotLocal, config.timezoneOffsetMinutes);
    const slotDate = new Date(utcMs);
    slots.push({
      slotIndex: i + 1,
      slotKey: `${targetDay.year}-${pad(targetDay.month)}-${pad(targetDay.day)} ${pad(hour)}:00`,
      localDate: `${targetDay.year}-${pad(targetDay.month)}-${pad(targetDay.day)}`,
      localTime: `${pad(hour)}:00`,
      scheduleAtUtc: slotDate.toISOString(),
      utcMs
    });
  }

  return slots;
}

function mapDateToSlot(date) {
  const parts = toOffsetDateParts(date, config.timezoneOffsetMinutes);
  if (parts.minute !== 0) return null;
  if (parts.hour < config.startHour) return null;
  const delta = parts.hour - config.startHour;
  if (delta % config.intervalHours !== 0) return null;
  const slotIndex = (delta / config.intervalHours) + 1;
  if (slotIndex < 1 || slotIndex > config.slotCount) return null;

  return {
    slotIndex,
    slotKey: `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:00`
  };
}

function sanitizeText(text) {
  const trimmed = text.trim();
  if (!config.sanitizeChineseCharacters) return trimmed;
  return trimmed.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '').replace(/\s{2,}/g, ' ').trim();
}

async function api(resource, options = {}) {
  const response = await fetch(`${baseUrl}${resource}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!response.ok) {
    throw new Error(`Repliz API ${response.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }

  return json;
}

function getOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

function loadSimpleEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    if (process.env[key]) continue;
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function toOffsetDateParts(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

function localPartsToUtcMs(parts, offsetMinutes) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.ms) - offsetMinutes * 60_000;
}

function addLocalDays(parts, dayOffset) {
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 0, 0, 0, 0);
  const shifted = new Date(utcMs);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}
