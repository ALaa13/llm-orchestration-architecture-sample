import {
  humanReadableSourceLabel,
  normalizedAttributionLabel,
  sourceSectionEntries,
} from '../attribution/attribution.contract';
import type { ContextPackage } from '../context-assembly/context-assembly.types';

export interface AttributionResolution {
  materiallyUsedRequiredSourceIds: string[];
  missingAttributionLabels: string[];
  invalidIdentityReason?: 'unknown_or_optional_source' | 'missing_source_title';
}

/**
 * Resolves provider-classified material use against application-owned source
 * identities and the production Sources parser.
 */
export function resolveRequiredAttribution(
  contextPackage: ContextPackage,
  output: string,
  materiallyUsedRequiredSourceIds: readonly string[],
): AttributionResolution {
  const requiredSources = new Map<string, string>();
  for (const item of contextPackage.knowledge) {
    if (!item.attributionRequired) continue;
    const label = humanReadableSourceLabel(item);
    if (label === undefined) {
      return {
        materiallyUsedRequiredSourceIds: [],
        missingAttributionLabels: [],
        invalidIdentityReason: 'missing_source_title',
      };
    }
    requiredSources.set(item.source.id, label);
  }

  const normalizedSourceIds = [...new Set(materiallyUsedRequiredSourceIds)];
  if (normalizedSourceIds.some((sourceId) => !requiredSources.has(sourceId))) {
    return {
      materiallyUsedRequiredSourceIds: normalizedSourceIds,
      missingAttributionLabels: [],
      invalidIdentityReason: 'unknown_or_optional_source',
    };
  }

  const parsedLabels = new Set(
    sourceSectionEntries(output).map(normalizedAttributionLabel),
  );
  const missingAttributionLabels = normalizedSourceIds.flatMap((sourceId) => {
    const label = requiredSources.get(sourceId);
    if (label === undefined) return [];
    return parsedLabels.has(normalizedAttributionLabel(label)) ? [] : [label];
  });

  return {
    materiallyUsedRequiredSourceIds: normalizedSourceIds,
    missingAttributionLabels,
  };
}
