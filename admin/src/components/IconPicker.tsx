import { useId, useState } from 'react';
import type { components } from '@coffix/api-client';

const wrench = <path d="M14 5a5 5 0 0 0-6 6l-5 5a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z" />;
const icons = {
  coffee: { label: 'Coffee', drawing: <><path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2M15 3v2M2 22h18" /></> },
  'coffee-bean': { label: 'Coffee beans', drawing: <><ellipse cx="12" cy="12" rx="7" ry="10" transform="rotate(35 12 12)" /><path d="M17 4C7 7 17 17 7 20" /></> },
  capsule: { label: 'Capsules', drawing: <><path d="M4 6h16M6 6l2 14h8l2-14M4 3h16v3H4Z" /><path d="M10 9v8M14 9v8" /></> },
  settings: { label: 'Settings', drawing: <><circle cx="12" cy="12" r="4" /><path d="M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1Z" transform="translate(1 0) scale(.92)" /></> },
  sparkles: { label: 'Sparkles', drawing: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM4 2v4M2 4h4M20 18v4M18 20h4" /> },
  wrench: { label: 'Wrench', drawing: wrench },
  tool: { label: 'Tool', drawing: wrench },
  sun: { label: 'Sun', drawing: <><circle cx="12" cy="12" r="4" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" /></> },
  star: { label: 'Star', drawing: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" /> },
  shield: { label: 'Shield', drawing: <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z" /> },
  info: { label: 'Information', drawing: <><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7v.1" /></> },
  droplet: { label: 'Droplet', drawing: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" /> },
  zap: { label: 'Lightning', drawing: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" /> },
};
type IconKey = keyof typeof icons;
export const categoryIcons = ['coffee', 'coffee-bean', 'capsule', 'settings', 'sparkles', 'wrench'] as const;
export const serviceIcons = ['tool', 'sun', 'star', 'shield', 'info', 'droplet', 'settings', 'coffee', 'zap'] as const satisfies readonly components['schemas']['ServiceTypeRead']['icon_key'][];

export function IconPicker({ label, name, choices, initialValue, allowNone = false }: {
  label: string; name: string; choices: readonly IconKey[]; initialValue?: string | null; allowNone?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState(initialValue ?? (allowNone ? '' : choices[0]));
  const selected = choices.find((key) => key === value);
  const icon = selected ? icons[selected] : null;
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} name={name} value={value} onChange={(event) => setValue(event.target.value)}>
      {allowNone ? <option value="">No icon</option> : null}
      {value && !selected ? <option value={value}>Current icon (unavailable)</option> : null}
      {choices.map((key) => <option key={key} value={key}>{icons[key].label}</option>)}
    </select>
    <div className="icon-preview" aria-live="polite">
      {icon ? <><svg role="img" aria-label={`${icon.label} icon preview`} viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{icon.drawing}</svg><span>{icon.label}</span></> : <span>{value ? 'Preview unavailable. Select a supported icon to replace it.' : 'No icon selected.'}</span>}
    </div>
  </div>;
}
