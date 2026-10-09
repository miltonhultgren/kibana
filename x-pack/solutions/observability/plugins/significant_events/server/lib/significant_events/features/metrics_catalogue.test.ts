/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { METRIC_FEATURE_TYPE } from '@kbn/significant-events-schema';
import {
  buildMetricsInfoQuery,
  knownMetricFieldKeys,
  normalizeDimensionFields,
  pageMetricsCatalogue,
  parseMetricsInfoResponse,
  type MetricsCatalogueRow,
} from './metrics_catalogue';

const row = (metricName: string, dimensionFields: string[] = []): MetricsCatalogueRow => ({
  metricName,
  dataStream: 'metrics-system.cpu-default',
  unit: '1',
  metricType: 'gauge',
  fieldType: 'double',
  dimensionFields,
});

describe('metrics catalogue', () => {
  it('normalizes dimension_fields from a string or an array', () => {
    expect(normalizeDimensionFields('host.name')).toEqual(['host.name']);
    expect(normalizeDimensionFields(['host.name', 'service.name', 'host.name'])).toEqual([
      'host.name',
      'service.name',
    ]);
    expect(normalizeDimensionFields('')).toEqual([]);
    expect(normalizeDimensionFields(null)).toEqual([]);
  });

  it('parses METRICS_INFO rows with either dimension_fields shape', () => {
    const response = {
      columns: [
        { name: 'metric_name' },
        { name: 'data_stream' },
        { name: 'unit' },
        { name: 'metric_type' },
        { name: 'field_type' },
        { name: 'dimension_fields' },
      ],
      values: [
        [
          'system.cpu.utilization',
          'metrics-system.cpu-default',
          '1',
          'gauge',
          'double',
          'host.name',
        ],
        [
          'system.memory.usage',
          'metrics-system.memory-default',
          'By',
          'gauge',
          'long',
          ['host.name', 'service.name'],
        ],
        ['', 'metrics-system.memory-default', 'By', 'gauge', 'long', []],
      ],
    };

    expect(parseMetricsInfoResponse(response)).toEqual([
      expect.objectContaining({
        metricName: 'system.cpu.utilization',
        dimensionFields: ['host.name'],
      }),
      expect.objectContaining({
        metricName: 'system.memory.usage',
        dimensionFields: ['host.name', 'service.name'],
      }),
    ]);
  });

  it('drops metrics that already have a KI and returns a stable next page', () => {
    const known = knownMetricFieldKeys([
      {
        type: METRIC_FEATURE_TYPE,
        id: 'System.CPU.Utilization',
        properties: { field: 'system.cpu.utilization' },
      },
    ]);

    const { page, remaining } = pageMetricsCatalogue({
      rows: [
        row('system.network.dropped'),
        row('system.cpu.utilization'),
        row('system.memory.usage'),
        row('system.memory.usage', ['service.name']),
      ],
      knownMetricFields: known,
      pageSize: 1,
    });

    expect(page.map((entry) => entry.metricName)).toEqual(['system.memory.usage']);
    expect(page[0].dimensionFields).toEqual(['service.name']);
    expect(remaining).toBe(1);
  });

  it('builds a TS METRICS_INFO query for the sampling source', () => {
    const query = buildMetricsInfoQuery('metrics-system.cpu-default').toLowerCase();
    expect(query).toContain('metrics_info');
    expect(query).toContain('metrics-system.cpu-default');
  });
});
