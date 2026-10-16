import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import {
  ruleCandidateSchema,
  transitionRuleCandidate,
  type RuleCandidate,
} from '../../workflow/feedback/feedback.types';
import type { RuleCandidateRepository } from '../../workflow/feedback/rule-candidate.repository';
import {
  PostgresDatabase,
  type FeedbackDatabase,
  type FeedbackTransaction,
} from './postgres.database';
import { ruleCandidates, type NewRuleCandidateRow } from './drizzle.schema';

const databaseRowSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  originalFeedback: z.string(),
  referencedContent: z.string().nullable(),
  referenceType: z.string(),
  derivedRule: z.string().nullable(),
  scope: z.string(),
  status: z.string(),
  sourceConversationId: z.string().nullable(),
  sourceMessageId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

@Injectable()
export class PostgresRuleCandidateRepository implements RuleCandidateRepository {
  private readonly transactionContext =
    new AsyncLocalStorage<FeedbackTransaction>();

  constructor(
    @Inject(PostgresDatabase)
    private readonly databaseProvider: Pick<PostgresDatabase, 'getDatabase'>,
  ) {}

  async withCommitLock<T>(
    ownerUserId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const owner = requireOwner(ownerUserId);
    const database = this.databaseProvider.getDatabase();
    const lockKey = `architecture-sample:reusable-rules:${owner}`;

    return database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      return this.transactionContext.run(transaction, operation);
    });
  }

  async create(
    ownerUserId: string,
    candidate: RuleCandidate,
  ): Promise<RuleCandidate> {
    const owner = requireOwner(ownerUserId);
    const validated = validateCandidate(candidate);
    const database = this.getDatabase();
    const rows = await database
      .insert(ruleCandidates)
      .values(toInsertValues(owner, validated))
      .returning();
    return mapPersistedRuleCandidate(rows[0]);
  }

  async findById(
    candidateId: string,
    ownerUserId: string,
  ): Promise<RuleCandidate | undefined> {
    const owner = requireOwner(ownerUserId);
    const database = this.getDatabase();
    const rows = await database
      .select()
      .from(ruleCandidates)
      .where(
        and(
          eq(ruleCandidates.id, candidateId),
          eq(ruleCandidates.ownerUserId, owner),
        ),
      )
      .limit(1);
    return rows[0] === undefined
      ? undefined
      : mapPersistedRuleCandidate(rows[0]);
  }

  async update(
    ownerUserId: string,
    candidate: RuleCandidate,
  ): Promise<RuleCandidate | undefined> {
    const owner = requireOwner(ownerUserId);
    const validated = validateCandidate(candidate);
    const database = this.getDatabase();
    const existingRows = await database
      .select()
      .from(ruleCandidates)
      .where(
        and(
          eq(ruleCandidates.id, validated.id),
          eq(ruleCandidates.ownerUserId, owner),
        ),
      )
      .limit(1);
    if (existingRows[0] === undefined) return undefined;

    const existing = mapPersistedRuleCandidate(existingRows[0]);
    if (existing.status !== validated.status) {
      transitionRuleCandidate(existing, validated.status, validated.updatedAt, {
        referencedContent: validated.referencedContent,
        referenceType: validated.referenceType,
        derivedRule: validated.derivedRule,
        scope: validated.scope,
      });
    }

    const rows = await database
      .update(ruleCandidates)
      .set(toUpdateValues(validated))
      .where(
        and(
          eq(ruleCandidates.id, validated.id),
          eq(ruleCandidates.ownerUserId, owner),
        ),
      )
      .returning();
    return rows[0] === undefined
      ? undefined
      : mapPersistedRuleCandidate(rows[0]);
  }

  async listByOwner(ownerUserId: string): Promise<RuleCandidate[]> {
    const owner = requireOwner(ownerUserId);
    const database = this.getDatabase();
    const rows = await database
      .select()
      .from(ruleCandidates)
      .where(eq(ruleCandidates.ownerUserId, owner))
      .orderBy(desc(ruleCandidates.updatedAt), asc(ruleCandidates.id));
    return rows.map((row) => mapPersistedRuleCandidate(row));
  }

  async replaceCommitted(
    ownerUserId: string,
    supersededCandidates: RuleCandidate[],
    replacement: RuleCandidate,
  ): Promise<RuleCandidate> {
    const owner = requireOwner(ownerUserId);
    const validatedSuperseded = supersededCandidates.map(validateCandidate);
    const validatedReplacement = validateCandidate(replacement);
    if (
      validatedSuperseded.length === 0 ||
      validatedSuperseded.some(({ status }) => status !== 'superseded') ||
      validatedReplacement.status !== 'committed'
    ) {
      throw new Error(
        'Rule replacement requires superseded and committed states.',
      );
    }

    const database = this.getDatabase();
    return database.transaction(async (transaction) => {
      for (const superseded of validatedSuperseded) {
        const rows = await transaction
          .select()
          .from(ruleCandidates)
          .where(
            and(
              eq(ruleCandidates.id, superseded.id),
              eq(ruleCandidates.ownerUserId, owner),
            ),
          )
          .limit(1);
        const current = rows[0];
        if (
          current === undefined ||
          mapPersistedRuleCandidate(current).status !== 'committed'
        ) {
          throw new Error('Conflicting committed rule no longer exists.');
        }
        await transaction
          .update(ruleCandidates)
          .set(toUpdateValues(superseded))
          .where(
            and(
              eq(ruleCandidates.id, superseded.id),
              eq(ruleCandidates.ownerUserId, owner),
            ),
          );
      }

      const replacementRows = await transaction
        .select()
        .from(ruleCandidates)
        .where(
          and(
            eq(ruleCandidates.id, validatedReplacement.id),
            eq(ruleCandidates.ownerUserId, owner),
          ),
        )
        .limit(1);
      const currentReplacement = replacementRows[0];
      const currentReplacementStatus =
        currentReplacement === undefined
          ? undefined
          : mapPersistedRuleCandidate(currentReplacement).status;
      if (
        currentReplacement === undefined ||
        (currentReplacementStatus !== 'pending_approval' &&
          currentReplacementStatus !== 'approved')
      ) {
        throw new Error(
          'Replacement rule is no longer eligible for commitment.',
        );
      }
      const updatedRows = await transaction
        .update(ruleCandidates)
        .set(toUpdateValues(validatedReplacement))
        .where(
          and(
            eq(ruleCandidates.id, validatedReplacement.id),
            eq(ruleCandidates.ownerUserId, owner),
          ),
        )
        .returning();
      if (updatedRows[0] === undefined) {
        throw new Error(
          'Replacement rule is no longer eligible for commitment.',
        );
      }
      return mapPersistedRuleCandidate(updatedRows[0]);
    });
  }

  private getDatabase(): FeedbackDatabase | FeedbackTransaction {
    return (
      this.transactionContext.getStore() ?? this.databaseProvider.getDatabase()
    );
  }
}

function toInsertValues(
  ownerUserId: string,
  candidate: RuleCandidate,
): NewRuleCandidateRow {
  return {
    ownerUserId,
    ...toCandidateValues(candidate),
  };
}

function toUpdateValues(
  candidate: RuleCandidate,
): Partial<NewRuleCandidateRow> {
  return {
    originalFeedback: candidate.originalFeedback,
    referencedContent: candidate.referencedContent ?? null,
    referenceType: candidate.referenceType,
    derivedRule: candidate.derivedRule ?? null,
    scope: candidate.scope,
    status: candidate.status,
    sourceConversationId: candidate.sourceConversationId ?? null,
    sourceMessageId: candidate.sourceMessageId ?? null,
    updatedAt: new Date(candidate.updatedAt),
  };
}

function toCandidateValues(
  candidate: RuleCandidate,
): Omit<NewRuleCandidateRow, 'ownerUserId'> {
  return {
    id: candidate.id,
    originalFeedback: candidate.originalFeedback,
    referencedContent: candidate.referencedContent ?? null,
    referenceType: candidate.referenceType,
    derivedRule: candidate.derivedRule ?? null,
    scope: candidate.scope,
    status: candidate.status,
    sourceConversationId: candidate.sourceConversationId ?? null,
    sourceMessageId: candidate.sourceMessageId ?? null,
    createdAt: new Date(candidate.createdAt),
    updatedAt: new Date(candidate.updatedAt),
  };
}

function validateCandidate(candidate: RuleCandidate): RuleCandidate {
  const result = ruleCandidateSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error(
      'RuleCandidate failed domain validation before persistence.',
    );
  }
  return result.data;
}

export function mapPersistedRuleCandidate(row: unknown): RuleCandidate {
  const databaseRow = databaseRowSchema.parse(row);
  const candidate = ruleCandidateSchema.safeParse({
    id: databaseRow.id,
    originalFeedback: databaseRow.originalFeedback,
    referencedContent: databaseRow.referencedContent ?? undefined,
    referenceType: databaseRow.referenceType,
    derivedRule: databaseRow.derivedRule ?? undefined,
    scope: databaseRow.scope,
    status: databaseRow.status,
    sourceConversationId: databaseRow.sourceConversationId ?? undefined,
    sourceMessageId: databaseRow.sourceMessageId ?? undefined,
    createdAt: databaseRow.createdAt.toISOString(),
    updatedAt: databaseRow.updatedAt.toISOString(),
  });
  if (!candidate.success) {
    throw new Error('Persisted RuleCandidate violates the domain schema.');
  }
  return candidate.data;
}

function requireOwner(ownerUserId: string): string {
  if (ownerUserId.trim() === '') {
    throw new Error('Authenticated ownerUserId is required.');
  }
  return ownerUserId;
}
