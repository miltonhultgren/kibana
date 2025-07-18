/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { orderBy } from 'lodash';
import { isNotFoundError } from '@kbn/es-errors';
import { badRequest, forbidden, notFound } from '@hapi/boom';
import { ApiOperation } from '@kbn/core-security-server';
import { createChangeRequestsServerRoute } from './route_factory';
import { ChangeRequestDoc, Status, statusRt } from '../types';
import { getCurrentUser } from '../lib/get_current_user';
import { CHANGE_REQUESTS_SUFFIX, createPrivilege } from '../lib/create_privilege';

const listRequestsRoute = createChangeRequestsServerRoute({
  endpoint: 'GET /internal/change_requests/manage/change_requests',
  security: {
    authz: {
      // This means they should be able to manage change requests (for any valid domain)
      // If they don't have access to any domain, they should get a 503
      // If another domain is added, it should be added here using anyRequired else the user gets a 503
      requiredPrivileges: [createPrivilege.api.manage('streams')],
    },
  },
  handler: async ({ response, getClients, getStartServices, request }) => {
    const { storageClient } = await getClients();
    const { security, spaces, core } = await getStartServices();
    const checkPrivileges = security.authz.checkPrivilegesDynamicallyWithRequest(request);

    const space = spaces.spacesService.getSpaceId(request);
    const user = await getCurrentUser(core, request);

    const result = await storageClient.search({
      size: 10000,
      track_total_hits: false,
    });

    if (result.hits.total) {
      // This property is only there if there are 0 hits since we don't track total hits
      return response.ok({
        body: {
          change_requests: [],
        },
      });
    }

    const changeRequests = orderBy(
      result.hits.hits
        .filter((hit) => hit._source.request.space === space && hit._source.request.user !== user) // You cannot approve your own request so we don't show it in the list
        .map((hit) => {
          const { space: _space, ...requestWithoutSpace } = hit._source.request;
          return {
            id: hit._id!, // Odd that I have to insist here
            ...requestWithoutSpace,
          };
        }),
      'submittedAt',
      'desc'
    );

    const domainPrivileges = Array.from(
      new Set(
        changeRequests.flatMap((changeRequest) =>
          changeRequest.actions.map((action) =>
            security.authz.actions.api.get(
              ApiOperation.Manage,
              `${action.domain}_${CHANGE_REQUESTS_SUFFIX}`
            )
          )
        )
      )
    );
    const { privileges } = await checkPrivileges({
      kibana: domainPrivileges,
    });
    const domainPrivilegesLookup = Object.fromEntries(
      privileges.kibana
        .filter(({ resource }) => resource === space) // Is this needed?
        .map(({ privilege, authorized }) => [privilege, authorized])
    );

    // This process might be fairly expensive if it is done for many requests and requested frequently (add APM)
    const results = await Promise.all(
      changeRequests
        .filter((changeRequest) =>
          Array.from(
            new Set(
              changeRequest.actions.map(({ domain }) =>
                security.authz.actions.api.get(
                  ApiOperation.Manage,
                  `${domain}_${CHANGE_REQUESTS_SUFFIX}`
                )
              )
            )
          ).every((privilege) => domainPrivilegesLookup[privilege])
        )
        .flatMap((changeRequest) =>
          changeRequest.actions.map(
            (action, index) =>
              [authorizationId(changeRequest, index), action.requiredPrivileges] as const
          )
        )
        .map(async ([id, requiredPrivileges]) => {
          const { hasAllRequested } = await checkPrivileges(requiredPrivileges);
          return [id, hasAllRequested] as const;
        })
    );
    const actionAuthorizationResults = Object.fromEntries(results);

    const authorizedChangeRequests = changeRequests
      .filter((changeRequest) => {
        const authorizedActions = changeRequest.actions.filter((action, index) => {
          return actionAuthorizationResults[authorizationId(changeRequest, index)];
        });
        return authorizedActions.length === changeRequest.actions.length;
      })
      .map((changeRequest) => {
        return {
          ...changeRequest,
          actions: changeRequest.actions.map((action) => {
            const { requiredPrivileges, ...actionWithoutRequiredPrivileges } = action;
            // Perhaps the reviewing admin actually wants to know which privileges are needed? Even if they have them.
            // My thought was that the action summary provided by plugins should already make it clear what kind of resources are effected.
            return actionWithoutRequiredPrivileges;
          }),
        };
      });

    return response.ok({
      body: {
        change_requests: authorizedChangeRequests,
      },
    });
  },
});

function authorizationId(changeRequest: { id: string }, index: number) {
  return `${changeRequest.id}_${index}` as string;
}

const updateRequestRoute = createChangeRequestsServerRoute({
  endpoint: 'PATCH /internal/change_requests/manage/change_requests/{id}',
  security: {
    authz: {
      // This means they should be able to manage change requests (for any valid domain)
      // If they don't have access to any domain, they should get a 503
      // If another domain is added, it should be added here using anyRequired else the user gets a 503
      requiredPrivileges: [createPrivilege.api.manage('streams')],
    },
  },
  params: z.object({
    path: z.object({
      id: z.string(),
    }),
    body: z.object({
      status: statusRt,
      reviewComment: z.string().optional(),
    }),
  }),
  handler: async ({ params, response, getClients, getStartServices, request }) => {
    // For approve, I probably want a lock but how does that even work if the UI is doing the actions?

    try {
      const { storageClient } = await getClients();
      const { security, spaces, core } = await getStartServices();
      const checkPrivileges = security.authz.checkPrivilegesDynamicallyWithRequest(request);

      const space = spaces.spacesService.getSpaceId(request);
      const user = await getCurrentUser(core, request);

      const result = await storageClient.get({
        id: params.path.id,
      });

      const changeRequest = result._source?.request;
      if (!changeRequest) {
        throw notFound();
      }

      const domainPrivileges = changeRequest.actions.map((action) =>
        security.authz.actions.api.get(
          ApiOperation.Manage,
          `${action.domain}_${CHANGE_REQUESTS_SUFFIX}`
        )
      );
      const { hasAllRequested: hasDomainPrivileges } = await checkPrivileges({
        kibana: Array.from(new Set(domainPrivileges)),
      });
      if (!hasDomainPrivileges) {
        throw forbidden();
      }

      if (changeRequest.space !== space) {
        throw notFound();
      }

      if (changeRequest.user === user) {
        throw badRequest('You cannot approve your own change request'); // Or?
      }

      assertValidStatusTransition(changeRequest.status, params.body.status);

      const authorizationResults = await Promise.all(
        changeRequest.actions.map(async (action) => checkPrivileges(action.requiredPrivileges))
      );
      const isAuthorized = authorizationResults.every(({ hasAllRequested }) => hasAllRequested);

      if (!isAuthorized) {
        throw notFound();
      }

      const updatedChangeRequest: ChangeRequestDoc = {
        ...changeRequest,
        lastUpdatedAt: new Date().toISOString(),
        reviewedBy: user,
        status: params.body.status,
        reviewComment: params.body.reviewComment,
      };

      // Do I need to log this event for audit tracing?
      await storageClient.index({
        id: params.path.id,
        document: {
          request: updatedChangeRequest,
        },
      });

      return response.ok({
        body: {
          change_request: updatedChangeRequest,
        },
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        throw notFound();
      }

      throw error;
    }
  },
});

function assertValidStatusTransition(currentStatus: Status, nextStatus: Status) {
  if (currentStatus === 'pending') {
    const invalidTransitions: Status[] = ['pending', 'applied', 'failed'];
    if (invalidTransitions.includes(nextStatus)) {
      throw badRequest(`Invalid status transitions: ${currentStatus} -> ${nextStatus}`);
    }
    return;
  }

  if (currentStatus === 'approved') {
    const invalidTransitions: Status[] = ['pending', 'rejected', 'approved'];
    if (invalidTransitions.includes(nextStatus)) {
      throw badRequest(`Invalid status transitions: ${currentStatus} -> ${nextStatus}`);
    }
    return;
  }

  if (currentStatus === 'applied') {
    const invalidTransitions: Status[] = ['pending', 'approved', 'rejected', 'failed', 'applied'];
    if (invalidTransitions.includes(nextStatus)) {
      throw badRequest(`Invalid status transitions: ${currentStatus} -> ${nextStatus}`);
    }
    return;
  }

  if (currentStatus === 'rejected') {
    const invalidTransitions: Status[] = ['pending', 'rejected', 'failed', 'applied'];
    if (invalidTransitions.includes(nextStatus)) {
      throw badRequest(`Invalid status transitions: ${currentStatus} -> ${nextStatus}`);
    }
    return;
  }

  if (currentStatus === 'failed') {
    const invalidTransitions: Status[] = ['pending', 'applied', 'failed'];
    if (invalidTransitions.includes(nextStatus)) {
      throw badRequest(`Invalid status transitions: ${currentStatus} -> ${nextStatus}`);
    }
    return;
  }
}

export const manageRoutes = {
  ...listRequestsRoute,
  ...updateRequestRoute,
};
