/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Asset } from '../../../../common/types_api';
import { CollectorOptions } from '.';

export async function collectContainers({ client, from, indices }: CollectorOptions) {
  const dsl = {
    index: [indices.traces, indices.metrics, indices.logs],
    size: 1000,
    collapse: {
      field: 'container.id',
    },
    sort: [{ _score: 'desc' }, { '@timestamp': 'desc' }],
    _source: false,
    fields: [
      'kubernetes.*',
      'cloud.provider',
      'orchestrator.cluster.name',
      'host.name',
      'host.hostname',
    ],
    query: {
      bool: {
        filter: [
          {
            range: {
              '@timestamp': {
                gte: from,
              },
            },
          },
        ],
        should: [
          { exists: { field: 'kubernetes.container.id' } },
          { exists: { field: 'kubernetes.pod.uid' } },
          { exists: { field: 'kubernetes.node.name' } },
          { exists: { field: 'host.hostname' } },
        ],
      },
    },
  };

  const esResponse = await client.search(dsl);

  const containers = esResponse.hits.hits.reduce<Asset[]>((acc: Asset[], hit: any) => {
    const { fields = {} } = hit;
    const containerId = fields['container.id'];
    const podUid = fields['kubernetes.pod.uid'];
    const nodeName = fields['kubernetes.node.name'];

    const parentEan = podUid ? `pod:${podUid}` : `host:${fields['host.hostname']}`;

    const container: Asset = {
      '@timestamp': new Date().toISOString(),
      'asset.kind': 'container',
      'asset.id': containerId,
      'asset.ean': `container:${containerId}`,
      'asset.parents': [parentEan],
    };

    if (nodeName) {
      container['asset.references'] = [`host:${nodeName}`];
    }

    acc.push(container);

    return acc;
  }, []);

  return containers;
}
