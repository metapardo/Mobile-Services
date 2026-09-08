import { useState } from 'react';
import { useListClients, useListBookings } from '@workspace/api-client-react';
import { adaptBooking } from '@/lib/api-adapters';
import { Link } from 'wouter';
import { Search, UserCircle, UserPlus, Loader2, AlertTriangle } from 'lucide-react';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Avatar, AvatarFallback } from '@workspace/blue-glass-design-system/components/ui/avatar';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@workspace/blue-glass-design-system/components/ui/empty';
import { EmptyState } from '@/components/empty-state';
import { format } from 'date-fns';

export default function Clients() {
  const [search, setSearch] = useState('');

  const clientsQuery = useListClients();
  // This page needs "last completed service" across every client in the list,
  // not just one, so the per-client `clientId` filter on `GET /bookings` doesn't
  // apply here — it still fetches the organization's full booking history
  // (unscoped, same endpoint calendar.tsx uses without a date range) and derives
  // each client's last booking client-side. Flag for backend-engineer if this
  // needs to become a real paginated/aggregated query once organizations have
  // enough history for this to matter.
  const bookingsQuery = useListBookings();

  const clients = clientsQuery.data ?? [];
  const bookings = (bookingsQuery.data ?? []).map(adaptBooking);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const sortedClients = [...filteredClients].sort((a, b) => a.name.localeCompare(b.name));

  const isLoading = clientsQuery.isLoading || bookingsQuery.isLoading;
  const isError = clientsQuery.isError || bookingsQuery.isError;

  // A brand-new organization has zero clients, period — distinct from a
  // search that just happens to match nothing. That case gets a dedicated
  // "add your first client" empty state with a real CTA; a no-results search
  // keeps the existing lightweight `EmptyState` message below.
  const hasNoClientsAtAll = !isLoading && !isError && clients.length === 0;

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-semibold mb-6">Clients</h1>

        {!hasNoClientsAtAll && !isLoading && !isError && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
        )}

        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" data-testid="status-clients-error">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-[15px] font-semibold">Couldn't load your clients</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16" data-testid="status-clients-loading">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : hasNoClientsAtAll ? (
          <Empty className="border border-border rounded-xl" data-testid="empty-state-clients">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserCircle />
              </EmptyMedia>
              <EmptyTitle>No clients yet</EmptyTitle>
              <EmptyDescription>
                Add your first client to start tracking their bookings, contact info, and history in one place.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/booking/new?newClient=1">
                <Button data-testid="button-add-first-client">
                  <UserPlus />
                  Add your first client
                </Button>
              </Link>
            </EmptyContent>
          </Empty>
        ) : sortedClients.length === 0 ? (
          <EmptyState icon={UserCircle} message="No clients found" />
        ) : (
          <div className="space-y-2">
            {sortedClients.map((client) => {
              const clientBookings = bookings.filter(b => b.clientId === client.id);
              const lastBooking = clientBookings
                .filter(b => b.status === 'completed')
                .sort((a, b) => b.date.localeCompare(a.date))[0];

              const initials = client.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase();

              return (
                <Link key={client.id} href={`/client/${client.id}`}>
                  <Card className="p-4 border border-border rounded-xl hover:bg-muted transition-colors" data-testid={`client-${client.id}`}>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[15px]">{client.name}</p>
                        <p className="text-[13px] text-muted-foreground">{client.phone}</p>
                        {lastBooking && (
                          <p className="text-[13px] text-muted-foreground">
                            Last service: {format(new Date(lastBooking.date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
