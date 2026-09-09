import { useParams } from 'react-router-dom';
import { ServiceRecord } from '../service/ServiceDetail';

export function JobDetail() {
  const { requestId = '' } = useParams();
  return <ServiceRecord key={requestId} requestId={requestId} technician />;
}
