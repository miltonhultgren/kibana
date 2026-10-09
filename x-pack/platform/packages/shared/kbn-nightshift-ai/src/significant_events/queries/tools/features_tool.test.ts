/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  QUERY_GENERATION_EXCLUDED_FEATURE_TYPES,
  SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES,
} from './features_tool';

describe('query generation feature types', () => {
  it('does not list metric or dimension catalogue types', () => {
    expect(SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES).not.toContain('metric');
    expect(SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES).not.toContain('dimension');
    expect(QUERY_GENERATION_EXCLUDED_FEATURE_TYPES).toEqual(
      expect.arrayContaining(['log_samples', 'metric', 'dimension'])
    );
  });
});
