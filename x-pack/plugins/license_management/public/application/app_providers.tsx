/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Provider } from 'react-redux';

import { KibanaRenderContextProvider } from '../shared_imports';
import { AppContextProvider, AppDependencies } from './app_context';
// @ts-ignore
import { licenseManagementStore } from './store';

interface Props {
  appDependencies: AppDependencies;
  children: React.ReactNode;
}

export const AppProviders = ({ appDependencies, children }: Props) => {
  const {
    core,
    plugins,
    services,
    store: { initialLicense },
  } = appDependencies;

  const {
    http,
    notifications: { toasts },
  } = core;

  // Setup Redux store
  const thunkServices = {
    history: appDependencies.services.history,
    toasts,
    http,
    telemetry: plugins.telemetry,
    licensing: plugins.licensing,
    breadcrumbService: services.breadcrumbService,
  };
  const initialState = { license: initialLicense };

  const store = licenseManagementStore(initialState, thunkServices);

  return (
    <KibanaRenderContextProvider {...core}>
      <Provider store={store}>
        <AppContextProvider value={appDependencies}>{children}</AppContextProvider>
      </Provider>
    </KibanaRenderContextProvider>
  );
};
