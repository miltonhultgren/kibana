/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../../common/ftr_provider_context';
import { ObjectRemover as ActionsRemover } from '../../../../alerting_api_integration/common/lib';

import { CASE_CONFIGURE_URL, CASES_URL } from '../../../../../plugins/case/common/constants';
import {
  postCaseReq,
  defaultUser,
  postCommentUserReq,
  postCollectionReq,
} from '../../../common/lib/mock';
import {
  deleteCases,
  deleteCasesUserActions,
  deleteComments,
  deleteConfiguration,
  getConfiguration,
  getServiceNowConnector,
} from '../../../common/lib/utils';
import {
  ExternalServiceSimulator,
  getExternalServiceSimulatorPath,
} from '../../../../alerting_api_integration/common/fixtures/plugins/actions_simulators/server/plugin';
import { CaseStatuses } from '../../../../../plugins/case/common/api';

// eslint-disable-next-line import/no-default-export
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const kibanaServer = getService('kibanaServer');
  const es = getService('es');

  describe('push_case', () => {
    const actionsRemover = new ActionsRemover(supertest);

    let servicenowSimulatorURL: string = '<could not determine kibana url>';
    before(() => {
      servicenowSimulatorURL = kibanaServer.resolveUrl(
        getExternalServiceSimulatorPath(ExternalServiceSimulator.SERVICENOW)
      );
    });

    afterEach(async () => {
      await deleteCases(es);
      await deleteComments(es);
      await deleteConfiguration(es);
      await deleteCasesUserActions(es);
      await actionsRemover.removeAll();
    });

    it('should push a case', async () => {
      const { body: connector } = await supertest
        .post('/api/actions/action')
        .set('kbn-xsrf', 'true')
        .send({
          ...getServiceNowConnector(),
          config: { apiUrl: servicenowSimulatorURL },
        })
        .expect(200);

      actionsRemover.add('default', connector.id, 'action', 'actions');
      await supertest
        .post(CASE_CONFIGURE_URL)
        .set('kbn-xsrf', 'true')
        .send(
          getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
          })
        )
        .expect(200);

      const { body: postedCase } = await supertest
        .post(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...postCaseReq,
          connector: getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
            fields: {
              urgency: '2',
              impact: '2',
              severity: '2',
              category: 'software',
              subcategory: 'os',
            },
          }).connector,
        })
        .expect(200);

      const { body } = await supertest
        .post(`${CASES_URL}/${postedCase.id}/connector/${connector.id}/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { pushed_at, external_url, ...rest } = body.external_service;

      expect(rest).to.eql({
        pushed_by: defaultUser,
        connector_id: connector.id,
        connector_name: connector.name,
        external_id: '123',
        external_title: 'INC01',
      });

      // external_url is of the form http://elastic:changeme@localhost:5620 which is different between various environments like Jekins
      expect(
        external_url.includes(
          'api/_actions-FTS-external-service-simulators/servicenow/nav_to.do?uri=incident.do?sys_id=123'
        )
      ).to.equal(true);
    });

    it('pushes a comment appropriately', async () => {
      const { body: connector } = await supertest
        .post('/api/actions/action')
        .set('kbn-xsrf', 'true')
        .send({
          ...getServiceNowConnector(),
          config: { apiUrl: servicenowSimulatorURL },
        })
        .expect(200);

      actionsRemover.add('default', connector.id, 'action', 'actions');

      await supertest
        .post(CASE_CONFIGURE_URL)
        .set('kbn-xsrf', 'true')
        .send(
          getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
          })
        )
        .expect(200);

      const { body: postedCase } = await supertest
        .post(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...postCaseReq,
          connector: getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
            fields: {
              urgency: '2',
              impact: '2',
              severity: '2',
              category: 'software',
              subcategory: 'os',
            },
          }).connector,
        })
        .expect(200);

      await supertest
        .post(`${CASES_URL}/${postedCase.id}/comments`)
        .set('kbn-xsrf', 'true')
        .send(postCommentUserReq)
        .expect(200);

      const { body } = await supertest
        .post(`${CASES_URL}/${postedCase.id}/connector/${connector.id}/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(200);

      expect(body.comments[0].pushed_by).to.eql(defaultUser);
    });

    it('should pushes a case and closes when closure_type: close-by-pushing', async () => {
      const { body: connector } = await supertest
        .post('/api/actions/action')
        .set('kbn-xsrf', 'true')
        .send({
          ...getServiceNowConnector(),
          config: { apiUrl: servicenowSimulatorURL },
        })
        .expect(200);

      actionsRemover.add('default', connector.id, 'action', 'actions');
      await supertest
        .post(CASE_CONFIGURE_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
          }),
          closure_type: 'close-by-pushing',
        })
        .expect(200);

      const { body: postedCase } = await supertest
        .post(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...postCaseReq,
          connector: getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
            fields: {
              urgency: '2',
              impact: '2',
              severity: '2',
              category: 'software',
              subcategory: 'os',
            },
          }).connector,
        })
        .expect(200);

      const { body } = await supertest
        .post(`${CASES_URL}/${postedCase.id}/connector/${connector.id}/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(200);

      expect(body.status).to.eql('closed');
    });

    it('should push a collection case but not close it when closure_type: close-by-pushing', async () => {
      const { body: connector } = await supertest
        .post('/api/actions/action')
        .set('kbn-xsrf', 'true')
        .send({
          ...getServiceNowConnector(),
          config: { apiUrl: servicenowSimulatorURL },
        })
        .expect(200);

      actionsRemover.add('default', connector.id, 'action', 'actions');
      await supertest
        .post(CASE_CONFIGURE_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
          }),
          closure_type: 'close-by-pushing',
        })
        .expect(200);

      const { body: postedCase } = await supertest
        .post(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...postCollectionReq,
          connector: getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
            fields: {
              urgency: '2',
              impact: '2',
              severity: '2',
              category: 'software',
              subcategory: 'os',
            },
          }).connector,
        })
        .expect(200);

      const { body } = await supertest
        .post(`${CASES_URL}/${postedCase.id}/connector/${connector.id}/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(200);

      expect(body.status).to.eql(CaseStatuses.open);
    });

    it('unhappy path - 404s when case does not exist', async () => {
      await supertest
        .post(`${CASES_URL}/fake-id/connector/fake-connector/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(404);
    });

    it('unhappy path - 404s when connector does not exist', async () => {
      const { body: postedCase } = await supertest
        .post(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...postCaseReq,
          connector: getConfiguration().connector,
        })
        .expect(200);

      await supertest
        .post(`${CASES_URL}/${postedCase.id}/connector/fake-connector/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(404);
    });

    it('unhappy path = 409s when case is closed', async () => {
      const { body: connector } = await supertest
        .post('/api/actions/action')
        .set('kbn-xsrf', 'true')
        .send({
          ...getServiceNowConnector(),
          config: { apiUrl: servicenowSimulatorURL },
        })
        .expect(200);

      actionsRemover.add('default', connector.id, 'action', 'actions');

      await supertest
        .post(CASE_CONFIGURE_URL)
        .set('kbn-xsrf', 'true')
        .send(
          getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
          })
        )
        .expect(200);

      const { body: postedCase } = await supertest
        .post(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          ...postCaseReq,
          connector: getConfiguration({
            id: connector.id,
            name: connector.name,
            type: connector.actionTypeId,
            fields: {
              urgency: '2',
              impact: '2',
              severity: '2',
              category: 'software',
              subcategory: 'os',
            },
          }).connector,
        })
        .expect(200);

      await supertest
        .patch(CASES_URL)
        .set('kbn-xsrf', 'true')
        .send({
          cases: [
            {
              id: postedCase.id,
              version: postedCase.version,
              status: 'closed',
            },
          ],
        })
        .expect(200);

      await supertest
        .post(`${CASES_URL}/${postedCase.id}/connector/${connector.id}/_push`)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(409);
    });
  });
};
