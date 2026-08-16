import { useState } from 'react';
import { Redirect, useLocation, Link, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSignup, useRequestAccess, getGetAuthSessionQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { LandingPhotoScroll, type PhotoTile } from '@/components/landing-photo-scroll';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { useQueryClient } from '@tanstack/react-query';
import rareAirLockup from '@/assets/lockup.png';

import foamWashFerrariSquare from '@/assets/landing-photos/foam-wash-ferrari-square.jpg';
import foamWashFerrariVertical from '@/assets/landing-photos/foam-wash-ferrari-vertical.jpg';
import foamWashBmwSquare from '@/assets/landing-photos/foam-wash-bmw-square.jpg';
import foamWashBmwVertical from '@/assets/landing-photos/foam-wash-bmw-vertical.jpg';
import foamWashCitySquare from '@/assets/landing-photos/foam-wash-city-square.jpg';
import foamWashCityVertical from '@/assets/landing-photos/foam-wash-city-vertical.jpg';
import foamWashPorscheSquare from '@/assets/landing-photos/foam-wash-porsche-square.jpg';
import foamWashPorscheVertical from '@/assets/landing-photos/foam-wash-porsche-vertical.jpg';
import finishedDetailCoachSquare from '@/assets/landing-photos/finished-detail-coach-square.jpg';
import finishedDetailCoachVertical from '@/assets/landing-photos/finished-detail-coach-vertical.jpg';
import carshowBugattiSquare from '@/assets/landing-photos/carshow-bugatti-square.jpg';
import carshowBugattiVertical from '@/assets/landing-photos/carshow-bugatti-vertical.jpg';
import carshowPorscheSquare from '@/assets/landing-photos/carshow-porsche-square.jpg';
import carshowPorscheVertical from '@/assets/landing-photos/carshow-porsche-vertical.jpg';
import barberingVanInteriorSquare from '@/assets/landing-photos/barbering-van-interior-square.jpg';
import barberingVanInteriorVertical from '@/assets/landing-photos/barbering-van-interior-vertical.jpg';
import barberingVanExteriorSquare from '@/assets/landing-photos/barbering-van-exterior-square.jpg';
import barberingVanExteriorVertical from '@/assets/landing-photos/barbering-van-exterior-vertical.jpg';

// Two even columns (9 tiles each) built from square + vertical-rectangle crops
// of all 9 approved source photos — each photo contributes one tile to each
// column (its square crop in one, its vertical crop in the other), so no
// photo repeats within a column and every column shows all 9 photos once per
// loop. See `LandingPhotoScroll` for the height/duration math that keeps the
// loop seamless with this tile count.
const LANDING_PHOTO_COLUMNS: [PhotoTile[], PhotoTile[]] = [
  [
    { src: foamWashFerrariSquare, shape: 'square' },
    { src: foamWashBmwVertical, shape: 'vertical' },
    { src: foamWashCitySquare, shape: 'square' },
    { src: foamWashPorscheVertical, shape: 'vertical' },
    { src: finishedDetailCoachSquare, shape: 'square' },
    { src: carshowBugattiVertical, shape: 'vertical' },
    { src: carshowPorscheSquare, shape: 'square' },
    { src: barberingVanInteriorVertical, shape: 'vertical' },
    { src: barberingVanExteriorSquare, shape: 'square' },
  ],
  [
    { src: foamWashFerrariVertical, shape: 'vertical' },
    { src: foamWashBmwSquare, shape: 'square' },
    { src: foamWashCityVertical, shape: 'vertical' },
    { src: foamWashPorscheSquare, shape: 'square' },
    { src: finishedDetailCoachVertical, shape: 'vertical' },
    { src: carshowBugattiSquare, shape: 'square' },
    { src: carshowPorscheVertical, shape: 'vertical' },
    { src: barberingVanInteriorSquare, shape: 'square' },
    { src: barberingVanExteriorVertical, shape: 'vertical' },
  ],
];

const signupSchema = z.object({
  name: z.string().min(1, 'Your name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().min(1, 'Business name is required'),
  organizationSlug: z
    .string()
    .min(1, 'Business URL is required')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers, and hyphens only (e.g. "acme-detailing")'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

const requestAccessSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  businessName: z.string().optional(),
  // Anti-spam honeypot — real visitors never see or fill this field (rendered
  // visually hidden, out of tab order, below). Any non-empty value here means
  // the submitter is a bot; the backend discards those silently.
  honeypot: z.string().optional(),
});

type RequestAccessFormValues = z.infer<typeof requestAccessSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Shared split-screen shell for every state this page can render (request
 * access / gated signup / request-access confirmation) — logo + adaptive
 * top-right label, eyebrow/headline/copy, the state-specific CTA area passed
 * in as `children`, then the fixed footer divider + feature labels, all on
 * the left; the auto-scrolling job-photo collage on the right.
 */
function SignupLayout({ topRightLabel, children }: { topRightLabel: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:h-dvh grid lg:grid-cols-2 bg-background overflow-hidden">
      <div className="relative flex flex-col px-6 sm:px-12 lg:px-16 py-8">
        <div className="flex items-center justify-between max-w-[480px]">
          <img src={rareAirLockup} alt="Rare Air" className="h-10 w-auto" data-testid="img-logo" />
          <span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase" data-testid="text-top-label">
            {topRightLabel}
          </span>
        </div>

        <div className="flex-1 flex flex-col max-w-[480px] py-10">
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-[12px] font-semibold tracking-[0.15em] text-primary uppercase mb-4" data-testid="text-eyebrow">
              Smarter scheduling for the road
            </p>
            <h1
              className="wordmark-gradient-text text-5xl sm:text-6xl font-bold tracking-tight mb-5"
              data-testid="text-headline"
            >
              Rare Air
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground mb-8" data-testid="text-subhead">
              Tells you if a job's worth taking before you drive, then helps you schedule smarter and see exactly
              where your money's going.
            </p>

            <div className="w-full">{children}</div>
          </div>

          <div className="mt-auto pt-10">
            <div className="h-px bg-border/60 mb-5" />

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {['Know before you go', 'Schedule smarter', 'Track every dollar'].map((label) => (
                <span
                  key={label}
                  className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <LandingPhotoScroll tiles={LANDING_PHOTO_COLUMNS} />
      </div>
    </div>
  );
}

/** The new no-token / rejected-token path: a real lead-capture form instead of a dead end. */
function RequestAccessForm({ noticeText, tokenRejected }: { noticeText: string; tokenRejected: boolean }) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const form = useForm<RequestAccessFormValues>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: { email: '', businessName: '', honeypot: '' },
  });

  const requestAccessMutation = useRequestAccess({
    mutation: {
      onSuccess: (_data, variables) => {
        setSubmittedEmail(variables.data.email);
        setSubmitted(true);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong submitting your request. Please try again.';
        toast({ title: 'Request failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: RequestAccessFormValues) => {
    requestAccessMutation.mutate({
      data: {
        email: values.email,
        businessName: values.businessName?.trim() ? values.businessName.trim() : undefined,
        honeypot: values.honeypot || undefined,
      },
    });
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-col items-start gap-3 py-2"
        data-testid="status-request-access-success"
      >
        <div className="w-11 h-11 rounded-full gradient-btn flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-[26px] font-semibold tracking-tight text-foreground">Request received</h2>
        <p className="text-[13px] text-muted-foreground max-w-[360px]">
          Thanks for your interest in Rare Air. We'll email {submittedEmail ?? 'you'} if a spot opens up.
        </p>
        <p className="text-[13px] text-muted-foreground pt-2">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium" data-testid="link-login">
            Log in
          </Link>
        </p>
      </motion.div>
    );
  }

  return (
    <div>
      {tokenRejected ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 mb-4"
          data-testid="text-request-access-notice"
        >
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-[13px] text-foreground">{noticeText}</p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground mb-4" data-testid="text-request-access-notice">
          {noticeText}
        </p>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-4" data-testid="form-request-access">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@business.com"
                    className="h-11 focus-visible:ring-2 focus-visible:ring-offset-0"
                    data-testid="input-request-email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Acme Detailing (optional)"
                    className="h-11 focus-visible:ring-2 focus-visible:ring-offset-0"
                    data-testid="input-request-business-name"
                    {...field}
                  />
                </FormControl>
                <FormDescription>Optional — helps us prioritize.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Honeypot: visually hidden and out of tab order, never seen by real
              visitors. Positioned off-screen (not display:none — some bots
              specifically skip display:none fields) so it still exists in the
              DOM for less careful automated submitters to fill in. */}
          <div className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
            <FormField
              control={form.control}
              name="honeypot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company website</FormLabel>
                  <FormControl>
                    <Input tabIndex={-1} autoComplete="off" data-testid="input-honeypot" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="min-h-[48px] w-full gradient-btn mt-2"
            disabled={requestAccessMutation.isPending}
            data-testid="button-request-access"
          >
            {requestAccessMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </>
            ) : (
              'Request Access'
            )}
          </Button>

          <p className="text-[13px] text-muted-foreground pt-2">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium" data-testid="link-login">
              Log in
            </Link>
          </p>
        </form>
      </Form>
    </div>
  );
}

/** The real gated account-creation form, shown whenever an `?invite=` token is present. */
function GatedSignupForm({ inviteToken, onInviteRejected }: { inviteToken: string; onInviteRejected: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', organizationName: '', organizationSlug: '' },
  });

  const signupMutation = useSignup({
    mutation: {
      onSuccess: async () => {
        // Signup only creates the user + organization — it doesn't sign in on its own
        // (see `useSignup`'s JSDoc / the api-server's `autoSignIn: false`). Send the new
        // user to log in with the credentials they just chose rather than pretending
        // they're already authenticated.
        await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
        toast({
          title: 'Account created',
          description: 'Log in with your new email and password to get started.',
        });
        setLocation('/login');
      },
      onError: (err) => {
        if (err?.data?.error === 'invalid_invite_token') {
          onInviteRejected();
          return;
        }
        const message = err?.data?.message ?? 'Something went wrong creating your account. Please try again.';
        toast({ title: 'Signup failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: SignupFormValues) => {
    signupMutation.mutate({
      data: { ...values, inviteToken },
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-4" data-testid="form-signup">
        <FormField
          control={form.control}
          name="organizationName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Acme Detailing"
                  className="h-11 focus-visible:ring-2 focus-visible:ring-offset-0"
                  data-testid="input-organization-name"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!slugTouched) {
                      form.setValue('organizationSlug', slugify(e.target.value), { shouldValidate: true });
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="organizationSlug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="acme-detailing"
                  className="h-11 focus-visible:ring-2 focus-visible:ring-offset-0"
                  data-testid="input-organization-slug"
                  {...field}
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.onChange(slugify(e.target.value));
                  }}
                />
              </FormControl>
              <FormDescription>Lowercase letters, numbers, and hyphens only.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3 pt-1 pb-1">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase whitespace-nowrap">
            About you
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Jordan Smith"
                  className="h-11 focus-visible:ring-2 focus-visible:ring-offset-0"
                  data-testid="input-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@business.com"
                  className="h-11 focus-visible:ring-2 focus-visible:ring-offset-0"
                  data-testid="input-email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    data-testid="input-password"
                    className="h-11 pr-10 focus-visible:ring-2 focus-visible:ring-offset-0"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="min-h-[48px] w-full gradient-btn mt-2"
          disabled={signupMutation.isPending}
          data-testid="button-signup"
        >
          {signupMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
            </>
          ) : (
            'Create Account'
          )}
        </Button>

        <p className="text-[13px] text-muted-foreground pt-2">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium" data-testid="link-login">
            Log in
          </Link>
        </p>
      </form>
    </Form>
  );
}

export default function Signup() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [inviteRejected, setInviteRejected] = useState(false);

  const inviteToken = new URLSearchParams(search).get('invite');

  const { data: session, isPending: sessionPending } = useSession();

  // Already authenticated — no reason to be on the signup page.
  if (!sessionPending && session?.authenticated) {
    return <Redirect to="/" />;
  }

  // There is no way to check an invite token's validity without consuming it
  // (see `claimPlatformInviteToken` — single atomic claim-and-consume, by
  // design, to stay race-safe on single-use tokens). So "invalid, expired, or
  // used" can only ever be discovered when the gated form below is actually
  // submitted and the API rejects it (`onInviteRejected` from
  // `GatedSignupForm`) — never pre-validated on load.
  const showGatedSignup = Boolean(inviteToken) && !inviteRejected;

  if (showGatedSignup && inviteToken) {
    return (
      <SignupLayout topRightLabel="You're Invited — 2026">
        <GatedSignupForm
          inviteToken={inviteToken}
          onInviteRejected={() => {
            setInviteRejected(true);
            // The token turned out invalid/expired/used — drop it from the
            // URL rather than leaving a stale `?invite=` hanging around
            // once we've fallen back to the request-access form.
            setLocation('/signup', { replace: true });
          }}
        />
      </SignupLayout>
    );
  }

  return (
    <SignupLayout topRightLabel="Early Access — 2026">
      <RequestAccessForm
        tokenRejected={inviteRejected}
        noticeText={
          inviteRejected
            ? "That invite link didn't work — it may be expired or already used. Request a new one below and we'll follow up."
            : "Rare Air is invite-only right now. Request access below and we'll follow up if a spot opens up."
        }
      />
    </SignupLayout>
  );
}
