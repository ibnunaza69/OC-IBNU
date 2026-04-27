import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { systemSettings } from '../db/schema.js';

export class SettingsRepository {
  async get(key: string): Promise<string | null> {
    const rows = await getDb()
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    return rows[0]?.value ?? null;
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await getDb()
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings);

    return rows.reduce((acc: Record<string, string>, row: { key: string; value: string | null }) => {
      if (row.value !== null) {
        acc[row.key] = row.value;
      }
      return acc;
    }, {});
  }

  async set(key: string, value: string, description?: string): Promise<void> {
    await getDb()
      .insert(systemSettings)
      .values({
        key,
        value,
        description,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value,
          description: description ?? undefined,
          updatedAt: new Date()
        }
      });
  }

  async delete(key: string): Promise<void> {
    await getDb()
      .delete(systemSettings)
      .where(eq(systemSettings.key, key));
  }
}
