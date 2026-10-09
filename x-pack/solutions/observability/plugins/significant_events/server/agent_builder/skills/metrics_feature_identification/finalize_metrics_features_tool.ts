/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { metricsFeatureIdentificationOutputSchema } from '../../../lib/significant_events/features/metrics_identification_output';

export const FINALIZE_METRICS_FEATURES_TOOL_ID = 'platform_sig_events_ki_metrics_feature_finalize';

export const finalizeMetricsFeaturesTool = {
  id: FINALIZE_METRICS_FEATURES_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Submit the complete deduplicated metrics feature list exactly once after duplicate checks. After this succeeds, respond with a brief confirmation and do not repeat the features.',
  schema: metricsFeatureIdentificationOutputSchema,
  handler: async () => ({
    results: [{ type: ToolResultType.other, data: { finalized: true } }],
  }),
} satisfies BuiltinSkillBoundedTool<typeof metricsFeatureIdentificationOutputSchema>;
