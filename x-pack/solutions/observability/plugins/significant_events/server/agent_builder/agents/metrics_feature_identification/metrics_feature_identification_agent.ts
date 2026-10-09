/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { AgentTypeDefinition } from '@kbn/agent-builder-server/agents';
import { metricsFeaturesPrompt } from '@kbn/nightshift-ai';
import { METRICS_FEATURE_IDENTIFICATION_SKILL_ID } from '../../skills/metrics_feature_identification';
import groundingInstructions from './instructions.md.text';

export const METRICS_FEATURE_IDENTIFICATION_AGENT_ID =
  'significant-events.metrics-feature-identification';
export const METRICS_FEATURE_IDENTIFICATION_AGENT_TYPE_ID =
  'platform.sig_events.metrics-feature-identification-type';

export const metricsFeatureIdentificationAgentType = {
  id: METRICS_FEATURE_IDENTIFICATION_AGENT_TYPE_ID,
  name: 'Metrics Feature Identification',
  description:
    'Classifies a METRICS_INFO catalogue page into metric and dimension KI features, including formula and symptom or diagnostic class.',
  avatar_icon: 'logoElastic',
  baseConfiguration: {
    instructions: `${metricsFeaturesPrompt}\n\n${groundingInstructions}`,
    skill_ids: [METRICS_FEATURE_IDENTIFICATION_SKILL_ID],
    enable_elastic_capabilities: false,
    connector_ids: [],
    tools: [],
  },
} as const satisfies AgentTypeDefinition;

export const registerMetricsFeatureIdentificationAgentType = (
  agentBuilder: AgentBuilderPluginSetup
): void => {
  agentBuilder.agents.registerType(metricsFeatureIdentificationAgentType);
};
