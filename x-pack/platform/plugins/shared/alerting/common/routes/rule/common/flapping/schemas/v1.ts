/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  MIN_LOOK_BACK_WINDOW as MIN_LOOK_BACK_WINDOW_V1,
  MAX_LOOK_BACK_WINDOW as MAX_LOOK_BACK_WINDOW_V1,
  MIN_STATUS_CHANGE_THRESHOLD as MIN_STATUS_CHANGE_THRESHOLD_V1,
  MAX_STATUS_CHANGE_THRESHOLD as MAX_STATUS_CHANGE_THRESHOLD_V1,
} from '@kbn/alerting-types/flapping/v1';
import { validateFlapping as validateFlappingV1 } from '../../../validation/validate_flapping/v1';

export const flappingSchema = schema.object(
  {
    look_back_window: schema.number({
      meta: { description: 'The minimum number of runs in which the threshold must be met.' },
      min: MIN_LOOK_BACK_WINDOW_V1,
      max: MAX_LOOK_BACK_WINDOW_V1,
    }),
    status_change_threshold: schema.number({
      meta: {
        description:
          'The minimum number of times an alert must switch states in the look back window.',
      },
      min: MIN_STATUS_CHANGE_THRESHOLD_V1,
      max: MAX_STATUS_CHANGE_THRESHOLD_V1,
    }),
  },
  {
    validate: validateFlappingV1,
    meta: {
      description:
        'When flapping detection is turned on, alerts that switch quickly between active and recovered states are identified as “flapping” and notifications are reduced.',
    },
  }
);
