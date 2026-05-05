import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeoCollection } from "./shapefile";
import type { LotData, RindeData, ParsedRow, ColumnMapping } from "./data-parser";

export interface LotVisit {
  date: string;        // "YYYY-MM-DD"
  note: string;
  yieldStars: number;  // 0 = not set, 1–5
  sprayTarget: string;
  sprayEffect: number; // 0 = not set, 1–5
  fitotoxicity?: number; // undefined = not asked; 0 = sin daño … 5 = perdido
}

export interface DriveManejo {
  fileId: string;
  type: "sheets" | "file";
  url: string;
}

// ─── Rain data ───────────────────────────────────────────────────────────────

export interface RainReading {
  date: string;       // "YYYY-MM-DD"
  mm: number;
  campaign: string;   // "25-26"
  source?: string;    // "recorrida" | "upload"
}

export type RainData = Record<string, RainReading[]>; // key = pluviometro/lot name

// ─── Workspace types ─────────────────────────────────────────────────────────

export interface Workspace {
  workspaceName: string;      // display label
  workspaceLogo: string;      // base64 data URL, "" if none
  fieldName: string;
  lotCount: number;
  collections: GeoCollection[];
  colorMap: Record<string, string>;
  cultivoColorMap: Record<string, string>;
  lotData: LotData;
  allRows: ParsedRow[];
  rindeData: RindeData;
  lotVisits: Record<string, LotVisit[]>;
  shpFiles: string[];
  csvFiles: string[];
  rindeFiles: string[];
  shpFileMeta: FileMeta[];
  csvFileMeta: FileMeta[];
  rindeFileMeta: FileMeta[];
  driveManejo?: DriveManejo | null;
  manejoColMapping?: ColumnMapping | null;
  rainData: RainData;
  pluviometroMap: Record<string, string>;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  logo: string;
  updatedAt: string;
}

// ─── File / empresa meta ─────────────────────────────────────────────────────

export interface FileMeta {
  name: string;
  empresaId?: string;
}

// ─── Date serialization ─────────────────────────────────────────────────────

type SerializedParsedRow = Omit<ParsedRow, "_fecha"> & { _fecha: string | null };
type SerializedLotData = Record<string, SerializedParsedRow[]>;

function serializeLotData(data: LotData): SerializedLotData {
  const out: SerializedLotData = {};
  for (const [k, rows] of Object.entries(data)) {
    out[k] = rows.map((r) => ({ ...r, _fecha: r._fecha ? r._fecha.toISOString() : null }));
  }
  return out;
}

function deserializeLotData(data: SerializedLotData): LotData {
  const out: LotData = {};
  for (const [k, rows] of Object.entries(data)) {
    out[k] = rows.map((r) => ({
      ...r,
      _fecha: r._fecha ? new Date(r._fecha) : null,
    })) as ParsedRow[];
  }
  return out;
}

function serializeAllRows(rows: ParsedRow[]): SerializedParsedRow[] {
  return rows.map((r) => ({ ...r, _fecha: r._fecha ? r._fecha.toISOString() : null }));
}

export function deserializeAllRows(rows: SerializedParsedRow[]): ParsedRow[] {
  return rows.map((r) => ({
    ...r,
    _fecha: r._fecha ? new Date(r._fecha) : null,
  })) as ParsedRow[];
}

function deserializeWorkspaceRow(data: Record<string, unknown>): Workspace {
  return {
    workspaceName: (data.name as string) ?? "",
    workspaceLogo: (data.logo as string) ?? "",
    fieldName: (data.field_name as string) ?? "",
    lotCount: (data.lot_count as number) ?? 0,
    collections: (data.collections ?? []) as GeoCollection[],
    colorMap: (data.color_map ?? {}) as Record<string, string>,
    cultivoColorMap: (data.cultivo_color_map ?? {}) as Record<string, string>,
    lotData: deserializeLotData((data.lot_data ?? {}) as SerializedLotData),
    allRows: deserializeAllRows((data.all_rows ?? []) as SerializedParsedRow[]),
    rindeData: (data.rinde_data ?? {}) as RindeData,
    lotVisits: (data.lot_visits ?? {}) as Record<string, LotVisit[]>,
    shpFiles: (data.shp_files ?? []) as string[],
    csvFiles: (data.csv_files ?? []) as string[],
    rindeFiles: (data.rinde_files ?? []) as string[],
    shpFileMeta: (data.shp_file_meta ?? []) as FileMeta[],
    csvFileMeta: (data.csv_file_meta ?? []) as FileMeta[],
    rindeFileMeta: (data.rinde_file_meta ?? []) as FileMeta[],
    driveManejo: (data.drive_manejo ?? null) as DriveManejo | null,
    manejoColMapping: (data.manejo_col_mapping ?? null) as ColumnMapping | null,
    rainData: (data.rain_data ?? {}) as RainData,
    pluviometroMap: (data.pluviometro_map ?? {}) as Record<string, string>,
  };
}

// ─── Active workspace (localStorage) ─────────────────────────────────────────

const ACTIVE_WS_KEY = "iag_active_ws";

export function getActiveWorkspaceId(): string | null {
  try { return localStorage.getItem(ACTIVE_WS_KEY); } catch { return null; }
}

export function setActiveWorkspaceId(id: string): void {
  try { localStorage.setItem(ACTIVE_WS_KEY, id); } catch {}
}

export function clearActiveWorkspaceId(): void {
  try { localStorage.removeItem(ACTIVE_WS_KEY); } catch {}
}

// ─── Workspace summaries ──────────────────────────────────────────────────────

export async function loadWorkspaceSummaries(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceSummary[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, logo, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as Array<{ id: string; name: string; logo: string; updated_at: string }>).map((r) => ({
    id: r.id,
    name: r.name ?? "",
    logo: r.logo ?? "",
    updatedAt: r.updated_at ?? "",
  }));
}

export async function createWorkspace(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  logo = ""
): Promise<string> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ user_id: userId, name, logo })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Error al crear espacio");
  return (data as { id: string }).id;
}

export async function renameWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  name: string,
  logo: string
): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .update({ name, logo, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error) throw new Error(error.message);
}

export async function deleteWorkspace(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId);
  if (error) throw new Error(error.message);
}

// ─── Supabase save ────────────────────────────────────────────────────────────

export async function saveWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  state: Workspace
): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .update({
      name: state.workspaceName || null,
      logo: state.workspaceLogo || null,
      field_name: state.fieldName,
      lot_count: state.lotCount,
      collections: state.collections,
      color_map: state.colorMap,
      cultivo_color_map: state.cultivoColorMap,
      lot_data: serializeLotData(state.lotData),
      all_rows: serializeAllRows(state.allRows),
      rinde_data: state.rindeData,
      lot_visits: state.lotVisits,
      shp_files: state.shpFiles,
      csv_files: state.csvFiles,
      rinde_files: state.rindeFiles,
      shp_file_meta: state.shpFileMeta,
      csv_file_meta: state.csvFileMeta,
      rinde_file_meta: state.rindeFileMeta,
      drive_manejo: state.driveManejo ?? null,
      manejo_col_mapping: state.manejoColMapping ?? null,
      rain_data: state.rainData,
      pluviometro_map: state.pluviometroMap,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);
  if (error) console.warn("[db] saveWorkspace:", error.message);
}

// ─── Supabase load ────────────────────────────────────────────────────────────

export async function loadWorkspace(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();
  if (error || !data) return null;
  return deserializeWorkspaceRow(data as Record<string, unknown>);
}

// ─── localStorage workspace (keyed by workspace ID) ───────────────────────────

function localWsKey(workspaceId: string): string {
  return `iag_ws_${workspaceId}`;
}

export function saveWorkspaceLocal(state: Workspace, workspaceId: string): void {
  try {
    localStorage.setItem(
      localWsKey(workspaceId),
      JSON.stringify({
        workspaceName: state.workspaceName,
        workspaceLogo: state.workspaceLogo,
        fieldName: state.fieldName,
        lotCount: state.lotCount,
        collections: state.collections,
        colorMap: state.colorMap,
        cultivoColorMap: state.cultivoColorMap,
        lot_data: serializeLotData(state.lotData),
        all_rows: serializeAllRows(state.allRows),
        rinde_data: state.rindeData,
        lot_visits: state.lotVisits,
        shp_files: state.shpFiles,
        csv_files: state.csvFiles,
        rinde_files: state.rindeFiles,
        shp_file_meta: state.shpFileMeta,
        csv_file_meta: state.csvFileMeta,
        rinde_file_meta: state.rindeFileMeta,
        drive_manejo: state.driveManejo ?? null,
        manejo_col_mapping: state.manejoColMapping ?? null,
        rain_data: state.rainData,
        pluviometro_map: state.pluviometroMap,
      })
    );
  } catch {
    // Storage quota exceeded — silently skip
  }
}

export function loadWorkspaceLocal(workspaceId: string): Workspace | null {
  try {
    const raw = localStorage.getItem(localWsKey(workspaceId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      workspaceName: (data.workspaceName as string) ?? "",
      workspaceLogo: (data.workspaceLogo as string) ?? "",
      fieldName: (data.fieldName as string) ?? "",
      lotCount: (data.lotCount as number) ?? 0,
      collections: (data.collections ?? []) as GeoCollection[],
      colorMap: (data.colorMap ?? {}) as Record<string, string>,
      cultivoColorMap: (data.cultivoColorMap ?? {}) as Record<string, string>,
      lotData: deserializeLotData((data.lot_data ?? {}) as SerializedLotData),
      allRows: deserializeAllRows((data.all_rows ?? []) as SerializedParsedRow[]),
      rindeData: (data.rinde_data ?? {}) as RindeData,
      lotVisits: (data.lot_visits ?? {}) as Record<string, LotVisit[]>,
      shpFiles: (data.shp_files ?? []) as string[],
      csvFiles: (data.csv_files ?? []) as string[],
      rindeFiles: (data.rinde_files ?? []) as string[],
      shpFileMeta: (data.shp_file_meta ?? []) as FileMeta[],
      csvFileMeta: (data.csv_file_meta ?? []) as FileMeta[],
      rindeFileMeta: (data.rinde_file_meta ?? []) as FileMeta[],
      driveManejo: (data.drive_manejo ?? null) as DriveManejo | null,
      manejoColMapping: (data.manejo_col_mapping ?? null) as ColumnMapping | null,
      rainData: (data.rain_data ?? {}) as RainData,
      pluviometroMap: (data.pluviometro_map ?? {}) as Record<string, string>,
    };
  } catch {
    return null;
  }
}

// ─── Management data backup (localStorage only, 7-day TTL) ──────────────────

const BACKUP_KEY = "iag_management_backup";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function saveManagementBackup(rows: ParsedRow[]): void {
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ rows: serializeAllRows(rows), timestamp: Date.now() })
    );
  } catch {
    // quota
  }
}

export function loadManagementBackup(): { rows: ParsedRow[]; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const backup = JSON.parse(raw) as { rows: SerializedParsedRow[]; timestamp: number };
    if (Date.now() - backup.timestamp >= SEVEN_DAYS) {
      localStorage.removeItem(BACKUP_KEY);
      return null;
    }
    return { rows: deserializeAllRows(backup.rows), timestamp: backup.timestamp };
  } catch {
    return null;
  }
}

export function clearManagementBackup(): void {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore
  }
}

// ─── User profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  role: "asesor" | "productor" | "ingeniero" | null;
  onboarding_done: boolean;
  display_name: string | null;
}

export async function getUserProfile(supabase: SupabaseClient): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role, onboarding_done, display_name")
    .single();
  if (error || !data) return null;
  const d = data as { role: string; onboarding_done: boolean; display_name: string };
  return {
    role: (d.role as UserProfile["role"]) ?? null,
    onboarding_done: d.onboarding_done ?? false,
    display_name: d.display_name ?? null,
  };
}

export async function setOnboardingDone(supabase: SupabaseClient, role: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  await supabase
    .from("user_profiles")
    .update({ onboarding_done: true, role })
    .eq("id", user.id);
}

// ─── Empresas ─────────────────────────────────────────────────────────────────

export interface Empresa {
  id: string;
  name: string;
  ownerId: string;
  workspaceId: string;
}

export async function getEmpresas(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Empresa[]> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id, name, owner_id, workspace_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Array<{ id: string; name: string; owner_id: string; workspace_id: string }>).map((e) => ({
    id: e.id,
    name: e.name,
    ownerId: e.owner_id,
    workspaceId: e.workspace_id,
  }));
}

export async function createEmpresa(
  supabase: SupabaseClient,
  workspaceId: string,
  name: string
): Promise<Empresa> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("No autenticado");
  const { data, error } = await supabase
    .from("empresas")
    .insert({ workspace_id: workspaceId, owner_id: authData.user.id, name })
    .select("id, name, owner_id, workspace_id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Error al crear empresa");
  const d = data as { id: string; name: string; owner_id: string; workspace_id: string };
  return { id: d.id, name: d.name, ownerId: d.owner_id, workspaceId: d.workspace_id };
}

// ─── Shared empresas ──────────────────────────────────────────────────────────

export interface SharedEmpresa {
  empresaId: string;
  empresaName: string;
  ownerWorkspaceId: string; // actual workspace UUID
  ownerName: string | null;
}

export async function getSharedEmpresas(supabase: SupabaseClient): Promise<SharedEmpresa[]> {
  const { data, error } = await supabase
    .from("empresa_members")
    .select(`
      empresa_id,
      empresas (
        id, name, owner_id, workspace_id,
        user_profiles ( display_name )
      )
    `)
    .order("joined_at", { ascending: true });
  if (error || !data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => {
      const emp = row.empresas;
      if (!emp) return null;
      const profile = Array.isArray(emp.user_profiles) ? emp.user_profiles[0] : emp.user_profiles;
      return {
        empresaId: emp.id,
        empresaName: emp.name,
        ownerWorkspaceId: emp.workspace_id,
        ownerName: profile?.display_name ?? null,
      };
    })
    .filter(Boolean) as SharedEmpresa[];
}

// ─── Invite to empresa ────────────────────────────────────────────────────────

export async function inviteToEmpresa(
  supabase: SupabaseClient,
  empresaId: string,
  email: string
): Promise<"added" | "invited"> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("No autenticado");
  const { error } = await supabase.from("empresa_invites").insert({
    empresa_id: empresaId,
    invited_email: email.toLowerCase().trim(),
    invited_by: authData.user.id,
  });
  if (error) throw new Error(error.message);
  return "invited";
}

// ─── Accept pending invites (call at login) ───────────────────────────────────

export async function acceptPendingEmpresaInvites(supabase: SupabaseClient): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user?.email) return;

  const { data: invites } = await supabase
    .from("empresa_invites")
    .select("id, empresa_id, invited_by")
    .eq("invited_email", user.email.toLowerCase())
    .is("accepted_at", null);

  if (!invites?.length) return;

  for (const inv of invites as Array<{ id: string; empresa_id: string; invited_by: string }>) {
    await supabase.from("empresa_members").upsert(
      { empresa_id: inv.empresa_id, member_user_id: user.id, invited_by: inv.invited_by },
      { onConflict: "empresa_id,member_user_id" }
    );
    await supabase
      .from("empresa_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);
  }
}

// ─── Empresa mutations ────────────────────────────────────────────────────────

export async function renameEmpresa(
  supabase: SupabaseClient,
  empresaId: string,
  newName: string
): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({ name: newName })
    .eq("id", empresaId);
  if (error) throw new Error(error.message);
}

export async function deleteEmpresa(
  supabase: SupabaseClient,
  empresaId: string
): Promise<void> {
  await supabase.from("empresa_invites").delete().eq("empresa_id", empresaId);
  await supabase.from("empresa_members").delete().eq("empresa_id", empresaId);
  const { error } = await supabase.from("empresas").delete().eq("id", empresaId);
  if (error) throw new Error(error.message);
}

// ─── File meta targeted update ────────────────────────────────────────────────

export async function saveFileMeta(
  supabase: SupabaseClient,
  workspaceId: string,
  field: "shp_file_meta" | "csv_file_meta" | "rinde_file_meta",
  meta: FileMeta[]
): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .update({ [field]: meta })
    .eq("id", workspaceId);
  if (error) console.warn("[db] saveFileMeta:", error.message);
}
