import { ApiClientError } from '@coffix/api-client';
import { errorMessage } from '../api/errors';

export function ProblemBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const stale = error instanceof ApiClientError && ['conflict', 'record_changed', 'stock_changed', 'service_intake_version_conflict', 'service_type_version_conflict', 'assignment_changed'].includes(error.problem.code.toLowerCase());
  return (
    <div role="alert" className="problem-banner" data-tone={stale ? 'warning' : 'danger'}>
      <p>{errorMessage(error)}</p>
      {error instanceof ApiClientError && error.problem.correlationId !== 'unknown'
        ? <small>אסמכתה לתמיכה: <bdi dir="ltr">{error.problem.correlationId}</bdi></small> : null}
    </div>
  );
}
