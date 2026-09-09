/**
 * AddressAutocomplete — shared address typeahead backed by Google Places
 * Autocomplete (New) via `api-server`'s proxy, per
 * `PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md` §5.2/§7.2 (FR-9 through FR-14,
 * FR-19). Used by both `booking-new.tsx`'s Location field and
 * `settings.tsx`'s Home Base field.
 *
 * - Debounced 250ms, suppressed under 3 characters (FR-10).
 * - One Google session token per address-entry session, generated on first
 *   focus/keystroke and reused across every autocomplete call and the
 *   terminating place-details call (FR-11) — a fresh token starts the next
 *   time the field is focused after a selection.
 * - ARIA combobox: `role="combobox"` on the input, `aria-expanded`,
 *   `aria-activedescendant`, a `role="listbox"` dropdown of `role="option"`
 *   rows. Full ↑/↓/Enter/Esc keyboard support (FR-13).
 * - Matched substrings bolded from each suggestion's `matches` offsets
 *   (FR-13).
 * - FR-19: a failed autocomplete/place-details call degrades to a plain,
 *   fully-functional text input with an inline notice — typing and saving
 *   are never blocked.
 *
 * Styling per `DESIGN.md`: the dropdown itself is a `glass-panel` (a
 * natural fit for a floating surface); individual suggestion rows stay flat
 * per the Flat Input Rule's spirit and `command.tsx`'s own precedent
 * (`CommandItem` — plain hover/selected background, no glass/card
 * treatment). The text field itself is a plain flat input, unchanged from
 * every other input on this page.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAutocompletePlaces, useGetPlaceDetails, type PlaceSuggestion } from '@workspace/api-client-react';
import { cn } from '@workspace/blue-glass-design-system/lib/utils';
import { Loader2, MapPin } from 'lucide-react';

export interface AddressAutocompleteSelection {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  value: string;
  /** Fires on every keystroke. The caller should also clear whatever selection state `onSelect` last wrote — free typing after a selection means the text no longer matches those coordinates. */
  onTextChange: (text: string) => void;
  /** Fires once, after Place Details resolves. The caller is responsible for writing `place.formattedAddress` into the state backing `value` — this component does not call `onTextChange` for it (FR-14: address text, place ID and coordinates land in state together, in one step). */
  onSelect: (place: AddressAutocompleteSelection) => void;
  /** Org's HQ coordinates, for `locationBias` (FR-12) — omit when unknown. */
  originLat?: number;
  originLng?: number;
  placeholder?: string;
  id?: string;
  className?: string;
  'data-testid'?: string;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

function renderMatchedText(text: string, matches: PlaceSuggestion['matches']) {
  if (!matches || matches.length === 0) return text;
  const sorted = [...matches].sort((a, b) => a.startOffset - b.startOffset);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((m, i) => {
    if (m.startOffset > cursor) parts.push(text.slice(cursor, m.startOffset));
    parts.push(
      <strong key={i} className="font-semibold text-foreground">
        {text.slice(m.startOffset, m.endOffset)}
      </strong>,
    );
    cursor = Math.max(cursor, m.endOffset);
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function AddressAutocomplete({
  value,
  onTextChange,
  onSelect,
  originLat,
  originLng,
  placeholder,
  id,
  className,
  ...rest
}: AddressAutocompleteProps) {
  const reactId = useId();
  const inputId = id ?? `address-autocomplete-${reactId}`;
  const listboxId = `${inputId}-listbox`;

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [degraded, setDegraded] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const autocomplete = useAutocompletePlaces();
  const placeDetails = useGetPlaceDetails();

  const ensureSession = useCallback((): string => {
    if (sessionToken) return sessionToken;
    const token = crypto.randomUUID();
    setSessionToken(token);
    return token;
  }, [sessionToken]);

  const runAutocomplete = useCallback((input: string, token: string) => {
    autocomplete.mutate(
      { data: { input, sessionToken: token, originLat, originLng } },
      {
        onSuccess: (res) => {
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
          setActiveIndex(-1);
        },
        onError: () => {
          // FR-19: degrade to a plain text input, never block typing/saving.
          setSuggestions([]);
          setOpen(false);
          setDegraded(true);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originLat, originLng]);

  const handleChange = (text: string) => {
    onTextChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const token = ensureSession();
    debounceRef.current = setTimeout(() => runAutocomplete(text, token), DEBOUNCE_MS);
  };

  const handleSelect = (s: PlaceSuggestion) => {
    const token = ensureSession();
    placeDetails.mutate(
      { data: { placeId: s.placeId, sessionToken: token } },
      {
        onSuccess: (details) => {
          // Caller is responsible for writing `details.formattedAddress`
          // into whatever state backs `value` (see `onSelect`'s contract) —
          // this component doesn't also call `onTextChange` for it, so a
          // single state update decides the final text, with no race
          // against `onTextChange`'s own "typing clears the selection"
          // handling in the caller.
          onSelect({
            placeId: details.placeId,
            formattedAddress: details.formattedAddress,
            latitude: details.latitude,
            longitude: details.longitude,
          });
          setSuggestions([]);
          setOpen(false);
          setActiveIndex(-1);
          // FR-11: this call closed the billing session — start fresh next time.
          setSessionToken(null);
        },
        onError: () => {
          setDegraded(true);
          setOpen(false);
        },
      },
    );
  };

  const handleFocus = () => {
    ensureSession();
  };

  const handleBlur = () => {
    // Delay so a suggestion row's onMouseDown still fires before we close.
    window.setTimeout(() => setOpen(false), 120);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        handleSelect(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const activeOptionId = activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined;
  const isBusy = autocomplete.isPending || placeDetails.isPending;

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        autoComplete="off"
        className={cn(
          'w-full px-4 py-3.5 rounded-2xl border border-border bg-background text-[15px] focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground/60',
          className,
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        data-testid={rest['data-testid'] ?? 'input-address-autocomplete'}
      />

      {isBusy && (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}

      {open && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="glass-panel absolute z-30 mt-1.5 w-full max-h-64 overflow-y-auto rounded-2xl border p-1.5"
        >
          {suggestions.map((s, i) => (
            <div
              key={s.placeId}
              id={`${inputId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // onMouseDown (not onClick) fires before the input's onBlur closes the list.
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex items-start gap-2 px-3 py-2.5 rounded-xl text-[14px] cursor-pointer transition-colors',
                i === activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <span className="min-w-0">{renderMatchedText(s.text, s.matches)}</span>
            </div>
          ))}
        </div>
      )}

      {degraded && (
        <p className="text-[12px] text-muted-foreground mt-1.5" data-testid="text-address-autocomplete-degraded">
          Suggestions unavailable — you can still type the address.
        </p>
      )}
    </div>
  );
}
