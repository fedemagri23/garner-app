import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_KEY = 'security:skipRateLimit';

/**
 * Exempts a route from the global limit. Reserved for infrastructure probes:
 * liveness and readiness are polled continuously by the orchestrator, and
 * throttling them would take healthy instances out of rotation.
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
