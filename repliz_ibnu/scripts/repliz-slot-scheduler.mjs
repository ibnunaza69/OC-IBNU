#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = '/root/.openclaw/workspace';
const projectRoot = path.join(workspaceRoot, 'repliz_ibnu');
const globalEnvPath = '/root/.openclaw/.env';
const configPath = path.join(projectRoot, 'slot-config.json');

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
    const topic = pickTopicForSlot(next.slot, { forceSlug });
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
    const topic = pickTopicForSlot(next.slot, { forceSlug });
    const payload = buildNestedPayload(topic, next);
    console.log(JSON.stringify({ selectedSlot: next.slot, topic, payload }, null, 2));
    return;
  }

  if (command === 'topics') {
    console.log(JSON.stringify(topicsCatalog, null, 2));
    return;
  }

  if (command === 'ensure-horizon') {
    const accountId = getOption('--account-id');
    const dryRun = hasFlag('--dry-run');
    const days = Number(getOption('--days') ?? '30');
    const result = await ensureHorizon({ accountId, days, dryRun });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'slots') {
    const accountId = getOption('--account-id');
    const result = await inspectSlots({ accountId, days: Number(getOption('--days') ?? '3') });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'report-day') {
    const accountId = getOption('--account-id');
    const date = getOption('--date');
    const result = await reportDay({ accountId, date });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'report-day-text') {
    const accountId = getOption('--account-id');
    const date = getOption('--date');
    const result = await reportDay({ accountId, date });
    console.log(result.text);
    return;
  }

  if (command === 'process-comments') {
    const accountId = getOption('--account-id');
    const dryRun = hasFlag('--dry-run');
    const limit = Number(getOption('--limit') ?? '20');
    const result = await processComments({ accountId, dryRun, limit });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Usage:');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs next [--account-id ID]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs slots [--account-id ID] [--days 3]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs topics');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon [--account-id ID] [--days 30] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs schedule --text "..." [--account-id ID] [--title "..."] [--type text] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs preview-daily-nested [--account-id ID] [--slug TOPIC_SLUG]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs schedule-daily-nested [--account-id ID] [--slug TOPIC_SLUG] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-day [--account-id ID] [--date YYYY-MM-DD]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-day-text [--account-id ID] [--date YYYY-MM-DD]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs process-comments [--account-id ID] [--limit 20] [--dry-run]');
  process.exit(1);
}

async function getNextAvailableSlot({ accountId }) {
  const account = await resolveAccount(accountId);
  const schedules = await fetchSchedules(account._id, 500);
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
  const schedules = await fetchSchedules(account._id, 500);
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

async function ensureHorizon({ accountId, days, dryRun }) {
  const account = await resolveAccount(accountId);
  const schedules = await fetchSchedules(account._id, 500);
  const occupied = buildOccupiedSlotKeySet(schedules.docs ?? []);
  const targetSlots = listTargetSlots(occupied, days);
  const created = [];
  const dayUsedSlugs = buildDayUsedSlugsMap(schedules.docs ?? []);

  for (let index = 0; index < targetSlots.length; index += 1) {
    const slot = targetSlots[index];
    const usedSlugs = dayUsedSlugs.get(slot.localDate) ?? new Set();
    const topic = pickTopicForSlot(slot, { usedSlugsToday: usedSlugs });
    const payload = buildNestedPayload(topic, { account, slot });

    if (dryRun) {
      created.push({ slot, topic, payload });
    } else {
      const result = await api('/public/schedule', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      created.push({ slot, topic, created: result });
    }

    occupied.add(slot.slotKey);
    usedSlugs.add(topic.slug);
    dayUsedSlugs.set(slot.localDate, usedSlugs);
  }

  return {
    account,
    requestedDays: days,
    dryRun,
    createdCount: created.length,
    items: created
  };
}

async function reportDay({ accountId, date }) {
  const account = await resolveAccount(accountId);
  const schedules = await fetchSchedules(account._id, 500);
  const targetDate = date ?? currentLocalDateString(new Date());
  const daySlots = buildDaySlots(fromLocalDateString(targetDate), 0);
  const dayItems = (schedules.docs ?? [])
    .filter((item) => mapItemToDay(item)?.localDate === targetDate)
    .sort((a, b) => new Date(a.scheduleAt ?? a.createdAt).getTime() - new Date(b.scheduleAt ?? b.createdAt).getTime());

  const slotRows = daySlots.map((slot) => {
    const match = dayItems.find((item) => mapItemToSlotKey(item) === slot.slotKey);
    return {
      slotKey: slot.slotKey,
      localTime: slot.localTime,
      checked: Boolean(match && match.status === 'success'),
      occupied: Boolean(match),
      status: match?.status ?? 'empty',
      title: match?.title ?? '',
      description: match?.description ?? '',
      replies: Array.isArray(match?.replies) ? match.replies.map((reply) => reply.description ?? '').filter(Boolean) : [],
      id: match?._id ?? null
    };
  });

  const extraItems = dayItems
    .filter((item) => !slotRows.some((row) => row.id === item._id))
    .map((item) => ({
      id: item._id,
      status: item.status ?? 'unknown',
      title: item.title ?? '',
      description: item.description ?? '',
      localTime: mapItemToLocalTime(item) ?? 'unknown'
    }));

  return {
    account,
    localDate: targetDate,
    slots: slotRows,
    extraItems,
    text: renderDayReportText({ account, localDate: targetDate, slots: slotRows, extraItems })
  };
}

async function processComments({ accountId, dryRun, limit }) {
  const account = await resolveAccount(accountId);
  const queue = await fetchQueue(account._id, limit);
  const pending = (queue.docs ?? []).filter((item) => item.status === 'pending' || !item.status);
  const processed = [];

  for (const item of pending) {
    if (isOwnerComment(item, account)) {
      processed.push({ id: item._id, action: 'skip-owner', preview: extractCommentText(item) });
      continue;
    }

    const replyText = buildCommentReply(item);
    if (!replyText) {
      processed.push({ id: item._id, action: 'skip-no-reply', preview: extractCommentText(item) });
      continue;
    }

    if (dryRun) {
      processed.push({ id: item._id, action: 'would-reply', replyText, preview: extractCommentText(item) });
      continue;
    }

    const result = await api(`/public/queue/${item._id}`, {
      method: 'POST',
      body: JSON.stringify({ text: replyText })
    });

    processed.push({ id: item._id, action: 'replied', replyText, result, preview: extractCommentText(item) });
  }

  return {
    account,
    dryRun,
    checkedCount: queue.docs?.length ?? 0,
    processedCount: processed.length,
    items: processed,
    note: 'Auto-like/love is not executed here because no supported Repliz API endpoint for reactions has been confirmed yet.'
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

async function fetchQueue(accountId, limit) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('page', '1');
  params.append('accountIds[]', accountId);
  params.set('status', 'pending');
  return api(`/public/queue?${params.toString()}`);
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

function pickTopicForSlot(slot, { forceSlug, usedSlugsToday = new Set() } = {}) {
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

  const available = topicsCatalog.topics.filter((item) => !usedSlugsToday.has(item.slug));
  const pool = available.length ? available : topicsCatalog.topics;
  const seed = buildSlotSeed(slot);
  const index = Math.abs(seed) % pool.length;
  return pool[index];
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

function listTargetSlots(occupied, days) {
  const today = new Date();
  const output = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const daySlots = buildDaySlots(today, dayOffset);
    for (const slot of daySlots) {
      if (slot.utcMs <= Date.now()) continue;
      if (occupied.has(slot.slotKey)) continue;
      output.push(slot);
      occupied.add(slot.slotKey);
    }
  }

  return output;
}

function buildDayUsedSlugsMap(schedules) {
  const output = new Map();
  for (const item of schedules) {
    const mapped = mapItemToDay(item);
    if (!mapped?.localDate) continue;
    const slug = inferTopicSlug(item);
    if (!slug) continue;
    const set = output.get(mapped.localDate) ?? new Set();
    set.add(slug);
    output.set(mapped.localDate, set);
  }
  return output;
}

function inferTopicSlug(item) {
  const title = sanitizeText(item?.title ?? '');
  const description = sanitizeText(item?.description ?? '');
  for (const topic of topicsCatalog.topics) {
    if (sanitizeText(topic.title ?? '') === title) return topic.slug;
    if ((topic.posts ?? []).some((post) => sanitizeText(post) === description)) return topic.slug;
  }
  return null;
}

function mapItemToDay(item) {
  const when = item.scheduleAt ?? item.createdAt;
  if (!when) return null;
  const parts = toOffsetDateParts(new Date(when), config.timezoneOffsetMinutes);
  return {
    localDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    localTime: `${pad(parts.hour)}:${pad(parts.minute)}`
  };
}

function mapItemToSlotKey(item) {
  const when = item.scheduleAt ?? item.createdAt;
  if (!when) return null;
  const slot = mapDateToSlot(new Date(when));
  return slot?.slotKey ?? null;
}

function mapItemToLocalTime(item) {
  return mapItemToDay(item)?.localTime ?? null;
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

function buildSlotSeed(slot) {
  const [year, month, day] = slot.localDate.split('-').map(Number);
  const hour = Number(slot.localTime.split(':')[0]);
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 86400000 * 100 + hour;
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

function renderDayReportText({ account, localDate, slots, extraItems }) {
  const lines = [];
  lines.push(`Laporan ${account.username} - ${localDate} WIB`);
  lines.push('');

  for (const row of slots) {
    const mark = row.checked ? '✅' : row.occupied ? '🕒' : '⬜';
    lines.push(`${mark} ${row.localTime} - ${row.status}`);
    if (row.occupied) {
      if (row.title) lines.push(`   Judul: ${sanitizeText(row.title)}`);
      if (row.description) lines.push(`   Isi: ${sanitizeText(row.description)}`);
      for (let index = 0; index < row.replies.length; index += 1) {
        lines.push(`   Balasan ${index + 1}: ${sanitizeText(row.replies[index])}`);
      }
    }
  }

  if (extraItems.length) {
    lines.push('');
    lines.push('Item non-slot:');
    for (const item of extraItems) {
      lines.push(`- ${item.localTime} - ${item.status} - ${sanitizeText(item.title || item.description || '(tanpa isi)')}`);
    }
  }

  return lines.join('\n');
}

function isOwnerComment(item, account) {
  const candidates = [
    item?.username,
    item?.userName,
    item?.authorUsername,
    item?.author?.username,
    item?.user?.username,
    item?.from?.username,
    item?.name,
    item?.authorName,
    item?.author?.name,
    item?.user?.name
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  const ownerNames = [account.username, account.name].filter(Boolean).map((value) => String(value).toLowerCase());
  return candidates.some((value) => ownerNames.includes(value));
}

function extractCommentText(item) {
  return sanitizeText(
    item?.text ??
    item?.comment ??
    item?.message ??
    item?.content ??
    item?.body ??
    item?.description ??
    ''
  );
}

function buildCommentReply(item) {
  const text = extractCommentText(item).toLowerCase();
  const author = sanitizeText(
    item?.username ??
    item?.userName ??
    item?.authorUsername ??
    item?.author?.username ??
    item?.name ??
    ''
  );

  const prefix = author ? `@${author} ` : '';

  if (!text) {
    return `${prefix}Makasih sudah mampir dan kasih respons 🙏😊`;
  }

  if (/[?？]/.test(text) || /(gimana|bagaimana|caranya|boleh|bisa|apakah|kapan|kenapa|why|how|what)/.test(text)) {
    return `${prefix}Makasih sudah tanya 🙌 Nanti saya bantu jawab pelan-pelan ya. Semoga konteks di thread ini juga ikut membantu ✨`;
  }

  if (/(makasih|terima kasih|thanks|thank you|syukron)/.test(text)) {
    return `${prefix}Sama-sama, senang kalau ini bermanfaat buat kamu 😊🌿`;
  }

  if (/(setuju|sepakat|relate|benar|bener|nice|mantap|bagus)/.test(text)) {
    return `${prefix}Senang dengarnya 😄 Semoga isi thread ini benar-benar kepakai di keseharian ya ✨`;
  }

  if (/(tidur|insomnia|ngantuk|istirahat)/.test(text)) {
    return `${prefix}Betul, ritme tidur memang sering jadi fondasi. Semoga pelan-pelan bisa lebih rapi dan badan terasa lebih enak 🙏😴`;
  }

  if (/(jahe|kunyit|temulawak|herbal|teh)/.test(text)) {
    return `${prefix}Iya, herbal memang enak kalau dipakai sebagai pendamping rutinitas sehat, tetap lihat kecocokan tubuh masing-masing ya 🌿😊`;
  }

  return `${prefix}Makasih sudah ikut nimbrung 🙌 Semoga thread ini relevan dan ada bagian yang bisa dipakai di rutinitas harian kamu 😊`;
}

function sanitizeText(text) {
  const trimmed = String(text ?? '').trim();
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

function currentLocalDateString(date) {
  const parts = toOffsetDateParts(date, config.timezoneOffsetMinutes);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function fromLocalDateString(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  const utcMs = localPartsToUtcMs({ year, month, day, hour: 0, minute: 0, second: 0, ms: 0 }, config.timezoneOffsetMinutes);
  return new Date(utcMs);
}

function pad(value) {
  return String(value).padStart(2, '0');
}
