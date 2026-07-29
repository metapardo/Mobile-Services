import { useState } from 'react';
import { clients, bookings } from '@/lib/mock-data';
import { Link } from 'wouter';
import { Search, UserCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { format } from 'date-fns';

export default function Clients() {
  const [search, setSearch] = useState('');

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const sortedClients = [...filteredClients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-semibold mb-6">Clients</h1>

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

        {sortedClients.length === 0 ? (
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
