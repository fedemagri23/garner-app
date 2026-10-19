/**
 * Times the background work HTTP load does not exercise, by running it
 * directly inside an application context (no HTTP server, no client
 * timeouts): one daily import per feed — mostly confirmations, one price in
 * ten moved — the recomputes those cause, and the daily aggregation over
 * every priced pair.
 *
 * Run on a freshly prepared environment, with the load API stopped:
 *   pnpm run load:prepare && pnpm run build && pnpm run load:jobs
 *   LOAD_FEEDS=1 pnpm run load:jobs        (import only the first feed)
 */
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { AppModule } from '../dist/app.module.js';
import { RunSourceImportUseCase } from '../dist/external-price-sources/application/run-source-import.use-case.js';
import { AggregateDailyPricesUseCase } from '../dist/price-intelligence/application/aggregate-daily-prices.use-case.js';
import { PRICE_INTELLIGENCE_QUEUE } from '../dist/price-intelligence/infrastructure/price-intelligence.queue.js';
import { PricingPrismaService } from '../dist/common/database/pricing-prisma.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const queue = app.get(getQueueToken(PRICE_INTELLIGENCE_QUEUE));

// On a fresh Redis the daily aggregation's scheduler fires at once. Stop it,
// and let any run already going finish, so each measurement below has the
// machine to itself.
await queue.removeJobScheduler('aggregate-day');
await queue.drain(true);
while ((await queue.getJobCounts('active')).active > 0) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const timed = async (work) => {
  const startedAt = Date.now();
  const result = await work();
  return { result, ms: Date.now() - startedAt };
};

const sources = await app
  .get(PricingPrismaService)
  .externalPriceSource.findMany({
    orderBy: { slug: 'asc' },
    take: Number(process.env.LOAD_FEEDS ?? 100),
  });
const runImport = app.get(RunSourceImportUseCase);

console.log('Daily import, per feed');
for (const source of sources) {
  const { result, ms } = await timed(() => runImport.execute(source.id, `bench-${Date.now()}`));
  const run = result.run;
  console.log(
    `  ${source.slug}: ${seconds(ms)} for ${run.pricesSeen} prices, ` +
      `${(ms / run.pricesSeen).toFixed(2)} ms/price ` +
      `(${run.observationsConfirmed} confirmed, ${run.observationsCreated} created, ${run.skippedPrices} skipped)`,
  );
}

console.log('Recomputes the imports queued');
const pending = async () => {
  const counts = await queue.getJobCounts('waiting', 'delayed', 'active');
  return counts.waiting + counts.delayed + counts.active;
};
const queued = await pending();
const { ms: drainMs } = await timed(async () => {
  while ((await pending()) > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
});
console.log(`  ${queued} jobs drained in ${seconds(drainMs)} (${(queued / (drainMs / 1000)).toFixed(0)} jobs/s)`);

console.log('Daily aggregation, one day');
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const { result: summary, ms: aggregateMs } = await timed(() =>
  app.get(AggregateDailyPricesUseCase).execute(yesterday),
);
console.log(
  `  ${seconds(aggregateMs)} for ${summary.targets} product/store pairs, ` +
    `${(aggregateMs / summary.targets).toFixed(2)} ms/pair`,
);

await app.close();
