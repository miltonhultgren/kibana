/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ImplicitCollectionOptions } from '.';
import { Collector, CollectorOptions } from './collectors';
import { Asset } from '../../../common/types_api';
import { LOGS_INDICES, METRICS_INDICES, APM_INDICES } from '../../constants';

function addRemotePrefix(prefix: string, indices: string) {
  return indices
    .split(',')
    .map((index) => `${prefix}:${index}`)
    .join(',');
}
export class CollectorRunner {
  private collectors: Array<{ name: string; collector: Collector }> = [];
  private indices: CollectorOptions['indices'];

  constructor(private options: ImplicitCollectionOptions) {
    if (options.remotePrefix) {
      this.indices = {
        metrics: addRemotePrefix(options.remotePrefix, METRICS_INDICES),
        logs: addRemotePrefix(options.remotePrefix, LOGS_INDICES),
        traces: addRemotePrefix(options.remotePrefix, APM_INDICES),
      };
    } else {
      this.indices = {
        metrics: METRICS_INDICES,
        logs: LOGS_INDICES,
        traces: APM_INDICES,
      };
    }
  }

  registerCollector(name: string, collector: Collector) {
    this.collectors.push({ name, collector });
  }

  async run() {
    const collectorOptions = {
      client: this.options.inputClient,
      from: Date.now() - this.options.intervalMs,
      indices: this.indices,
    };

    for (let i = 0; i < this.collectors.length; i++) {
      const { name, collector } = this.collectors[i];
      this.options.logger.info(`Collector '${name}' started`);

      const assets = await collector(collectorOptions)
        .then((collectedAssets) => {
          this.options.logger.info(`Collector '${name}' found ${collectedAssets.length} assets`);
          return collectedAssets;
        })
        .catch((err) => {
          this.options.logger.error(`Collector '${name}' execution failure: ${err}`);
          return [];
        });

      if (assets.length) {
        const bulkBody = assets.flatMap((asset: Asset) => {
          return [{ create: { _index: `assets-${asset['asset.kind']}-default` } }, asset];
        });

        await this.options.outputClient
          .bulk({ body: bulkBody })
          .then((res) => {
            if (res.errors) {
              this.options.logger.error(
                `Failure writing assets documents from collector '${name}': ${JSON.stringify(res)}`
              );
            }
          })
          .catch((err) => {
            this.options.logger.error(
              `Failure writing assets documents from collector '${name}': ${err}`
            );
          });
      }
    }
  }
}
