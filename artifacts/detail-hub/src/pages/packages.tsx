import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListPackages,
  useCreatePackage,
  useUpdatePackage,
  useArchivePackage,
  getListPackagesQueryKey,
  type PackageResult,
} from '@workspace/api-client-react';
import { ArrowLeft, Plus, Archive, Loader2, AlertTriangle, PackageX } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Textarea } from '@workspace/blue-glass-design-system/components/ui/textarea';
import { Switch } from '@workspace/blue-glass-design-system/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/blue-glass-design-system/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/blue-glass-design-system/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@workspace/blue-glass-design-system/components/ui/alert-dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@workspace/blue-glass-design-system/components/ui/empty';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';

type PackageCategory = 'Exterior' | 'Interior' | 'Full' | 'Add-on';

// OBS-2 (`BUGS_Mobull_2026-09-10.md`) — a 1-minute service made it into the
// catalog and every downstream gap/slot-fitting calculation (BUG-3, the
// Appointment Optimizer) treats it as an instantly-bookable no-op. This is
// frontend-only client-side validation; no server-side check exists yet
// (flagged in this batch's report rather than added here — out of scope for
// this fix).
const MIN_PACKAGE_DURATION_MINUTES = 5;

interface PackageFormState {
  name: string;
  category: PackageCategory;
  description: string;
  price: number;
  durationMinutes: number;
  isAddon: boolean;
}

const EMPTY_FORM: PackageFormState = {
  name: '',
  category: 'Exterior',
  description: '',
  price: 0,
  durationMinutes: 60,
  isAddon: false,
};

export default function Packages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageResult | null>(null);
  const [formData, setFormData] = useState<PackageFormState>(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<PackageResult | null>(null);

  // `includeArchived` so admins can still see (and reference) packages they've
  // archived, even though archiving is one-directional (there's no "unarchive").
  const packagesQuery = useListPackages({ includeArchived: true });
  const allPackages = packagesQuery.data ?? [];

  const invalidatePackages = () =>
    queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });

  const createPackageMutation = useCreatePackage({
    mutation: {
      onSuccess: async () => {
        await invalidatePackages();
        toast({ title: 'Package created' });
        setEditOpen(false);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong creating this package. Please try again.';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      },
    },
  });

  const updatePackageMutation = useUpdatePackage({
    mutation: {
      onSuccess: async () => {
        await invalidatePackages();
        toast({ title: 'Package updated' });
        setEditOpen(false);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong saving this package. Please try again.';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      },
    },
  });

  const archivePackageMutation = useArchivePackage({
    mutation: {
      onSuccess: async () => {
        await invalidatePackages();
        toast({ title: 'Package archived' });
        setArchiveTarget(null);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong archiving this package. Please try again.';
        toast({ title: 'Archive failed', description: message, variant: 'destructive' });
      },
    },
  });

  const activePackages = allPackages.filter(p => !p.archived);
  const archivedPackages = allPackages.filter(p => p.archived);

  const packagesByCategory = activePackages.reduce((acc, pkg) => {
    if (!acc[pkg.category]) acc[pkg.category] = [];
    acc[pkg.category].push(pkg);
    return acc;
  }, {} as Record<string, PackageResult[]>);

  const handleEdit = (pkg: PackageResult) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      category: pkg.category,
      description: pkg.description,
      price: pkg.price,
      durationMinutes: pkg.durationMinutes,
      isAddon: pkg.isAddon,
    });
    setEditOpen(true);
  };

  const handleNew = () => {
    setEditingPackage(null);
    setFormData(EMPTY_FORM);
    setEditOpen(true);
  };

  const handleSave = () => {
    const data = {
      name: formData.name,
      category: formData.category,
      description: formData.description,
      price: formData.price,
      durationMinutes: formData.durationMinutes,
      isAddon: formData.isAddon,
    };
    if (editingPackage) {
      updatePackageMutation.mutate({ id: editingPackage.id, data });
    } else {
      createPackageMutation.mutate({ data });
    }
  };

  const isSaving = createPackageMutation.isPending || updatePackageMutation.isPending;
  const hasNoPackagesAtAll = !packagesQuery.isLoading && !packagesQuery.isError && allPackages.length === 0;
  const isDurationValid = formData.durationMinutes >= MIN_PACKAGE_DURATION_MINUTES;

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/more" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to More</span>
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Package Admin</h1>
          <Button onClick={handleNew} size="sm" data-testid="button-new-package">
            <Plus className="w-4 h-4 mr-1" />
            New Package
          </Button>
        </div>

        {packagesQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center" data-testid="status-packages-error">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-[15px] font-semibold">Couldn't load your packages</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
          </div>
        ) : packagesQuery.isLoading ? (
          <div className="flex items-center justify-center py-16" data-testid="status-packages-loading">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : hasNoPackagesAtAll ? (
          <Empty className="border border-border rounded-xl bg-card" data-testid="empty-state-packages">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageX />
              </EmptyMedia>
              <EmptyTitle>No packages yet</EmptyTitle>
              <EmptyDescription>
                Add your first service to start booking jobs against real pricing and duration.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={handleNew} data-testid="button-add-first-package">
                <Plus className="w-4 h-4 mr-1" />
                Add your first service
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {Object.entries(packagesByCategory).map(([category, pkgs]) => (
              <div key={category} className="mb-6">
                <h2 className="text-[18px] font-semibold mb-3">{category}</h2>
                <div className="space-y-2">
                  {pkgs.map(pkg => (
                    <Card
                      key={pkg.id}
                      onClick={() => handleEdit(pkg)}
                      className="p-4 border border-border rounded-xl hover:bg-muted transition-colors cursor-pointer"
                      data-testid={`package-${pkg.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-[15px]">{pkg.name}</p>
                            {pkg.isAddon && (
                              <span className="text-[11px] px-2 py-0.5 bg-muted text-muted-foreground rounded">
                                Add-on
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-muted-foreground mb-1">{pkg.description}</p>
                          <p className="text-[13px] text-muted-foreground">{pkg.durationMinutes} min</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className="text-[18px] font-semibold tabular-nums">${pkg.price}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setArchiveTarget(pkg);
                            }}
                            data-testid={`button-archive-${pkg.id}`}
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {archivedPackages.length > 0 && (
              <div className="mb-6">
                <h2 className="text-[18px] font-semibold mb-3 text-muted-foreground">Archived</h2>
                <div className="space-y-2">
                  {archivedPackages.map(pkg => (
                    <Card
                      key={pkg.id}
                      className="p-4 border border-border rounded-xl opacity-50"
                      data-testid={`package-${pkg.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-[15px] mb-1">{pkg.name}</p>
                          <p className="text-[13px] text-muted-foreground">{pkg.durationMinutes} min</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[18px] font-semibold tabular-nums">${pkg.price}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPackage ? 'Edit Package' : 'New Package'}</DialogTitle>
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
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as PackageCategory })}>
                  <SelectTrigger id="category" data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Exterior">Exterior</SelectItem>
                    <SelectItem value="Interior">Interior</SelectItem>
                    <SelectItem value="Full">Full</SelectItem>
                    <SelectItem value="Add-on">Add-on</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  data-testid="input-description"
                />
              </div>
              <div>
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  data-testid="input-price"
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={MIN_PACKAGE_DURATION_MINUTES}
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 0 })}
                  data-testid="input-duration"
                />
                {/* OBS-2 — same inline-error convention as the rest of this
                    app's forms (e.g. `payroll-run.tsx`'s "Run By" field). */}
                {!isDurationValid && (
                  <p className="text-[12px] text-destructive mt-1" data-testid="text-duration-error">
                    Duration must be at least {MIN_PACKAGE_DURATION_MINUTES} minutes.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isAddon">Is Add-on</Label>
                <Switch
                  id="isAddon"
                  checked={formData.isAddon}
                  onCheckedChange={(checked) => setFormData({ ...formData, isAddon: checked })}
                  data-testid="switch-addon"
                />
              </div>
              <Button onClick={handleSave} className="w-full" disabled={isSaving || !isDurationValid} data-testid="button-save">
                {isSaving ? 'Saving…' : editingPackage ? 'Save Changes' : 'Create Package'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Package</AlertDialogTitle>
              <AlertDialogDescription>
                Archiving "{archiveTarget?.name}" removes it from the booking form's package picker, but keeps it
                attached to any existing bookings that already reference it. This can't be undone from here —
                ask an admin to recreate the package if you need it back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => archiveTarget && archivePackageMutation.mutate({ id: archiveTarget.id })}
                disabled={archivePackageMutation.isPending}
                data-testid="button-confirm-archive"
              >
                {archivePackageMutation.isPending ? 'Archiving…' : 'Archive'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
