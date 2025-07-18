/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChangeRequestDoc, ChangeRequestsStorageClient } from '../types';

export async function submitChangeRequest(
  storageClient: ChangeRequestsStorageClient,
  changeRequest: ChangeRequestDoc
) {
  // How do I apply the same permissions check here? This might be called by either an other plugin that has access to a Kibana request
  // Or it may be called by the Kibana system user from another plugin
  // Should probably perform the same validation the API does of at least one action, and at least one required privilege per action
  return storageClient.index({
    document: {
      request: changeRequest,
    },
  });
}
