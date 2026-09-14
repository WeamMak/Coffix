const israel = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export class InvalidAppointmentTime extends Error {}
export function israelInput(value: string | null): string {
  if (!value) return '';
  const parts = Object.fromEntries(israel.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function israelInstant(value: string): string {
  const wall = Date.parse(`${value}Z`);
  if (!Number.isFinite(wall)) throw new InvalidAppointmentTime('בחרו תאריך ושעה תקינים.');
  let guess = wall;
  for (let attempt = 0; attempt < 2; attempt++) guess += wall - Date.parse(`${israelInput(new Date(guess).toISOString())}Z`);
  const matches = [guess - 3600000, guess, guess + 3600000].filter((instant) => israelInput(new Date(instant).toISOString()) === value);
  if (matches.length !== 1) throw new InvalidAppointmentTime('השעה שבחרתם חסרה או מופיעה פעמיים עקב מעבר לשעון קיץ או חורף. בחרו שעה אחרת.');
  return new Date(matches[0]).toISOString();
}
