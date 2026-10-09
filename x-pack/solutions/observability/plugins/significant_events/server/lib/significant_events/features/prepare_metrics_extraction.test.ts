/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { METRIC_FEATURE_TYPE } from '@kbn/significant-events-schema';
import type { KnowledgeIndicatorClient } from '../../knowledge_indicators';
import { runEsqlQuery } from '../run_esql_query';
import { prepareMetricsExtraction } from './prepare_metrics_extraction';

jest.mock('../run_esql_query', () => ({
  runEsqlQuery: jest.fn(),
}));

const runEsqlQueryMock = jest.mocked(runEsqlQuery);

const logger: Pick<Logger, 'warn'> = { warn: jest.fn() };

const createParams = (
  kiClient: Pick<KnowledgeIndicatorClient, 'getFeatures' | 'getExcludedFeatures'>
) => ({
  esClient: {} as ElasticsearchClient,
  kiClient: kiClient as KnowledgeIndicatorClient,
  streamName: 'metrics-system.cpu',
  samplingSource: 'metrics-system.cpu-default',
  logger,
  pageSize: 25,
});

describe('prepareMetricsExtraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no work when METRICS_INFO cannot run', async () => {
    runEsqlQueryMock.mockRejectedValue(
      new Error('METRICS_INFO requires a time series data stream')
    );
    const kiClient = {
      getFeatures: jest.fn(),
      getExcludedFeatures: jest.fn(),
    };

    const result = await prepareMetricsExtraction(createParams(kiClient));

    expect(result.hasWork).toBe(false);
    expect(result.cataloguePage).toEqual([]);
    expect(kiClient.getFeatures).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('pages unseen metrics and does not sample documents', async () => {
    runEsqlQueryMock.mockResolvedValue({
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
          ['host.name'],
        ],
        [
          'system.memory.usage',
          'metrics-system.memory-default',
          'By',
          'gauge',
          'long',
          'service.name',
        ],
        [
          'system.network.dropped',
          'metrics-system.network-default',
          '1',
          'counter',
          'long',
          ['host.name'],
        ],
      ],
    } as unknown as Awaited<ReturnType<typeof runEsqlQuery>>);
    const kiClient = {
      getFeatures: jest.fn().mockResolvedValue({
        hits: [
          {
            type: METRIC_FEATURE_TYPE,
            id: 'system.cpu.utilization',
            properties: { field: 'system.cpu.utilization' },
          },
        ],
      }),
      getExcludedFeatures: jest.fn().mockResolvedValue({
        hits: [
          {
            type: METRIC_FEATURE_TYPE,
            id: 'system.network.dropped',
            properties: { field: 'system.network.dropped' },
          },
        ],
      }),
    };

    const result = await prepareMetricsExtraction(createParams(kiClient));

    expect(runEsqlQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/metrics_info/i)
    );
    expect(result.cataloguePage.map((entry) => entry.metricName)).toEqual(['system.memory.usage']);
    expect(result.catalogueRemaining).toBe(0);
    expect(result.hasWork).toBe(true);
  });
});
