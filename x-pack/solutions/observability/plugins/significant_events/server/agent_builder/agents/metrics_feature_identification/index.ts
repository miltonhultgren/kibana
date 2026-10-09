/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { registerMetricsFeatureIdentificationAgentType } from './metrics_feature_identification_agent';

export {
  METRICS_FEATURE_IDENTIFICATION_AGENT_ID,
  METRICS_FEATURE_IDENTIFICATION_AGENT_TYPE_ID,
  metricsFeatureIdentificationAgentType,
  registerMetricsFeatureIdentificationAgentType,
} from './metrics_feature_identification_agent';
export { installMetricsFeatureIdentificationAgent } from './install_metrics_feature_identification_agent';

export const registerSignificantEventsMetricsFeatureIdentificationAgentTypes = ({
  agentBuilder,
}: {
  agentBuilder: AgentBuilderPluginSetup;
}): void => {
  registerMetricsFeatureIdentificationAgentType(agentBuilder);
};
