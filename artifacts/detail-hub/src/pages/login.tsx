import { useState } from 'react';
import { Redirect, useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useLogin, getGetAuthSessionQueryKey } from '@workspace/api-client-react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { useQueryClient } from '@tanstack/react-query';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);

  // If there's already a valid session, don't show the login form — bounce into the
  // gated app and let `AuthGate` decide exactly where (calendar vs. the "no
  // organization" state), rather than duplicating that decision here.
  const { data: session, isPending: sessionPending } = useSession();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async () => {
        // The session cookie is already set by the browser (see the `credentials:
        // 'include'` fix in `customFetch`) — refresh the cached session query so
        // `AuthGate` picks up the new `authenticated`/`organizationId` state
        // immediately instead of waiting for its own next refetch.
        await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
        setLocation('/');
      },
      onError: (err) => {
        const message =
          err?.data?.message ??
          (err?.status === 401
            ? 'Incorrect email or password.'
            : 'Something went wrong signing you in. Please try again.');
        toast({ title: 'Login failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate({ data: values });
  };

  // Already authenticated with a usable session — skip the form entirely.
  if (!sessionPending && session?.authenticated) {
    return <Redirect to="/" />;
  }

  return (
    <AuthShell>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-4" data-testid="form-login">
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
                      autoComplete="current-password"
                      placeholder="••••••••"
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
            disabled={loginMutation.isPending}
            data-testid="button-login"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
              </>
            ) : (
              'Log In'
            )}
          </Button>

          <p className="text-center text-[13px] text-muted-foreground pt-2">
            Don't have an account?{' '}
            <Link href="/signup" className="text-primary font-medium" data-testid="link-signup">
              Sign up
            </Link>
          </p>
        </form>
      </Form>
    </AuthShell>
  );
}
