// Shared client create/edit form — extracted from `client-detail.tsx`'s
// original Edit dialog (per `PRD_Mobull_Client_Creation_Parity.md`). This is
// the single source of truth for client field validation and request-shape
// mapping: `clients.tsx`'s new "Add Client" dialog, `client-detail.tsx`'s
// existing Edit dialog, and `booking-new.tsx`'s quick-add "add more details"
// expansion all render this component and call the helpers below rather than
// hand-rolling their own copies. If validation or the request shape ever
// needs to change, it changes once, here.
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Textarea } from '@workspace/blue-glass-design-system/components/ui/textarea';

// Matches the real `clients` schema's nullable columns — `name`/`phone` are
// `NOT NULL`, `email`/`address`/`notes` are nullable. Kept as plain strings
// here (not `string | null`) since every field is backed by a controlled
// text input; nulls only reappear when building the API payload.
export interface ClientFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export const EMPTY_CLIENT_FORM_VALUES: ClientFormValues = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email/address are optional on the real `clients` schema (a quick-added
// client from the appointment-creation flow may have neither) — only
// format-validate email when something's actually typed, don't require it
// (or address) to be present just to save the record.
export function isClientFormValid(values: ClientFormValues): boolean {
  return (
    values.name.trim().length > 0 &&
    values.phone.trim().length > 0 &&
    (values.email.trim().length === 0 || EMAIL_RE.test(values.email.trim()))
  );
}

// The one place `CreateClientRequest`/`UpdateClientRequest` payloads get
// built from form state — both request types accept this exact shape
// (`UpdateClientRequest`'s fields are a superset-compatible optional version
// of `CreateClientRequest`'s), so create and update share this mapping
// instead of each hand-rolling their own trim/null-coalescing.
export function clientFormValuesToPayload(values: ClientFormValues) {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    email: values.email.trim() ? values.email.trim() : null,
    address: values.address.trim() ? values.address.trim() : null,
    notes: values.notes.trim() ? values.notes.trim() : null,
  };
}

// Inverse of the payload mapping above — seeds form state from an existing
// `ClientResult` (`client-detail.tsx`'s Edit dialog).
export function clientToFormValues(client: {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}): ClientFormValues {
  return {
    name: client.name,
    phone: client.phone,
    email: client.email ?? '',
    address: client.address ?? '',
    notes: client.notes ?? '',
  };
}

export type ClientFormField = 'name' | 'phone' | 'email' | 'address' | 'notes';

const ALL_FIELDS: ClientFormField[] = ['name', 'phone', 'email', 'address', 'notes'];

interface ClientFormProps {
  values: ClientFormValues;
  onChange: (values: ClientFormValues) => void;
  /**
   * Which fields to render, in order. Defaults to all five (the Clients-page
   * "Add Client" dialog and `client-detail.tsx`'s Edit dialog). Booking's
   * quick-add renders its own first/last-name + phone inputs directly (it
   * splits "name" into first/last, which this shared form deliberately
   * doesn't do) and only mounts this component for the `['email', 'address',
   * 'notes']` optional-details expansion.
   */
  fields?: ClientFormField[];
  /**
   * Prefixes each field's `data-testid`/`id` (e.g. `quick-client-email`
   * instead of `input-email`) so a second instance of this form on the same
   * page (booking's quick-add) doesn't collide with element ids/testids
   * elsewhere. Defaults to '' to preserve the existing `input-name`,
   * `input-phone`, etc. testids `client-detail.tsx`'s Edit dialog already
   * shipped with.
   */
  testIdPrefix?: string;
  autoFocusFirstField?: boolean;
}

export function ClientForm({
  values,
  onChange,
  fields = ALL_FIELDS,
  testIdPrefix = '',
  autoFocusFirstField = false,
}: ClientFormProps) {
  const set = (patch: Partial<ClientFormValues>) => onChange({ ...values, ...patch });
  const testId = (field: ClientFormField) => `${testIdPrefix}input-${field}`;
  const firstField = fields[0];

  return (
    <div className="space-y-4">
      {fields.includes('name') && (
        <div>
          <Label htmlFor={testId('name')}>Name</Label>
          <Input
            id={testId('name')}
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            autoFocus={autoFocusFirstField && firstField === 'name'}
            data-testid={testId('name')}
          />
        </div>
      )}
      {fields.includes('phone') && (
        <div>
          <Label htmlFor={testId('phone')}>Phone</Label>
          <Input
            id={testId('phone')}
            value={values.phone}
            onChange={(e) => set({ phone: e.target.value })}
            autoFocus={autoFocusFirstField && firstField === 'phone'}
            data-testid={testId('phone')}
          />
        </div>
      )}
      {fields.includes('email') && (
        <div>
          <Label htmlFor={testId('email')}>Email</Label>
          <Input
            id={testId('email')}
            type="email"
            value={values.email}
            onChange={(e) => set({ email: e.target.value })}
            autoFocus={autoFocusFirstField && firstField === 'email'}
            data-testid={testId('email')}
          />
        </div>
      )}
      {fields.includes('address') && (
        <div>
          <Label htmlFor={testId('address')}>Address</Label>
          <Input
            id={testId('address')}
            value={values.address}
            onChange={(e) => set({ address: e.target.value })}
            autoFocus={autoFocusFirstField && firstField === 'address'}
            data-testid={testId('address')}
          />
        </div>
      )}
      {fields.includes('notes') && (
        <div>
          <Label htmlFor={testId('notes')}>Notes</Label>
          <Textarea
            id={testId('notes')}
            value={values.notes || ''}
            onChange={(e) => set({ notes: e.target.value })}
            autoFocus={autoFocusFirstField && firstField === 'notes'}
            data-testid={testId('notes')}
          />
        </div>
      )}
    </div>
  );
}
