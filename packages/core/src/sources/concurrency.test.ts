// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest";
import { makeLimitedFetch } from "./concurrency.js";

/**
 * Validates: Requirements 7.2
 * "THE Core SHALL issue at most 6 concurrent outbound requests at any point
 * during an audit."
 */
describe("makeLimitedFetch", () => {
  it("never has more than 6 requests in-flight during a burst of 20", async () => {
    // Track concurrency
    let inFlight = 0;
    let peakInFlight = 0;

    // Resolvers collected so we can drain requests manually
    const resolvers: Array<() => void> = [];

    // Mock fetch: increments counter on entry, decrements on exit,
    // and stays in-flight until we call the matching resolver.
    const mockFetch = vi.fn((_url: string): Promise<Response> => {
      inFlight++;
      if (inFlight > peakInFlight) {
        peakInFlight = inFlight;
      }
      return new Promise<Response>(resolve => {
        resolvers.push(() => {
          inFlight--;
          resolve(new Response("ok", { status: 200 }));
        });
      });
    });

    const limitedFetch = makeLimitedFetch(mockFetch as any);

    // Fire 20 requests simultaneously — none awaited yet
    const promises = Array.from({ length: 20 }, (_, i) =>
      limitedFetch(`https://example.com/${i}`)
    );

    // Yield to the microtask queue so the limited fetch can start the
    // first batch (up to 6) before we inspect the counter.
    await Promise.resolve();
    await Promise.resolve(); // second yield for any nested await inside makeLimitedFetch

    // At this point exactly 6 slots should be active and 14 should be queued.
    expect(inFlight).toBe(6);
    expect(peakInFlight).toBe(6);

    // Drain one request — the queue should immediately fill the freed slot.
    resolvers.shift()!();
    await Promise.resolve();
    await Promise.resolve();

    // Still at most 6 in-flight — a queued request took the freed slot.
    expect(inFlight).toBe(6);
    expect(peakInFlight).toBe(6);

    // Drain all remaining requests and confirm everything completes.
    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(promises);

    // Peak never exceeded 6 at any observed point.
    expect(peakInFlight).toBeLessThanOrEqual(6);
    // All 20 requests were eventually dispatched to the underlying fetch.
    expect(mockFetch).toHaveBeenCalledTimes(20);
  });

  it("uses a default limit of 6", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const resolvers: Array<() => void> = [];

    const mockFetch = vi.fn((_url: string): Promise<Response> => {
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      return new Promise<Response>(resolve => {
        resolvers.push(() => {
          inFlight--;
          resolve(new Response("ok", { status: 200 }));
        });
      });
    });

    // No explicit limit — should default to 6
    const limitedFetch = makeLimitedFetch(mockFetch as any);

    const promises = Array.from({ length: 10 }, (_, i) =>
      limitedFetch(`https://example.com/${i}`)
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(inFlight).toBe(6);

    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(promises);
    expect(peakInFlight).toBeLessThanOrEqual(6);
  });

  it("respects a custom concurrency limit", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const resolvers: Array<() => void> = [];

    const mockFetch = vi.fn((_url: string): Promise<Response> => {
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      return new Promise<Response>(resolve => {
        resolvers.push(() => {
          inFlight--;
          resolve(new Response("ok", { status: 200 }));
        });
      });
    });

    const limit = 3;
    const limitedFetch = makeLimitedFetch(mockFetch as any, limit);

    const promises = Array.from({ length: 10 }, (_, i) =>
      limitedFetch(`https://example.com/${i}`)
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(inFlight).toBe(limit);

    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(promises);
    expect(peakInFlight).toBeLessThanOrEqual(limit);
  });

  it("processes all requests in FIFO order", async () => {
    const dispatched: number[] = [];
    const resolvers: Array<() => void> = [];

    const mockFetch = vi.fn((url: string): Promise<Response> => {
      const idx = parseInt(url.split("/").pop()!, 10);
      dispatched.push(idx);
      return new Promise<Response>(resolve => {
        resolvers.push(() => resolve(new Response("ok", { status: 200 })));
      });
    });

    const limitedFetch = makeLimitedFetch(mockFetch as any, 2);

    // Queue 5 requests; only 2 start immediately
    const promises = Array.from({ length: 5 }, (_, i) =>
      limitedFetch(`https://example.com/${i}`)
    );

    await Promise.resolve();
    await Promise.resolve();

    // First two are dispatched immediately
    expect(dispatched).toEqual([0, 1]);

    // Free slot 0 — request 2 should be next
    resolvers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(dispatched).toEqual([0, 1, 2]);

    // Free slot 1 — request 3 should be next
    resolvers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(dispatched).toEqual([0, 1, 2, 3]);

    // Drain the rest
    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(promises);
    expect(dispatched).toEqual([0, 1, 2, 3, 4]);
  });
});
