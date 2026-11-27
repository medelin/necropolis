// SPDX-License-Identifier: AGPL-3.0-only

import type { FetchFn } from "./types.js";

/**
 * Wraps a fetch function with a concurrency limit (default 6, per the
 * browser data-source budget). Requests beyond the limit are queued in
 * FIFO order and start as soon as a slot frees up.
 */
export function makeLimitedFetch(fetch: FetchFn, limit = 6): FetchFn {
  let active = 0;
  const queue: Array<() => void> = [];

  return async (url, init) => {
    if (active >= limit) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
      return await fetch(url, init);
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
