import React from 'react';
import { Card, CardBody, CardHeader, Chip } from '@heroui/react';

const STATUS_COLOR = {
  success: 'success',
  ready: 'success',
  valid: 'success',
  failed: 'danger',
  invalid: 'danger',
  running: 'warning',
  queued: 'warning',
  partial: 'warning',
  not_started: 'default'
};

function getStatusColor(status) {
  const key = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return STATUS_COLOR[key] || 'default';
}

export function JobStatusPanel({ title, status, errorMessage, meta }) {
  const safeStatus = status || 'unknown';

  return (
    <Card className="panel-card">
      <CardHeader className="pb-1">
        <h3 className="text-base font-semibold">{title}</h3>
      </CardHeader>
      <CardBody className="gap-3 pt-1">
        <Chip size="sm" variant="flat" color={getStatusColor(safeStatus)}>
          status: {safeStatus}
        </Chip>
        {errorMessage ? <p className="text-sm text-danger">{errorMessage}</p> : <p className="muted">No errors.</p>}
        {meta ? <pre className="meta">{JSON.stringify(meta, null, 2)}</pre> : null}
      </CardBody>
    </Card>
  );
}
