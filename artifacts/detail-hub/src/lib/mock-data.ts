export interface Employee {
  id: number;
  name: string;
  color: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes?: string;
}

export interface Package {
  id: number;
  name: string;
  category: 'Exterior' | 'Interior' | 'Full' | 'Add-on';
  description: string;
  price: number;
  durationMinutes: number;
  isAddon: boolean;
  archived?: boolean;
}

export type BookingStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'no-show';

export interface EmployeeSplit {
  employeeId: number;
  percentage: number;
}

export interface Booking {
  id: number;
  clientId: number;
  packageIds: number[];
  employeeIds: number[];
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  address: string;
  depositAmount: number;
  parkingCost: number;
  status: BookingStatus;
  notes?: string;
  employeeSplit: EmployeeSplit[];
}

export interface Settings {
  homeAddress: string;
  gasPrice: number;
  vehicleMpg: number;
  gasThresholdGreen: number;
  gasThresholdAmber: number;
  commissionRate: number;
  // Fuel Gauge thresholds — configurable in admin settings
  fuelGaugeHalfMi:  number;   // $/mile  — lower bound of Half band  (default 3)
  fuelGaugeFullMi:  number;   // $/mile  — lower bound of Full band  (default 8)
  fuelGaugeHalfMin: number;   // $/min   — lower bound of Half band  (default 1.5)
  fuelGaugeFullMin: number;   // $/min   — lower bound of Full band  (default 4)
}

export interface GasMeter {
  distanceMiles: number;
  roundTrip: number;
  gasCost: number;
  ratio: number;
  status: 'green' | 'amber' | 'red';
}

export function getGasMeter(address: string, bookingPrice: number, settings: Settings): GasMeter {
  const hash = address.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const distanceMiles = (hash % 38) + 3;
  const roundTrip = distanceMiles * 2;
  const gasCost = (roundTrip / settings.vehicleMpg) * settings.gasPrice;
  const ratio = gasCost / bookingPrice;
  const status = ratio <= settings.gasThresholdGreen / 100 ? 'green' : ratio <= settings.gasThresholdAmber / 100 ? 'amber' : 'red';
  return { distanceMiles, roundTrip, gasCost, ratio, status };
}

export function getWeather(date: string): string {
  const weatherOptions = ["Sunny 81°F", "Partly Cloudy 74°F", "Cloudy 67°F", "Light Rain 63°F", "Clear 88°F"];
  const dateObj = new Date(date);
  const dayOfYear = Math.floor((dateObj.getTime() - new Date(dateObj.getFullYear(), 0, 0).getTime()) / 86400000);
  return weatherOptions[dayOfYear % 5];
}

// Mock data
export const employees: Employee[] = [
  { id: 1, name: 'Marcus Webb', color: '#3654FF' },
  { id: 2, name: 'Deja Thornton', color: '#1E9E62' },
  { id: 3, name: 'Carlos Reyes', color: '#D9A404' },
  { id: 4, name: 'Tanya Osei', color: '#DC2626' },
];

export const clients: Client[] = [
  {
    id: 1,
    name: 'Jessica Chen',
    phone: '(415) 789-2341',
    email: 'jessica.chen@email.com',
    address: '2847 Market Street, San Francisco, CA 94114',
  },
  {
    id: 2,
    name: 'Michael Rodriguez',
    phone: '(415) 234-8765',
    email: 'mrodriguez@email.com',
    address: '1523 Valencia Street, San Francisco, CA 94110',
  },
  {
    id: 3,
    name: 'Sarah Thompson',
    phone: '(415) 567-3421',
    email: 'sarah.t@email.com',
    address: '4521 Geary Boulevard, San Francisco, CA 94118',
  },
  {
    id: 4,
    name: 'David Park',
    phone: '(415) 890-1234',
    email: 'dpark@email.com',
    address: '987 Divisadero Street, San Francisco, CA 94115',
  },
  {
    id: 5,
    name: 'Emily Nguyen',
    phone: '(415) 432-9876',
    email: 'emily.nguyen@email.com',
    address: '3214 Folsom Street, San Francisco, CA 94110',
  },
  {
    id: 6,
    name: 'Robert Martinez',
    phone: '(415) 678-5432',
    email: 'rmartinez@email.com',
    address: '756 Irving Street, San Francisco, CA 94122',
  },
  {
    id: 7,
    name: 'Amanda Foster',
    phone: '(415) 321-6543',
    email: 'afoster@email.com',
    address: '2109 Lombard Street, San Francisco, CA 94123',
  },
  {
    id: 8,
    name: 'James Wilson',
    phone: '(415) 765-4321',
    email: 'james.wilson@email.com',
    address: '1845 Union Street, San Francisco, CA 94123',
  },
];

export const packages: Package[] = [
  {
    id: 1,
    name: 'Exterior Wash',
    category: 'Exterior',
    description: 'Thorough exterior hand wash and dry',
    price: 89,
    durationMinutes: 90,
    isAddon: false,
  },
  {
    id: 2,
    name: 'Full Exterior Detail',
    category: 'Exterior',
    description: 'Complete exterior detail including wash, clay bar, polish, and wax',
    price: 199,
    durationMinutes: 180,
    isAddon: false,
  },
  {
    id: 3,
    name: 'Interior Refresh',
    category: 'Interior',
    description: 'Vacuum, wipe down, and air freshener',
    price: 129,
    durationMinutes: 120,
    isAddon: false,
  },
  {
    id: 4,
    name: 'Full Interior Detail',
    category: 'Interior',
    description: 'Deep clean carpets, seats, dashboard, windows, and trim',
    price: 249,
    durationMinutes: 210,
    isAddon: false,
  },
  {
    id: 5,
    name: 'Complete Detail',
    category: 'Full',
    description: 'Full interior and exterior detail package',
    price: 349,
    durationMinutes: 300,
    isAddon: false,
  },
  {
    id: 6,
    name: 'Premium Complete',
    category: 'Full',
    description: 'Ultimate detail with all premium treatments',
    price: 499,
    durationMinutes: 360,
    isAddon: false,
  },
  {
    id: 7,
    name: 'Engine Bay',
    category: 'Add-on',
    description: 'Engine compartment cleaning and dressing',
    price: 79,
    durationMinutes: 45,
    isAddon: true,
  },
  {
    id: 8,
    name: 'Paint Decontamination',
    category: 'Add-on',
    description: 'Remove embedded contaminants from paint',
    price: 89,
    durationMinutes: 60,
    isAddon: true,
  },
  {
    id: 9,
    name: 'Ceramic Coating',
    category: 'Add-on',
    description: 'Professional ceramic coating application',
    price: 599,
    durationMinutes: 240,
    isAddon: true,
  },
  {
    id: 10,
    name: 'Headlight Restoration',
    category: 'Add-on',
    description: 'Restore clarity to cloudy headlights',
    price: 59,
    durationMinutes: 30,
    isAddon: true,
  },
];

export const bookings: Booking[] = [
  {
    id: 1,
    clientId: 1,
    packageIds: [5],
    employeeIds: [1],
    date: '2026-08-04',
    startTime: '09:00',
    address: '2847 Market Street, San Francisco, CA 94114',
    depositAmount: 100,
    parkingCost: 0,
    status: 'confirmed',
    notes: 'Client prefers eco-friendly products',
    employeeSplit: [{ employeeId: 1, percentage: 100 }],
  },
  {
    id: 2,
    clientId: 2,
    packageIds: [2, 7],
    employeeIds: [2, 3],
    date: '2026-08-04',
    startTime: '14:00',
    address: '1523 Valencia Street, San Francisco, CA 94110',
    depositAmount: 50,
    parkingCost: 10,
    status: 'confirmed',
    notes: '',
    employeeSplit: [
      { employeeId: 2, percentage: 60 },
      { employeeId: 3, percentage: 40 },
    ],
  },
  {
    id: 3,
    clientId: 3,
    packageIds: [4],
    employeeIds: [1],
    date: '2026-08-05',
    startTime: '10:00',
    address: '4521 Geary Boulevard, San Francisco, CA 94118',
    depositAmount: 0,
    parkingCost: 0,
    status: 'pending',
    notes: 'First-time customer',
    employeeSplit: [{ employeeId: 1, percentage: 100 }],
  },
  {
    id: 4,
    clientId: 4,
    packageIds: [1],
    employeeIds: [4],
    date: '2026-08-05',
    startTime: '13:00',
    address: '987 Divisadero Street, San Francisco, CA 94115',
    depositAmount: 0,
    parkingCost: 0,
    status: 'confirmed',
    notes: '',
    employeeSplit: [{ employeeId: 4, percentage: 100 }],
  },
  {
    id: 5,
    clientId: 5,
    packageIds: [6, 9],
    employeeIds: [1, 2],
    date: '2026-08-06',
    startTime: '08:00',
    address: '3214 Folsom Street, San Francisco, CA 94110',
    depositAmount: 100,
    parkingCost: 15,
    status: 'confirmed',
    notes: 'VIP client - premium service expected',
    employeeSplit: [
      { employeeId: 1, percentage: 50 },
      { employeeId: 2, percentage: 50 },
    ],
  },
  {
    id: 6,
    clientId: 6,
    packageIds: [3],
    employeeIds: [3],
    date: '2026-08-06',
    startTime: '15:00',
    address: '756 Irving Street, San Francisco, CA 94122',
    depositAmount: 0,
    parkingCost: 0,
    status: 'pending',
    notes: '',
    employeeSplit: [{ employeeId: 3, percentage: 100 }],
  },
  {
    id: 7,
    clientId: 7,
    packageIds: [5, 10],
    employeeIds: [2],
    date: '2026-08-07',
    startTime: '09:30',
    address: '2109 Lombard Street, San Francisco, CA 94123',
    depositAmount: 75,
    parkingCost: 0,
    status: 'confirmed',
    notes: 'Gate code: #1234',
    employeeSplit: [{ employeeId: 2, percentage: 100 }],
  },
  {
    id: 8,
    clientId: 8,
    packageIds: [2],
    employeeIds: [4],
    date: '2026-08-07',
    startTime: '14:00',
    address: '1845 Union Street, San Francisco, CA 94123',
    depositAmount: 0,
    parkingCost: 0,
    status: 'pending',
    notes: '',
    employeeSplit: [{ employeeId: 4, percentage: 100 }],
  },
  {
    id: 9,
    clientId: 1,
    packageIds: [1],
    employeeIds: [1],
    date: '2026-07-28',
    startTime: '11:00',
    address: '2847 Market Street, San Francisco, CA 94114',
    depositAmount: 0,
    parkingCost: 0,
    status: 'confirmed',
    notes: '',
    employeeSplit: [{ employeeId: 1, percentage: 100 }],
  },
  {
    id: 10,
    clientId: 3,
    packageIds: [6],
    employeeIds: [1, 3],
    date: '2026-07-28',
    startTime: '13:00',
    address: '4521 Geary Boulevard, San Francisco, CA 94118',
    depositAmount: 100,
    parkingCost: 0,
    status: 'confirmed',
    notes: 'Bring extra supplies',
    employeeSplit: [
      { employeeId: 1, percentage: 55 },
      { employeeId: 3, percentage: 45 },
    ],
  },
  {
    id: 11,
    clientId: 2,
    packageIds: [4],
    employeeIds: [2],
    date: '2026-08-11',
    startTime: '10:00',
    address: '1523 Valencia Street, San Francisco, CA 94110',
    depositAmount: 50,
    parkingCost: 10,
    status: 'confirmed',
    notes: '',
    employeeSplit: [{ employeeId: 2, percentage: 100 }],
  },
  {
    id: 12,
    clientId: 5,
    packageIds: [1],
    employeeIds: [4],
    date: '2026-08-11',
    startTime: '15:00',
    address: '3214 Folsom Street, San Francisco, CA 94110',
    depositAmount: 0,
    parkingCost: 0,
    status: 'pending',
    notes: '',
    employeeSplit: [{ employeeId: 4, percentage: 100 }],
  },
  // Past bookings
  {
    id: 13,
    clientId: 1,
    packageIds: [3],
    employeeIds: [1],
    date: '2026-07-28',
    startTime: '10:00',
    address: '2847 Market Street, San Francisco, CA 94114',
    depositAmount: 50,
    parkingCost: 0,
    status: 'completed',
    notes: '',
    employeeSplit: [{ employeeId: 1, percentage: 100 }],
  },
  {
    id: 14,
    clientId: 4,
    packageIds: [5],
    employeeIds: [2, 3],
    date: '2026-07-30',
    startTime: '09:00',
    address: '987 Divisadero Street, San Francisco, CA 94115',
    depositAmount: 75,
    parkingCost: 0,
    status: 'completed',
    notes: '',
    employeeSplit: [
      { employeeId: 2, percentage: 50 },
      { employeeId: 3, percentage: 50 },
    ],
  },
  {
    id: 15,
    clientId: 6,
    packageIds: [2],
    employeeIds: [1],
    date: '2026-08-01',
    startTime: '13:00',
    address: '756 Irving Street, San Francisco, CA 94122',
    depositAmount: 0,
    parkingCost: 0,
    status: 'cancelled',
    notes: 'Client rescheduled',
    employeeSplit: [{ employeeId: 1, percentage: 100 }],
  },
];

export let settings: Settings = {
  homeAddress: '742 Evergreen Terrace, Springfield',
  gasPrice: 6.0,
  vehicleMpg: 28,
  gasThresholdGreen: 10,
  gasThresholdAmber: 20,
  commissionRate: 25,
  // Fuel Gauge defaults
  fuelGaugeHalfMi:  3,
  fuelGaugeFullMi:  8,
  fuelGaugeHalfMin: 1.5,
  fuelGaugeFullMin: 4,
};

// In-memory state management
let nextBookingId = 16;
let nextClientId = 9;
let nextPackageId = 11;

export function updateSettings(newSettings: Partial<Settings>) {
  settings = { ...settings, ...newSettings };
}

export function createBooking(booking: Omit<Booking, 'id'>): Booking {
  const newBooking = { ...booking, id: nextBookingId++ };
  bookings.push(newBooking);
  return newBooking;
}

export function updateBooking(id: number, updates: Partial<Booking>): Booking | undefined {
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return undefined;
  bookings[index] = { ...bookings[index], ...updates };
  return bookings[index];
}

export function deleteBooking(id: number): boolean {
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return false;
  bookings.splice(index, 1);
  return true;
}

export function createClient(client: Omit<Client, 'id'>): Client {
  const newClient = { ...client, id: nextClientId++ };
  clients.push(newClient);
  return newClient;
}

export function updateClient(id: number, updates: Partial<Client>): Client | undefined {
  const index = clients.findIndex(c => c.id === id);
  if (index === -1) return undefined;
  clients[index] = { ...clients[index], ...updates };
  return clients[index];
}

export function createPackage(pkg: Omit<Package, 'id'>): Package {
  const newPackage = { ...pkg, id: nextPackageId++ };
  packages.push(newPackage);
  return newPackage;
}

export function updatePackage(id: number, updates: Partial<Package>): Package | undefined {
  const index = packages.findIndex(p => p.id === id);
  if (index === -1) return undefined;
  packages[index] = { ...packages[index], ...updates };
  return packages[index];
}
