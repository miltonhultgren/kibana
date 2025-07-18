/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBetaBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageHeader,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../hooks/use_kibana';

import { MyRequestsTable } from './my_requests_table';
import { ReviewTable } from './review_table';
import { StreamsAppPageTemplate } from '../streams_app_page_template';
import { useStreamsAppBreadcrumbs } from '../../hooks/use_streams_app_breadcrumbs';

export const ChangeRequestsPage = () => {
  const {
    core,
    dependencies: {
      start: {
        changeRequests: { changeRequestsRepositoryClient },
      },
    },
  } = useKibana();

  const canManage = core.application.capabilities.streams.manage_streams_change_requests;

  const { euiTheme } = useEuiTheme();

  useStreamsAppBreadcrumbs(() => {
    return [
      {
        title: i18n.translate('xpack.streams.changeRequests.changeRequestsTitle', {
          defaultMessage: 'Change requests',
        }),
        path: '/change-requests',
      },
    ];
  }, []);

  return (
    <>
      <EuiPageHeader
        paddingSize="l"
        css={css`
          background: ${euiTheme.colors.backgroundBasePlain};
          .euiSpacer--l {
            display: none !important;
          }
        `}
        pageTitle={
          <EuiFlexGroup
            alignItems="center"
            gutterSize="m"
            css={css`
              margin-bottom: ${euiTheme.size.s};
            `}
          >
            <FormattedMessage
              id="xpack.streams.changeRequests.changeRequestsTitle"
              defaultMessage="Change requests"
            />
            <EuiBetaBadge
              label={i18n.translate('xpack.streams.changeRequests.betaBadgeLabel', {
                defaultMessage: 'Technical Preview',
              })}
              tooltipContent={i18n.translate('xpack.streams.changeRequests.betaBadgeDescription', {
                defaultMessage:
                  'This functionality is experimental and not supported. It may change or be removed at any time.',
              })}
              alignment="middle"
              size="s"
            />
          </EuiFlexGroup>
        }
      >
        <p
          css={css`
            margin: 0 0 ${euiTheme.size.s} 0;
            font-size: ${euiTheme.font.scale.s};
            color: ${euiTheme.colors.textSubdued};
            line-height: ${euiTheme.size.l};
          `}
        >
          {i18n.translate('xpack.streams.changeRequests.pageHeaderDescription', {
            defaultMessage:
              'Use Change Requests to suggest changes to Streams. As an admin, you can review these requests and either approve or reject them.',
          })}
        </p>
      </EuiPageHeader>

      <StreamsAppPageTemplate.Body grow>
        <EuiFlexGroup gutterSize="l" direction="column">
          {canManage && (
            <EuiFlexItem grow={0}>
              <EuiTitle size="s">
                <h2>To review</h2>
              </EuiTitle>
              <EuiSpacer size="m" />
              <ReviewTable
                changeRequestsRepositoryClient={changeRequestsRepositoryClient}
                coreStart={core}
              />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={0}>
            <EuiTitle size="s">
              <h2>My requests</h2>
            </EuiTitle>
            <EuiSpacer size="m" />
            <MyRequestsTable
              changeRequestsRepositoryClient={changeRequestsRepositoryClient}
              coreStart={core}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </StreamsAppPageTemplate.Body>
    </>
  );
};
