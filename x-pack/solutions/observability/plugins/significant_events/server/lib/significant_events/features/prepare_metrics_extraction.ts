/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { KnowledgeIndicatorClient } from '../../knowledge_indicators';
import { runEsqlQuery } from '../run_esql_query';
import {
  METRICS_CATALOGUE_PAGE_SIZE,
  buildMetricsInfoQuery,
  knownMetricFieldKeys,
  pageMetricsCatalogue,
  parseMetricsInfoResponse,
  type MetricsCatalogueRow,
} from './metrics_catalogue';

export interface PrepareMetricsExtractionResult {
  hasWork: boolean;
  cataloguePage: MetricsCatalogueRow[];
  catalogueRemaining: number;
}

const emptyCatalogue = (): PrepareMetricsExtractionResult => ({
  hasWork: false,
  cataloguePage: [],
  catalogueRemaining: 0,
});

export const prepareMetricsExtraction = async ({
  esClient,
  kiClient,
  streamName,
  samplingSource,
  logger,
  pageSize = METRICS_CATALOGUE_PAGE_SIZE,
}: {
  esClient: ElasticsearchClient;
  kiClient: Pick<KnowledgeIndicatorClient, 'getFeatures' | 'getExcludedFeatures'>;
  streamName: string;
  samplingSource: string;
  logger: Pick<Logger, 'warn'>;
  pageSize?: number;
}): Promise<PrepareMetricsExtractionResult> => {
  let metricsInfo: Awaited<ReturnType<typeof runEsqlQuery>>;
  try {
    metricsInfo = await runEsqlQuery(esClient, buildMetricsInfoQuery(samplingSource));
  } catch (error) {
    logger.warn(
      `METRICS_INFO failed for "${samplingSource}", skipping the metrics catalogue: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return emptyCatalogue();
  }

  const [{ hits: allFeatures }, { hits: excludedFeatures }] = await Promise.all([
    kiClient.getFeatures(streamName),
    kiClient.getExcludedFeatures(streamName),
  ]);

  const { page, remaining } = pageMetricsCatalogue({
    rows: parseMetricsInfoResponse(metricsInfo),
    knownMetricFields: knownMetricFieldKeys([...allFeatures, ...excludedFeatures]),
    pageSize,
  });

  return {
    hasWork: page.length > 0,
    cataloguePage: page,
    catalogueRemaining: remaining,
  };
};
