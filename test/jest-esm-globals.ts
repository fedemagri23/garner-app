import { jest } from '@jest/globals';

/**
 * Under ESM, Jest injects `describe`/`it`/`expect` as globals but not the
 * `jest` object itself — that one is only importable from '@jest/globals'.
 *
 * Importing it per-file would shadow the `jest` *type* namespace from
 * @types/jest, breaking annotations like `jest.Mocked<T>`. Putting the runtime
 * object on globalThis instead keeps both the value and the types working the
 * way they do in every Jest example.
 */
(globalThis as Record<string, unknown>).jest = jest;
