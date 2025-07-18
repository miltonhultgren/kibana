/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  MachineImplementationsFrom,
  assign,
  and,
  or,
  enqueueActions,
  setup,
  ActorRefFrom,
} from 'xstate5';
import { getPlaceholderFor } from '@kbn/xstate-utils';
import { Streams, isSchema, routingDefinitionListSchema } from '@kbn/streams-schema';
import { ALWAYS_CONDITION } from '../../../../../util/condition';
import {
  StreamRoutingContext,
  StreamRoutingEvent,
  StreamRoutingInput,
  StreamRoutingServiceDependencies,
} from './types';
import {
  createUpsertStreamActor,
  createStreamFailureNotifier,
  createStreamSuccessNotifier,
  createForkStreamActor,
  createDeleteStreamActor,
  createSuggestStreamActor,
} from './stream_actors';
import { routingConverter } from '../../utils';
import { RoutingDefinitionWithUIAttributes } from '../../types';
import { selectCurrentRule } from './selectors';
import {
  createRoutingSamplesMachineImplementations,
  routingSamplesMachine,
} from './routing_samples_state_machine';

export type StreamRoutingActorRef = ActorRefFrom<typeof streamRoutingMachine>;

export const streamRoutingMachine = setup({
  types: {
    input: {} as StreamRoutingInput,
    context: {} as StreamRoutingContext,
    events: {} as StreamRoutingEvent,
  },
  actors: {
    deleteStream: getPlaceholderFor(createDeleteStreamActor),
    forkStream: getPlaceholderFor(createForkStreamActor),
    suggestStream: getPlaceholderFor(createSuggestStreamActor),
    upsertStream: getPlaceholderFor(createUpsertStreamActor),
    routingSamplesMachine: getPlaceholderFor(() => routingSamplesMachine),
  },
  actions: {
    notifyStreamSuccess: getPlaceholderFor(createStreamSuccessNotifier),
    notifyStreamFailure: getPlaceholderFor(createStreamFailureNotifier),
    refreshDefinition: () => {},
    addNewRoutingRule: assign(({ context }) => {
      const newRule = routingConverter.toUIDefinition({
        destination: `${context.definition.stream.name}.child`,
        if: ALWAYS_CONDITION,
        isNew: true,
      });

      return {
        currentRuleId: newRule.id,
        routing: [...context.routing, newRule],
      };
    }),
    patchRule: assign(
      ({ context }, params: { routingRule: Partial<RoutingDefinitionWithUIAttributes> }) => ({
        routing: context.routing.map((rule) =>
          rule.id === context.currentRuleId ? { ...rule, ...params.routingRule } : rule
        ),
      })
    ),
    reorderRouting: assign((_, params: { routing: RoutingDefinitionWithUIAttributes[] }) => ({
      routing: params.routing,
    })),
    resetRoutingChanges: assign(({ context }) => ({
      currentRuleId: null,
      routing: context.initialRouting,
    })),
    setupRouting: assign((_, params: { definition: Streams.WiredStream.GetResponse }) => {
      const routing = params.definition.stream.ingest.wired.routing.map(
        routingConverter.toUIDefinition
      );

      return {
        currentRuleId: null,
        initialRouting: routing,
        routing,
      };
    }),
    storeCurrentRuleId: assign((_, params: { id: StreamRoutingContext['currentRuleId'] }) => ({
      currentRuleId: params.id,
    })),
    storeDefinition: assign((_, params: { definition: Streams.WiredStream.GetResponse }) => ({
      definition: params.definition,
    })),
  },
  guards: {
    canForkStream: and(['hasManagePrivileges', 'isValidRouting']),
    canReorderRules: and(['hasManagePrivileges', 'hasMultipleRoutingRules']),
    canUpdateStream: and(['hasManagePrivileges', 'isValidRouting']),
    hasMultipleRoutingRules: ({ context }) => context.routing.length > 1,
    hasManagePrivileges: ({ context }) => context.definition.privileges.manage,
    hasSimulatePrivileges: ({ context }) => context.definition.privileges.simulate,
    hasSuggestPrivileges: () => false, // Injected by provided configuration
    isAlreadyEditing: ({ context }, params: { id: string }) => context.currentRuleId === params.id,
    isValidRouting: ({ context }) =>
      isSchema(routingDefinitionListSchema, context.routing.map(routingConverter.toAPIDefinition)),
    canCreateRule: or(['hasSimulatePrivileges', 'hasSuggestPrivileges']),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCcD2BXALgSwHZQGVNkwBDAWwDo9sdSAbbALzygGIBtABgF1FQADqli1sqXPxAAPRACZZATkoA2AIwAWABwL1sgKybZG1bIA0IAJ6IAzKr2V1XLgs3WA7Jq7uFb5QF8-czQsViISCkpwiAs2WGIyKhIAYzBsADdIbj4kECERHHFJGQQucysSgKCMHHwwhMiyaOoIejA2YJqoACV0Vsok8MwwLMk80UKc4tLLRC5KkA7Q+Iioi2bW9urWHr7IWhGcsYKJScRNPXVKa1tFN1VbHTcyxABaeUofZT03W3VVT+sXnmi1qy0SjTW2BabRB3V6YAaqGQEDAyAOgmE4xOoGK6mUXBU1lcXDcelUmjcbnU6ieMwQmk0VyJ7n0XGUfz+emBW1B4XBpCaAzInQAcmAAO47BFJAAWpHwrE2IXwUv68pS9HRuUxxyKiB0ykoXAuzmsehcml0zwQylJlDJtt0Bi4NIU3OVhDBDQFayFpFFEtVsvlUEVsKDcvww14ox1Ymx0kQ92USms6gU7gpsi0yk01tzsiu-yJRnunhM7s6dRWEP6g1YYsl8P6kdD+CVnVVe0wWqO8b1CFU7MLej0skMVNt+lU1rcClUDj0X1cZN0KeslaWfO9gvr+EbEZDYZ5cL6ADMkQBrXtxiY4pMu6wqRzWBRvn7KNPqa2qJyXXxcIY5ImCmGabry9SrHWwoNoGzbBgq7bhs2sDoFAMBxDe+T9qcCDyIy5Kjnor7KOO6juMo1ovKoPyUJ4riaLaNFjsy4GetuUF+gGTbnleioQOICJ4GkqCXgiF7IJe1bkAAgkkmBIlhWIDj8C6kVwsiUlSJKKDOdJUqmCjfIobIpt8qhsdJO6+nuUAHs2EmXoqqJoMglACPQ-oSVQjnSXJClojGhy3gmxS-j4Dg-FozG2KoJjWto9jfJ8o40jSlqWV6nG2fZfSoehcCdGwAm4EJuAiWJlD5RhmB+fJilBRi2F3omCAvNYsgEgyc4li6tqMT+XALrIgK5oxniAp1siZRxtZcbBPEItVhXOcgrnuZ5mDeVVaE1XVAVKbquHtRoHyvgonXXBSNFpta05Gs4pGdec2YXVygQLCeVlQd22zwa2x4ekGgzRtkTXKbh9xLpQdweA8cWWhmP4mP+hjGhcc6eORM2QbWv0qv9R5ISeQbqmAmqNdqzWhWcI10YC6afqSdwuD+JoOCmU2-mOujTR9sLfXjECiATfQIW27DIWLrag7G1MDjRzhGuoegacojo0kSP79Q4NJGI4Hhju9VQeoLPqUPjp7SgDxNA823aHTh96DmOC5-MSjFOg8P6xQ4PgKBplKAWabg4zW5uW4eiGSyT9vCz2qhg1TEPOzReJGrma7Zmab0-uRSjmkN5F3MWFJh-yTSR4T0cdn9fQkOQqAZI7LVhTRhqOIxFGcyr1h59mKiyCmOm6CrGX819WVCyLVstkTMd23lpDN5Tfat0m-yGvhOjjgYujWJRdLtwSv6MUNJJviYocT6bU8R-HdcIg3TeP8VgnUOVokIiirRDPtDVJzXjTBAIc6KaA0K+dKahmI-mzJcY00Di4uGzOXayFsH6iyfmARuaRX4uSRBtLySIqA-zAH-ME-kAFyxTq1EwihIpEURlodMeYj7EQ7sSNk8gRoGD5ibKsd9K4YNnugAQEB-SvxKmVCqCJRGwFRLVCh9VAqAJCgOUBRgfh70cNmKk34j5uH0JQOwFwfBDi0DoTQqCfrCNVKI8RnZ4RsHwW5DyRDkBUDkQo-+KjqFHVTvhOicUaRTiHPIbWaZ7RmnMuyJcv51DWNrCQJEKJkCP1gIiZEqJAaOPrmAFJqIW7AOTIWeQgJSQulcOmO6xoCRUhuuae4Q4LI3wEbNc2ySslpMwRkzpqScmPzVLgDURSByq0ZOmdMxEFBfFSnoGpNEHrZzTJ1SciSOn5K6ekzJ-Tba5KWsvWWwV5aQ1qSodkb48QuF0DMu61w3AqDfBpIk5JPwunWU0Pp2SemUHsRIiCFA36lQ-jI35Ah5HIEUXyShvjjk0NxHTc0WhDE8LNBAu6RhDT-D+BmdkbhjQfLWF87pVsMl-LaQkZxa0CFuK2sQsFEKoUJBhaMyGv4CSrIpC4O41IMVK3nC8y0dx3ABA+rgVAKJ4A5AFmCPxTtWovDHmdN8l0iSw1unSF4+IFyAktLcVcPg+GfVvtuGgdBGAsHwHK9eeEhx0XVqWWGWMkZ0hGoWDQhcBXAU-MbY1FLw7RGtcAxVv5lUXS8Gqm6+jygvDJE+eiOKh6aQuoS9YYAg0Dn0EoNkl9tATQdfMuklpGSkUMfcEi4Dr78K3Ljc2819xwVaBm46B9CwZhVRG66UUqLeCuIBci0yaLzjdK0mtAabIwQbYtOe0dm0BPOBzeQc5szjg8Hpco4DLjkViloTwrtU31rso28SfErVwv8a1UkjJjRaE0voTw44EoZntEuL8+gzSuBHdWgFFcJ3-KPdO5acRWBztatMcocUnAw3xEBcBQ83wblHT+tBVcm3nvlcUFMDyVYXUMTnH4Chka+EigOz2pILpGple0oRM8o4S1A2FJ6Vxl0GF8CrbMrCIPmifJAoy5pbSASrX6sdv70G0ebM-XBmCGOIFJIWOG0Di3aWjUmWwBIfDUi4V4bQLTv3sVrTR-ZYKHGPxkwgKk9gcN3vw6+H8H4VCASNvoLRWhU3EvSWZsyMMqS+BekNTSfcj4zKfNmcknUjLZneUh-T46dnfNJXFklZn7heHtCBRQLhXxpkPuUfW2GvjcoDqaAl0WzafM2bshL5KRNmapE+SkIS-NX0C7l1ZdEA7uA6h1OcFxRV+CAA */
  id: 'routingStream',
  context: ({ input }) => ({
    currentRuleId: null,
    definition: input.definition,
    initialRouting: [],
    routing: [],
  }),
  initial: 'initializing',
  states: {
    initializing: {
      always: 'ready',
    },
    ready: {
      id: 'ready',
      initial: 'idle',
      entry: [
        { type: 'setupRouting', params: ({ context }) => ({ definition: context.definition }) },
      ],
      on: {
        'stream.received': {
          target: '#ready',
          actions: [{ type: 'storeDefinition', params: ({ event }) => event }],
          reenter: true,
        },
      },
      states: {
        idle: {
          id: 'idle',
          on: {
            'routingRule.create': {
              guard: 'canCreateRule',
              target: 'creatingNewRule',
            },
            'routingRule.edit': {
              guard: 'hasManagePrivileges',
              target: 'editingRule',
              actions: [{ type: 'storeCurrentRuleId', params: ({ event }) => event }],
            },
            'routingRule.reorder': {
              guard: 'canReorderRules',
              target: 'reorderingRules',
              actions: [{ type: 'reorderRouting', params: ({ event }) => event }],
            },
          },
        },
        creatingNewRule: {
          id: 'creatingNewRule',
          entry: [{ type: 'addNewRoutingRule' }],
          exit: [{ type: 'resetRoutingChanges' }],
          initial: 'changing',
          invoke: {
            id: 'routingSamplesMachine',
            src: 'routingSamplesMachine',
            input: ({ context }) => ({
              definition: context.definition,
              condition: selectCurrentRule(context).if,
            }),
          },
          states: {
            changing: {
              on: {
                'routingRule.cancel': {
                  target: '#idle',
                  actions: [{ type: 'resetRoutingChanges' }],
                },
                'routingRule.change': {
                  actions: enqueueActions(({ enqueue, event }) => {
                    enqueue({ type: 'patchRule', params: { routingRule: event.routingRule } });

                    // Trigger samples collection only on condition change
                    if (event.routingRule.if) {
                      enqueue.sendTo('routingSamplesMachine', {
                        type: 'routingSamples.updateCondition',
                        condition: event.routingRule.if,
                      });
                    }
                  }),
                },
                'routingRule.edit': {
                  guard: 'hasManagePrivileges',
                  target: '#editingRule',
                  actions: [{ type: 'storeCurrentRuleId', params: ({ event }) => event }],
                },
                'routingRule.fork': {
                  guard: 'canForkStream',
                  target: 'forking',
                },
                'routingRule.suggest': {
                  guard: 'hasSuggestPrivileges',
                  target: 'suggesting',
                },
              },
            },
            forking: {
              invoke: {
                id: 'forkStreamActor',
                src: 'forkStream',
                input: ({ context }) => {
                  const currentRoutingRule = selectCurrentRule(context);

                  return {
                    definition: context.definition,
                    if: currentRoutingRule.if,
                    destination: currentRoutingRule.destination,
                  };
                },
                onDone: {
                  target: '#idle',
                  actions: [{ type: 'refreshDefinition' }],
                },
                onError: {
                  target: 'changing',
                  actions: [{ type: 'notifyStreamFailure' }],
                },
              },
            },
            suggesting: {
              invoke: {
                id: 'suggestStreamActor',
                src: 'suggestStream',
                input: ({ context }) => {
                  const currentRoutingRule = selectCurrentRule(context);

                  return {
                    definition: context.definition,
                    if: currentRoutingRule.if,
                    destination: currentRoutingRule.destination,
                  };
                },
                onDone: {
                  target: '#idle',
                },
                onError: {
                  target: 'changing',
                  actions: [{ type: 'notifyStreamFailure' }],
                },
              },
            },
          },
        },
        editingRule: {
          id: 'editingRule',
          initial: 'changing',
          exit: [{ type: 'resetRoutingChanges' }],
          states: {
            changing: {
              on: {
                'routingRule.create': {
                  guard: 'hasSimulatePrivileges',
                  target: '#creatingNewRule',
                },
                'routingRule.cancel': {
                  target: '#idle',
                  actions: [{ type: 'resetRoutingChanges' }],
                },
                'routingRule.change': {
                  actions: [{ type: 'patchRule', params: ({ event }) => event }],
                },
                'routingRule.edit': [
                  {
                    guard: { type: 'isAlreadyEditing', params: ({ event }) => event },
                    target: '#idle',
                    actions: [{ type: 'storeCurrentRuleId', params: { id: null } }],
                  },
                  {
                    actions: [{ type: 'storeCurrentRuleId', params: ({ event }) => event }],
                  },
                ],
                'routingRule.remove': {
                  guard: 'hasManagePrivileges',
                  target: 'removingRule',
                },
                'routingRule.save': {
                  guard: 'canUpdateStream',
                  target: 'updatingRule',
                },
              },
            },
            removingRule: {
              invoke: {
                id: 'deleteStreamActor',
                src: 'deleteStream',
                input: ({ context }) => ({
                  name: selectCurrentRule(context).destination,
                }),
                onDone: {
                  target: '#idle',
                  actions: [{ type: 'refreshDefinition' }],
                },
                onError: {
                  target: 'changing',
                },
              },
            },
            updatingRule: {
              invoke: {
                id: 'upsertStreamActor',
                src: 'upsertStream',
                input: ({ context }) => ({
                  definition: context.definition,
                  routing: context.routing.map(routingConverter.toAPIDefinition),
                }),
                onDone: {
                  target: '#idle',
                  actions: [{ type: 'notifyStreamSuccess' }, { type: 'refreshDefinition' }],
                },
                onError: {
                  target: 'changing',
                  actions: [{ type: 'notifyStreamFailure' }],
                },
              },
            },
          },
        },
        reorderingRules: {
          id: 'reorderingRules',
          initial: 'reordering',
          states: {
            reordering: {
              on: {
                'routingRule.reorder': {
                  actions: [{ type: 'reorderRouting', params: ({ event }) => event }],
                },
                'routingRule.cancel': {
                  target: '#idle',
                  actions: [{ type: 'resetRoutingChanges' }],
                },
                'routingRule.save': {
                  guard: 'canUpdateStream',
                  target: 'updatingStream',
                },
              },
            },
            updatingStream: {
              invoke: {
                id: 'upsertStreamActor',
                src: 'upsertStream',
                input: ({ context }) => ({
                  definition: context.definition,
                  routing: context.routing.map(routingConverter.toAPIDefinition),
                }),
                onDone: {
                  target: '#idle',
                  actions: [{ type: 'notifyStreamSuccess' }, { type: 'refreshDefinition' }],
                },
                onError: {
                  target: 'reordering',
                  actions: [{ type: 'notifyStreamFailure' }],
                },
              },
            },
          },
        },
      },
    },
  },
});

export const createStreamRoutingMachineImplementations = ({
  refreshDefinition,
  streamsRepositoryClient,
  changeRequestsRepositoryClient,
  core,
  data,
  timeState$,
  forkSuccessNotifier,
  suggestSuccessNotifier,
}: StreamRoutingServiceDependencies): MachineImplementationsFrom<typeof streamRoutingMachine> => ({
  actors: {
    deleteStream: createDeleteStreamActor({ streamsRepositoryClient }),
    forkStream: createForkStreamActor({ streamsRepositoryClient, forkSuccessNotifier }),
    suggestStream: createSuggestStreamActor({
      changeRequestsRepositoryClient,
      suggestSuccessNotifier,
    }),
    upsertStream: createUpsertStreamActor({ streamsRepositoryClient }),
    routingSamplesMachine: routingSamplesMachine.provide(
      createRoutingSamplesMachineImplementations({
        data,
        timeState$,
      })
    ),
  },
  actions: {
    refreshDefinition,
    notifyStreamSuccess: createStreamSuccessNotifier({
      toasts: core.notifications.toasts,
    }),
    notifyStreamFailure: createStreamFailureNotifier({
      toasts: core.notifications.toasts,
    }),
  },
  guards: {
    hasSuggestPrivileges: () =>
      core.application.capabilities.streams.create_streams_change_requests as boolean,
  },
});
