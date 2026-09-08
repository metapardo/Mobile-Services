import { and, eq } from "drizzle-orm";
import { packagesTable, type InsertPackage, type Package } from "./schema";
import { withOrganization } from "./tenant";

export type CreatePackageInput = Omit<InsertPackage, "organizationId" | "archived">;
export type UpdatePackageInput = Partial<Omit<InsertPackage, "organizationId">>;

/**
 * Lists an organization's packages. Excludes archived (soft-deleted) packages by
 * default — pass `includeArchived: true` for admin/reporting views that need the
 * full catalog including retired packages still referenced by historical bookings.
 */
export async function listPackages(
  organizationId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Package[]> {
  return withOrganization(organizationId, async (tx) => {
    const conditions = [eq(packagesTable.organizationId, organizationId)];
    if (!opts.includeArchived) {
      conditions.push(eq(packagesTable.archived, false));
    }
    return tx
      .select()
      .from(packagesTable)
      .where(and(...conditions));
  });
}

export async function getPackageById(organizationId: string, id: number): Promise<Package | null> {
  return withOrganization(organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(packagesTable)
      .where(and(eq(packagesTable.organizationId, organizationId), eq(packagesTable.id, id)));
    return row ?? null;
  });
}

export async function createPackage(organizationId: string, input: CreatePackageInput): Promise<Package> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(packagesTable)
      .values({ ...input, organizationId })
      .returning();
    return created!;
  });
}

export async function updatePackage(
  organizationId: string,
  id: number,
  patch: UpdatePackageInput,
): Promise<Package | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(packagesTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(packagesTable.organizationId, organizationId), eq(packagesTable.id, id)))
      .returning();
    return updated ?? null;
  });
}

/** Soft-delete: marks the package archived rather than removing the row (see
 * `clients.ts`'s `archiveClient` for the same reasoning). */
export async function archivePackage(organizationId: string, id: number): Promise<Package | null> {
  return updatePackage(organizationId, id, { archived: true });
}
