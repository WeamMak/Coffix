import type { MachineCreate } from './api';

export type MachineRegisterForm = {
  machineModelId: string;
  mediaId: string | null;
  purchaseDate: string;
  serialNumber: string;
};

export type MachineRegisterFormErrors = Partial<
  Record<'machineModelId' | 'purchaseDate' | 'serialNumber', string>
>;

export const emptyMachineRegisterForm: MachineRegisterForm = {
  machineModelId: '',
  mediaId: null,
  purchaseDate: '',
  serialNumber: '',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateMachineRegisterForm(
  values: MachineRegisterForm,
  now: Date = new Date(),
): MachineRegisterFormErrors {
  const errors: MachineRegisterFormErrors = {};
  if (!values.machineModelId) {
    errors.machineModelId = 'יש לבחור דגם מכונה.';
  }
  const serialNumber = values.serialNumber.trim();
  if (!serialNumber) {
    errors.serialNumber = 'יש להזין מספר סידורי.';
  } else if (serialNumber.length > 160) {
    errors.serialNumber = 'מספר סידורי ארוך מדי.';
  }
  const purchaseDate = values.purchaseDate.trim();
  if (purchaseDate) {
    if (!ISO_DATE.test(purchaseDate) || !isRealCalendarDate(purchaseDate)) {
      errors.purchaseDate = 'יש להזין תאריך תקין בפורמט שנה-חודש-יום, לדוגמה 2025-05-06.';
    } else if (purchaseDate > now.toISOString().slice(0, 10)) {
      errors.purchaseDate = 'תאריך הרכישה לא יכול להיות בעתיד.';
    }
  }
  return errors;
}

export function toMachineCreate(values: MachineRegisterForm): MachineCreate {
  if (Object.keys(validateMachineRegisterForm(values)).length > 0) {
    throw new Error('Machine registration form must be valid before conversion');
  }
  return {
    machine_model_id: values.machineModelId,
    media_id: values.mediaId,
    purchase_date: values.purchaseDate.trim() || null,
    serial_number: values.serialNumber.trim(),
  };
}
