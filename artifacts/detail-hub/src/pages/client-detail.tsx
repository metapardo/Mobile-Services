import { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetClient,
  useUpdateClient,
  useListBookings,
  useListPackages,
  getGetClientQueryKey,
  getListClientsQueryKey,
  getListBookingsQueryKey,
} from '@workspace/api-client-react';
import { adaptBooking } from '@/lib/api-adapters';
import { ArrowLeft, Edit2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Avatar, AvatarFallback } from '@workspace/blue-glass-design-system/components/ui/avatar';
import { StatusBadge } from '@/components/status-badge';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@workspace/blue-glass-design-system/components/ui/dialog';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Textarea } from '@workspace/blue-glass-design-system/components/ui/textarea';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ClientDetail() {
  const params = useParams();
  const clientId = parseInt(params.id || '0');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const clientQuery = useGetClient(clientId, {
    query: { queryKey: getGetClientQueryKey(clientId), enabled: !!clientId },
  });
  const client = clientQuery.data;

  const bookingsQuery = useListBookings(
    { clientId },
    { query: { queryKey: getListBookingsQueryKey({ clientId }), enabled: !!clientId } },
  );
  // `includeArchived` — booking history can reference a package that's since been
  // retired; this page needs to resolve its name/price even though it wouldn't show
  // up in a "pick a package for a new booking" list anymore.
  const packagesQuery = useListPackages({ includeArchived: true });

  const [editOpen, setEditOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', notes: '' });

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name,
        phone: client.phone,
        email: client.email ?? '',
        address: client.address ?? '',
        notes: client.notes ?? '',
      });
    }
  }, [client?.id]);

  const updateClientMutation = useUpdateClient({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) }),
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() }),
        ]);
        toast({ title: 'Client updated' });
        setEditOpen(false);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong saving this client. Please try again.';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      },
    },
  });

  // Email/address are optional on the real `clients` schema (a quick-added
  // client from the appointment-creation flow may have neither) — only
  // format-validate email when something's actually typed, don't require
  // either field to be present just to save an unrelated edit.
  const formValid =
    formData.name.trim().length > 0 &&
    formData.phone.trim().length > 0 &&
    (formData.email.trim().length === 0 || EMAIL_RE.test(formData.email.trim()));

  const handleSave = () => {
    if (!formValid) return;
    updateClientMutation.mutate({
      id: clientId,
      data: {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() ? formData.email.trim() : null,
        address: formData.address.trim() ? formData.address.trim() : null,
        notes: formData.notes.trim() ? formData.notes.trim() : null,
      },
    });
  };

  if (clientQuery.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-20 md:pb-6 flex items-center justify-center" data-testid="status-client-loading">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (clientQuery.isError || !client) {
    return (
      <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
        <div className="max-w-2xl mx-auto px-4 pt-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p>Client not found</p>
          <Link href="/clients" className="text-primary text-[14px]">Back to Clients</Link>
        </div>
      </div>
    );
  }

  const packages = packagesQuery.data ?? [];
  const clientBookings = (bookingsQuery.data ?? [])
    .map(adaptBooking)
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
                    type="email"
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
                <Button
                  onClick={handleSave}
                  className="w-full"
                  disabled={!formValid || updateClientMutation.isPending}
                  data-testid="button-save"
                >
                  {updateClientMutation.isPending ? 'Saving…' : 'Save Changes'}
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
              <p className="text-[15px]">
                {client.email || <span className="text-muted-foreground">Not provided</span>}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground mb-0.5">Address</p>
              <p className="text-[15px]">
                {client.address || <span className="text-muted-foreground">Not provided</span>}
              </p>
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
            {clientBookings.length === 0 && (
              <p className="text-[13px] text-muted-foreground">No bookings yet for this client.</p>
            )}
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
