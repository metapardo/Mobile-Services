import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { clients, bookings, packages, updateClient } from '@/lib/mock-data';
import { ArrowLeft, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/status-badge';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function ClientDetail() {
  const params = useParams();
  const clientId = parseInt(params.id || '0');
  const client = clients.find(c => c.id === clientId);
  const [editOpen, setEditOpen] = useState(false);
  const [formData, setFormData] = useState(client || { id: 0, name: '', phone: '', email: '', address: '', notes: '' });

  if (!client) {
    return (
      <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <p>Client not found</p>
        </div>
      </div>
    );
  }

  const clientBookings = bookings
    .filter(b => b.clientId === clientId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalSpend = clientBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => {
      const pkgTotal = b.packageIds.reduce((s, id) => {
        const pkg = packages.find(p => p.id === id);
        return s + (pkg?.price || 0);
      }, 0);
      return sum + pkgTotal;
    }, 0);

  const initials = client.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  const handleSave = () => {
    updateClient(clientId, formData);
    setEditOpen(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/clients" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to Clients</span>
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold">{client.name}</h1>
              <p className="text-[15px] text-muted-foreground">Client</p>
            </div>
          </div>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-edit">
                <Edit2 className="w-4 h-4 mr-1" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Client</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-name"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    data-testid="input-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-address"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    data-testid="input-notes"
                  />
                </div>
                <Button onClick={handleSave} className="w-full" data-testid="button-save">
                  Save Changes
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="p-4 mb-6 border border-border rounded-xl">
          <div className="space-y-3">
            <div>
              <p className="text-[13px] text-muted-foreground mb-0.5">Phone</p>
              <p className="text-[15px]">{client.phone}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground mb-0.5">Email</p>
              <p className="text-[15px]">{client.email}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground mb-0.5">Address</p>
              <p className="text-[15px]">{client.address}</p>
            </div>
            {client.notes && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Notes</p>
                <p className="text-[15px]">{client.notes}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 mb-6 border border-border rounded-xl">
          <p className="text-[13px] text-muted-foreground mb-1">Total Spend</p>
          <p className="text-2xl font-semibold tabular-nums">${totalSpend.toFixed(2)}</p>
        </Card>

        <div>
          <h2 className="text-[18px] font-semibold mb-3">Booking History</h2>
          <div className="space-y-2">
            {clientBookings.map(booking => {
              const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
              const total = pkgs.reduce((sum, p) => sum + p.price, 0);
              
              return (
                <Link key={booking.id} href={`/booking/${booking.id}`}>
                  <Card className="p-4 border border-border rounded-xl hover:bg-muted transition-colors" data-testid={`booking-${booking.id}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-[15px] font-medium">
                          {format(new Date(booking.date), 'MMM d, yyyy')}
                        </p>
                        <p className="text-[13px] text-muted-foreground">{booking.startTime}</p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>
                    <p className="text-[15px] text-muted-foreground mb-1">
                      {pkgs.map(p => p.name).join(', ')}
                    </p>
                    <p className="text-[15px] font-medium tabular-nums">${total.toFixed(2)}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
