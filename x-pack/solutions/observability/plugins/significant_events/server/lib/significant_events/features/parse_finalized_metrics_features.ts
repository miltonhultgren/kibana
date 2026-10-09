/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniqBy } from 'lodash';
import { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/logging';
import {
  DIMENSION_FEATURE_TYPE,
  identifiedFeatureSchema,
  ignoredFeatureSchema,
  METRIC_CATALOGUE_FEATURE_TYPES,
  METRIC_FEATURE_TYPE,
  type BaseFeature,
  type IgnoredFeature,
} from '@kbn/significant-events-schema';
import { conditionSchema, isConditionComplete, type Condition } from '@kbn/streamlang';
const MAX_EVIDENCE_ITEMS = 5;
const MAX_IDENTIFIED_FEATURES_PER_ITERATION = 100;

const formulaSchema = z.object({
  aggregation: z.string().min(1),
  field: z.string().min(1),
  percentile: z.number().min(0).max(100).optional(),
  filter: z.string().min(1).optional(),
  bucket: z.string().min(1).optional(),
});

const allowedTypes = new Set<string>(METRIC_CATALOGUE_FEATURE_TYPES);

export interface RawFinalizeMetricsFeaturesParams {
  features?: unknown;
  ignored_features?: unknown;
}

function tryParseFilter(maybeFilter: unknown): Condition | undefined {
  if (!maybeFilter) {
    return undefined;
  }
  const result = conditionSchema.safeParse(maybeFilter);
  if (!result.success) {
    return undefined;
  }
  return isConditionComplete(result.data) ? result.data : undefined;
}

const normalizeStringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return undefined;
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      items.push(trimmed);
    }
  }
  return items;
};

const cataloguePropertiesAreValid = (feature: BaseFeature, logger?: Logger): boolean => {
  const { properties } = feature;
  if (feature.type === METRIC_FEATURE_TYPE) {
    const metricClass = properties.class;
    const formula = formulaSchema.safeParse(properties.formula);
    const field = properties.field;
    if (
      (metricClass !== 'symptom' && metricClass !== 'diagnostic') ||
      !formula.success ||
      typeof field !== 'string' ||
      field.length === 0
    ) {
      logger?.debug(
        `Skipping metric [${feature.id}] without a symptom/diagnostic class and formula`
      );
      return false;
    }
    if (properties.dimensions === undefined) {
      properties.dimensions = [];
    } else {
      const dimensions = normalizeStringList(properties.dimensions);
      if (!dimensions) {
        logger?.debug(`Skipping metric [${feature.id}] with a non-list dimensions property`);
        return false;
      }
      properties.dimensions = dimensions;
    }
    return true;
  }

  if (feature.type === DIMENSION_FEATURE_TYPE) {
    const role = properties.role;
    const field = properties.field;
    if (
      (role !== 'pivot' && role !== 'scope' && role !== 'both') ||
      typeof field !== 'string' ||
      field.length === 0
    ) {
      logger?.debug(`Skipping dimension [${feature.id}] without a field and pivot/scope role`);
      return false;
    }
    return true;
  }

  return false;
};

/**
 * Normalizes the metrics agent's finalize payload into KI features.
 * Metric features without a formula and class are dropped. Dimension features
 * without a role are dropped. Excluded features are removed later by reconcile.
 */
export function parseFinalizedMetricsFeatures(
  rawParams: RawFinalizeMetricsFeaturesParams,
  streamName: string,
  logger?: Logger
): { features: BaseFeature[]; ignoredFeatures: IgnoredFeature[] } {
  const finalizedFeatures: BaseFeature[] = [];
  const ignoredFeatures: IgnoredFeature[] = [];

  for (const item of Array.isArray(rawParams.features) ? rawParams.features : []) {
    const raw = item as Record<string, unknown>;
    if (typeof raw.type !== 'string' || !allowedTypes.has(raw.type)) {
      logger?.debug(`Skipping feature with unsupported type [${String(raw.type)}]`);
      continue;
    }
    const candidate = {
      ...raw,
      stream_name: streamName,
      filter: tryParseFilter(raw.filter),
      ...(Array.isArray(raw.evidence)
        ? { evidence: (raw.evidence as unknown[]).slice(0, MAX_EVIDENCE_ITEMS) }
        : {}),
    };
    const result = identifiedFeatureSchema.safeParse(candidate);
    if (!result.success || Object.keys(result.data.properties).length === 0) {
      logger?.debug(
        `Skipping invalid feature: ${result.success ? 'empty properties' : result.error.message}`
      );
      continue;
    }
    if (!cataloguePropertiesAreValid(result.data, logger)) {
      continue;
    }
    finalizedFeatures.push(result.data);
  }

  for (const item of Array.isArray(rawParams.ignored_features) ? rawParams.ignored_features : []) {
    const result = ignoredFeatureSchema.safeParse(item);
    if (result.success) {
      ignoredFeatures.push(result.data);
    }
  }

  return {
    features: uniqBy(finalizedFeatures, (feature) => feature.id).slice(
      0,
      MAX_IDENTIFIED_FEATURES_PER_ITERATION
    ),
    ignoredFeatures,
  };
}
