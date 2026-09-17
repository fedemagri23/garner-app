/**
 * Record of trips whose purchases have been turned into observations. It is
 * what lets reconciliation tell a trip that was missed from one already done.
 */
export interface SessionContributionLedger {
  isRecorded(sessionId: string): Promise<boolean>;
  /** The subset of `sessionIds` already recorded. */
  recordedAmong(sessionIds: string[]): Promise<Set<string>>;
  /** Idempotent: recording the same trip twice keeps the first entry. */
  record(entry: {
    sessionId: string;
    userId: string;
    observationCount: number;
    skippedCount: number;
  }): Promise<void>;
}

export const SESSION_CONTRIBUTION_LEDGER = Symbol('SESSION_CONTRIBUTION_LEDGER');

export interface ContributionJobs {
  /** Safe to call repeatedly for one trip; queued work collapses by trip id. */
  enqueueSessionPurchases(sessionId: string): Promise<void>;
}

export const CONTRIBUTION_JOBS = Symbol('CONTRIBUTION_JOBS');
