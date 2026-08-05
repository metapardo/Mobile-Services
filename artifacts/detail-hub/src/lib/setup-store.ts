/** Persists the business setup profile across the session (in-memory). */

export interface SetupProfile {
  businessName: string;
  phone: string;
  isStorefront: boolean;
  storefrontAddress: string;
  businessCategory: string;
  businessSubType: string;
  businessStructure: 'sole_prop' | 'single_llc' | 'multi_llc' | 'partnership' | 'corp' | '';
  ein: string;
  paymentProcessor: 'stripe' | 'square' | 'paypal' | 'venmo' | 'cash' | '';
  bankName: string;
  bankRouting: string;
  bankAccount: string;
  setupComplete: boolean;
}

const defaultProfile: SetupProfile = {
  businessName: 'DetailHub',
  phone: '',
  isStorefront: false,
  storefrontAddress: '',
  businessCategory: 'Auto & Vehicle Services',
  businessSubType: 'Mobile Car Detailing',
  businessStructure: '',
  ein: '',
  paymentProcessor: '',
  bankName: '',
  bankRouting: '',
  bankAccount: '',
  setupComplete: false,
};

const STORAGE_KEY = 'detailhub_setup_profile';

function loadProfile(): SetupProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultProfile, ...JSON.parse(raw) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...defaultProfile };
}

function saveProfile(p: SetupProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

let profile: SetupProfile = loadProfile();

export function getSetupProfile(): SetupProfile { return profile; }

export function updateSetupProfile(updates: Partial<SetupProfile>) {
  profile = { ...profile, ...updates };
  saveProfile(profile);
}

export function completeSetup() {
  profile.setupComplete = true;
  saveProfile(profile);
}

export const BUSINESS_CATEGORIES = [
  { label: 'Auto & Vehicle Services', subTypes: ['Mobile Car Detailing', 'Car Wash / Auto Spa', 'Auto Repair', 'Paint & Body', 'Tinting & Wraps', 'Other Auto Services'] },
  { label: 'Beauty and Personal Care', subTypes: ['Hair Salon', 'Nail Salon', 'Barbershop', 'Spa & Massage', 'Esthetics', 'Other'] },
  { label: 'Home and Repair', subTypes: ['Cleaning', 'Landscaping', 'Handyman', 'Plumbing', 'Electrical', 'Other'] },
  { label: 'Fitness', subTypes: ['Personal Training', 'Yoga', 'Martial Arts', 'CrossFit', 'Dance', 'Other'] },
  { label: 'Health Care', subTypes: ['Chiropractic', 'Acupuncture', 'Massage Therapy', 'Physical Therapy', 'Other'] },
  { label: 'Pet Care', subTypes: ['Dog Grooming', 'Dog Walking', 'Pet Sitting', 'Veterinary', 'Other'] },
  { label: 'Food and Drink', subTypes: ['Restaurant', 'Food Truck', 'Catering', 'Bakery', 'Coffee Shop', 'Other'] },
  { label: 'Professional Services', subTypes: ['Consulting', 'Accounting', 'Legal', 'Marketing', 'Photography', 'Other'] },
  { label: 'Retail', subTypes: ['Clothing', 'Electronics', 'Home Goods', 'Specialty', 'Other'] },
  { label: 'Other', subTypes: ['Other'] },
];

export const BUSINESS_STRUCTURES = [
  { value: 'sole_prop',   label: 'Sole Proprietorship',    sub: 'Unincorporated, owned by one person' },
  { value: 'single_llc',  label: 'Single-Member LLC',       sub: 'One member, limited liability' },
  { value: 'multi_llc',   label: 'Multi-Member LLC',         sub: 'Multiple members, limited liability' },
  { value: 'partnership', label: 'Partnership',               sub: 'Two or more owners' },
  { value: 'corp',        label: 'Corporation (S or C)',      sub: 'Incorporated entity' },
] as const;

export const PAYMENT_PROCESSORS = [
  { id: 'stripe',  label: 'Stripe',   sub: 'Cards, ACH, Apple Pay, Google Pay', color: '#635BFF' },
  { id: 'square',  label: 'Square',   sub: 'POS hardware + online payments',    color: '#00B388' },
  { id: 'paypal',  label: 'PayPal',   sub: '400M+ buyer accounts worldwide',    color: '#003087' },
  { id: 'venmo',   label: 'Venmo',    sub: 'Social payments for small business',color: '#3D95CE' },
  { id: 'cash',    label: 'Cash / Manual', sub: 'Record-only, no processor',    color: '#6B7280' },
] as const;
