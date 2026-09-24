import type {
  OptimizationPreferences,
  OptimizationRequest,
  OptimizationSettings,
  OptimizationStatus,
} from './optimization-request.entity.js';
import type { OptimizationResult } from './optimizer.js';

export interface OptimizationPreferencesRepository {
  find(userId: string): Promise<OptimizationPreferences | null>;
  save(
    userId: string,
    input: Partial<Omit<OptimizationPreferences, 'userId'>>,
  ): Promise<OptimizationPreferences>;
}

export const OPTIMIZATION_PREFERENCES_REPOSITORY = Symbol(
  'OPTIMIZATION_PREFERENCES_REPOSITORY',
);

export interface OptimizationRequestRepository {
  create(input: {
    ownerId: string;
    listId: string;
    settings: OptimizationSettings;
    fingerprint: string;
  }): Promise<OptimizationRequest>;
  findById(id: string): Promise<OptimizationRequest | null>;
  findByOwner(
    ownerId: string,
    filter: { listId?: string; skip: number; take: number },
  ): Promise<{ requests: OptimizationRequest[]; totalItems: number }>;
  /** The newest completed answer to the same question, if there is one. */
  findReusable(
    listId: string,
    fingerprint: string,
  ): Promise<OptimizationRequest | null>;
  /**
   * Moves a request into RUNNING only from PENDING, so a retried or duplicated
   * job cannot compute the same request twice at once.
   */
  claim(id: string, startedAt: Date): Promise<boolean>;
  complete(
    id: string,
    outcome: {
      result: OptimizationResult;
      recommendedTotalCents: number | null;
      recommendedStoreCount: number | null;
    },
  ): Promise<OptimizationRequest>;
  fail(id: string, error: string): Promise<OptimizationRequest>;
  /** Puts a claimed request back, so a failed job can be retried. */
  release(id: string): Promise<void>;
  statusOf(id: string): Promise<OptimizationStatus | null>;
}

export const OPTIMIZATION_REQUEST_REPOSITORY = Symbol(
  'OPTIMIZATION_REQUEST_REPOSITORY',
);

export interface OptimizationJobs {
  enqueue(requestId: string): Promise<void>;
}

export const OPTIMIZATION_JOBS = Symbol('OPTIMIZATION_JOBS');
