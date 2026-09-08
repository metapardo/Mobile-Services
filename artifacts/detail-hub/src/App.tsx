import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@workspace/blue-glass-design-system/components/ui/toaster';
import { TooltipProvider } from '@workspace/blue-glass-design-system/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { BottomNav } from '@/components/bottom-nav';
import { SidebarNav } from '@/components/sidebar-nav';
import { AuthGate } from '@/components/auth-gate';
import { useSession } from '@/hooks/use-session';

import Login from '@/pages/login';
import Signup from '@/pages/signup';
import Home from '@/pages/home';
import Calendar from '@/pages/calendar';

import Clients from '@/pages/clients';
import ClientDetail from '@/pages/client-detail';
import BookingNew from '@/pages/booking-new';
import BookingDetail from '@/pages/booking-detail';
import More from '@/pages/more';
import Checkout from '@/pages/checkout';
import CheckoutReview from '@/pages/checkout-review';
import CheckoutPayment from '@/pages/checkout-payment';
import Reporting from '@/pages/reporting';
import Packages from '@/pages/packages';
import PayrollOverview from '@/pages/payroll-overview';
import PayrollTeam from '@/pages/payroll-team';
import PayrollTimeTracking from '@/pages/payroll-time-tracking';
import PayrollTimeOff from '@/pages/payroll-time-off';
import PayrollRun from '@/pages/payroll-run';
import Settings from '@/pages/settings';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/home" component={Home} />
      <Route path="/calendar" component={Calendar} />

      <Route path="/clients" component={Clients} />
      <Route path="/client/:id" component={ClientDetail} />
      <Route path="/booking/new" component={BookingNew} />
      <Route path="/booking/:id" component={BookingDetail} />
      <Route path="/checkout/payment" component={CheckoutPayment} />
      <Route path="/checkout/review" component={CheckoutReview} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/more" component={More} />
      <Route path="/more/reporting" component={Reporting} />
      <Route path="/more/packages" component={Packages} />
      <Route path="/more/payroll/team" component={PayrollTeam} />
      <Route path="/more/payroll/time-tracking" component={PayrollTimeTracking} />
      <Route path="/more/payroll/time-off" component={PayrollTimeOff} />
      <Route path="/more/payroll/run" component={PayrollRun} />
      <Route path="/more/payroll" component={PayrollOverview} />
      <Route path="/more/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  return (
    <div className="relative">
      <SidebarNav />
      <div className="md:pl-64">
        <Router />
      </div>
      <BottomNav />
    </div>
  );
}

/**
 * `/` is public (unlike every other route, which lives behind `AuthGate`): a visitor with
 * no session should see the marketing/signup page, not get bounced to `/login`. A visitor
 * who already has a valid session + organization should skip the marketing page and land
 * straight in the app. Mirrors the same `useSession` check `AuthGate` uses, but the
 * unauthenticated fallback here is the marketing page (`Signup`), not a redirect to
 * `/login`.
 */
function RootRoute() {
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (data?.authenticated && data.organizationId) {
    return <Redirect to="/calendar" />;
  }

  return <Signup />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            {/* `/`, `/login`, and `/signup` are the only routes that must stay ungated —
                everything else renders behind `AuthGate` below. */}
            <Route path="/" component={RootRoute} />
            <Route path="/login" component={Login} />
            <Route path="/signup" component={Signup} />
            <Route>
              <AuthGate>
                <AppShell />
              </AuthGate>
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
