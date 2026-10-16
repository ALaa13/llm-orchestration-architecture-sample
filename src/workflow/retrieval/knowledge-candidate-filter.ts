import { Injectable } from '@nestjs/common';
import { humanReadableSourceLabel } from '../attribution/attribution.contract';
import type { UsageArea } from '../interpretation/interpretation.types';
import type { RetrievedKnowledgeItem } from './retrieval.types';

export interface KnowledgeFilterResult {
  eligibleItems: RetrievedKnowledgeItem[];
  rejectedCount: number;
}

@Injectable()
export class KnowledgeCandidateFilter {
  filter(
    candidates: RetrievedKnowledgeItem[],
    usageArea: UsageArea,
  ): KnowledgeFilterResult {
    // Lightweight mock eligibility enforcement. The future knowledge center
    // may authoritatively enforce release, rights, exclusion, and lifecycle
    // rules; depending on its contract, this backend may revalidate them here.
    const eligibleItems = candidates.filter(
      (candidate) =>
        candidate.status === 'approved' &&
        usageArea !== 'unknown' &&
        candidate.allowedUsageAreas.includes(usageArea) &&
        (candidate.attributionRequired
          ? humanReadableSourceLabel(candidate) !== undefined
          : true),
    );

    return {
      eligibleItems,
      rejectedCount: candidates.length - eligibleItems.length,
    };
  }
}
