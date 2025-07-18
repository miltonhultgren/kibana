/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Condition, RoutingDefinition, Streams } from '@kbn/streams-schema';
import { ErrorActorEvent, fromPromise } from 'xstate5';
import { errors as esErrors } from '@elastic/elasticsearch';
import { APIReturnType } from '@kbn/streams-plugin/public/api';
import { IToasts } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { getFormattedError } from '../../../../../util/errors';
import { StreamRoutingServiceDependencies } from './types';

/**
 * Upsert stream actor factory
 * This actor is used to update the routing of a stream
 */
export type UpsertStreamResponse = APIReturnType<'PUT /api/streams/{name}/_ingest 2023-10-31'>;
export interface UpsertStreamInput {
  definition: Streams.WiredStream.GetResponse;
  routing: RoutingDefinition[];
}

export function createUpsertStreamActor({
  streamsRepositoryClient,
}: Pick<StreamRoutingServiceDependencies, 'streamsRepositoryClient'>) {
  return fromPromise<UpsertStreamResponse, UpsertStreamInput>(({ input, signal }) => {
    return streamsRepositoryClient.fetch(`PUT /api/streams/{name}/_ingest 2023-10-31`, {
      signal,
      params: {
        path: {
          name: input.definition.stream.name,
        },
        body: {
          ingest: {
            ...input.definition.stream.ingest,
            wired: {
              ...input.definition.stream.ingest.wired,
              routing: input.routing,
            },
          },
        },
      },
    });
  });
}

/**
 * Fork stream actor factory
 * This actor is used to fork a stream, creating a new stream with the same definition
 */
export type ForkStreamResponse = APIReturnType<'POST /api/streams/{name}/_fork 2023-10-31'>;
export interface ForkStreamInput {
  definition: Streams.WiredStream.GetResponse;
  if: Condition;
  destination: string;
}
export function createForkStreamActor({
  streamsRepositoryClient,
  forkSuccessNotifier,
}: Pick<StreamRoutingServiceDependencies, 'streamsRepositoryClient' | 'forkSuccessNotifier'>) {
  return fromPromise<ForkStreamResponse, ForkStreamInput>(async ({ input, signal }) => {
    const response = await streamsRepositoryClient.fetch(
      'POST /api/streams/{name}/_fork 2023-10-31',
      {
        signal,
        params: {
          path: {
            name: input.definition.stream.name,
          },
          body: {
            if: input.if,
            stream: {
              name: input.destination,
            },
          },
        },
      }
    );

    forkSuccessNotifier(input.destination);

    return response;
  });
}

export function createSuggestStreamActor({
  changeRequestsRepositoryClient,
  suggestSuccessNotifier,
}: Pick<
  StreamRoutingServiceDependencies,
  'changeRequestsRepositoryClient' | 'suggestSuccessNotifier'
>) {
  return fromPromise<any, ForkStreamInput>(async ({ input, signal }) => {
    await changeRequestsRepositoryClient.fetch('POST /internal/change_requests/change_requests', {
      signal,
      params: {
        body: {
          // Need a UI way to input these things
          title: `Fork stream: ${input.definition.stream.name} to ${input.destination}`,
          description: 'I think it would be neat',
          urgency: 'medium',
          actions: [
            {
              request: {
                method: 'post',
                endpoint: `/api/streams/${input.definition.stream.name}/_fork`, // Ideally I can pass this as path params instead
                version: '2023-10-31',
                body: {
                  if: input.if,
                  stream: {
                    name: input.destination,
                  },
                },
              },
              domain: 'streams',
              label: 'Fork stream',
              summary:
                'This creates a child stream from the parent stream and routes data based on a condition',
              requiredPrivileges: {
                // This is a placeholder, the actual privileges will be added later
                elasticsearch: {
                  cluster: ['manage_ingest_pipelines'],
                  index: {},
                },
              },
            },
          ],
        },
      },
    });

    suggestSuccessNotifier();
  });
}

/**
 * Delete stream actor factory
 * This actor is used to fork a stream, creating a new stream with the same definition
 */
export type DeleteStreamResponse = APIReturnType<'DELETE /api/streams/{name} 2023-10-31'>;
export interface DeleteStreamInput {
  name: string;
}

export function createDeleteStreamActor({
  streamsRepositoryClient,
}: Pick<StreamRoutingServiceDependencies, 'streamsRepositoryClient'>) {
  return fromPromise<DeleteStreamResponse, DeleteStreamInput>(({ input, signal }) => {
    return streamsRepositoryClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
      signal,
      params: {
        path: {
          name: input.name,
        },
      },
    });
  });
}

/**
 * Notifier factories
 */

export const createStreamSuccessNotifier =
  ({ toasts }: { toasts: IToasts }) =>
  () => {
    toasts.addSuccess({
      title: i18n.translate('xpack.streams.streamDetailRouting.saved', {
        defaultMessage: 'Stream saved',
      }),
      toastLifeTimeMs: 3000,
    });
  };

export const createStreamFailureNotifier =
  ({ toasts }: { toasts: IToasts }) =>
  (params: { event: unknown }) => {
    const event = params.event as ErrorActorEvent<esErrors.ResponseError, string>;
    toasts.addError(new Error(event.error.body.message), {
      title: i18n.translate('xpack.streams.failedToSave', {
        defaultMessage: 'Failed to save',
      }),
      toastMessage: getFormattedError(event.error).message,
      toastLifeTimeMs: 5000,
    });
  };
