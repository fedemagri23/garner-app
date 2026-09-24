import { Injectable } from '@nestjs/common';

/**
 * Counters and latency histograms, in memory, exposed in Prometheus text
 * format.
 *
 * In-process on purpose: one deployable, and a scrape endpoint is all a
 * monitoring stack needs to start. Nothing here is a source of truth, so
 * losing it on restart costs a gap in a graph and nothing else.
 */

/** Buckets in milliseconds, covering a fast read to a slow query. */
const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000];

interface Histogram {
  counts: number[];
  sum: number;
  total: number;
}

type Labels = Record<string, string | number>;

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, Histogram>();
  private readonly gauges = new Map<string, number>();

  increment(name: string, labels: Labels = {}, by = 1): void {
    const key = seriesKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  observe(name: string, milliseconds: number, labels: Labels = {}): void {
    const key = seriesKey(name, labels);
    const histogram = this.histograms.get(key) ?? {
      counts: Array.from({ length: LATENCY_BUCKETS_MS.length }, () => 0),
      sum: 0,
      total: 0,
    };

    for (const [index, bucket] of LATENCY_BUCKETS_MS.entries()) {
      if (milliseconds <= bucket) {
        histogram.counts[index] += 1;
      }
    }

    histogram.sum += milliseconds;
    histogram.total += 1;
    this.histograms.set(key, histogram);
  }

  /** For values that are read rather than accumulated, such as queue depth. */
  setGauge(name: string, value: number, labels: Labels = {}): void {
    this.gauges.set(seriesKey(name, labels), value);
  }

  /** Prometheus exposition format. */
  render(): string {
    const lines: string[] = [];

    for (const [series, value] of [...this.counters].sort()) {
      lines.push(`${series} ${value}`);
    }

    for (const [series, value] of [...this.gauges].sort()) {
      lines.push(`${series} ${value}`);
    }

    for (const [series, histogram] of [...this.histograms].sort()) {
      const { name, labels } = parseKey(series);

      for (const [index, bucket] of LATENCY_BUCKETS_MS.entries()) {
        lines.push(
          `${name}_bucket${withLabel(labels, 'le', String(bucket))} ${histogram.counts[index]}`,
        );
      }

      lines.push(
        `${name}_bucket${withLabel(labels, 'le', '+Inf')} ${histogram.total}`,
      );
      lines.push(`${name}_sum${labels} ${histogram.sum}`);
      lines.push(`${name}_count${labels} ${histogram.total}`);
    }

    return `${lines.join('\n')}\n`;
  }

  /** Test seam; never called in production. */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

function seriesKey(name: string, labels: Labels): string {
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabel(String(value))}"`);

  return entries.length === 0 ? name : `${name}{${entries.join(',')}}`;
}

function parseKey(series: string): { name: string; labels: string } {
  const brace = series.indexOf('{');

  return brace === -1
    ? { name: series, labels: '' }
    : { name: series.slice(0, brace), labels: series.slice(brace) };
}

function withLabel(labels: string, key: string, value: string): string {
  const pair = `${key}="${value}"`;

  return labels === ''
    ? `{${pair}}`
    : `${labels.slice(0, -1)},${pair}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
