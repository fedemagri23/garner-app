/** Queued import work. One job per source, so failures stay local to a source. */
export interface ImportJobs {
  /** Safe to call repeatedly: work collapses per source and slot. */
  enqueueImport(sourceId: string, runKey: string): Promise<void>;
}

export const IMPORT_JOBS = Symbol('IMPORT_JOBS');
