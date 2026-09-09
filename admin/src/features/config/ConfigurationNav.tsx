import { NavLink } from 'react-router-dom';
export function ConfigurationNav() {
  return <nav className="section-nav" aria-label="Configuration"><NavLink to="/configuration" end>Machine models</NavLink><NavLink to="/configuration/service-types">Service types</NavLink><NavLink to="/configuration/intake">Service intake</NavLink><NavLink to="/configuration/shop">Shop settings</NavLink></nav>;
}
