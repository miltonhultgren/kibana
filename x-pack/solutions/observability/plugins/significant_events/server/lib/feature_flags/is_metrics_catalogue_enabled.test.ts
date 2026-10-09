/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import type { FeatureFlagsStart } from '@kbn/core/server';
import { SIGNIFICANT_EVENTS_METRICS_CATALOGUE_ENABLED_FLAG } from '../../../common/feature_flags';
import { isMetricsCatalogueEnabled } from './is_metrics_catalogue_enabled';

describe('isMetricsCatalogueEnabled', () => {
  it('defaults to off', async () => {
    const getBooleanValue$ = jest.fn().mockReturnValue(of(false));
    const featureFlags = { getBooleanValue$ } as unknown as FeatureFlagsStart;

    await expect(isMetricsCatalogueEnabled(featureFlags)).resolves.toBe(false);
    expect(getBooleanValue$).toHaveBeenCalledWith(
      SIGNIFICANT_EVENTS_METRICS_CATALOGUE_ENABLED_FLAG,
      false
    );
  });

  it('returns the flag value', async () => {
    const featureFlags = {
      getBooleanValue$: jest.fn().mockReturnValue(of(true)),
    } as unknown as FeatureFlagsStart;

    await expect(isMetricsCatalogueEnabled(featureFlags)).resolves.toBe(true);
  });
});
