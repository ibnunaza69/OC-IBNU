import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import {
  authenticateDashboardLogin,
  clearDashboardSession,
  dashboardSecurityHeaders,
  getDashboardSession,
  issueDashboardSession
} from './auth.js';
import { DashboardMonitoringService } from './dashboard.service.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024)
});

const campaignHierarchyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const campaignHierarchySyncSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const creativeLibraryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  assetType: z.enum(['all', 'image', 'video']).default('all')
});

const audienceListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  type: z.enum(['all', 'custom', 'lookalike']).default('all')
});

const audienceParamsSchema = z.object({
  audienceId: z.string().trim().min(1).max(128)
});

const audienceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).max(1024).optional(),
  retentionDays: z.coerce.number().int().min(1).max(180).optional(),
  reason: z.string().trim().min(5).max(255),
  dryRun: z.boolean().optional().default(true)
}).superRefine((value, ctx) => {
  if (value.name === undefined && value.description === undefined && value.retentionDays === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide at least one field: name, description, or retentionDays.'
    });
  }
});

const audienceDeleteSchema = z.object({
  reason: z.string().trim().min(5).max(255),
  dryRun: z.boolean().optional().default(true)
});

const assetParamsSchema = z.object({
  assetId: z.string().uuid()
});

const campaignParamsSchema = z.object({
  campaignId: z.string().trim().min(1).max(128)
});

const adSetParamsSchema = z.object({
  adSetId: z.string().trim().min(1).max(128)
});

const adDetailParamsSchema = z.object({
  adId: z.string().trim().min(1).max(128)
});

const duplicateStatusOptionSchema = z.enum(['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE']).optional().default('PAUSED');

const dashboardMetaCampaignDuplicateSchema = z.object({
  statusOption: duplicateStatusOptionSchema,
  deepCopy: z.boolean().optional().default(false),
  startTime: z.string().trim().min(1).optional(),
  endTime: z.string().trim().min(1).optional(),
  renameOptions: z.record(z.string(), z.unknown()).optional(),
  parameterOverrides: z.record(z.string(), z.unknown()).optional(),
  migrateToAdvantagePlus: z.boolean().optional().default(false),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const dashboardMetaCampaignDuplicateTreeSchema = z.object({
  statusOption: duplicateStatusOptionSchema,
  includeAds: z.boolean().optional().default(true),
  cleanupOnFailure: z.boolean().optional().default(true),
  namePrefix: z.string().trim().min(1).max(80).optional(),
  nameSuffix: z.string().trim().min(1).max(80).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const dashboardMetaAdSetDuplicateSchema = z.object({
  targetCampaignId: z.string().min(1).optional(),
  statusOption: duplicateStatusOptionSchema,
  deepCopy: z.boolean().optional().default(false),
  createDcoAdSet: z.boolean().optional().default(false),
  startTime: z.string().trim().min(1).optional(),
  endTime: z.string().trim().min(1).optional(),
  renameOptions: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const dashboardMetaAdDuplicateSchema = z.object({
  targetAdSetId: z.string().min(1).optional(),
  statusOption: duplicateStatusOptionSchema,
  renameOptions: z.record(z.string(), z.unknown()).optional(),
  creativeParameters: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const dashboardMetaDeleteSchema = z.object({
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true)
});

const dashboardMetaAdPromotabilitySchema = z.object({
  targetAdSetId: z.string().min(1).optional()
});

const dashboardSettingsUpdateSchema = z.object({
  dashboardUsername: z.string().trim().min(1).max(128).optional().nullable(),
  dashboardAuthEnabled: z.boolean().optional(),
  dashboardCookieSecure: z.boolean().optional(),
  dashboardSessionTtlSeconds: z.coerce.number().int().min(300).max(604800).optional(),
  dashboardLoginMaxAttempts: z.coerce.number().int().min(1).max(20).optional(),
  dashboardLoginBlockMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  metaAccessToken: z.string().trim().max(4096).optional().nullable(),
  metaAdAccountId: z.string().trim().max(255).optional().nullable(),
  metaWriteEnabled: z.boolean().optional(),
  metaWriteApprovalRequired: z.boolean().optional(),
  metaAppId: z.string().trim().max(255).optional().nullable(),
  metaAppSecret: z.string().trim().max(4096).optional().nullable(),
  metaOAuthRedirectUri: z.string().trim().url().max(2048).optional().nullable(),
  metaGraphApiVersion: z.string().trim().min(2).max(32).optional().nullable(),
  kieApiKey: z.string().trim().max(4096).optional().nullable(),
  kieCallbackUrl: z.string().trim().url().max(2048).optional().nullable(),
  reason: z.string().trim().min(5).max(255).optional()
});

const metaOAuthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().uuid()
});

const metaConnectionParamsSchema = z.object({
  connectionId: z.string().trim().uuid()
});

const metaConnectionSelectionSchema = z.object({
  adAccountIds: z.array(z.string().trim().min(1)).default([]),
  pageIds: z.array(z.string().trim().min(1)).default([]),
  pixelIds: z.array(z.string().trim().min(1)).default([]),
  businessIds: z.array(z.string().trim().min(1)).default([]),
  primaryAdAccountId: z.string().trim().min(1).optional().nullable(),
  bindRuntime: z.boolean().optional().default(true)
});

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sendMetaCallbackPage(reply: FastifyReply, options: {
  title: string;
  body: string;
  details?: string[];
  buttonLabel?: string;
  closeWindow?: boolean;
  statusCode?: number;
}) {
  dashboardSecurityHeaders(reply);
  reply.code(options.statusCode ?? 200);
  reply.type('text/html; charset=utf-8');
  return reply.send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .card { max-width: 640px; background: #111c34; border: 1px solid #22304f; border-radius: 24px; padding: 24px; }
      h1 { margin-top: 0; }
      p, li { color: #cbd5e1; line-height: 1.6; }
      button, a { margin-top: 16px; display: inline-block; border: 0; border-radius: 12px; padding: 10px 14px; background: #3b82f6; color: white; cursor: pointer; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>${escapeHtml(options.title)}</h1>
        <p>${escapeHtml(options.body)}</p>
        ${options.details?.length
          ? `<ul>${options.details.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : ''}
        ${options.closeWindow
          ? `<button onclick="window.opener && window.opener.postMessage({ type: 'meta-oauth-complete' }, window.location.origin); window.close();">${escapeHtml(options.buttonLabel ?? 'Tutup jendela ini')}</button>`
          : `<a href="/dashboard/settings">${escapeHtml(options.buttonLabel ?? 'Kembali ke dashboard')}</a>`}
      </section>
    </main>
  </body>
</html>`);
}

function sendPublicPolicyPage(reply: FastifyReply, options: {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }>;
}) {
  dashboardSecurityHeaders(reply);
  reply.type('text/html; charset=utf-8');
  return reply.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.title}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0b1220; color: #dbe4f0; }
      main { max-width: 920px; margin: 0 auto; padding: 40px 20px 72px; }
      .hero { padding: 28px; border: 1px solid #22304f; border-radius: 28px; background: linear-gradient(135deg, rgba(30,41,59,.95), rgba(15,23,42,.9)); }
      .hero h1 { margin: 0; font-size: 2rem; }
      .hero p { color: #bfd0e6; line-height: 1.7; }
      .meta { margin-top: 10px; font-size: .95rem; color: #93a9c5; }
      nav { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
      nav a { color: white; background: #2563eb; text-decoration: none; padding: 10px 14px; border-radius: 999px; }
      section { margin-top: 18px; padding: 24px; border: 1px solid #22304f; border-radius: 24px; background: rgba(15,23,42,.72); }
      h2 { margin-top: 0; font-size: 1.15rem; }
      p, li { color: #d0d8e4; line-height: 1.8; }
      ul { margin: 12px 0 0 20px; }
      footer { margin-top: 24px; color: #8da3bd; font-size: .95rem; }
      code { color: #93c5fd; }
    </style>
  </head>
  <body>
    <main>
      <div class="hero">
        <h1>${options.title}</h1>
        <p>${options.subtitle}</p>
        <div class="meta">Last updated: ${options.lastUpdated}</div>
        <nav>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/dashboard/login">Dashboard Login</a>
        </nav>
      </div>
      ${options.sections.map((section) => `
        <section>
          <h2>${section.heading}</h2>
          ${(section.paragraphs ?? []).map((paragraph) => `<p>${paragraph}</p>`).join('')}
          ${section.bullets?.length ? `<ul>${section.bullets.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}
        </section>
      `).join('')}
      <footer>
        These pages are provided to support product transparency, user control, and platform review readiness for the Ops Dashboard marketing operations dashboard.
      </footer>
    </main>
  </body>
</html>`);
}

const imageCreativeGenerateSchema = z.object({
  assetType: z.literal('image'),
  reason: z.string().trim().min(5).max(255),
  image: z.object({
    providerPayload: z.record(z.string(), z.unknown()),
    templateVersion: z.string().trim().min(1).max(128).optional(),
    callbackUrl: z.string().trim().url().optional(),
    enqueuePolling: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false)
  })
});

const videoCreativeGenerateSchema = z.object({
  assetType: z.literal('video'),
  reason: z.string().trim().min(5).max(255),
  video: z.object({
    prompt: z.string().trim().min(5).max(1800),
    imageAssetId: z.string().uuid().optional(),
    imageUrl: z.string().trim().url().optional(),
    durationSeconds: z.union([z.literal(5), z.literal(10)]).optional().default(5),
    quality: z.enum(['720p', '1080p']).optional().default('720p'),
    aspectRatio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16']).optional(),
    templateVersion: z.string().trim().min(1).max(128).optional(),
    callbackUrl: z.string().trim().url().optional(),
    enqueuePolling: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false)
  })
});

const creativeGenerateSchema = z.discriminatedUnion('assetType', [
  imageCreativeGenerateSchema,
  videoCreativeGenerateSchema
]);

const dashboardService = new DashboardMonitoringService();
const DASHBOARD_DIST_DIR = resolve(process.cwd(), 'dashboard-dist');
const DASHBOARD_INDEX_PATH = resolve(DASHBOARD_DIST_DIR, 'index.html');

const assetContentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf']
]);

async function sendDashboardShell(reply: FastifyReply) {
  dashboardSecurityHeaders(reply);

  try {
    const html = await readFile(DASHBOARD_INDEX_PATH, 'utf8');
    reply.type('text/html; charset=utf-8');
    return reply.send(html);
  } catch {
    reply.code(503);
    reply.type('text/html; charset=utf-8');
    return reply.send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard build unavailable</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .card { max-width: 560px; background: #111c34; border: 1px solid #22304f; border-radius: 24px; padding: 24px; }
      h1 { margin-top: 0; }
      p { color: #cbd5e1; line-height: 1.6; }
      code { color: #93c5fd; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Dashboard frontend belum siap</h1>
        <p>Build frontend dashboard belum ditemukan di <code>dashboard-dist/</code>. Jalankan <code>npm run build</code> lalu reload halaman ini.</p>
      </section>
    </main>
  </body>
</html>`);
  }
}

function resolveDashboardAssetPath(relativePath: string) {
  const sanitizedPath = relativePath.replace(/^\/+/, '');
  const assetsRoot = resolve(DASHBOARD_DIST_DIR, 'assets');
  const absolutePath = resolve(assetsRoot, sanitizedPath);

  if (!absolutePath.startsWith(assetsRoot)) {
    return null;
  }

  return absolutePath;
}

function requireDashboardApiSession(request: FastifyRequest, reply: FastifyReply) {
  dashboardSecurityHeaders(reply);
  const session = getDashboardSession(request);
  if (!session) {
    reply.code(401);
    return {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Dashboard authentication required.'
      }
    } as const;
  }

  return session;
}

async function requireDashboardPageSession(request: FastifyRequest, reply: FastifyReply) {
  const session = getDashboardSession(request);
  if (!session) {
    dashboardSecurityHeaders(reply);
    reply.code(302);
    reply.header('location', '/dashboard/login');
    await reply.send();
    return null;
  }

  return session;
}

export async function registerDashboardMonitoringRoutes(app: FastifyInstance) {
  app.get<{ Params: { '*': string } }>('/dashboard/assets/*', async (request, reply) => {
    const assetPath = resolveDashboardAssetPath(request.params['*']);
    if (!assetPath) {
      reply.code(404);
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Dashboard asset not found.' } };
    }

    try {
      const file = await readFile(assetPath);
      const contentType = assetContentTypes.get(extname(assetPath).toLowerCase()) ?? 'application/octet-stream';
      reply.header('cache-control', 'public, max-age=31536000, immutable');
      reply.header('x-content-type-options', 'nosniff');
      reply.header('referrer-policy', 'no-referrer');
      reply.type(contentType);
      return reply.send(file);
    } catch {
      reply.code(404);
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Dashboard asset not found.' } };
    }
  });

  app.get('/privacy', async (_request, reply) => {
    return sendPublicPolicyPage(reply, {
      title: '[Company Name] - Privacy Policy',
      subtitle: 'Kebijakan Privasi ini menjelaskan pemrosesan data pada Ops Dashboard sesuai konteks operasional dashboard dan prinsip kepatuhan yang relevan di Indonesia, termasuk perlindungan data pribadi dan penyelenggaraan sistem elektronik.',
      lastUpdated: '2026-04-08',
      sections: [
        {
          heading: 'Informasi penyelenggara dan pengendali data',
          paragraphs: [
            'Halaman ini dipublikasikan untuk layanan yang dioperasikan oleh [Company Name] sebagai penyelenggara sistem elektronik pada deployment ini. Detail alamat resmi dan kontak layanan/privasi dapat diperbarui sesuai kanal resmi perusahaan.',
            'Dalam deployment ini, [Company Name] bertindak sebagai pihak yang menentukan tujuan dan kendali operasional atas data yang diproses dalam dashboard.'
          ]
        },
        {
          heading: 'Dasar kepatuhan yang dirujuk',
          bullets: [
            'Undang-Undang Nomor 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP)',
            'Undang-Undang Informasi dan Transaksi Elektronik beserta perubahannya',
            'Peraturan Pemerintah Nomor 71 Tahun 2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik',
            'Ketentuan PMSE yang relevan, termasuk kewajiban transparansi informasi kepada pengguna'
          ]
        },
        {
          heading: 'Data yang dapat diproses',
          bullets: [
            'Token akses Meta yang diberikan oleh operator melalui OAuth atau konfigurasi yang terkendali',
            'Metadata asset seperti ad account ID, page ID, business ID, pixel ID, nama asset, dan status ketersediaan',
            'Catatan audit internal untuk perubahan konfigurasi dan aktivitas operasional',
            'Snapshot operasional untuk kebutuhan dashboard, monitoring, dan dukungan workflow'
          ]
        },
        {
          heading: 'Tujuan dan dasar pemrosesan',
          bullets: [
            'Menemukan dan menampilkan asset Meta yang tersedia bagi operator yang berwenang',
            'Memungkinkan operator memilih asset yang relevan untuk workflow internal',
            'Mendukung workflow operasional yang tetap berada di belakang guardrail, approval, dan kontrol internal',
            'Menjaga audit trail, troubleshooting, dan kontinuitas operasional',
            'Pemrosesan dilakukan berdasarkan kebutuhan operasional sah, instruksi operator yang berwenang, dan/atau persetujuan/otorisasi yang diberikan dalam flow koneksi platform terkait'
          ]
        },
        {
          heading: 'Hak subjek data',
          bullets: [
            'Meminta akses atas data pribadi yang diproses sepanjang berlaku dan dimungkinkan menurut hukum',
            'Meminta perbaikan atau pembaruan data yang tidak akurat',
            'Meminta penghentian pemrosesan tertentu atau penarikan persetujuan jika dasar pemrosesan bergantung pada persetujuan',
            'Meminta penghapusan data sesuai ketentuan yang berlaku dan mekanisme operasional yang aman',
            'Mengajukan pengaduan kepada operator deployment atau otoritas yang berwenang sesuai hukum yang berlaku'
          ]
        },
        {
          heading: 'Penyimpanan, retensi, dan keamanan',
          bullets: [
            'Token dan konfigurasi runtime disimpan hanya sepanjang diperlukan untuk operasional yang sah dan terkendali',
            'Akses ke dashboard dibatasi melalui autentikasi internal dan kontrol operasional',
            'Workflow write tetap berada di belakang guardrail dan approval',
            'Retensi final harus ditetapkan oleh [Company Name] sesuai kebutuhan bisnis dan hukum yang berlaku',
            'Insiden keamanan yang material harus ditangani dan, jika diwajibkan hukum, diberitahukan sesuai ketentuan yang berlaku'
          ]
        },
        {
          heading: 'Pengungkapan dan transfer data',
          bullets: [
            'Ops Dashboard tidak dimaksudkan untuk membagikan token atau asset terhubung kepada pihak yang tidak berwenang',
            'Data dapat diproses melalui penyedia infrastruktur atau platform terkait sepanjang diperlukan untuk penyelenggaraan layanan',
            'Jika terjadi transfer data lintas yurisdiksi, [Company Name] wajib memastikan dasar dan perlindungannya sesuai ketentuan hukum yang berlaku'
          ]
        },
        {
          heading: 'Kontrol pengguna dan penghapusan data',
          bullets: [
            'Operator dapat menghubungkan Meta, memilih asset, menandai koneksi untuk penggunaan operasional berikutnya, melakukan unbind, dan menghapus koneksi yang sudah aman dihapus',
            'Instruksi penghapusan data harus disediakan secara jelas oleh [Company Name], termasuk kontak atau kanal permintaan penghapusan',
            'Koneksi yang masih dipakai oleh konfigurasi operasional aktif sebaiknya di-unbind terlebih dahulu untuk menjaga stabilitas layanan'
          ]
        }
      ]
    });
  });

  const sendTermsOfServicePage = (reply: FastifyReply) => sendPublicPolicyPage(reply, {
    title: '[Company Name] - Terms of Service',
    subtitle: 'Syarat dan Ketentuan ini mengatur penggunaan layanan [Company Name] pada dashboard operasional internal dan tanggung jawab operator atas asset Meta yang dihubungkan.',
    lastUpdated: '2026-04-08',
    sections: [
      {
        heading: 'Ruang lingkup layanan',
        paragraphs: [
          'Layanan ini disediakan oleh [Company Name] sebagai dashboard operasional internal untuk menghubungkan asset Meta, meninjau ketersediaan asset, memilih asset yang relevan, dan menyiapkan workflow operasional secara terkendali.',
          'Layanan ini ditujukan bagi operator atau pengguna bisnis yang memang memiliki kewenangan atas asset yang dihubungkan.'
        ]
      },
      {
        heading: 'Kewajiban pengguna/operator',
        bullets: [
          'Hanya menghubungkan account, page, business, atau pixel yang memang berhak diakses',
          'Memberikan data konfigurasi yang akurat saat menghubungkan platform atau menyiapkan preferensi operasional',
          'Meninjau asset terpilih dan pengaturan operasional sebelum mengaktifkan perubahan berikutnya',
          'Tidak menggunakan layanan untuk melanggar hukum, aturan platform, atau hak pihak lain'
        ]
      },
      {
        heading: 'Kontrol dan pengamanan operasional',
        bullets: [
          'Menambahkan koneksi Meta baru tidak otomatis mengganti konfigurasi operasional yang sedang aktif',
          'Perubahan operasional dapat tetap berada di belakang approval, review, dan guardrail internal',
          'Koneksi yang disiapkan untuk tahap operasional berikutnya dapat di-unbind atau dihapus melalui kontrol dashboard'
        ]
      },
      {
        heading: 'Kepatuhan hukum dan platform',
        bullets: [
          'Penggunaan layanan harus sejalan dengan hukum yang berlaku di Indonesia, termasuk ketentuan perlindungan data pribadi dan penyelenggaraan sistem elektronik',
          'Penggunaan layanan juga harus mematuhi aturan, permission, dan pembatasan dari Meta atau provider lain yang relevan',
          'Layanan ini tidak dimaksudkan untuk membenarkan atau memfasilitasi akses di luar hak yang dimiliki pengguna'
        ]
      },
      {
        heading: 'Ketersediaan layanan dan perubahan',
        paragraphs: [
          'Fitur, workflow, dan panduan dapat berubah dari waktu ke waktu. Operator bertanggung jawab untuk meninjau perubahan konfigurasi dan asset sebelum menggunakan koneksi yang baru disiapkan.',
          'Operator deployment dapat memperbarui syarat layanan ini untuk menjaga kepatuhan hukum, keamanan, atau perubahan produk yang wajar.'
        ]
      },
      {
        heading: 'Hukum yang berlaku dan penyelesaian sengketa',
        paragraphs: [
          'Sepanjang diperbolehkan oleh hukum, syarat layanan ini ditafsirkan menurut hukum Republik Indonesia. Detail mekanisme penyelesaian sengketa dan forum final dapat ditetapkan oleh [Company Name] pada dokumen legal final perusahaan.'
        ]
      }
    ]
  });

  app.get('/terms', async (_request, reply) => sendTermsOfServicePage(reply));
  app.get('/terms-of-service', async (_request, reply) => sendTermsOfServicePage(reply));

  app.get('/dashboard/login', async (request, reply) => {
    const session = getDashboardSession(request);
    if (session) {
      dashboardSecurityHeaders(reply);
      reply.code(302);
      reply.header('location', '/dashboard/overview');
      return reply.send();
    }

    return sendDashboardShell(reply);
  });

  app.post('/dashboard/login', async (request, reply) => {
    dashboardSecurityHeaders(reply);
    const body = loginSchema.parse(request.body ?? {});
    const result = authenticateDashboardLogin(request, body.username, body.password);

    if (!result.ok) {
      const statusCode = result.code === 'LOGIN_RATE_LIMITED' ? 429 : 401;
      reply.code(statusCode);
      return {
        ok: false,
        error: {
          code: result.code,
          message: result.code === 'LOGIN_RATE_LIMITED'
            ? `Terlalu banyak percobaan login. Coba lagi dalam ${result.retryAfterSeconds ?? 60} detik.`
            : 'Username atau password salah.',
          retryAfterSeconds: result.retryAfterSeconds ?? null
        }
      };
    }

    const username = result.username ?? body.username;
    issueDashboardSession(reply, username);
    return {
      ok: true,
      redirectTo: '/overview'
    };
  });

  app.post('/dashboard/logout', async (_request, reply) => {
    dashboardSecurityHeaders(reply);
    clearDashboardSession(reply);
    reply.code(200);
    return {
      ok: true,
      redirectTo: '/login'
    };
  });

  app.get('/dashboard/api/session', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    return {
      ok: true,
      session: {
        username: session.username
      }
    };
  });

  app.get('/dashboard/api/summary', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    return dashboardService.getSummary();
  });

  app.get('/dashboard/api/campaigns/hierarchy', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const query = campaignHierarchyQuerySchema.parse(request.query);
    return dashboardService.getCampaignExplorer(query.limit);
  });

  app.post('/dashboard/api/campaigns/sync', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const body = campaignHierarchySyncSchema.parse(request.body ?? {});
    return dashboardService.syncCampaignExplorer(body.limit, {
      actor: session.username
    });
  });

  app.get<{ Params: { adId: string } }>('/dashboard/api/ads/:adId/detail', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = adDetailParamsSchema.parse(request.params);
    return dashboardService.getAdDetail(params.adId);
  });

  app.post<{ Params: { campaignId: string } }>('/dashboard/api/campaigns/:campaignId/duplicate', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = campaignParamsSchema.parse(request.params);
    const body = dashboardMetaCampaignDuplicateSchema.parse(request.body ?? {});
    return dashboardService.duplicateCampaign(params.campaignId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun,
      confirmHighImpact: body.confirmHighImpact,
      statusOption: body.statusOption,
      deepCopy: body.deepCopy,
      startTime: body.startTime,
      endTime: body.endTime,
      renameOptions: body.renameOptions,
      parameterOverrides: body.parameterOverrides,
      migrateToAdvantagePlus: body.migrateToAdvantagePlus
    });
  });

  app.post<{ Params: { campaignId: string } }>('/dashboard/api/campaigns/:campaignId/duplicate-tree', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = campaignParamsSchema.parse(request.params);
    const body = dashboardMetaCampaignDuplicateTreeSchema.parse(request.body ?? {});
    return dashboardService.duplicateCampaignTree(params.campaignId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun,
      confirmHighImpact: body.confirmHighImpact,
      statusOption: body.statusOption,
      includeAds: body.includeAds,
      cleanupOnFailure: body.cleanupOnFailure,
      namePrefix: body.namePrefix,
      nameSuffix: body.nameSuffix
    });
  });

  app.post<{ Params: { campaignId: string } }>('/dashboard/api/campaigns/:campaignId/delete', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = campaignParamsSchema.parse(request.params);
    const body = dashboardMetaDeleteSchema.parse(request.body ?? {});
    return dashboardService.deleteCampaign(params.campaignId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun
    });
  });

  app.post<{ Params: { adSetId: string } }>('/dashboard/api/adsets/:adSetId/duplicate', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = adSetParamsSchema.parse(request.params);
    const body = dashboardMetaAdSetDuplicateSchema.parse(request.body ?? {});
    return dashboardService.duplicateAdSet(params.adSetId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun,
      confirmHighImpact: body.confirmHighImpact,
      targetCampaignId: body.targetCampaignId,
      statusOption: body.statusOption,
      deepCopy: body.deepCopy,
      createDcoAdSet: body.createDcoAdSet,
      startTime: body.startTime,
      endTime: body.endTime,
      renameOptions: body.renameOptions
    });
  });

  app.post<{ Params: { adSetId: string } }>('/dashboard/api/adsets/:adSetId/delete', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = adSetParamsSchema.parse(request.params);
    const body = dashboardMetaDeleteSchema.parse(request.body ?? {});
    return dashboardService.deleteAdSet(params.adSetId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun
    });
  });

  app.post<{ Params: { adId: string } }>('/dashboard/api/ads/:adId/promotability', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = adDetailParamsSchema.parse(request.params);
    const body = dashboardMetaAdPromotabilitySchema.parse(request.body ?? {});
    return dashboardService.inspectAdPromotability(params.adId, {
      targetAdSetId: body.targetAdSetId
    });
  });

  app.post<{ Params: { adId: string } }>('/dashboard/api/ads/:adId/preflight/duplicate', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = adDetailParamsSchema.parse(request.params);
    const body = dashboardMetaAdDuplicateSchema.parse(request.body ?? {});
    return dashboardService.preflightDuplicateAd(params.adId, {
      actor: session.username,
      reason: body.reason,
      targetAdSetId: body.targetAdSetId,
      statusOption: body.statusOption,
      renameOptions: body.renameOptions,
      creativeParameters: body.creativeParameters
    });
  });

  app.post<{ Params: { adId: string } }>('/dashboard/api/ads/:adId/duplicate', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = adDetailParamsSchema.parse(request.params);
    const body = dashboardMetaAdDuplicateSchema.parse(request.body ?? {});
    return dashboardService.duplicateAd(params.adId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun,
      confirmHighImpact: body.confirmHighImpact,
      targetAdSetId: body.targetAdSetId,
      statusOption: body.statusOption,
      renameOptions: body.renameOptions,
      creativeParameters: body.creativeParameters
    });
  });

  app.get('/dashboard/api/creatives', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const query = creativeLibraryQuerySchema.parse(request.query);
    return dashboardService.getCreativeLibrary(query.limit, query.assetType);
  });

  app.get('/dashboard/api/workflows', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    return dashboardService.getWorkflowCatalog();
  });

  app.get('/dashboard/api/audiences', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const query = audienceListQuerySchema.parse(request.query);
    return dashboardService.getAudiences(query.limit, query.type);
  });

  app.patch<{ Params: { audienceId: string } }>('/dashboard/api/audiences/:audienceId', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = audienceParamsSchema.parse(request.params);
    const body = audienceUpdateSchema.parse(request.body ?? {});

    return dashboardService.updateAudience(params.audienceId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun,
      name: body.name,
      description: body.description,
      retentionDays: body.retentionDays
    });
  });

  app.delete<{ Params: { audienceId: string } }>('/dashboard/api/audiences/:audienceId', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = audienceParamsSchema.parse(request.params);
    const body = audienceDeleteSchema.parse(request.body ?? {});

    return dashboardService.deleteAudience(params.audienceId, {
      actor: session.username,
      reason: body.reason,
      dryRun: body.dryRun
    });
  });

  app.get('/dashboard/api/settings', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    return dashboardService.getSettings();
  });

  app.post('/dashboard/api/settings', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const body = dashboardSettingsUpdateSchema.parse(request.body ?? {});
    return dashboardService.updateSettings({
      ...body,
      actor: session.username,
      reason: body.reason ?? 'Dashboard settings updated from dashboard UI'
    });
  });

  app.get('/dashboard/api/meta/oauth/start', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    return dashboardService.startMetaOAuth(session.username);
  });

  app.post<{ Params: { connectionId: string } }>('/dashboard/api/meta/connections/:connectionId/selections', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = metaConnectionParamsSchema.parse(request.params);
    const body = metaConnectionSelectionSchema.parse(request.body ?? {});

    return dashboardService.saveMetaSelections({
      connectionId: params.connectionId,
      adAccountIds: body.adAccountIds,
      pageIds: body.pageIds,
      pixelIds: body.pixelIds,
      businessIds: body.businessIds,
      primaryAdAccountId: body.primaryAdAccountId ?? null,
      bindRuntime: body.bindRuntime
    });
  });

  app.post<{ Params: { connectionId: string } }>('/dashboard/api/meta/connections/:connectionId/unbind', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = metaConnectionParamsSchema.parse(request.params);
    return dashboardService.unbindMetaConnection(params.connectionId);
  });

  app.delete<{ Params: { connectionId: string } }>('/dashboard/api/meta/connections/:connectionId', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = metaConnectionParamsSchema.parse(request.params);
    return dashboardService.removeMetaConnection(params.connectionId);
  });

  app.get('/dashboard/meta/callback', async (request, reply) => {
    const parsedQuery = metaOAuthCallbackQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      return sendMetaCallbackPage(reply, {
        title: 'Meta callback tidak valid',
        body: 'Permintaan callback ini tidak lengkap atau sudah rusak. Mulai lagi dari tombol Connect Meta di dashboard agar proses review dan connect tetap rapi.',
        buttonLabel: 'Kembali ke dashboard',
        closeWindow: false,
        statusCode: 400
      });
    }

    try {
      const result = await dashboardService.completeMetaOAuth(parsedQuery.data.code, parsedQuery.data.state);
      return sendMetaCallbackPage(reply, {
        title: 'Meta berhasil terhubung',
        body: `Connection baru tersimpan untuk ${result.connection.profileName}. Kembali ke dashboard settings untuk memilih ads account, pages, dan pixel yang mau dipakai.`,
        buttonLabel: 'Tutup jendela ini',
        closeWindow: true,
        statusCode: 200
      });
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError('Meta OAuth callback gagal diproses.', 'REMOTE_TEMPORARY_FAILURE', 500);
      const details = new Set<string>();
      const errorDetails = appError.details as {
        providerStatus?: number;
        providerError?: {
          message?: string;
          type?: string;
          code?: number;
          error_subcode?: number;
          fbtrace_id?: string;
        };
      } | undefined;

      if (errorDetails?.providerStatus != null) {
        details.add(`HTTP status dari Meta: ${errorDetails.providerStatus}`);
      }

      if (errorDetails?.providerError?.message) {
        details.add(`Pesan Meta: ${errorDetails.providerError.message}`);
      }

      if (errorDetails?.providerError?.type) {
        details.add(`Type: ${errorDetails.providerError.type}`);
      }

      if (errorDetails?.providerError?.code != null) {
        details.add(`Code: ${errorDetails.providerError.code}`);
      }

      if (errorDetails?.providerError?.error_subcode != null) {
        details.add(`Subcode: ${errorDetails.providerError.error_subcode}`);
      }

      if (errorDetails?.providerError?.fbtrace_id) {
        details.add(`fbtrace_id: ${errorDetails.providerError.fbtrace_id}`);
      }

      return sendMetaCallbackPage(reply, {
        title: 'Meta gagal terhubung',
        body: appError.message,
        details: Array.from(details),
        buttonLabel: 'Kembali ke dashboard',
        closeWindow: false,
        statusCode: appError.statusCode
      });
    }
  });

  app.post('/dashboard/api/creatives/generate', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const body = creativeGenerateSchema.parse(request.body ?? {});
    return dashboardService.generateCreative({
      ...body,
      actor: session.username
    });
  });

  app.delete('/dashboard/api/creatives/:assetId', async (request, reply) => {
    const session = requireDashboardApiSession(request, reply);
    if ('ok' in session && session.ok === false) {
      return session;
    }

    const params = assetParamsSchema.parse(request.params);
    const deleted = await dashboardService.deleteCreativeAsset(params.assetId, session.username);

    if (!deleted) {
      reply.code(404);
      return {
        ok: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Creative asset not found.'
        }
      };
    }

    return {
      ok: true,
      item: deleted
    };
  });

  app.get('/dashboard', async (request, reply) => {
    const session = await requireDashboardPageSession(request, reply);
    if (!session) {
      return reply;
    }

    return sendDashboardShell(reply);
  });

  app.get('/dashboard/', async (request, reply) => {
    const session = await requireDashboardPageSession(request, reply);
    if (!session) {
      return reply;
    }

    return sendDashboardShell(reply);
  });

  app.get<{ Params: { '*': string } }>('/dashboard/*', async (request, reply) => {
    const subPath = request.params['*']?.replace(/^\/+/, '') ?? '';
    if (subPath.startsWith('api/') || subPath.startsWith('assets/') || subPath === 'login') {
      reply.code(404);
      return { ok: false, error: { code: 'DASHBOARD_ROUTE_NOT_FOUND', message: 'Dashboard route not found.' } };
    }

    const session = await requireDashboardPageSession(request, reply);
    if (!session) {
      return reply;
    }

    return sendDashboardShell(reply);
  });
}
