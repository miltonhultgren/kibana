/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transactionGroupsFetcher } from './fetcher';
import {
  SearchParamsMock,
  inspectSearchParams,
} from '../../utils/test_helpers';

describe('transaction group queries', () => {
  let mock: SearchParamsMock;

  afterEach(() => {
    mock.teardown();
  });

  it('fetches top transactions', async () => {
    const bucketSize = 100;
    mock = await inspectSearchParams((setup) =>
      transactionGroupsFetcher(
        {
          type: 'top_transactions',
          serviceName: 'foo',
          transactionType: 'bar',
          searchAggregatedTransactions: false,
        },
        setup,
        bucketSize
      )
    );

    const allParams = mock.spy.mock.calls.map((call) => call[0]);

    expect(allParams).toMatchSnapshot();
  });

  it('fetches top traces', async () => {
    const bucketSize = 100;
    mock = await inspectSearchParams((setup) =>
      transactionGroupsFetcher(
        {
          type: 'top_traces',
          searchAggregatedTransactions: false,
        },
        setup,
        bucketSize
      )
    );

    const allParams = mock.spy.mock.calls.map((call) => call[0]);

    expect(allParams).toMatchSnapshot();
  });
});
