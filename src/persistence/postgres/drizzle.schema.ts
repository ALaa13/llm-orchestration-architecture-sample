import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  FEEDBACK_REFERENCE_TYPES,
  RULE_CANDIDATE_STATUSES,
  RULE_SCOPES,
  type FeedbackReferenceType,
  type RuleCandidateStatus,
  type RuleScope,
} from '../../workflow/feedback/feedback.types';

/** Typed PostgreSQL representation; domain validation remains authoritative. */
export const ruleCandidates = pgTable(
  'rule_candidates',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    originalFeedback: text('original_feedback').notNull(),
    referencedContent: text('referenced_content'),
    referenceType: text('reference_type', {
      enum: FEEDBACK_REFERENCE_TYPES,
    })
      .$type<FeedbackReferenceType>()
      .notNull(),
    derivedRule: text('derived_rule'),
    scope: text('scope', { enum: RULE_SCOPES }).$type<RuleScope>().notNull(),
    status: text('status', { enum: RULE_CANDIDATE_STATUSES })
      .$type<RuleCandidateStatus>()
      .notNull(),
    sourceConversationId: text('source_conversation_id'),
    sourceMessageId: text('source_message_id'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('rule_candidates_owner_updated_idx').on(
      table.ownerUserId,
      table.updatedAt,
    ),
    check(
      'rule_candidates_not_committed_current_draft',
      sql`NOT (${table.status} = 'committed' AND ${table.scope} = 'current_draft')`,
    ),
  ],
);

export type RuleCandidateRow = typeof ruleCandidates.$inferSelect;
export type NewRuleCandidateRow = typeof ruleCandidates.$inferInsert;
