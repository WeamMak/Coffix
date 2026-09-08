import { ApiClientError } from '@coffix/api-client';
import { errorMessage } from '../api/errors';

export function ProblemBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="problem-banner">
      <p>{errorMessage(error)}</p>
      {error instanceof ApiClientError && error.problem.correlationId !== 'unknown'
        ? <small>Reference: {error.problem.correlationId}</small> : null}
    </div>
  );
}
