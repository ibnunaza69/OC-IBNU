import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { CopyRepository } from './copy.repository.js';

type CopyContextInput = {
  campaignId?: string | undefined;
  adSetId?: string | undefined;
  adId?: string | undefined;
};

type GenerateCopyInput = CopyContextInput & {
  brief: string;
  productName?: string | undefined;
  targetAudience?: string | undefined;
  desiredOutcome?: string | undefined;
  styles?: string[] | undefined;
  toneKeywords?: string[] | undefined;
  callToActionType?: string | undefined;
  actor: string;
  reason: string;
};

type ReviseCopyInput = {
  variantId: string;
  instruction: string;
  actor: string;
  reason: string;
  primaryText?: string | undefined;
  headline?: string | undefined;
  description?: string | undefined;
};

type ReviewCopyInput = {
  variantId?: string | undefined;
  actor: string;
  reason?: string | undefined;
  primaryText?: string | undefined;
  headline?: string | undefined;
  description?: string | undefined;
  productName?: string | undefined;
  targetAudience?: string | undefined;
  desiredOutcome?: string | undefined;
  callToActionType?: string | undefined;
};

type ResolvedContext = {
  campaign: Awaited<ReturnType<MetaCampaignSnapshotRepository['getLatestByCampaignId']>> | null;
  adSet: Awaited<ReturnType<MetaAdSetSnapshotRepository['getLatestByAdSetId']>> | null;
  ad: Awaited<ReturnType<MetaAdSnapshotRepository['getLatestByAdId']>> | null;
};

const DEFAULT_STYLES = ['benefit-led', 'direct-response', 'social-proof'];
const CTA_VERBS = ['coba', 'mulai', 'pelajari', 'dapatkan', 'hubungi', 'daftar', 'beli', 'booking', 'pesan'];
const RISKY_CLAIMS = ['pasti', 'jamin', 'garansi hasil', 'tanpa risiko', '100%', 'instan', 'seumur hidup'];

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function toSentenceCase(value: string) {
  const normalized = compactWhitespace(value);
  return normalized.length > 0
    ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
    : normalized;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildLineageKey(input: {
  brief: string;
  productName?: string | undefined;
  style: string;
  campaignId?: string | null | undefined;
  adSetId?: string | null | undefined;
  adId?: string | null | undefined;
}) {
  const contextKey = input.adId ?? input.adSetId ?? input.campaignId ?? 'global';
  const briefHash = createHash('sha1').update(`${input.productName ?? ''}|${input.brief}`).digest('hex').slice(0, 10);
  const styleKey = slugify(input.style) || 'general';
  return `${contextKey}:${styleKey}:${briefHash}`;
}

function normalizeToneKeywords(input?: string[]) {
  if (!input || input.length === 0) {
    return ['jelas', 'ringkas'];
  }

  return input.map((item) => compactWhitespace(item)).filter(Boolean).slice(0, 6);
}

function buildHeadline(style: string, productName: string, desiredOutcome: string, audience: string) {
  switch (style) {
    case 'benefit-led':
      return truncateText(`${productName}: ${desiredOutcome} tanpa ribet`, 80);
    case 'direct-response':
      return truncateText(`Butuh ${desiredOutcome}? Coba ${productName}`, 80);
    case 'social-proof':
      return truncateText(`${audience} mulai pilih ${productName}`, 80);
    case 'educational':
      return truncateText(`Cara lebih rapi capai ${desiredOutcome}`, 80);
    case 'promo':
      return truncateText(`${productName} untuk bantu ${desiredOutcome}`, 80);
    default:
      return truncateText(`${productName} untuk ${desiredOutcome}`, 80);
  }
}

function buildDescription(productName: string, audience: string, cta: string) {
  return truncateText(`${productName} cocok untuk ${audience}. ${cta}.`, 120);
}

function buildPrimaryText(input: {
  style: string;
  brief: string;
  productName: string;
  targetAudience: string;
  desiredOutcome: string;
  toneKeywords: string[];
  context: ResolvedContext;
  callToActionType?: string | undefined;
}) {
  const tone = input.toneKeywords.join(', ');
  const contextHint = [
    input.context.campaign?.name,
    input.context.adSet?.name,
    input.context.ad?.name
  ].filter(Boolean).join(' → ');

  const ctaLine = input.callToActionType
    ? `CTA yang disarankan: ${input.callToActionType}.`
    : 'CTA yang disarankan: Pelajari lebih lanjut.';

  const contextLine = contextHint.length > 0
    ? `Context internal: ${contextHint}.`
    : '';

  switch (input.style) {
    case 'benefit-led':
      return compactWhitespace(
        `${input.productName} dirancang untuk ${input.targetAudience} yang ingin ${input.desiredOutcome}. ` +
        `${toSentenceCase(input.brief)}. Fokus copy ini: hasil utama dulu, lalu alasan kenapa solusi ini lebih praktis dipakai sehari-hari. ` +
        `Tone: ${tone}. ${ctaLine} ${contextLine}`
      );
    case 'direct-response':
      return compactWhitespace(
        `Kalau targetnya ${input.desiredOutcome}, ${input.productName} bisa langsung diposisikan sebagai next step yang jelas untuk ${input.targetAudience}. ` +
        `${toSentenceCase(input.brief)}. Buka dengan pain point, lanjut value proposition singkat, lalu tutup dengan ajakan aksi yang tegas. ` +
        `Tone: ${tone}. ${ctaLine} ${contextLine}`
      );
    case 'social-proof':
      return compactWhitespace(
        `${input.targetAudience} biasanya lebih cepat respon saat copy menunjukkan sinyal kepercayaan. ` +
        `${input.productName} bisa dipresentasikan sebagai pilihan yang terasa aman, relevan, dan sudah terbukti membantu ${input.desiredOutcome}. ` +
        `${toSentenceCase(input.brief)}. Tone: ${tone}. ${ctaLine} ${contextLine}`
      );
    case 'educational':
      return compactWhitespace(
        `Mulai dari insight singkat yang membuat ${input.targetAudience} merasa dipahami, lalu sambungkan ke ${input.productName} sebagai solusi yang masuk akal. ` +
        `${toSentenceCase(input.brief)}. Fokuskan copy pada edukasi ringan sebelum jualan keras. Tone: ${tone}. ${ctaLine} ${contextLine}`
      );
    case 'promo':
      return compactWhitespace(
        `Bingkai ${input.productName} sebagai penawaran yang membantu ${input.targetAudience} mencapai ${input.desiredOutcome} dengan lebih cepat. ` +
        `${toSentenceCase(input.brief)}. Jaga copy tetap konkret, jangan berlebihan, lalu tutup dengan CTA yang jelas. Tone: ${tone}. ${ctaLine} ${contextLine}`
      );
    default:
      return compactWhitespace(
        `${input.productName} untuk ${input.targetAudience} yang ingin ${input.desiredOutcome}. ` +
        `${toSentenceCase(input.brief)}. Tone: ${tone}. ${ctaLine} ${contextLine}`
      );
  }
}

function reviseText(base: { primaryText: string; headline: string; description: string | null }, instruction: string) {
  const normalized = instruction.toLowerCase();
  let primaryText = base.primaryText;
  let headline = base.headline;
  let description = base.description;

  if (normalized.includes('short') || normalized.includes('singkat') || normalized.includes('pendek')) {
    primaryText = truncateText(primaryText, 220);
    headline = truncateText(headline, 45);
    description = description ? truncateText(description, 70) : description;
  }

  if (normalized.includes('urgent') || normalized.includes('segera') || normalized.includes('cepat')) {
    headline = truncateText(`Sekarang: ${headline}`, 80);
    primaryText = compactWhitespace(`${primaryText} Ajak audiens mengambil langkah sekarang, bukan nanti.`);
  }

  if (normalized.includes('soft') || normalized.includes('halus')) {
    primaryText = primaryText.replace(/ajakan aksi yang tegas/gi, 'ajakan aksi yang ringan');
    description = description ? description.replace(/\.$/, ' secara santai.') : description;
  }

  if (normalized.includes('premium') || normalized.includes('elegan')) {
    headline = headline.replace(/coba/gi, 'rasakan');
    primaryText = compactWhitespace(`${primaryText} Jaga diksi tetap elegan dan berkelas.`);
  }

  if (normalized.includes('cta') || normalized.includes('call to action')) {
    primaryText = compactWhitespace(`${primaryText} Pastikan CTA muncul eksplisit di kalimat penutup.`);
  }

  return {
    primaryText,
    headline,
    description
  };
}

function splitWords(value: string) {
  return value.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number) {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function evaluateCopy(input: {
  primaryText: string;
  headline: string;
  description?: string | null | undefined;
  productName?: string | null | undefined;
  targetAudience?: string | null | undefined;
  desiredOutcome?: string | null | undefined;
  callToActionType?: string | null | undefined;
}) {
  const primaryText = compactWhitespace(input.primaryText);
  const headline = compactWhitespace(input.headline);
  const description = compactWhitespace(input.description ?? '');
  const strengths: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];

  const wordCount = splitWords(primaryText).length;
  const sentenceCount = Math.max(1, primaryText.split(/[.!?]+/).filter((item) => item.trim().length > 0).length);
  const avgSentenceLength = wordCount / sentenceCount;

  let clarity = 5;
  if (avgSentenceLength > 22) {
    clarity -= 1;
    suggestions.push('Pecah kalimat utama jadi lebih pendek supaya lebih cepat dipahami.');
  }
  if (primaryText.length > 420) {
    clarity -= 1;
    suggestions.push('Ringkas primary text; bagian awal iklan sebaiknya cepat sampai ke value utama.');
  }
  if ((primaryText.match(/!/g) ?? []).length > 2) {
    clarity -= 1;
    risks.push('Tanda seru terlalu banyak bisa terasa terlalu agresif.');
  }
  if (clarity >= 4) {
    strengths.push('Pesan utama relatif jelas dan tidak berputar-putar.');
  }

  let specificity = 2;
  if (/\d/.test(primaryText) || /\d/.test(headline)) {
    specificity += 1;
    strengths.push('Ada unsur konkret/angka yang membantu copy terasa spesifik.');
  }
  if (input.productName && primaryText.toLowerCase().includes(input.productName.toLowerCase())) {
    specificity += 1;
  }
  if (input.desiredOutcome && primaryText.toLowerCase().includes(input.desiredOutcome.toLowerCase())) {
    specificity += 1;
  }
  if (specificity <= 2) {
    suggestions.push('Tambahkan detail konkret: hasil, angka, atau use case singkat.');
  }

  let ctaStrength = 2;
  const joinedText = `${headline} ${primaryText}`.toLowerCase();
  if (CTA_VERBS.some((verb) => joinedText.includes(verb))) {
    ctaStrength += 2;
    strengths.push('Ajakan aksinya sudah cukup terlihat.');
  }
  if (input.callToActionType) {
    ctaStrength += 1;
  } else {
    suggestions.push('Tentukan CTA yang lebih eksplisit supaya next step audiens jelas.');
  }

  let audienceFit = 3;
  if (input.targetAudience) {
    const audienceWords = splitWords(input.targetAudience);
    const hitCount = audienceWords.filter((word) => joinedText.includes(word)).length;
    if (hitCount >= 1) {
      audienceFit += 1;
      strengths.push('Copy mulai menyebut atau memantulkan konteks audiens.');
    } else {
      suggestions.push('Masukkan bahasa yang lebih dekat ke target audience.');
    }
  }

  let complianceSafety = 5;
  const riskyHits = RISKY_CLAIMS.filter((claim) => joinedText.includes(claim));
  if (riskyHits.length > 0) {
    complianceSafety -= Math.min(3, riskyHits.length);
    risks.push(`Ada klaim yang berpotensi sensitif: ${riskyHits.join(', ')}.`);
    suggestions.push('Lunakkan klaim supaya tidak terdengar absolut atau menjanjikan hasil pasti.');
  }

  let lengthFit = 5;
  if (headline.length > 45) {
    lengthFit -= 1;
    suggestions.push('Pendekkan headline supaya lebih kuat di placement sempit.');
  }
  if (headline.length < 12) {
    lengthFit -= 1;
    suggestions.push('Headline terlalu pendek; tambahkan value utama.');
  }
  if (description.length > 140) {
    lengthFit -= 1;
  }

  const scores = {
    clarity: clampScore(clarity),
    specificity: clampScore(specificity),
    ctaStrength: clampScore(ctaStrength),
    audienceFit: clampScore(audienceFit),
    complianceSafety: clampScore(complianceSafety),
    lengthFit: clampScore(lengthFit)
  };

  const averageScoreRaw = Number(average(Object.values(scores)).toFixed(1));
  const overallScore = clampScore(averageScoreRaw);

  if (scores.complianceSafety <= 2 && !risks.some((item) => item.includes('sensitif'))) {
    risks.push('Ada wording yang berisiko terlalu menjanjikan atau terlalu absolut.');
  }

  if (scores.specificity >= 4 && !strengths.some((item) => item.includes('konkret'))) {
    strengths.push('Copy terasa cukup konkret untuk dijadikan bahan iklan.');
  }

  const summary = overallScore >= 4
    ? 'Copy ini sudah cukup kuat dipakai sebagai draft operasional dengan revisi minor.'
    : overallScore >= 3
      ? 'Copy ini usable, tapi masih butuh penguatan di beberapa area sebelum dipublish.'
      : 'Copy ini masih perlu dirapikan cukup banyak sebelum aman dipakai sebagai materi iklan.';

  return {
    overallScore,
    rubric: {
      scores,
      metrics: {
        wordCount,
        headlineLength: headline.length,
        primaryTextLength: primaryText.length,
        avgSentenceLength: Number(avgSentenceLength.toFixed(1)),
        averageScoreRaw
      }
    },
    summary,
    strengths: Array.from(new Set(strengths)).slice(0, 6),
    risks: Array.from(new Set(risks)).slice(0, 6),
    suggestions: Array.from(new Set(suggestions)).slice(0, 8)
  };
}

export class CopyService {
  private readonly copyRepository = new CopyRepository();
  private readonly auditRepository = new AuditRepository();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  private async resolveContext(input: CopyContextInput): Promise<ResolvedContext> {
    const [campaign, adSet, ad] = await Promise.all([
      input.campaignId ? this.campaignRepository.getLatestByCampaignId(input.campaignId) : Promise.resolve(null),
      input.adSetId ? this.adSetRepository.getLatestByAdSetId(input.adSetId) : Promise.resolve(null),
      input.adId ? this.adRepository.getLatestByAdId(input.adId) : Promise.resolve(null)
    ]);

    return { campaign, adSet, ad };
  }

  async generateVariants(input: GenerateCopyInput) {
    const styles = Array.from(new Set((input.styles?.length ? input.styles : DEFAULT_STYLES).map((item) => compactWhitespace(item).toLowerCase()).filter(Boolean))).slice(0, 8);
    const productName = compactWhitespace(input.productName ?? 'produk ini');
    const targetAudience = compactWhitespace(input.targetAudience ?? 'audiens relevan');
    const desiredOutcome = compactWhitespace(input.desiredOutcome ?? 'hasil yang lebih baik');
    const toneKeywords = normalizeToneKeywords(input.toneKeywords);
    const context = await this.resolveContext(input);
    const batchId = randomUUID();
    const items = [];

    for (const style of styles) {
      const lineageKey = buildLineageKey({
        brief: input.brief,
        productName,
        style,
        campaignId: input.campaignId,
        adSetId: input.adSetId,
        adId: input.adId
      });
      const versionNumber = await this.copyRepository.getNextVersionNumber(lineageKey);
      const primaryText = buildPrimaryText({
        style,
        brief: input.brief,
        productName,
        targetAudience,
        desiredOutcome,
        toneKeywords,
        context,
        callToActionType: input.callToActionType
      });
      const headline = buildHeadline(style, productName, desiredOutcome, targetAudience);
      const description = buildDescription(productName, targetAudience, input.callToActionType ?? 'Pelajari lebih lanjut');

      const created = await this.copyRepository.createVariant({
        lineageKey,
        batchId,
        versionNumber,
        sourceType: 'generated',
        style,
        actor: input.actor,
        reason: input.reason,
        brief: input.brief,
        productName,
        targetAudience,
        desiredOutcome,
        campaignId: input.campaignId,
        adSetId: input.adSetId,
        adId: input.adId,
        contextSummary: {
          campaign: context.campaign ? {
            campaignId: context.campaign.campaignId,
            name: context.campaign.name,
            objective: context.campaign.objective,
            effectiveStatus: context.campaign.effectiveStatus
          } : null,
          adSet: context.adSet ? {
            adSetId: context.adSet.adSetId,
            name: context.adSet.name,
            effectiveStatus: context.adSet.effectiveStatus
          } : null,
          ad: context.ad ? {
            adId: context.ad.adId,
            name: context.ad.name,
            effectiveStatus: context.ad.effectiveStatus,
            creativeId: context.ad.creativeId
          } : null
        },
        toneKeywords,
        callToActionType: input.callToActionType,
        primaryText,
        headline,
        description,
        metadata: {
          generator: 'internal-template',
          style,
          tones: toneKeywords
        }
      });

      if (!created) {
        throw new AppError('Copy variant creation did not return a record');
      }

      items.push(created);
    }

    await this.auditRepository.create({
      operationType: 'copy.variant.generate',
      actor: input.actor,
      targetType: 'copy-batch',
      targetId: batchId,
      status: 'success',
      reason: input.reason,
      metadata: {
        batchId,
        count: items.length,
        styles,
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null
      }
    });

    return {
      ok: true,
      batchId,
      count: items.length,
      items
    };
  }

  async reviseVariant(input: ReviseCopyInput) {
    const source = await this.copyRepository.findVariantById(input.variantId);

    if (!source) {
      throw new AppError('Copy variant not found', 'RESOURCE_NOT_FOUND', 404, { variantId: input.variantId });
    }

    const nextVersion = await this.copyRepository.getNextVersionNumber(source.lineageKey);
    const revised = reviseText({
      primaryText: source.primaryText,
      headline: source.headline,
      description: source.description
    }, input.instruction);

    const created = await this.copyRepository.createVariant({
      lineageKey: source.lineageKey,
      batchId: randomUUID(),
      parentVariantId: source.id,
      versionNumber: nextVersion,
      sourceType: 'revision',
      style: source.style,
      actor: input.actor,
      reason: input.reason,
      brief: source.brief,
      productName: source.productName,
      targetAudience: source.targetAudience,
      desiredOutcome: source.desiredOutcome,
      campaignId: source.campaignId,
      adSetId: source.adSetId,
      adId: source.adId,
      contextSummary: source.contextSummary,
      toneKeywords: Array.isArray(source.toneKeywords) ? source.toneKeywords.filter((item): item is string => typeof item === 'string') : null,
      callToActionType: source.callToActionType,
      primaryText: compactWhitespace(input.primaryText ?? revised.primaryText),
      headline: compactWhitespace(input.headline ?? revised.headline),
      description: input.description ?? revised.description,
      metadata: {
        revisionOf: source.id,
        instruction: input.instruction
      }
    });

    if (!created) {
      throw new AppError('Copy variant revision did not return a record');
    }

    await this.auditRepository.create({
      operationType: 'copy.variant.revise',
      actor: input.actor,
      targetType: 'copy-variant',
      targetId: created.id,
      status: 'success',
      reason: input.reason,
      beforeState: {
        variantId: source.id,
        versionNumber: source.versionNumber
      },
      afterState: {
        variantId: created.id,
        versionNumber: created.versionNumber
      },
      metadata: {
        instruction: input.instruction,
        lineageKey: source.lineageKey
      }
    });

    return {
      ok: true,
      sourceVariantId: source.id,
      item: created
    };
  }

  async getVariant(variantId: string) {
    const item = await this.copyRepository.findVariantById(variantId);

    if (!item) {
      throw new AppError('Copy variant not found', 'RESOURCE_NOT_FOUND', 404, { variantId });
    }

    const reviews = await this.copyRepository.listReviews({ limit: 10, variantId });

    return {
      ok: true,
      item,
      reviews
    };
  }

  async listVariants(filters: { limit?: number; campaignId?: string | undefined; adSetId?: string | undefined; adId?: string | undefined; lineageKey?: string | undefined }) {
    const items = await this.copyRepository.listVariants(filters);

    return {
      ok: true,
      count: items.length,
      items
    };
  }

  async reviewCopy(input: ReviewCopyInput) {
    if (input.variantId) {
      const variant = await this.copyRepository.findVariantById(input.variantId);

      if (!variant) {
        throw new AppError('Copy variant not found', 'RESOURCE_NOT_FOUND', 404, { variantId: input.variantId });
      }

      const evaluation = evaluateCopy({
        primaryText: variant.primaryText,
        headline: variant.headline,
        description: variant.description,
        productName: variant.productName,
        targetAudience: variant.targetAudience,
        desiredOutcome: variant.desiredOutcome,
        callToActionType: variant.callToActionType
      });

      const review = await this.copyRepository.createReview({
        variantId: variant.id,
        actor: input.actor,
        reviewMode: 'variant',
        reviewInput: null,
        overallScore: evaluation.overallScore,
        rubric: evaluation.rubric,
        summary: evaluation.summary,
        strengths: evaluation.strengths,
        risks: evaluation.risks,
        suggestions: evaluation.suggestions
      });

      if (!review) {
        throw new AppError('Copy review creation did not return a record');
      }

      await this.auditRepository.create({
        operationType: 'copy.review.create',
        actor: input.actor,
        targetType: 'copy-variant',
        targetId: variant.id,
        status: 'success',
        ...(input.reason ? { reason: input.reason } : {}),
        metadata: {
          reviewId: review.id,
          overallScore: review.overallScore
        }
      });

      return {
        ok: true,
        review,
        item: variant
      };
    }

    if (!input.primaryText || !input.headline) {
      throw new AppError('primaryText and headline are required for ad-hoc copy review', 'VALIDATION_ERROR', 400);
    }

    const evaluation = evaluateCopy({
      primaryText: input.primaryText,
      headline: input.headline,
      description: input.description,
      productName: input.productName,
      targetAudience: input.targetAudience,
      desiredOutcome: input.desiredOutcome,
      callToActionType: input.callToActionType
    });

    const review = await this.copyRepository.createReview({
      actor: input.actor,
      reviewMode: 'ad-hoc',
      reviewInput: {
        primaryText: input.primaryText,
        headline: input.headline,
        description: input.description ?? null,
        productName: input.productName ?? null,
        targetAudience: input.targetAudience ?? null,
        desiredOutcome: input.desiredOutcome ?? null,
        callToActionType: input.callToActionType ?? null
      },
      overallScore: evaluation.overallScore,
      rubric: evaluation.rubric,
      summary: evaluation.summary,
      strengths: evaluation.strengths,
      risks: evaluation.risks,
      suggestions: evaluation.suggestions
    });

    if (!review) {
      throw new AppError('Copy review creation did not return a record');
    }

    await this.auditRepository.create({
      operationType: 'copy.review.create',
      actor: input.actor,
      targetType: 'copy-review',
      targetId: review.id,
      status: 'success',
      ...(input.reason ? { reason: input.reason } : {}),
      metadata: {
        mode: 'ad-hoc',
        overallScore: review.overallScore
      }
    });

    return {
      ok: true,
      review,
      item: null
    };
  }

  async listReviews(filters: { limit?: number; variantId?: string | undefined }) {
    const items = await this.copyRepository.listReviews(filters);

    return {
      ok: true,
      count: items.length,
      items
    };
  }
}
