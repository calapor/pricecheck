/**
 * Per-retailer circuit breaker. After `threshold` consecutive failures the
 * breaker opens and `canRequest` returns false until `cooldownMs` elapses, at
 * which point it half-opens to probe. This stops us hammering a site that is
 * down or actively blocking us, and isolates one retailer's failures from others.
 */
export type BreakerState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  state(now = Date.now()): BreakerState {
    if (this.failures < this.threshold) return "closed";
    if (now - this.openedAt >= this.cooldownMs) return "half_open";
    return "open";
  }

  canRequest(now = Date.now()): boolean {
    return this.state(now) !== "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.threshold && this.openedAt === 0) {
      this.openedAt = now;
    }
  }
}

/** Registry of breakers keyed by retailer slug. */
export class BreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  get(slug: string): CircuitBreaker {
    let breaker = this.breakers.get(slug);
    if (!breaker) {
      breaker = new CircuitBreaker(this.threshold, this.cooldownMs);
      this.breakers.set(slug, breaker);
    }
    return breaker;
  }
}
