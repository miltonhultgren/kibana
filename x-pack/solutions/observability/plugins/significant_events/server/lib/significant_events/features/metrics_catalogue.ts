/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BasicPrettyPrinter, Builder } from '@elastic/esql';
import { MAX_ID_LENGTH, METRIC_FEATURE_TYPE } from '@kbn/significant-events-schema';

export const METRICS_CATALOGUE_PAGE_SIZE = 25;

export interface MetricsCatalogueRow {
  metricName: string;
  dataStream: string;
  unit: string;
  metricType: string;
  fieldType: string;
  dimensionFields: string[];
}

export interface MetricFieldSource {
  type: string;
  id: string;
  properties?: Record<string, unknown>;
}

interface EsqlTable {
  columns: Array<{ name: string }>;
  values: unknown[][];
}

export function normalizeMetricKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeDimensionFields(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const fields = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
  return [...new Set(fields.map((field) => field.trim()))];
}

export function buildMetricsInfoQuery(source: string): string {
  return BasicPrettyPrinter.print(
    Builder.expression.query([
      Builder.command({
        name: 'ts',
        args: [Builder.expression.source.index(source)],
      }),
      Builder.command({
        name: 'metrics_info',
        args: [],
      }),
    ])
  );
}

const cellString = (value: unknown): string => (typeof value === 'string' ? value : '');

const boundedText = (value: string): string => value.slice(0, MAX_ID_LENGTH);

export function parseMetricsInfoResponse(response: EsqlTable | undefined): MetricsCatalogueRow[] {
  if (!response) {
    return [];
  }

  const indexOf = (name: string) => response.columns.findIndex((column) => column.name === name);
  const nameIdx = indexOf('metric_name');
  if (nameIdx === -1) {
    return [];
  }

  const dataStreamIdx = indexOf('data_stream');
  const unitIdx = indexOf('unit');
  const metricTypeIdx = indexOf('metric_type');
  const fieldTypeIdx = indexOf('field_type');
  const dimensionIdx = indexOf('dimension_fields');

  const rows: MetricsCatalogueRow[] = [];
  for (const row of response.values) {
    const metricName = cellString(row[nameIdx]).trim();
    if (metricName.length === 0) {
      continue;
    }
    rows.push({
      metricName,
      dataStream: dataStreamIdx === -1 ? '' : boundedText(cellString(row[dataStreamIdx])),
      unit: unitIdx === -1 ? '' : boundedText(cellString(row[unitIdx])),
      metricType: metricTypeIdx === -1 ? '' : boundedText(cellString(row[metricTypeIdx])),
      fieldType: fieldTypeIdx === -1 ? '' : boundedText(cellString(row[fieldTypeIdx])),
      dimensionFields: dimensionIdx === -1 ? [] : normalizeDimensionFields(row[dimensionIdx]),
    });
  }

  return rows;
}

const mergeDataStream = (current: string, next: string): string => {
  const incoming = boundedText(next);
  if (incoming.length === 0 || current === incoming) {
    return current;
  }
  if (current.length === 0) {
    return incoming;
  }
  const parts = current.split(', ');
  if (parts.includes(incoming)) {
    return current;
  }
  const merged = `${current}, ${incoming}`;
  return merged.length <= MAX_ID_LENGTH ? merged : current;
};

export function dedupeCatalogueRows(rows: readonly MetricsCatalogueRow[]): MetricsCatalogueRow[] {
  const byName = new Map<string, MetricsCatalogueRow>();
  for (const row of rows) {
    const key = normalizeMetricKey(row.metricName);
    if (key.length === 0) {
      continue;
    }
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...row, dimensionFields: [...row.dimensionFields] });
      continue;
    }
    existing.dataStream = mergeDataStream(existing.dataStream, row.dataStream);
    existing.dimensionFields = [
      ...new Set([...existing.dimensionFields, ...row.dimensionFields]),
    ].sort((left, right) => left.localeCompare(right));
    if (existing.unit.length === 0) {
      existing.unit = row.unit;
    }
    if (existing.metricType.length === 0) {
      existing.metricType = row.metricType;
    }
    if (existing.fieldType.length === 0) {
      existing.fieldType = row.fieldType;
    }
  }
  return [...byName.values()];
}

export function knownMetricFieldKeys(features: readonly MetricFieldSource[]): Set<string> {
  const keys = new Set<string>();
  for (const feature of features) {
    if (feature.type !== METRIC_FEATURE_TYPE) {
      continue;
    }
    const idKey = normalizeMetricKey(feature.id);
    if (idKey.length > 0) {
      keys.add(idKey);
    }
    const field = feature.properties?.field;
    if (typeof field === 'string') {
      const fieldKey = normalizeMetricKey(field);
      if (fieldKey.length > 0) {
        keys.add(fieldKey);
      }
    }
  }
  return keys;
}

export function pageMetricsCatalogue({
  rows,
  knownMetricFields,
  pageSize = METRICS_CATALOGUE_PAGE_SIZE,
}: {
  rows: readonly MetricsCatalogueRow[];
  knownMetricFields: ReadonlySet<string>;
  pageSize?: number;
}): { page: MetricsCatalogueRow[]; remaining: number } {
  const size = Math.max(0, Math.floor(pageSize));
  const unseen = dedupeCatalogueRows(rows)
    .filter((row) => !knownMetricFields.has(normalizeMetricKey(row.metricName)))
    .sort(
      (left, right) =>
        left.metricName.localeCompare(right.metricName) ||
        left.dataStream.localeCompare(right.dataStream)
    );
  const page = unseen.slice(0, size);
  return { page, remaining: unseen.length - page.length };
}
