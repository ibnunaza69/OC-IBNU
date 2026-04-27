import PgBoss from 'pg-boss';
import { env } from '../../../config/env.js';

let boss: PgBoss | undefined;

export async function getQueue() {
  if (!boss) {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL
    });
  }

  return boss;
}

export async function startQueue() {
  const queue = await getQueue();
  await queue.start();
  return queue;
}

export async function stopQueue() {
  await boss?.stop();
}
