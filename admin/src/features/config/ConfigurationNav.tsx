import { NavLink } from 'react-router-dom';
export function ConfigurationNav() {
  return <nav className="section-nav" aria-label="הגדרות"><NavLink to="/configuration" end>דגמי מכונות</NavLink><NavLink to="/configuration/service-types">סוגי שירות</NavLink><NavLink to="/configuration/intake">הגדרות קבלת שירות</NavLink><NavLink to="/configuration/shop">הגדרות החנות</NavLink></nav>;
}
