import { and, eq } from "drizzle-orm";
import { clientsTable, type InsertClient, type Client } from "./schema";
import { withOrganization } from "./tenant";

export type CreateClientInput = Omit<InsertClient, "organizationId" | "archived">;
export type UpdateClientInput = Partial<Omit<InsertClient, "organizationId">>;

/**
 * Lists an organization's clients. Excludes archived (soft-deleted) clients by
 * default — pass `includeArchived: true` for views that need full history (e.g. a
 * client-detail page reached from an old booking).
 */
export async function listClients(
  organizationId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Client[]> {
  return withOrganization(organizationId, async (tx) => {
    const conditions = [eq(clientsTable.organizationId, organizationId)];
    if (!opts.includeArchived) {
      conditions.push(eq(clientsTable.archived, false));
    }
    return tx
      .select()
      .from(clientsTable)
      .where(and(...conditions));
  });
}

export async function getClientById(organizationId: string, id: number): Promise<Client | null> {
  return withOrganization(organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.organizationId, organizationId), eq(clientsTable.id, id)));
    return row ?? null;
  });
}

export async function createClient(organizationId: string, input: CreateClientInput): Promise<Client> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(clientsTable)
      .values({ ...input, organizationId })
      .returning();
    return created!;
  });
}

export async function updateClient(
  organizationId: string,
  id: number,
  patch: UpdateClientInput,
): Promise<Client | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(clientsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(clientsTable.organizationId, organizationId), eq(clientsTable.id, id)))
      .returning();
    return updated ?? null;
  });
}

/** Soft-delete: marks the client archived rather than removing the row, so any
 * booking that already references it keeps a valid `clientId` (see
 * `PRD_DetailHub_Real_Bookings_Clients_Backend.md` Section 10/Edge Cases). */
export async function archiveClient(organizationId: string, id: number): Promise<Client | null> {
  return updateClient(organizationId, id, { archived: true });
}
