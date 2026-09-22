import type { WeightedObservation } from './price-weighting.js';

/**
 * Which observations may shape a price.
 *
 * Rejected ones never do — they exist only as an abuse trail. Flagged ones are
 * held back until other people independently saw much the same price, which is
 * what "confirmed" has to mean if a flag is to be worth anything: one person
 * cannot confirm their own report, however many times they send it.
 */

export interface SelectableObservation extends WeightedObservation {
  id: string;
}

/** How far apart two prices may be and still count as the same observation. */
export const CORROBORATION_TOLERANCE = 0.2;

/** Distinct other contributors needed to release a flagged observation. */
export const CORROBORATION_CONTRIBUTORS = 2;

export interface Selection<T> {
  usable: T[];
  /** Kept out of the calculation: rejected, or flagged and unconfirmed. */
  quarantined: T[];
}

export function selectUsableObservations<T extends SelectableObservation>(
  observations: T[],
): Selection<T> {
  const usable: T[] = [];
  const quarantined: T[] = [];

  const accepted = observations.filter(
    (observation) => observation.status === 'ACCEPTED',
  );

  for (const observation of observations) {
    if (observation.status === 'ACCEPTED') {
      usable.push(observation);
      continue;
    }

    if (
      observation.status === 'FLAGGED' &&
      isCorroborated(observation, accepted)
    ) {
      usable.push(observation);
      continue;
    }

    quarantined.push(observation);
  }

  return { usable, quarantined };
}

function isCorroborated(
  observation: SelectableObservation,
  accepted: SelectableObservation[],
): boolean {
  const confirmingContributors = new Set<string>();

  for (const candidate of accepted) {
    if (candidate.id === observation.id) {
      continue;
    }

    // An anonymous source (a feed) confirms as itself; two reports from one
    // account are still one account.
    const contributor = candidate.userId ?? `source:${candidate.sourceType}`;

    if (
      contributor !== observation.userId &&
      withinTolerance(observation.priceCents, candidate.priceCents)
    ) {
      confirmingContributors.add(contributor);
    }
  }

  return confirmingContributors.size >= CORROBORATION_CONTRIBUTORS;
}

function withinTolerance(a: number, b: number): boolean {
  const reference = Math.max(a, b);
  return reference === 0 || Math.abs(a - b) / reference <= CORROBORATION_TOLERANCE;
}
