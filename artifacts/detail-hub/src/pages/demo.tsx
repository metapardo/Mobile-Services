/**
 * `/demo` — public, no-login "Request a Demo" page
 * (`PRD_Mobull_Demo_Request_Page.md`). Closes Risk #1 from
 * `Mobull_Long_Island_Guerrilla_GTM_Campaign.md`: the guerrilla campaign's
 * (and the calculator page's own) "someone will reach out" CTA had nowhere
 * to actually land — this is that landing spot.
 *
 * Structural template: `calculator.tsx` — same public-page shape
 * (`Header`/`Footer` from `@/components/marketing-chrome`, `container-wide`
 * / section conventions, no `AuthGate`). Unlike `calculator.tsx`, this page
 * *does* render the shared `Footer` (the PRD explicitly calls for reusing
 * both `Header`/`Footer`, and this page has no mockup-specific footer of its
 * own to preserve instead).
 *
 * Form field styling reuses `signup.css`'s `.access-form`/`.field-group`/
 * `.field-error`/`.form-fineprint`/`.field-group-honeypot` classes directly
 * (imported alongside `demo.css`, same layering `calculator.tsx` uses for
 * `calculator.css` on top of `signup.css`).
 *
 * Confirmation state: on a successful submission the form is replaced in
 * place (not a route redirect) with a `framer-motion` fade/settle reveal —
 * same animation vocabulary as `signup.tsx`'s `Reveal` helper, not a new
 * animation approach.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarCheck, CheckCircle2, Loader2, Send } from 'lucide-react';
import { useCreateDemoRequest } from '@workspace/api-client-react';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { trackMixpanelEvent } from '@/lib/mixpanel';
import { Header, Footer } from '@/components/marketing-chrome';
import './signup.css';
import './demo.css';

const REVEAL_EASE: [number, number, number, number] = [0.2, 0.75, 0.2, 1];

/** Strips everything but digits and caps at 10 — the normalized value the API expects. */
function toDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

/** `"5165551234"` -> `"(516) 555-1234"`, growing progressively as digits are typed. */
function formatPhoneForDisplay(digits: string): string {
  if (digits.length === 0) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const demoRequestSchema = z.object({
  name: z.string().min(1, 'Your name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .refine((value) => toDigits(value).length === 10, 'Enter a valid 10-digit US phone number'),
  businessName: z.string().optional(),
  note: z.string().optional(),
});

type DemoRequestFormValues = z.infer<typeof demoRequestSchema>;

function DemoConfirmation() {
  const prefersReducedMotion = useReducedMotion();

  const content = (
    <div className="demo-confirmation" data-testid="text-demo-confirmation">
      <div className="demo-confirmation-icon">
        <CheckCircle2 size={28} />
      </div>
      <h2>You&rsquo;re all set.</h2>
      <p>Thank you, someone from Mobull will reach out to you to setup that demo!</p>
    </div>
  );

  if (prefersReducedMotion) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: REVEAL_EASE }}
    >
      {content}
    </motion.div>
  );
}

export default function Demo() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  // FR (honeypot) — a real, hidden input real visitors never see or fill;
  // `website` matches the exact field name on the generated `DemoRequestBody`
  // type. Visually hidden off-screen (not `display:none`/`visibility:hidden`,
  // which some bots specifically check for and skip) via `.field-group-honeypot`.
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    document.title = 'Request a Demo — Mobull';
    const meta = document.querySelector('meta[name="description"]');
    const previous = meta?.getAttribute('content') ?? null;
    meta?.setAttribute(
      'content',
      'Talk to a real person before you sign up. Request a free demo of Mobull, built for mobile detailers and other on-the-road service businesses.',
    );
    return () => {
      if (meta && previous !== null) meta.setAttribute('content', previous);
    };
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DemoRequestFormValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: { name: '', email: '', phone: '', businessName: '', note: '' },
  });

  // `phone` is driven by `setValue`/`watch` rather than a plain `register()`
  // spread so every keystroke can be reformatted live (auto-format to
  // `(XXX) XXX-XXXX`) while still participating in the same form's zod
  // validation/submit flow.
  const phoneDisplay = watch('phone');

  const createDemoRequest = useCreateDemoRequest({
    mutation: {
      onSuccess: (result) => {
        if (!result.success) {
          toast({
            title: 'Something went wrong',
            description: 'We could not submit your request. Please try again.',
            variant: 'destructive',
          });
          return;
        }
        setSubmitted(true);
      },
      onError: () => {
        toast({
          title: 'Something went wrong',
          description: 'We could not submit your request. Please try again.',
          variant: 'destructive',
        });
      },
    },
  });

  const onSubmit = (values: DemoRequestFormValues) => {
    const source = new URLSearchParams(window.location.search).get('source') ?? 'direct';
    const hasBusinessName = !!values.businessName?.trim();
    const hasNote = !!values.note?.trim();

    createDemoRequest.mutate(
      {
        data: {
          name: values.name,
          email: values.email,
          // Normalized 10-digit, digits-only value — formatting is a display
          // concern only, never sent to the API.
          phone: toDigits(values.phone),
          businessName: values.businessName?.trim() || undefined,
          note: values.note?.trim() || undefined,
          website: honeypot,
        },
      },
      {
        onSuccess: (result) => {
          if (!result.success) return;
          trackMixpanelEvent('demo_signup_completed', {
            has_business_name: hasBusinessName,
            has_note: hasNote,
            source,
          });
        },
      },
    );
  };

  return (
    <div className="site-shell demo-page">
      <Header open={menuOpen} setOpen={setMenuOpen} />

      <section className="demo-hero container-wide">
        <div className="demo-eyebrow-pill">
          <CalendarCheck size={13} />
          <span>Talk to a real person</span>
        </div>
        <h1 className="demo-title">
          Request a <span className="demo-title-accent">Demo</span>
        </h1>
        <p className="demo-subtitle">
          Not ready to sign up yet? Tell us a bit about your business and someone from Mobull will reach out to walk
          you through it.
        </p>
      </section>

      <section className="demo-panel-wrap container-wide">
        <div className="demo-panel glass">
          {submitted ? (
            <DemoConfirmation />
          ) : (
            <>
              <div className="demo-form-heading">
                <h2>Get in touch</h2>
                <p>Takes less than a minute. No account required.</p>
              </div>
              <form className="access-form" onSubmit={handleSubmit(onSubmit)} data-testid="form-demo-request">
                <div className="field-group">
                  <label htmlFor="demo-name">Your name</label>
                  <input id="demo-name" placeholder="Jordan Smith" data-testid="input-demo-name" {...register('name')} />
                  {errors.name && <span className="field-error">{errors.name.message}</span>}
                </div>

                <div className="demo-field-row">
                  <div className="field-group">
                    <label htmlFor="demo-email">Email</label>
                    <input
                      id="demo-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@yourbusiness.com"
                      data-testid="input-demo-email"
                      {...register('email')}
                    />
                    {errors.email && <span className="field-error">{errors.email.message}</span>}
                  </div>

                  <div className="field-group">
                    <label htmlFor="demo-phone">Phone</label>
                    <input
                      id="demo-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(555) 123-4567"
                      data-testid="input-demo-phone"
                      value={phoneDisplay}
                      onChange={(e) => {
                        const digits = toDigits(e.target.value);
                        setValue('phone', formatPhoneForDisplay(digits), {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                      }}
                    />
                    {errors.phone && <span className="field-error">{errors.phone.message}</span>}
                  </div>
                </div>

                <div className="field-group">
                  <label htmlFor="demo-business-name">Business name</label>
                  <input
                    id="demo-business-name"
                    placeholder="Northline Mobile Detail (optional)"
                    data-testid="input-demo-business-name"
                    {...register('businessName')}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="demo-note">Anything you&rsquo;d like us to know?</label>
                  <textarea
                    id="demo-note"
                    placeholder="Optional"
                    data-testid="input-demo-note"
                    {...register('note')}
                  />
                </div>

                {/* Honeypot (PRD's basic abuse mitigation) — real visitors never see this field. */}
                <div className="field-group field-group-honeypot" aria-hidden="true">
                  <label htmlFor="demo-website">Website</label>
                  <input
                    id="demo-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                <button
                  className="button-primary form-submit"
                  type="submit"
                  disabled={createDemoRequest.isPending}
                  data-testid="button-demo-submit"
                >
                  {createDemoRequest.isPending ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Submitting…
                    </>
                  ) : (
                    <>
                      Request a demo <Send size={15} />
                    </>
                  )}
                </button>

                <p className="form-fineprint">No account, no commitment — just a conversation.</p>
              </form>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
