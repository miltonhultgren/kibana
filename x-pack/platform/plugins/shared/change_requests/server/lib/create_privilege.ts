/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ApiOperation, ApiPrivileges } from '@kbn/core-security-server';

export const CHANGE_REQUESTS_SUFFIX = 'change_requests';

export const createPrivilege = {
  api: {
    create: (domain: string) => ApiPrivileges.create(`${domain}_${CHANGE_REQUESTS_SUFFIX}`),
    manage: (domain: string) => ApiPrivileges.manage(`${domain}_${CHANGE_REQUESTS_SUFFIX}`),
  },
  ui: {
    create: (domain: string) => `${ApiOperation.Create}_${domain}_${CHANGE_REQUESTS_SUFFIX}`,
    manage: (domain: string) => `${ApiOperation.Manage}_${domain}_${CHANGE_REQUESTS_SUFFIX}`,
  },
};
