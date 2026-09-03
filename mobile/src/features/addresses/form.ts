import { normalizeIsraeliPhone } from '../auth/api';
import type { AddressCreate } from './api';

export type AddressForm = {
  apartment: string;
  building: string;
  city: string;
  isDefault: boolean;
  phone: string;
  postalCode: string;
  recipientName: string;
  street: string;
};

export type AddressFormErrors = Partial<Record<keyof AddressForm, string>>;

export const emptyAddressForm: AddressForm = {
  apartment: '',
  building: '',
  city: '',
  isDefault: false,
  phone: '',
  postalCode: '',
  recipientName: '',
  street: '',
};

export function validateAddressForm(values: AddressForm): AddressFormErrors {
  const errors: AddressFormErrors = {};
  if (!values.recipientName.trim()) {
    errors.recipientName = 'יש להזין שם מקבל או מקבלת.';
  }
  if (!normalizeIsraeliPhone(values.phone)) {
    errors.phone = 'יש להזין מספר טלפון ישראלי תקין.';
  }
  if (!values.street.trim()) {
    errors.street = 'יש להזין רחוב.';
  }
  if (!values.building.trim()) {
    errors.building = 'יש להזין מספר בית.';
  }
  if (!values.city.trim()) {
    errors.city = 'יש להזין עיר.';
  }
  return errors;
}

export function toAddressCreate(values: AddressForm): AddressCreate {
  const phone = normalizeIsraeliPhone(values.phone);
  if (!phone || Object.keys(validateAddressForm(values)).length > 0) {
    throw new Error('Address form must be valid before conversion');
  }
  return {
    apartment: values.apartment.trim() || null,
    building: values.building.trim(),
    city: values.city.trim(),
    country: 'IL',
    is_default: values.isDefault,
    phone,
    postal_code: values.postalCode.trim() || null,
    recipient_name: values.recipientName.trim(),
    street: values.street.trim(),
  };
}
