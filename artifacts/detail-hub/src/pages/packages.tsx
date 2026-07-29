import { useState } from 'react';
import { packages, createPackage, updatePackage, Package } from '@/lib/mock-data';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Packages() {
  const [editOpen, setEditOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Exterior' as 'Exterior' | 'Interior' | 'Full' | 'Add-on',
    description: '',
    price: 0,
    durationMinutes: 60,
    isAddon: false,
    archived: false,
  });

  const activePackages = packages.filter(p => !p.archived);
  const archivedPackages = packages.filter(p => p.archived);

  const packagesByCategory = activePackages.reduce((acc, pkg) => {
    if (!acc[pkg.category]) acc[pkg.category] = [];
    acc[pkg.category].push(pkg);
    return acc;
  }, {} as Record<string, typeof packages>);

  const handleEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      category: pkg.category,
      description: pkg.description,
      price: pkg.price,
      durationMinutes: pkg.durationMinutes,
      isAddon: pkg.isAddon,
      archived: pkg.archived || false,
    });
    setEditOpen(true);
  };

  const handleNew = () => {
    setEditingPackage(null);
    setFormData({
      name: '',
      category: 'Exterior',
      description: '',
      price: 0,
      durationMinutes: 60,
      isAddon: false,
      archived: false,
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    if (editingPackage) {
      updatePackage(editingPackage.id, formData);
    } else {
      createPackage(formData);
    }
    setEditOpen(false);
  };

  const handleToggleArchive = (pkg: Package) => {
    updatePackage(pkg.id, { archived: !pkg.archived });
  };

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
                    <div className="text-right">
                      <p className="text-[18px] font-semibold tabular-nums">${pkg.price}</p>
                      <Switch
                        checked={!pkg.archived}
                        onCheckedChange={() => handleToggleArchive(pkg)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2"
                        data-testid={`switch-archive-${pkg.id}`}
                      />
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
                  onClick={() => handleEdit(pkg)}
                  className="p-4 border border-border rounded-xl hover:bg-muted transition-colors cursor-pointer opacity-50"
                  data-testid={`package-${pkg.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-[15px] mb-1">{pkg.name}</p>
                      <p className="text-[13px] text-muted-foreground">{pkg.durationMinutes} min</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-semibold tabular-nums">${pkg.price}</p>
                      <Switch
                        checked={!pkg.archived}
                        onCheckedChange={() => handleToggleArchive(pkg)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
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
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as any })}>
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
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                  data-testid="input-price"
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                  data-testid="input-duration"
                />
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
              <Button onClick={handleSave} className="w-full" data-testid="button-save">
                {editingPackage ? 'Save Changes' : 'Create Package'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
