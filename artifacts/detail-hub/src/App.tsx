import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { BottomNav } from '@/components/bottom-nav';
import { SidebarNav } from '@/components/sidebar-nav';

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

/** Fixed gradient orb layer — always behind everything */
function GradientBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 75% 60% at 10% -5%,  rgba(54, 84, 255, 0.13) 0%, transparent 58%),
          radial-gradient(ellipse 60% 50% at 90% 105%, rgba(124, 58, 237, 0.10) 0%, transparent 58%),
          radial-gradient(ellipse 45% 40% at 52% 48%,  rgba(6, 182, 212, 0.07)  0%, transparent 65%),
          hsl(230, 50%, 98%)
        `,
      }}
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GradientBackground />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/">
              <Redirect to="/calendar" />
            </Route>
            <Route>
              <AppShell />
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
