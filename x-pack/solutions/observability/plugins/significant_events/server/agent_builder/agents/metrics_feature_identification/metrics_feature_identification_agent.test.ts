/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import {
  FINALIZE_METRICS_FEATURES_TOOL_ID,
  METRICS_FEATURE_IDENTIFICATION_SKILL_ID,
  metricsFeatureIdentificationSkill,
} from '../../skills/metrics_feature_identification';
import { metricsFeatureIdentificationAgentType } from './metrics_feature_identification_agent';

describe('metricsFeatureIdentificationAgentType', () => {
  it('registers the metrics skill and finalize tool only', async () => {
    expect(metricsFeatureIdentificationAgentType.baseConfiguration.skill_ids).toEqual([
      METRICS_FEATURE_IDENTIFICATION_SKILL_ID,
    ]);
    expect(metricsFeatureIdentificationAgentType.baseConfiguration.tools).toEqual([]);
    expect(isAllowedBuiltinSkill(METRICS_FEATURE_IDENTIFICATION_SKILL_ID)).toBe(true);

    const inlineTools = await metricsFeatureIdentificationSkill.getInlineTools?.();
    expect(inlineTools?.map((tool) => tool.id)).toEqual([FINALIZE_METRICS_FEATURES_TOOL_ID]);
  });
});
