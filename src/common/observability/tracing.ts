import { context, propagation, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AlwaysOffSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

export interface TracingOptions {
  serviceName: string;
  /** OTLP/HTTP collector base URL; null keeps spans in-process only. */
  otlpEndpoint: string | null;
  sampleRatio: number;
  /** Replaces the OTLP exporter, for tests. */
  exporter?: SpanExporter;
}

export interface Tracing {
  readonly exporting: boolean;
  /** Flushes what is buffered and unregisters, so a later start is clean. */
  shutdown(): Promise<void>;
}

/**
 * Registers the process-wide tracer provider.
 *
 * Always registered, because trace *ids* are useful without a collector: they
 * are what links a request to its log lines and to the jobs it queues. With
 * nothing to export to, every span is sampled out — ids are still minted and
 * propagated, but nothing is recorded, so it costs next to nothing.
 */
export function startTracing(options: TracingOptions): Tracing {
  const exporter =
    options.exporter ??
    (options.otlpEndpoint
      ? new OTLPTraceExporter({
          url: `${options.otlpEndpoint.replace(/\/+$/, '')}/v1/traces`,
        })
      : null);

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
    }),
    sampler: exporter
      ? new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(options.sampleRatio),
        })
      : new AlwaysOffSampler(),
    spanProcessors: exporter ? [new BatchSpanProcessor(exporter)] : [],
  });

  // Async-local context and W3C `traceparent` propagation.
  provider.register();

  // Prisma reports its queries through a global hook rather than by patching
  // modules, so this works under ESM where require-time patching does not.
  const unregister = exporter
    ? registerInstrumentations({
        tracerProvider: provider,
        instrumentations: [new PrismaInstrumentation()],
      })
    : () => undefined;

  return {
    exporting: exporter !== null,
    async shutdown() {
      unregister();
      await provider.shutdown();
      trace.disable();
      context.disable();
      propagation.disable();
    },
  };
}
