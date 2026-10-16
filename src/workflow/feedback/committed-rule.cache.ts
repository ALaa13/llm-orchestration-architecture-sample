import { Injectable } from '@nestjs/common';
import type { UsageArea } from '../interpretation/interpretation.types';
import type { CommittedRule } from './committed-rule-retrieval.service';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

type CachedRules = {
  expiresAt: number;
  rules: readonly CommittedRule[];
};

/**
 * Small process-local cache for committed reusable rules. Postgres remains the
 * source of truth; callers populate it only after a successful read.
 */
@Injectable()
export class CommittedRuleCache {
  private readonly entries = new Map<string, CachedRules>();

  get(
    ownerUserId: string,
    usageArea: Exclude<UsageArea, 'unknown'>,
  ): CommittedRule[] | undefined {
    const key = cacheKey(ownerUserId, usageArea);
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Refresh insertion order so eviction removes the least recently used key.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return snapshot(entry.rules);
  }

  set(
    ownerUserId: string,
    usageArea: Exclude<UsageArea, 'unknown'>,
    rules: readonly CommittedRule[],
  ): void {
    const key = cacheKey(ownerUserId, usageArea);
    this.entries.delete(key);
    this.entries.set(key, {
      expiresAt: Date.now() + TTL_MS,
      rules: snapshot(rules),
    });

    while (this.entries.size > MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as string;
      this.entries.delete(oldestKey);
    }
  }

  invalidate(ownerUserId: string, scope: CommittedRule['scope']): void {
    if (scope === 'global') {
      for (const key of this.entries.keys()) {
        if (key.startsWith(`${ownerUserId}\u0000`)) this.entries.delete(key);
      }
      return;
    }
    this.entries.delete(cacheKey(ownerUserId, scope));
  }
}

function cacheKey(
  ownerUserId: string,
  usageArea: CommittedRule['scope'],
): string {
  return `${ownerUserId}\u0000${usageArea}`;
}

function snapshot(rules: readonly CommittedRule[]): CommittedRule[] {
  return rules.map((rule) => ({ ...rule }));
}
