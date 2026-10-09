/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { ChatCompletionTokenCount } from '@kbn/inference-common';
import {
  type BaseFeature,
  type FeatureUpsert,
  type IgnoredFeature,
  type IterationResult,
  isComputedFeature,
  normalizeFeatureSlug,
  DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  type SignificantEventsTuningConfig,
} from '@kbn/significant-events-schema';
import {
  EMPTY_TOKENS,
  toPreviouslyIdentifiedFeature,
  type InferenceDocument,
} from '@kbn/nightshift-ai';
import type { KnowledgeIndicatorClient } from '../../knowledge_indicators';
import { FeatureNotEnabledError } from '../../errors/feature_not_enabled_error';
import {
  buildKnownFeatureIds,
  buildTelemetry,
  selectPreviouslyIdentifiedFeatures,
  type FeaturesIdentifiedTelemetry,
} from './identify_inferred_features';
import { executeMetricsFeatureIdentificationAgent } from './identify_metrics_via_agent';
import type { MetricsCatalogueRow } from './metrics_catalogue';
import { reconcileInferredFeatures, toFeatureSummary } from './reconcile_features';

const DEFAULT_MAX_PREVIOUSLY_IDENTIFIED_FEATURES = 100;

type IterationTuningParams = Partial<
  Pick<SignificantEventsTuningConfig, 'max_excluded_features_in_prompt'>
> & {
  maxPreviouslyIdentifiedFeatures?: number;
};

export interface IdentifyMetricsFeaturesOptions {
  kiClient: KnowledgeIndicatorClient;
  agentBuilder?: AgentBuilderPluginStart;
  request: KibanaRequest;
  connectorId: string;
  logger: Logger;
  signal: AbortSignal;
  streamName: string;
  runId: string;
  documents: InferenceDocument[];
  cataloguePage: MetricsCatalogueRow[];
  totalFilters: number;
  filtersCapped: boolean;
  hasFilteredDocuments: boolean;
  iteration?: number;
  tuning?: IterationTuningParams;
  trackFeaturesIdentified?: (data: FeaturesIdentifiedTelemetry) => void;
}

export interface IdentifyMetricsFeaturesResult {
  docsCount: number;
  discoveredFeatures: FeatureUpsert[];
  iterationResult: IterationResult;
}

export async function identifyMetricsFeatures({
  kiClient,
  agentBuilder,
  request,
  connectorId,
  logger,
  signal,
  streamName,
  runId,
  documents,
  cataloguePage,
  totalFilters,
  filtersCapped,
  hasFilteredDocuments,
  iteration = 1,
  tuning = {},
  trackFeaturesIdentified,
}: IdentifyMetricsFeaturesOptions): Promise<IdentifyMetricsFeaturesResult> {
  if (!agentBuilder) {
    throw new FeatureNotEnabledError(
      'Metrics feature identification requires Agent Builder, which is not available'
    );
  }

  const {
    max_excluded_features_in_prompt:
      maxExcludedFeaturesInPrompt = DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG.max_excluded_features_in_prompt,
    maxPreviouslyIdentifiedFeatures = DEFAULT_MAX_PREVIOUSLY_IDENTIFIED_FEATURES,
  } = tuning;

  const [{ hits: allFeatures }, { hits: excludedFeatures }] = await Promise.all([
    kiClient.getFeatures(streamName),
    kiClient.getExcludedFeatures(streamName),
  ]);

  const discoveredFeatures = allFeatures.filter((f) => !isComputedFeature(f) && f.run_id === runId);
  const allKnownFeatures = allFeatures.filter((f) => !isComputedFeature(f));
  const topRanked = selectPreviouslyIdentifiedFeatures(
    allKnownFeatures,
    maxPreviouslyIdentifiedFeatures
  );
  const { text: knownFeatureIds, droppedCount: knownFeatureIdsDropped } =
    buildKnownFeatureIds(allKnownFeatures);
  if (knownFeatureIdsDropped > 0) {
    logger.debug(
      `known_feature_ids inventory for stream "${streamName}" exceeded its budget; dropped the ${knownFeatureIdsDropped} stalest ids`
    );
  }

  const startedAt = Date.now();
  const telemetryCtx = {
    run_id: runId,
    connector_id: connectorId,
    iteration,
    source_id: streamName,
    docs_count: documents.length,
    excluded_features_count: excludedFeatures.length,
    total_filters: totalFilters,
    filters_capped: filtersCapped,
    has_filtered_documents: hasFilteredDocuments,
  };

  let rawFeatures: BaseFeature[];
  let ignoredFeatures: IgnoredFeature[];
  let tokensUsed: ChatCompletionTokenCount;
  try {
    const result = await executeMetricsFeatureIdentificationAgent({
      agentBuilder,
      request,
      connectorId,
      streamName,
      cataloguePage,
      excludedFeatures: excludedFeatures
        .slice(0, maxExcludedFeaturesInPrompt)
        .map(toPreviouslyIdentifiedFeature),
      previouslyIdentifiedFeatures: topRanked.map(toPreviouslyIdentifiedFeature),
      knownFeatureIds,
      interactionId: runId,
      signal,
      logger,
    });
    rawFeatures = result.features;
    ignoredFeatures = result.ignoredFeatures;
    tokensUsed = result.tokensUsed;
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Metrics feature identification agent failed: ${errorMsg}`);
    const durationMs = Date.now() - startedAt;
    trackFeaturesIdentified?.(buildTelemetry(telemetryCtx, durationMs, { state: 'failure' }));
    return {
      docsCount: documents.length,
      discoveredFeatures,
      iterationResult: {
        runId,
        iteration,
        durationMs,
        state: 'failure',
        tokensUsed: { ...EMPTY_TOKENS },
        newFeatures: [],
        updatedFeatures: [],
      },
    };
  }

  const { newFeatures, updatedFeatures, codeIgnoredCount, remappedCount } =
    reconcileInferredFeatures({
      rawFeatures,
      allKnownFeatures,
      discoveredFeatures,
      ignoredFeatures,
      excludedFeatures,
      runId,
      logger,
    });

  const allChanged = [...newFeatures, ...updatedFeatures];
  if (allChanged.length > 0) {
    const priorBySlug = new Map(allFeatures.map((f) => [normalizeFeatureSlug(f.id), f]));
    await kiClient.bulk(
      streamName,
      allChanged.map((feature) => {
        const prior = priorBySlug.get(normalizeFeatureSlug(feature.id));
        const expiresAt = !prior || prior.expires_at ? kiClient.getDefaultExpiresAt() : undefined;
        return { index: { feature: { ...feature, expires_at: expiresAt } } };
      })
    );
  }

  const discoveredMap = new Map<string, FeatureUpsert>(discoveredFeatures.map((f) => [f.id, f]));
  for (const feature of allChanged) {
    discoveredMap.set(feature.id, feature);
  }

  const durationMs = Date.now() - startedAt;
  trackFeaturesIdentified?.(
    buildTelemetry(telemetryCtx, durationMs, {
      state: 'success',
      tokensUsed,
      newCount: newFeatures.length,
      updatedCount: updatedFeatures.length,
      llmIgnoredCount: ignoredFeatures.length,
      codeIgnoredCount,
      remappedCount,
    })
  );

  return {
    docsCount: documents.length,
    discoveredFeatures: Array.from(discoveredMap.values()),
    iterationResult: {
      runId,
      iteration,
      durationMs,
      state: 'success',
      tokensUsed,
      newFeatures: newFeatures.map(toFeatureSummary),
      updatedFeatures: updatedFeatures.map(toFeatureSummary),
    },
  };
}
