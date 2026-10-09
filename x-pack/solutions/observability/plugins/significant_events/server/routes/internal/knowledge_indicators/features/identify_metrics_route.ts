/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from '@kbn/zod/v4';
import { resolveNightshiftModelForRequest } from '@kbn/nightshift-ai';
import { MAX_ID_LENGTH } from '@kbn/significant-events-schema';
import { isInferenceProviderError } from '@kbn/inference-common';
import { NIGHTSHIFT_API_PRIVILEGES } from '@kbn/nightshift-shared';
import { createServerRoute } from '../../../create_server_route';
import { assertNotPaused } from '../../../utils/assert_not_paused';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { getRequestAbortSignal } from '../../../utils/get_request_abort_signal';
import { formatInferenceProviderError } from '../../../utils/create_connector_sse_error';
import { buildTelemetry } from '../../../../lib/significant_events/features/identify_inferred_features';
import { identifyMetricsFeatures } from '../../../../lib/significant_events/features/identify_metrics_features';
import { isMetricsCatalogueEnabled } from '../../../../lib/feature_flags/is_metrics_catalogue_enabled';
import { METRICS_CATALOGUE_PAGE_SIZE } from '../../../../lib/significant_events/features/metrics_catalogue';
import { prepareMetricsExtraction } from '../../../../lib/significant_events/features/prepare_metrics_extraction';
import { installMetricsFeatureIdentificationAgent } from '../../../../agent_builder/agents/metrics_feature_identification';
import { createSignificantEventsAvailability } from '../../../../agent_builder/tools/significant_events_availability';
import type { SyncWorkflowService } from '../../../../lib/workflows/sync_workflow';
import type { SignificantEventsMaintenanceService } from '../../../../lib/maintenance/maintenance_service';
import { stateBlocksNewActivity } from '../../../../../common/maintenance/state_machine';

const catalogueRowSchema = z
  .object({
    metricName: z.string().min(1).max(MAX_ID_LENGTH),
    dataStream: z.string().max(MAX_ID_LENGTH),
    unit: z.string().max(MAX_ID_LENGTH),
    metricType: z.string().max(MAX_ID_LENGTH),
    fieldType: z.string().max(MAX_ID_LENGTH),
    dimensionFields: z.array(z.string().max(MAX_ID_LENGTH)).max(100),
  })
  .strict();

const bootstrapSyncWorkflow = async ({
  syncWorkflowService,
  maintenanceService,
  request,
  logger,
}: {
  syncWorkflowService: SyncWorkflowService | undefined;
  maintenanceService: SignificantEventsMaintenanceService;
  request: Parameters<SyncWorkflowService['ensureEnabled']>[0]['request'];
  logger: { warn: (message: string) => void };
}): Promise<void> => {
  if (!syncWorkflowService) {
    return;
  }
  try {
    const state = await maintenanceService.getState({ request });
    if (stateBlocksNewActivity(state)) {
      return;
    }
    await syncWorkflowService.ensureEnabled({ request });
  } catch (error) {
    logger.warn(
      `Failed to ensure KI sync workflow is enabled: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const emptyCatalogue = () => ({
  hasWork: false,
  cataloguePage: [],
  catalogueRemaining: 0,
});

const identifyMetricsModeRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{sourceId}/features/_identify/mode',
  options: {
    access: 'internal',
    summary: 'Read the Nightshift source signal type that selects KI extraction pipelines',
  },
  security: {
    authz: {
      requiredPrivileges: [NIGHTSHIFT_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ sourceId: z.string().max(MAX_ID_LENGTH) }),
  }),
  handler: async ({ params, request, getScopedClients, server, maintenanceService }) => {
    const scopedClients = await getScopedClients({ request });
    const { sourcesClient, licensing } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing });
    await assertNotPaused({ maintenanceService, request });

    const { source } = await sourcesClient.get(params.path.sourceId);
    return { type: source.type };
  },
});

const prepareMetricsExtractionRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{sourceId}/features/_identify/metrics/prepare',
  options: {
    access: 'internal',
    summary: 'Read the next METRICS_INFO page for one metrics catalogue iteration',
    timeout: { idleSocket: 300_000 },
  },
  security: {
    authz: {
      requiredPrivileges: [NIGHTSHIFT_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ sourceId: z.string().max(MAX_ID_LENGTH) }),
    body: z.object({}).optional(),
  }),
  handler: async ({ params, request, getScopedClients, server, logger, maintenanceService }) => {
    const scopedClients = await getScopedClients({ request });
    const { streamDataEsClient, sourcesClient, licensing } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing });
    await assertNotPaused({ maintenanceService, request });

    const { sourceId } = params.path;
    const routeLogger = logger.get('features_identification', 'metrics_prepare', sourceId);

    if (!(await isMetricsCatalogueEnabled(server.core.featureFlags))) {
      return emptyCatalogue();
    }

    const { source } = await sourcesClient.get(sourceId);
    const kiClient = await scopedClients.getKnowledgeIndicatorClient(source);

    return prepareMetricsExtraction({
      esClient: streamDataEsClient,
      kiClient,
      streamName: source.id,
      samplingSource: source.view_name,
      logger: routeLogger,
      pageSize: METRICS_CATALOGUE_PAGE_SIZE,
    });
  },
});

const identifyMetricsFeaturesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{sourceId}/features/_identify/metrics',
  options: {
    access: 'internal',
    summary: 'Classify one metrics catalogue page into metric and dimension KI features',
    timeout: { idleSocket: 300_000 },
  },
  security: {
    authz: {
      requiredPrivileges: [NIGHTSHIFT_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ sourceId: z.string().max(MAX_ID_LENGTH) }),
    body: z.object({
      connectorId: z.string().max(MAX_ID_LENGTH).optional(),
      runId: z.string().max(MAX_ID_LENGTH).optional(),
      iteration: z.number().optional(),
      cataloguePage: z.array(catalogueRowSchema).max(METRICS_CATALOGUE_PAGE_SIZE),
      maxExcludedFeaturesInPrompt: z.number().optional(),
      maxPreviouslyIdentifiedFeatures: z.number().optional(),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    logger,
    telemetry,
    syncWorkflowService,
    maintenanceService,
  }) => {
    const scopedClients = await getScopedClients({ request });
    const { sourcesClient, inferenceClient, tuningConfig, licensing } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing });
    await assertNotPaused({ maintenanceService, request });

    const { sourceId } = params.path;
    const routeLogger = logger.get('features_identification', 'metrics', sourceId);
    const now = Date.now();
    const {
      connectorId: connectorIdOverride,
      runId,
      iteration,
      cataloguePage,
      maxExcludedFeaturesInPrompt = tuningConfig.max_excluded_features_in_prompt,
      maxPreviouslyIdentifiedFeatures,
    } = params.body;
    const resolvedRunId = runId?.trim() || uuidv4();

    const [connectorId, { source }] = await Promise.all([
      resolveNightshiftModelForRequest({
        request,
        inference: server.inference,
        savedObjects: server.core.savedObjects,
        uiSettings: server.core.uiSettings,
        step: 'kiExtraction',
        requestedId: connectorIdOverride,
      }),
      sourcesClient.get(sourceId),
    ]);
    const kiClient = await scopedClients.getKnowledgeIndicatorClient(source);

    if (server.agentBuilder) {
      await installMetricsFeatureIdentificationAgent({
        agentBuilder: server.agentBuilder,
        spaceId: request.spaceId,
        availability: createSignificantEventsAvailability({ server, logger: routeLogger }),
      });
    }

    try {
      const result = await identifyMetricsFeatures({
        kiClient,
        agentBuilder: server.agentBuilder,
        request,
        connectorId,
        logger: routeLogger,
        signal: getRequestAbortSignal(request),
        streamName: source.id,
        runId: resolvedRunId,
        documents: [],
        cataloguePage,
        totalFilters: 0,
        filtersCapped: false,
        hasFilteredDocuments: false,
        iteration,
        tuning: {
          max_excluded_features_in_prompt: maxExcludedFeaturesInPrompt,
          maxPreviouslyIdentifiedFeatures,
        },
        trackFeaturesIdentified: (data) => telemetry.trackFeaturesIdentified(data),
      });

      await bootstrapSyncWorkflow({
        syncWorkflowService,
        maintenanceService,
        request,
        logger: routeLogger,
      });

      return { ...result, connectorId };
    } catch (error) {
      routeLogger.error(
        `Metrics feature identification failed for source [${sourceId}]: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      telemetry.trackFeaturesIdentified(
        buildTelemetry(
          {
            run_id: resolvedRunId,
            connector_id: connectorId,
            iteration: iteration ?? 1,
            source_id: sourceId,
            docs_count: 0,
            excluded_features_count: 0,
            total_filters: 0,
            filters_capped: false,
            has_filtered_documents: false,
          },
          Date.now() - now,
          { state: 'failure' }
        )
      );

      if (isInferenceProviderError(error)) {
        const connector = await inferenceClient
          .getConnectorById(connectorId)
          .catch(() => undefined);
        if (connector) {
          throw new Error(formatInferenceProviderError(error, connector));
        }
      }

      throw error;
    }
  },
});

export const internalIdentifyMetricsKIFeaturesRoutes = {
  ...identifyMetricsModeRoute,
  ...prepareMetricsExtractionRoute,
  ...identifyMetricsFeaturesRoute,
};
