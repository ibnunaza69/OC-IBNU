import { env } from './env.js';
import { SettingsRepository } from '../modules/foundation/settings/settings.repository.js';

export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly settingsRepository: SettingsRepository;

  private constructor() {
    this.settingsRepository = new SettingsRepository();
  }

  static getInstance() {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settingsRepository.get(key);
  }

  async getSettingWithEnvFallback(key: string, envFallback?: string | undefined): Promise<string | null> {
    const dbValue = await this.settingsRepository.get(key);
    if (dbValue !== null && dbValue !== undefined) {
      return dbValue;
    }

    const fallback = envFallback?.trim();
    return fallback && fallback.length > 0 ? fallback : null;
  }

  async getBrandName(): Promise<string> {
    const value = await this.getSettingWithEnvFallback('BRAND_NAME', env.BRAND_NAME ?? undefined);
    return value ?? 'My Brand';
  }

  async getMetaAccessToken(): Promise<string | null> {
    return this.getSettingWithEnvFallback('META_ACCESS_TOKEN', env.META_ACCESS_TOKEN ?? undefined);
  }

  async getMetaAccountId(): Promise<string | null> {
    return this.getSettingWithEnvFallback('META_AD_ACCOUNT_ID', env.META_AD_ACCOUNT_ID ?? undefined);
  }

  async getMetaPixelId(): Promise<string | null> {
    return this.getSettingWithEnvFallback('META_PIXEL_ID', env.META_PIXEL_ID ?? undefined);
  }

  async getMetaGraphApiVersion(): Promise<string> {
    const value = env.META_GRAPH_API_VERSION?.trim();
    return value && value.length > 0 ? value : 'v25.0';
  }

  async getKieApiKey(): Promise<string | null> {
    return this.getSettingWithEnvFallback('KIE_API_KEY', env.KIE_API_KEY ?? undefined);
  }

  async getKieCallbackUrl(): Promise<string | null> {
    return this.getSettingWithEnvFallback('KIE_CALLBACK_URL', env.KIE_CALLBACK_URL ?? undefined);
  }
}

export const configService = ConfigService.getInstance();
