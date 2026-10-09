/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { METRIC_CATALOGUE_FEATURE_TYPES } from '@kbn/significant-events-schema';

export const METRICS_EXTRACTION_FEATURE_TYPES = METRIC_CATALOGUE_FEATURE_TYPES;

const nonEmptyRecordSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one property is required',
  });

const featureItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(METRICS_EXTRACTION_FEATURE_TYPES),
    subtype: z.string(),
    description: z.string(),
    title: z.string(),
    properties: nonEmptyRecordSchema.describe(
      'For metric: name, field, metric_type, unit, data_stream, dimensions, class (symptom|diagnostic), and formula {aggregation, field, percentile?, filter?, bucket?}. For dimension: field and role (pivot|scope|both).'
    ),
    confidence: z.number().min(0).max(100),
    evidence: z.array(z.string()),
    evidence_doc_ids: z.array(z.string()).optional(),
    tags: z.array(z.string()),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const ignoredFeatureItemSchema = z
  .object({
    feature_id: z.string(),
    feature_title: z.string(),
    excluded_feature_id: z.string(),
    reason: z.string(),
  })
  .passthrough();

export const metricsFeatureIdentificationOutputSchema = z
  .object({
    features: z
      .array(featureItemSchema)
      .describe(
        'Deduplicated metric and dimension features for the current catalogue page. Include every catalogue metric you can classify. Do not include entity or other component features.'
      ),
    ignored_features: z
      .array(ignoredFeatureItemSchema)
      .optional()
      .default([])
      .describe(
        'Features suppressed because they match an excluded feature. Empty array when no exclusions apply.'
      ),
  })
  .describe(
    'The complete metrics catalogue classification. Produce it exactly once, after duplicate checks are complete.'
  );

export type MetricsFeatureIdentificationOutput = z.infer<
  typeof metricsFeatureIdentificationOutputSchema
>;
