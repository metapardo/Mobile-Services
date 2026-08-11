import { useState } from 'react';
import { Redirect, useLocation, Link, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { useSignup, getGetAuthSessionQueryKey } from '@workspace/api-client-react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { useQueryClient } from '@tanstack/react-query';

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Shown when there's no usable invite token — no form, no silent failure. */
function InviteGateBlocked({ reason }: { reason: 'missing' | 'rejected' }) {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="status-invite-blocked">
        <ShieldAlert className="w-9 h-9 text-amber-500" />
        <h2 className="text-[18px] font-semibold text-foreground">Signup isn't open yet</h2>
        <p className="text-[13px] text-muted-foreground max-w-[300px]">
          {reason === 'missing'
            ? "DetailHub is invite-only right now. You'll need an invite link from us to create an account."
            : "That invite link is invalid, expired, or has already been used. Ask us for a new one."}
        </p>
        <p className="text-[13px] text-muted-foreground pt-3">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium" data-testid="link-login">
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [inviteRejected, setInviteRejected] = useState(false);

  const inviteToken = new URLSearchParams(search).get('invite');

  const { data: session, isPending: sessionPending } = useSession();

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
          setInviteRejected(true);
          return;
        }
        const message = err?.data?.message ?? 'Something went wrong creating your account. Please try again.';
        toast({ title: 'Signup failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: SignupFormValues) => {
    if (!inviteToken) {
      setInviteRejected(true);
      return;
    }
    signupMutation.mutate({
      data: { ...values, inviteToken },
    });
  };

  // Already authenticated — no reason to be on the signup page.
  if (!sessionPending && session?.authenticated) {
    return <Redirect to="/" />;
  }

  if (!inviteToken) {
    return <InviteGateBlocked reason="missing" />;
  }

  if (inviteRejected) {
    return <InviteGateBlocked reason="rejected" />;
  }

  return (
    <AuthShell>
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

          <div className="h-px bg-border/50 my-1" />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input placeholder="Jordan Smith" data-testid="input-name" {...field} />
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
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-muted-foreground"
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

          <p className="text-center text-[13px] text-muted-foreground pt-2">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium" data-testid="link-login">
              Log in
            </Link>
          </p>
        </form>
      </Form>
    </AuthShell>
  );
}
