import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  IngestPriceObservationService,
  type IngestResult,
} from '../../pricing/application/ingest-price-observation.service.js';
import { PriceSourceType } from '../../pricing/domain/price-observation.entity.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  EVIDENCE_STORAGE,
  EVIDENCE_UPLOAD_QUOTA,
  type EvidenceStorage,
  type EvidenceUploadQuota,
} from '../domain/evidence-storage.port.js';
import { MAX_EVIDENCE_BYTES, sniffImageType } from '../domain/evidence.js';

export interface ReportPriceCommand {
  id?: string;
  productId: string;
  storeId: string;
  priceCents: number;
  currency: string;
  observedAt?: Date;
  evidence?: { photoKey?: string; note?: string };
}

/**
 * The explicit contribution path: a shopper sees a price and reports it,
 * without a shopping list or trip.
 */
@Injectable()
export class ReportPriceUseCase {
  constructor(
    private readonly ingestion: IngestPriceObservationService,
    @Inject(EVIDENCE_STORAGE) private readonly evidence: EvidenceStorage,
    @Inject(EVIDENCE_UPLOAD_QUOTA) private readonly quota: EvidenceUploadQuota,
  ) {}

  async report(
    actor: AuthenticatedUser,
    command: ReportPriceCommand,
    clientIp: string | null,
  ): Promise<IngestResult> {
    const photoKey = command.evidence?.photoKey ?? null;

    // A photo only upgrades the source when the store confirms this user
    // uploaded it. A key that names nothing, or someone else's photo, is a
    // claim of evidence without the evidence.
    if (photoKey && !(await this.evidence.exists(actor.id, photoKey))) {
      throw new UnprocessableEntityException('Evidence photo not found');
    }

    return this.ingestion.ingest({
      id: command.id,
      productId: command.productId,
      storeId: command.storeId,
      priceCents: command.priceCents,
      currency: command.currency,
      observedAt: command.observedAt ?? new Date(),
      sourceType: photoKey
        ? PriceSourceType.UserWithEvidence
        : PriceSourceType.UserReported,
      userId: actor.id,
      clientIp,
      evidence: {
        photoKey,
        note: command.evidence?.note?.trim() || null,
      },
    });
  }

  async uploadEvidence(
    actor: AuthenticatedUser,
    content: Buffer | undefined,
  ): Promise<string> {
    if (!content || content.length === 0) {
      throw new UnprocessableEntityException('A photo file is required');
    }

    if (content.length > MAX_EVIDENCE_BYTES) {
      throw new HttpException(
        { error: 'Payload Too Large', message: 'The photo is larger than 5 MB' },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const type = sniffImageType(content);
    if (!type) {
      throw new UnprocessableEntityException(
        'Evidence must be a JPEG, PNG or WebP image',
      );
    }

    if (!(await this.quota.consume(actor.id))) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Too many photo uploads, please try again later',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.evidence.save(actor.id, content, type);
  }
}
