import { Link } from 'react-router-dom';
import { ProblemBanner } from '../../components/ProblemBanner';
import { money, useStaffQuery, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

export function ShopSettings() {
  const query = useStaffQuery<Schema['ConfigurationRead']>('/admin/configuration');
  return <section><h1>Shop settings</h1><ConfigurationNav /><ProblemBanner error={query.error} />
    {query.data ? <section className="editor-panel"><h2>Bring-in address</h2><address dir="auto">{Object.values(query.data.shop_address).filter((value) => typeof value === 'string').join(', ')}</address><h2>Product shipping fee</h2><p>{money(query.data.shipping_fee_agorot)}</p><p>These values are managed in the deployment configuration. Contact the operator to update the shop address or shipping fee.</p><p>Service pickup has no separate fee. Existing requests retain their recorded address and fee snapshots.</p><Link to="/configuration/intake">Edit preferred slots and response hours</Link></section> : query.isPending ? <p role="status">Loading shop settings…</p> : null}
  </section>;
}
