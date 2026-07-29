import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { BottomNav } from '@/components/bottom-nav';
import { SidebarNav } from '@/components/sidebar-nav';

import Login from '@/pages/login';
import Home from '@/pages/home';
import Calendar from '@/pages/calendar';
import Checkout from '@/pages/checkout';
import Clients from '@/pages/clients';
import ClientDetail from '@/pages/client-detail';
import BookingNew from '@/pages/booking-new';
import BookingDetail from '@/pages/booking-detail';
import More from '@/pages/more';
import Reporting from '@/pages/reporting';
import Packages from '@/pages/packages';
import Payroll from '@/pages/payroll';
import Settings from '@/pages/settings';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/home" component={Home} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/clients" component={Clients} />
      <Route path="/client/:id" component={ClientDetail} />
      <Route path="/booking/new" component={BookingNew} />
      <Route path="/booking/:id" component={BookingDetail} />
      <Route path="/more" component={More} />
      <Route path="/more/reporting" component={Reporting} />
      <Route path="/more/packages" component={Packages} />
      <Route path="/more/payroll" component={Payroll} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/" component={Login} />
            <Route path="/login" component={Login} />
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
