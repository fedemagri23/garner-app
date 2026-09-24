import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('counts by name and labels', () => {
    metrics.increment('garner_http_requests_total', { method: 'GET', status: 200 });
    metrics.increment('garner_http_requests_total', { method: 'GET', status: 200 });
    metrics.increment('garner_http_requests_total', { method: 'GET', status: 404 });

    const rendered = metrics.render();

    expect(rendered).toContain('garner_http_requests_total{method="GET",status="200"} 2');
    expect(rendered).toContain('garner_http_requests_total{method="GET",status="404"} 1');
  });

  it('orders labels, so one series is not split by how it was written', () => {
    metrics.increment('requests', { b: '2', a: '1' });
    metrics.increment('requests', { a: '1', b: '2' });

    expect(metrics.render()).toContain('requests{a="1",b="2"} 2');
  });

  it('renders a histogram with cumulative buckets, a sum and a count', () => {
    metrics.observe('garner_http_request_duration_ms', 7, { route: '/v1/products' });
    metrics.observe('garner_http_request_duration_ms', 120, { route: '/v1/products' });

    const rendered = metrics.render();

    // 7ms falls in every bucket from 10 up; 120ms only from 250 up.
    expect(rendered).toContain('_bucket{route="/v1/products",le="10"} 1');
    expect(rendered).toContain('_bucket{route="/v1/products",le="250"} 2');
    expect(rendered).toContain('_bucket{route="/v1/products",le="+Inf"} 2');
    expect(rendered).toContain('_sum{route="/v1/products"} 127');
    expect(rendered).toContain('_count{route="/v1/products"} 2');
  });

  it('keeps the last value of a gauge rather than accumulating it', () => {
    metrics.setGauge('garner_queue_waiting', 5, { queue: 'notifications' });
    metrics.setGauge('garner_queue_waiting', 2, { queue: 'notifications' });

    expect(metrics.render()).toContain('garner_queue_waiting{queue="notifications"} 2');
  });

  it('escapes a label value that would break the format', () => {
    metrics.increment('requests', { route: 'a"b\\c' });

    expect(metrics.render()).toContain('route="a\\"b\\\\c"');
  });

  it('drops empty labels rather than emitting empty series dimensions', () => {
    metrics.increment('requests', { route: '' });

    expect(metrics.render()).toContain('requests 1');
  });

  it('renders nothing but a newline when nothing has happened', () => {
    expect(metrics.render()).toBe('\n');
  });
});
