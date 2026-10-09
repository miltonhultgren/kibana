/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import {
  DIMENSION_FEATURE_TYPE,
  METRIC_FEATURE_TYPE,
  type Feature,
} from '@kbn/significant-events-schema';
import { reconcileInferredFeatures } from './reconcile_features';
import { parseFinalizedMetricsFeatures } from './parse_finalized_metrics_features';

const logger = loggingSystemMock.createLogger();
const STREAM = 'metrics-system.cpu-default';

const metricPayload = (id: string, metricClass: 'symptom' | 'diagnostic' = 'symptom') => ({
  id,
  type: METRIC_FEATURE_TYPE,
  subtype: 'gauge',
  title: id,
  description: `${id} gauge`,
  properties: {
    name: id,
    field: id,
    metric_type: 'gauge',
    unit: '1',
    data_stream: STREAM,
    dimensions: ['service.name'],
    class: metricClass,
    formula: { aggregation: 'avg', field: id },
  },
  confidence: 80,
  evidence: [`metric_name=${id}`],
  tags: ['metric'],
});

const storedFeature = (id: string, type: string): Feature =>
  ({
    id,
    uuid: `uuid-${id}`,
    stream_name: STREAM,
    type,
    subtype: type === METRIC_FEATURE_TYPE ? 'gauge' : 'scope',
    title: id,
    description: id,
    properties:
      type === METRIC_FEATURE_TYPE
        ? { name: id, field: id, class: 'symptom', formula: { aggregation: 'avg', field: id } }
        : { field: id, role: 'scope' },
    confidence: 80,
    evidence: [`metric_name=${id}`],
    tags: [],
    updated_at: '2026-01-01T00:00:00.000Z',
  } as Feature);

describe('parseFinalizedMetricsFeatures', () => {
  it('reconciles a new metric onto an upsert and drops an excluded metric', () => {
    const { features } = parseFinalizedMetricsFeatures(
      {
        features: [
          metricPayload('system.memory.usage'),
          metricPayload('system.cpu.utilization'),
          {
            ...metricPayload('custom.business.total', 'diagnostic'),
            properties: { name: 'custom.business.total' },
          },
        ],
      },
      STREAM,
      logger
    );

    expect(features.map((feature) => feature.id)).toEqual([
      'system.memory.usage',
      'system.cpu.utilization',
    ]);

    const result = reconcileInferredFeatures({
      rawFeatures: features,
      allKnownFeatures: [storedFeature('system.cpu.utilization', METRIC_FEATURE_TYPE)],
      discoveredFeatures: [],
      ignoredFeatures: [],
      excludedFeatures: [storedFeature('system.memory.usage', METRIC_FEATURE_TYPE)],
      runId: 'run-1',
      logger,
    });

    expect(result.newFeatures).toEqual([]);
    expect(result.updatedFeatures.map((feature) => feature.id)).toEqual(['system.cpu.utilization']);
    expect(result.codeIgnoredCount).toBe(1);
  });

  it('keeps a dimension role and drops a dimension without one', () => {
    const { features } = parseFinalizedMetricsFeatures(
      {
        features: [
          {
            id: 'service.name',
            type: DIMENSION_FEATURE_TYPE,
            subtype: 'scope',
            title: 'service.name',
            description: 'Service scope',
            properties: { field: 'service.name', role: 'scope' },
            confidence: 90,
            evidence: ['dimension=service.name'],
            tags: ['dimension'],
          },
          {
            id: 'host.name',
            type: DIMENSION_FEATURE_TYPE,
            subtype: 'pivot',
            title: 'host.name',
            description: 'Host',
            properties: { field: 'host.name' },
            confidence: 40,
            evidence: ['dimension=host.name'],
            tags: ['dimension'],
          },
        ],
      },
      STREAM,
      logger
    );

    expect(features.map((feature) => feature.id)).toEqual(['service.name']);
  });

  it('drops an entity feature so catalogue classification does not extract components', () => {
    const { features } = parseFinalizedMetricsFeatures(
      {
        features: [
          {
            id: 'checkout',
            type: 'entity',
            subtype: 'service',
            title: 'Checkout',
            description: 'Checkout service',
            properties: { service: 'checkout' },
            confidence: 80,
            evidence: ['service.name=checkout'],
            tags: ['service'],
          },
        ],
      },
      STREAM,
      logger
    );

    expect(features).toEqual([]);
  });
});
