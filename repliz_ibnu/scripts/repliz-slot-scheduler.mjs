#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = '/root/.openclaw/workspace';
const projectRoot = path.join(workspaceRoot, 'repliz_ibnu');
const globalEnvPath = '/root/.openclaw/.env';
const configPath = path.join(projectRoot, 'slot-config.json');
const runtimeRoot = path.join(projectRoot, 'runtime');
const stateRoot = path.join(runtimeRoot, 'state');
const reportStatePath = path.join(stateRoot, 'telegram-report-state.json');
const commentStatePath = path.join(stateRoot, 'comment-worker-state.json');

ensureDir(runtimeRoot);
ensureDir(stateRoot);

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

  if (command === 'schedule-product-day') {
    const accountId = getOption('--account-id');
    const date = getOption('--date');
    const filePath = getOption('--file');
    const dryRun = hasFlag('--dry-run');
    const replacePending = hasFlag('--replace-pending');
    if (!filePath || !date) {
      console.error('Missing --file or --date');
      process.exit(1);
    }
    const result = await scheduleProductDay({ accountId, date, filePath, dryRun, replacePending });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'catch-up-product-slot') {
    const accountId = getOption('--account-id');
    const date = getOption('--date');
    const filePath = getOption('--file');
    const slotTime = getOption('--slot');
    const dryRun = hasFlag('--dry-run');
    if (!filePath || !date || !slotTime) {
      console.error('Missing --file, --date, or --slot');
      process.exit(1);
    }
    const result = await catchUpProductSlot({ accountId, date, filePath, slotTime, dryRun });
    console.log(JSON.stringify(result, null, 2));
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

  if (command === 'report-successes') {
    const accountId = getOption('--account-id');
    const date = getOption('--date');
    const dryRun = hasFlag('--dry-run');
    const result = await reportSuccesses({ accountId, date, dryRun });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'run-comment-worker-once') {
    const accountId = getOption('--account-id');
    const dryRun = hasFlag('--dry-run');
    const limit = Number(getOption('--limit') ?? '20');
    const result = await runCommentWorkerOnce({ accountId, dryRun, limit });
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
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs schedule-product-day --file FILE --date YYYY-MM-DD [--account-id ID] [--replace-pending] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs catch-up-product-slot --file FILE --date YYYY-MM-DD --slot HH:MM [--account-id ID] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs process-comments [--account-id ID] [--limit 20] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes [--account-id ID] [--date YYYY-MM-DD] [--dry-run]');
  console.error('  node repliz_ibnu/scripts/repliz-slot-scheduler.mjs run-comment-worker-once [--account-id ID] [--limit 20] [--dry-run]');
  process.exit(1);
}

async function getNextAvailableSlot({ accountId }) {
  const account = await resolveAccount(accountId);
  const slotRules = getSlotRules(account);
  const schedules = await fetchSchedules(account._id, 500);
  const occupied = buildOccupiedSlotKeySet(schedules.docs ?? [], slotRules);

  const now = new Date();
  const maxDaysToSearch = 30;
  for (let dayOffset = 0; dayOffset < maxDaysToSearch; dayOffset += 1) {
    const slots = buildDaySlots(now, dayOffset, slotRules);
    for (const slot of slots) {
      if (slot.utcMs <= Date.now()) continue;
      if (!occupied.has(slot.slotKey)) {
        return {
          account,
          slot,
          slotRules,
          checkedScheduleCount: schedules.docs?.length ?? 0
        };
      }
    }
  }

  throw new Error('No empty slot found in the next 30 days');
}

async function inspectSlots({ accountId, days }) {
  const account = await resolveAccount(accountId);
  const slotRules = getSlotRules(account);
  const schedules = await fetchSchedules(account._id, 500);
  const occupied = buildOccupiedSlotKeySet(schedules.docs ?? [], slotRules);
  const today = new Date();
  const output = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    for (const slot of buildDaySlots(today, dayOffset, slotRules)) {
      output.push({
        ...slot,
        occupied: occupied.has(slot.slotKey)
      });
    }
  }

  return {
    account,
    slotRules,
    checkedScheduleCount: schedules.docs?.length ?? 0,
    slots: output
  };
}

async function ensureHorizon({ accountId, days, dryRun }) {
  const account = await resolveAccount(accountId);
  const slotRules = getSlotRules(account);
  const schedules = await fetchSchedules(account._id, 500);
  const occupied = buildOccupiedSlotKeySet(schedules.docs ?? [], slotRules);
  const targetSlots = listTargetSlots(occupied, days, slotRules);
  const created = [];
  const dayUsedSlugs = buildDayUsedSlugsMap(schedules.docs ?? []);
  const scheduledProductDates = new Set();
  const accountRule = config.accountRules?.[account._id] ?? {};
  const disableTopicFallback = Boolean(accountRule.disableTopicFallback);

  for (let index = 0; index < targetSlots.length; index += 1) {
    const slot = targetSlots[index];
    const usedSlugs = dayUsedSlugs.get(slot.localDate) ?? new Set();
    const productDayFile = findDefaultProductDayFile(slot.localDate, account);

    if (productDayFile && !scheduledProductDates.has(slot.localDate)) {
      const product = loadProductDayFile(productDayFile);
      for (const productSlot of product.slots) {
        const productSlotKey = `${slot.localDate} ${productSlot.time}`;
        if (occupied.has(productSlotKey)) continue;
        const scheduleAt = isPastSlotKeyToday(productSlotKey) ? new Date().toISOString() : localDateTimeToUtcIso(slot.localDate, productSlot.time);
        const payload = buildProductSchedulePayload({ accountId: account._id, slot: productSlot, scheduleAt });

        if (dryRun) {
          created.push({ slotKey: productSlotKey, localDate: slot.localDate, style: product.style || 'product-day', source: productDayFile, catchUpNow: isPastSlotKeyToday(productSlotKey), payload });
        } else {
          const result = await api('/public/schedule', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          created.push({ slotKey: productSlotKey, localDate: slot.localDate, style: product.style || 'product-day', source: productDayFile, catchUpNow: isPastSlotKeyToday(productSlotKey), created: result });
        }

        occupied.add(productSlotKey);
      }
      scheduledProductDates.add(slot.localDate);
      continue;
    }

    if (disableTopicFallback) {
      created.push({ slot, skipped: true, reason: 'missing-product-day-file-and-fallback-disabled' });
      continue;
    }

    const topic = pickTopicForSlot(slot, { usedSlugsToday: usedSlugs });
    const scheduleAt = slot.catchUpNow ? new Date().toISOString() : slot.scheduleAtUtc;
    const payload = buildNestedPayload(topic, { account, slot }, { scheduleAt });

    if (dryRun) {
      created.push({ slot, topic, catchUpNow: Boolean(slot.catchUpNow), payload, fallback: 'daily-topics' });
    } else {
      const result = await api('/public/schedule', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      created.push({ slot, topic, catchUpNow: Boolean(slot.catchUpNow), created: result, fallback: 'daily-topics' });
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
  const slotRules = getSlotRules(account);
  const schedules = await fetchSchedules(account._id, 500);
  const targetDate = date ?? currentLocalDateString(new Date());
  const daySlots = buildDaySlots(fromLocalDateString(targetDate), 0, slotRules);
  const dayItems = (schedules.docs ?? [])
    .filter((item) => mapItemToDay(item)?.localDate === targetDate)
    .sort((a, b) => new Date(a.scheduleAt ?? a.createdAt).getTime() - new Date(b.scheduleAt ?? b.createdAt).getTime());

  const slotRows = daySlots.map((slot) => {
    const match = dayItems.find((item) => mapItemToSlotKey(item, slotRules) === slot.slotKey);
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

async function scheduleProductDay({ accountId, date, filePath, dryRun, replacePending }) {
  const account = await resolveAccount(accountId);
  const report = await reportDay({ accountId: account._id, date });
  const product = loadProductDayFile(filePath);
  const created = [];
  const deleted = [];
  const skipped = [];

  for (const slot of product.slots) {
    const slotKey = `${date} ${slot.time}`;
    const existing = report.slots.find((row) => row.slotKey === slotKey);
    if (!existing) {
      skipped.push({ slotKey, action: 'skip-no-slot-row' });
      continue;
    }

    if (existing.status === 'success') {
      skipped.push({ slotKey, action: 'skip-success', existingId: existing.id, existingTitle: existing.title });
      continue;
    }

    if (existing.occupied && existing.status !== 'pending') {
      skipped.push({ slotKey, action: 'skip-non-pending', existingId: existing.id, existingStatus: existing.status, existingTitle: existing.title });
      continue;
    }

    if (existing.occupied && existing.status === 'pending' && !replacePending) {
      skipped.push({ slotKey, action: 'skip-pending-no-replace', existingId: existing.id, existingTitle: existing.title });
      continue;
    }

    const scheduleAt = localDateTimeToUtcIso(date, slot.time);
    const payload = buildProductSchedulePayload({ accountId: account._id, slot, scheduleAt });

    if (dryRun) {
      if (existing.occupied && existing.id) {
        deleted.push({ dryRun: true, slotKey, id: existing.id, title: existing.title });
      }
      created.push({ dryRun: true, slotKey, payload });
      continue;
    }

    if (existing.occupied && existing.id) {
      await api(`/public/schedule/${existing.id}`, { method: 'DELETE' });
      deleted.push({ dryRun: false, slotKey, id: existing.id, title: existing.title });
    }

    const result = await api('/public/schedule', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    created.push({ dryRun: false, slotKey, id: result._id ?? result.id ?? null, title: payload.title });
  }

  return {
    account,
    localDate: date,
    filePath: path.resolve(filePath),
    dryRun,
    replacePending,
    productName: product.productName,
    deleted,
    created,
    skipped
  };
}

async function catchUpProductSlot({ accountId, date, filePath, slotTime, dryRun }) {
  const account = await resolveAccount(accountId);
  const product = loadProductDayFile(filePath);
  const slot = product.slots.find((item) => item.time === slotTime);
  if (!slot) {
    throw new Error(`Slot ${slotTime} not found in ${filePath}`);
  }

  const now = new Date().toISOString();
  const payload = buildProductSchedulePayload({ accountId: account._id, slot, scheduleAt: now });

  if (dryRun) {
    return {
      account,
      localDate: date,
      slotTime,
      filePath: path.resolve(filePath),
      dryRun: true,
      catchUp: true,
      payload
    };
  }

  const result = await api('/public/schedule', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    account,
    localDate: date,
    slotTime,
    filePath: path.resolve(filePath),
    dryRun: false,
    catchUp: true,
    created: {
      id: result._id ?? result.id ?? null,
      title: payload.title,
      scheduleAt: now
    }
  };
}

async function processComments({ accountId, dryRun, limit, alreadyProcessedIds = new Set() }) {
  const account = await resolveAccount(accountId);
  const queue = await fetchQueue(account._id, limit);
  const pending = (queue.docs ?? []).filter((item) => item.status === 'pending' || !item.status);
  const processed = [];

  for (const item of pending) {
    if (alreadyProcessedIds.has(item._id)) {
      processed.push({ id: item._id, action: 'skip-already-processed', preview: extractCommentText(item) });
      continue;
    }

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

async function reportSuccesses({ accountId, date, dryRun }) {
  const report = await reportDay({ accountId, date });
  const accountReportStatePath = getReportStatePath(report.account);
  const state = readJsonFile(accountReportStatePath, { deliveredIds: [], deliveredKeys: [] });
  const deliveredIds = new Set(Array.isArray(state.deliveredIds) ? state.deliveredIds : []);
  const deliveredKeys = new Set(Array.isArray(state.deliveredKeys) ? state.deliveredKeys : []);
  const newlySucceededSlots = report.slots.filter((row) => row.status === 'success' && row.id && !deliveredIds.has(row.id));
  const newlySucceededExtras = report.extraItems.filter((item) => item.status === 'success' && item.id && !deliveredIds.has(item.id));

  const slotSummary = report.slots.map((row) => ({
    localTime: row.localTime,
    status: row.status,
    title: row.title,
    id: row.id,
    kind: 'slot'
  }));

  const extraSummary = report.extraItems.map((item) => ({
    localTime: item.localTime,
    status: item.status,
    title: item.title,
    id: item.id,
    kind: 'catch-up'
  }));

  const pendingDelivery = [
    ...newlySucceededSlots.map((row) => ({ id: row.id, key: `slot:${row.localTime}:${row.id}`, label: `${row.localTime} ${row.title}` })),
    ...newlySucceededExtras.map((item) => ({ id: item.id, key: `catch-up:${item.localTime}:${item.id}`, label: `${item.localTime} ${item.title}` }))
  ].filter((item) => !deliveredKeys.has(item.key));

  if (!pendingDelivery.length) {
    return {
      delivered: false,
      dryRun,
      reason: 'no-new-success',
      localDate: report.localDate,
      slotSummary,
      extraSummary,
      text: renderDayReportText({ account: report.account, localDate: report.localDate, slots: report.slots, extraItems: report.extraItems })
    };
  }

  const text = renderTelegramSuccessText({
    account: report.account,
    localDate: report.localDate,
    slots: report.slots,
    extraItems: report.extraItems,
    pendingDelivery
  });

  if (dryRun) {
    return {
      delivered: false,
      dryRun: true,
      reason: 'dry-run',
      localDate: report.localDate,
      pendingDelivery,
      text
    };
  }

  const sendResult = sendTelegramReport(text);
  for (const item of pendingDelivery) {
    if (item.id) deliveredIds.add(item.id);
    deliveredKeys.add(item.key);
  }
  writeJsonFile(accountReportStatePath, {
    deliveredIds: Array.from(deliveredIds),
    deliveredKeys: Array.from(deliveredKeys)
  });

  return {
    delivered: true,
    dryRun: false,
    localDate: report.localDate,
    pendingDelivery,
    text,
    sendResult
  };
}

async function runCommentWorkerOnce({ accountId, dryRun, limit }) {
  const state = readJsonFile(commentStatePath, { repliedQueueIds: [] });
  const repliedQueueIds = new Set(Array.isArray(state.repliedQueueIds) ? state.repliedQueueIds : []);
  const result = await processComments({ accountId, dryRun, limit, alreadyProcessedIds: repliedQueueIds });

  if (!dryRun) {
    for (const item of result.items) {
      if (item.action === 'replied' && item.id) {
        repliedQueueIds.add(item.id);
      }
    }
    writeJsonFile(commentStatePath, { repliedQueueIds: Array.from(repliedQueueIds) });
  }

  return {
    ...result,
    workerStatePath: commentStatePath
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

function buildNestedPayload(topic, next, options = {}) {
  const threadLength = config.nestedThreadLength ?? topicsCatalog.threadLength ?? 4;
  const posts = (topic.posts ?? []).slice(0, threadLength).map((text) => sanitizeText(text));

  if (!posts.length) {
    throw new Error(`Topic has no posts: ${topic.slug}`);
  }

  const scheduleAt = options.scheduleAt ?? next.slot.scheduleAtUtc;

  return {
    title: sanitizeText(topic.title ?? ''),
    description: posts[0],
    type: config.defaultType ?? 'text',
    medias: [],
    scheduleAt,
    accountId: next.account._id,
    replies: posts.slice(1).map((text) => ({
      title: '',
      description: text,
      type: 'text',
      medias: []
    }))
  };
}

function listTargetSlots(occupied, days, slotRules = config) {
  const today = new Date();
  const output = [];
  const now = Date.now();
  const todayLocalDate = currentLocalDateString(today);

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const daySlots = buildDaySlots(today, dayOffset, slotRules);
    for (const slot of daySlots) {
      if (occupied.has(slot.slotKey)) continue;

      const isPast = slot.utcMs <= now;
      const isToday = slot.localDate === todayLocalDate;
      if (isPast && !isToday) continue;

      output.push({
        ...slot,
        catchUpNow: isPast && isToday
      });
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

function mapItemToSlotKey(item, slotRules = config) {
  const when = item.scheduleAt ?? item.createdAt;
  if (!when) return null;
  const slot = mapDateToSlot(new Date(when), slotRules);
  return slot?.slotKey ?? null;
}

function mapItemToLocalTime(item) {
  return mapItemToDay(item)?.localTime ?? null;
}

function buildOccupiedSlotKeySet(schedules, slotRules = config) {
  const set = new Set();
  for (const item of schedules) {
    const when = item.scheduleAt ?? item.createdAt;
    if (!when) continue;
    const slot = mapDateToSlot(new Date(when), slotRules);
    if (slot) set.add(slot.slotKey);
  }
  return set;
}

function buildDaySlots(referenceDate, dayOffset, slotRules = config) {
  const localBase = toOffsetDateParts(referenceDate, config.timezoneOffsetMinutes);
  const targetDay = addLocalDays(localBase, dayOffset);
  const slots = [];
  const startHour = Number(slotRules.startHour ?? config.startHour ?? 5);
  const startMinute = Number(slotRules.startMinute ?? config.startMinute ?? 0);
  const intervalHours = Number(slotRules.intervalHours ?? config.intervalHours ?? 3);
  const slotCount = Number(slotRules.slotCount ?? config.slotCount ?? 7);
  const startTotalMinutes = startHour * 60 + startMinute;

  for (let i = 0; i < slotCount; i += 1) {
    const totalMinutes = startTotalMinutes + (i * intervalHours * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const slotLocal = {
      year: targetDay.year,
      month: targetDay.month,
      day: targetDay.day,
      hour,
      minute,
      second: 0,
      ms: 0
    };
    const utcMs = localPartsToUtcMs(slotLocal, config.timezoneOffsetMinutes);
    const slotDate = new Date(utcMs);
    slots.push({
      slotIndex: i + 1,
      slotKey: `${targetDay.year}-${pad(targetDay.month)}-${pad(targetDay.day)} ${pad(hour)}:${pad(minute)}`,
      localDate: `${targetDay.year}-${pad(targetDay.month)}-${pad(targetDay.day)}`,
      localTime: `${pad(hour)}:${pad(minute)}`,
      scheduleAtUtc: slotDate.toISOString(),
      utcMs
    });
  }

  return slots;
}

function buildSlotSeed(slot) {
  const [year, month, day] = slot.localDate.split('-').map(Number);
  const [hour, minute] = slot.localTime.split(':').map(Number);
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 86400000 * 10000 + (hour * 100) + minute;
}

function mapDateToSlot(date, slotRules = config) {
  const parts = toOffsetDateParts(date, config.timezoneOffsetMinutes);
  const startHour = Number(slotRules.startHour ?? config.startHour ?? 5);
  const startMinute = Number(slotRules.startMinute ?? config.startMinute ?? 0);
  const intervalHours = Number(slotRules.intervalHours ?? config.intervalHours ?? 3);
  const slotCount = Number(slotRules.slotCount ?? config.slotCount ?? 7);
  const minuteOfDay = (parts.hour * 60) + parts.minute;
  const startMinuteOfDay = (startHour * 60) + startMinute;
  if (minuteOfDay < startMinuteOfDay) return null;
  const delta = minuteOfDay - startMinuteOfDay;
  const intervalMinutes = intervalHours * 60;
  if (delta % intervalMinutes !== 0) return null;
  const slotIndex = (delta / intervalMinutes) + 1;
  if (slotIndex < 1 || slotIndex > slotCount) return null;

  return {
    slotIndex,
    slotKey: `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`
  };
}

function getSlotRules(account) {
  if (!account?._id) return config;
  return config.accountRules?.[account._id] ?? config;
}

function renderDayReportText({ account, localDate, slots, extraItems }) {
  const lines = [];
  lines.push(`Laporan ${account.username} - ${localDate} WIB`);
  lines.push('');
  lines.push('Slot reguler:');

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
    lines.push('Catch-up / non-slot:');
    for (const item of extraItems) {
      lines.push(`- ${item.localTime} - ${item.status} - ${sanitizeText(item.title || item.description || '(tanpa isi)')}`);
    }
  }

  return lines.join('\n');
}

function renderTelegramSuccessText({ account, localDate, slots, extraItems, pendingDelivery }) {
  const lines = [];
  lines.push(`Report Threads ${account.username} - ${localDate} WIB`);
  lines.push('');
  lines.push('Baru sukses:');
  for (const item of pendingDelivery) {
    lines.push(`✅ ${sanitizeText(item.label)}`);
  }

  const successCount = slots.filter((row) => row.status === 'success').length;
  const pendingCount = slots.filter((row) => row.status === 'pending').length;
  const emptyCount = slots.filter((row) => !row.occupied).length;
  lines.push('');
  lines.push(`Ringkas slot: success ${successCount} | pending ${pendingCount} | kosong ${emptyCount}`);

  const compactRows = slots
    .filter((row) => row.status === 'success' || row.status === 'pending')
    .map((row) => `${row.status === 'success' ? '✅' : '🕒'} ${row.localTime}${row.title ? ` ${sanitizeText(row.title)}` : ''}`);
  if (compactRows.length) {
    lines.push('Aktif:');
    for (const row of compactRows) lines.push(row);
  }

  const extraActive = extraItems
    .filter((item) => item.status === 'success' || item.status === 'pending')
    .map((item) => `${item.status === 'success' ? '✅' : '🕒'} ${item.localTime}${item.title ? ` ${sanitizeText(item.title)}` : ''}`);
  if (extraActive.length) {
    lines.push('Catch-up:');
    for (const row of extraActive) lines.push(row);
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

function getReportStatePath(account) {
  const suffix = account?._id ? `telegram-report-state.${account._id}.json` : 'telegram-report-state.json';
  return path.join(stateRoot, suffix);
}

function sanitizeText(text) {
  const trimmed = String(text ?? '').trim();
  if (!config.sanitizeChineseCharacters) return trimmed;
  return trimmed.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '').replace(/\s{2,}/g, ' ').trim();
}

function buildProductSchedulePayload({ accountId, slot, scheduleAt }) {
  return {
    accountId,
    title: sanitizeText(slot.title),
    description: sanitizeText(slot.description),
    type: 'text',
    medias: [],
    scheduleAt,
    replies: (slot.replies ?? []).map((text) => ({
      title: '',
      description: sanitizeText(text),
      type: 'text',
      medias: []
    }))
  };
}

function loadProductDayFile(filePath) {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!parsed || !Array.isArray(parsed.slots)) {
    throw new Error(`Invalid product day file: ${resolved}`);
  }

  const slots = parsed.slots.map((slot) => {
    if (!slot?.time || !slot?.title || !slot?.description) {
      throw new Error(`Invalid slot entry in ${resolved}`);
    }
    return {
      time: String(slot.time),
      title: String(slot.title),
      description: String(slot.description),
      replies: Array.isArray(slot.replies) ? slot.replies.map((item) => String(item)) : []
    };
  });

  return {
    productName: parsed.productName ?? '',
    style: parsed.style ?? '',
    affiliateLink: parsed.affiliateLink ?? '',
    slots
  };
}

function findDefaultProductDayFile(localDate, account = null) {
  const accountRuleDir = account?._id ? config.accountRules?.[account._id]?.defaultProductDayDir : null;
  const baseDir = accountRuleDir || config.defaultProductDayDir;
  if (!baseDir) return null;
  const resolved = path.resolve(baseDir, `${localDate}.json`);
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

function isPastSlotKeyToday(slotKey) {
  const [localDate, localTime] = String(slotKey).split(' ');
  if (!localDate || !localTime) return false;
  if (localDate !== currentLocalDateString(new Date())) return false;
  const slotUtcMs = new Date(localDateTimeToUtcIso(localDate, localTime)).getTime();
  return slotUtcMs <= Date.now();
}

function localDateTimeToUtcIso(localDate, localTime) {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - config.timezoneOffsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

function sendTelegramReport(text) {
  const replyTo = process.env.REPLIZ_TELEGRAM_REPORT_TO ?? '6186239554';
  const commandArgs = ['agent', '--to', replyTo, '--message', sanitizeText(text), '--deliver', '--reply-channel', 'telegram', '--reply-to', replyTo];
  const result = spawnSync('openclaw', commandArgs, {
    cwd: workspaceRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 120000
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`openclaw agent failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  }

  return {
    command: ['openclaw', ...commandArgs].join(' '),
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim()
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
