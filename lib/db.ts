import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeoCollection } from "./shapefile";
import type { LotData, RindeData, ParsedRow, RindeRow, ColumnMapping } from "./data-parser";

export interface LotVisit {
  date: string;        // "YYYY-MM-DD"
  note: string;
  yieldStars: number;  // 0 = not set, 1–5
  sprayTarget: string;
  sprayEffect: number; // 0 = not set, 1–5
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

// ─── Workspace type ──────────────────────────────────────────────────────────

export interface Workspace {
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
  pluviometroMap: Record<string, string>; // pluviometro name → lot name
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

// ─── Supabase save ───────────────────────────────────────────────────────────

export async function saveWorkspace(
  supabase: SupabaseClient,
  userId: string,
  state: Workspace
): Promise<void> {
  const { error } = await supabase.from("workspaces").upsert(
    {
      user_id: userId,
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
    },
    { onConflict: "user_id" }
  );
  if (error) console.warn("[db] saveWorkspace (cloud sync):", error.message);
}

// ─── Supabase load ───────────────────────────────────────────────────────────

export async function loadWorkspace(
  supabase: SupabaseClient,
  userId: string
): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    fieldName: data.field_name ?? "",
    lotCount: data.lot_count ?? 0,
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

// ─── localStorage workspace ──────────────────────────────────────────────────

const LOCAL_KEY = "iag_workspace";

export function saveWorkspaceLocal(state: Workspace): void {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
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

export function loadWorkspaceLocal(): Workspace | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      fieldName: data.fieldName ?? "",
      lotCount: data.lotCount ?? 0,
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
  return {
    role: data.role ?? null,
    onboarding_done: data.onboarding_done ?? false,
    display_name: data.display_name ?? null,
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
}

export async function getEmpresas(supabase: SupabaseClient): Promise<Empresa[]> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((e: { id: string; name: string; owner_id: string }) => ({
    id: e.id,
    name: e.name,
    ownerId: e.owner_id,
  }));
}

export async function createEmpresa(supabase: SupabaseClient, name: string): Promise<Empresa> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("No autenticado");
  const { data, error } = await supabase
    .from("empresas")
    .insert({ name, owner_id: authData.user.id })
    .select("id, name, owner_id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Error al crear empresa");
  return { id: data.id, name: data.name, ownerId: data.owner_id };
}

// ─── Shared empresas ──────────────────────────────────────────────────────────

export interface SharedEmpresa {
  empresaId: string;
  empresaName: string;
  ownerWorkspaceId: string; // = owner's user_id in workspaces
  ownerName: string | null;
}

export async function getSharedEmpresas(supabase: SupabaseClient): Promise<SharedEmpresa[]> {
  const { data, error } = await supabase
    .from("empresa_members")
    .select(`
      empresa_id,
      empresas (
        id, name, owner_id,
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
        ownerWorkspaceId: emp.owner_id,
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

  for (const inv of invites) {
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

// ─── File meta targeted update ────────────────────────────────────────────────

export async function saveFileMeta(
  supabase: SupabaseClient,
  workspaceOwnerId: string,
  field: "shp_file_meta" | "csv_file_meta" | "rinde_file_meta",
  meta: FileMeta[]
): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .update({ [field]: meta })
    .eq("user_id", workspaceOwnerId);
  if (error) console.warn("[db] saveFileMeta:", error.message);
}
