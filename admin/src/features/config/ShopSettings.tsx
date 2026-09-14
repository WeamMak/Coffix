import { Link } from 'react-router-dom';
import { ProblemBanner } from '../../components/ProblemBanner';
import { money, useStaffQuery, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

export function ShopSettings() {
  const query = useStaffQuery<Schema['ConfigurationRead']>('/admin/configuration');
  return <section><h1>הגדרות החנות</h1><ConfigurationNav /><ProblemBanner error={query.error} />
    {query.data ? <div className="record-layout"><div>
      <section className="editor-panel"><h2>כתובת להבאת המכונה</h2><p className="field-caption">כתובת החנות</p><address className="readonly-value" dir="auto">{Object.values(query.data.shop_address).filter((value) => typeof value === 'string').join(', ')}</address></section>
      <section className="editor-panel"><h2>משלוח מוצרים</h2><p className="field-caption">דמי משלוח מוצרים</p><p className="readonly-value">{money(query.data.shipping_fee_agorot)}</p><p className="subtle-notice">לאיסוף לצורך שירות אין חיוב נפרד. בקשות קיימות שומרות על הכתובת והחיובים שנרשמו בהן.</p></section>
    </div><aside className="editor-panel"><h2>ניהול ההגדרות</h2><p>הנתונים מוצגים לקריאה בלבד. לעדכון כתובת החנות או דמי המשלוח פנו למנהל המערכת.</p><Link className="secondary-link" to="/configuration/intake">עריכת חלונות מועדפים וזמן תגובה</Link></aside></div> : query.isPending ? <p role="status">טוענים את הגדרות החנות…</p> : null}
  </section>;
}
