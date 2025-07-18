/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type PluginInitializerContext,
  type Plugin,
  type Logger,
  type CoreSetup,
  CoreStart,
} from '@kbn/core/server';
import { type SecurityPluginStart } from '@kbn/security-plugin/server';
import { registerRoutes } from '@kbn/server-route-repository';
import { StorageIndexAdapter } from '@kbn/storage-adapter';
import { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { repository } from './routes/repository';
import {
  ChangeRequestDoc,
  ChangeRequestsRouteDependencies,
  ChangeRequestsStorageSettings,
} from './types';
import { changeRequestsStorageSettings } from './constants';
import { submitChangeRequest } from './lib/submit_change_request';
import { createPrivilege } from './lib/create_privilege';

export type ChangeRequestsPluginSetup = ReturnType<ChangeRequestsPlugin['setup']>;
export type ChangeRequestsPluginStart = ReturnType<ChangeRequestsPlugin['start']>;
interface ChangeRequestsPluginSetupDependencies {
  features: FeaturesPluginSetup;
}
interface ChangeRequestsPluginStartDependencies {
  security: SecurityPluginStart;
  spaces: SpacesPluginStart;
}

export class ChangeRequestsPlugin
  implements
    Plugin<
      ChangeRequestsPluginSetup,
      ChangeRequestsPluginStart,
      ChangeRequestsPluginSetupDependencies,
      ChangeRequestsPluginStartDependencies
    >
{
  public logger: Logger;

  constructor(initContext: PluginInitializerContext) {
    this.logger = initContext.logger.get();
  }

  public setup(
    core: CoreSetup<ChangeRequestsPluginStartDependencies>,
    plugins: ChangeRequestsPluginSetupDependencies
  ) {
    registerRoutes<ChangeRequestsRouteDependencies>({
      core,
      logger: this.logger,
      repository,
      dependencies: {
        getClients: async () => {
          const [coreStart] = await core.getStartServices();

          const scopedClusterClient = coreStart.elasticsearch.client;

          const storageAdapter = new StorageIndexAdapter<
            ChangeRequestsStorageSettings,
            { request: ChangeRequestDoc } & { _id: string }
          >(scopedClusterClient.asInternalUser, this.logger, changeRequestsStorageSettings);

          return {
            storageClient: storageAdapter.getClient(),
          };
        },
        getStartServices: async () => {
          const [coreStart, pluginsStart] = await core.getStartServices();

          return {
            core: coreStart,
            security: pluginsStart.security,
            spaces: pluginsStart.spaces,
          };
        },
      },
      runDevModeChecks: false,
    });

    return {
      createPrivilege,
    };
  }

  public start(coreStart: CoreStart) {
    const scopedClusterClient = coreStart.elasticsearch.client;

    const storageAdapter = new StorageIndexAdapter<
      ChangeRequestsStorageSettings,
      { request: ChangeRequestDoc } & { _id: string }
    >(scopedClusterClient.asInternalUser, this.logger, changeRequestsStorageSettings);

    const storageClient = storageAdapter.getClient();

    return {
      submitChangeRequest: async (
        changeRequest: Omit<
          ChangeRequestDoc,
          'reviewedBy' | 'reviewComment' | 'user' | 'lastUpdatedAt' | 'submittedAt' | 'status'
        >
      ) =>
        submitChangeRequest(storageClient, {
          ...changeRequest,
          status: 'pending',
          user: 'Kibana system',
          lastUpdatedAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
        }),
    };
  }
}
