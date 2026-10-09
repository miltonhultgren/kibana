/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { AgentAvailabilityConfig } from '@kbn/agent-builder-server/agents';
import {
  METRICS_FEATURE_IDENTIFICATION_AGENT_ID,
  METRICS_FEATURE_IDENTIFICATION_AGENT_TYPE_ID,
  metricsFeatureIdentificationAgentType,
} from './metrics_feature_identification_agent';

export const installMetricsFeatureIdentificationAgent = async ({
  agentBuilder,
  spaceId,
  availability,
}: {
  agentBuilder: AgentBuilderPluginStart;
  spaceId: string;
  availability?: AgentAvailabilityConfig;
}): Promise<void> => {
  await agentBuilder.agents.ensure({
    spaceId,
    availability,
    agent: {
      id: METRICS_FEATURE_IDENTIFICATION_AGENT_ID,
      type: METRICS_FEATURE_IDENTIFICATION_AGENT_TYPE_ID,
      name: 'Metrics Feature Identification',
      description: metricsFeatureIdentificationAgentType.description,
      labels: ['observability', 'streams', 'significant-events', 'metrics-feature-identification'],
      avatar_symbol: 'MF',
      access_control: { access_mode: AgentAccessControlMode.Public },
      configuration: {
        tools: [],
        skill_ids: [],
        connector_ids: [],
      },
    },
  });
};
