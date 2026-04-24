import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeoCollection } from "./shapefile";
import type { LotData, RindeData, ParsedRow, RindeRow } from "./data-parser";

// ─── Workspace type ─────────────────────────────────────────────────────────

export interface Workspace {
  fieldName: string;
  lotCount: number;
  collections: GeoCollection[];
  colorMap: Record<string, string>;
  cultivoColorMap: Record<string, string>;
  lotData: LotData;
  allRows: ParsedRow[];
  rindeData: RindeData;
  lotNotes: Record<string, string>;
  shpFiles: string[];
  csvFiles: string[];
  rindeFiles: string[];
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
      lot_notes: state.lotNotes,
      shp_files: state.shpFiles,
      csv_files: state.csvFiles,
      rinde_files: state.rindeFiles,
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
    lotNotes: (data.lot_notes ?? {}) as Record<string, string>,
    shpFiles: (data.shp_files ?? []) as string[],
    csvFiles: (data.csv_files ?? []) as string[],
    rindeFiles: (data.rinde_files ?? []) as string[],
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
        lot_notes: state.lotNotes,
        shp_files: state.shpFiles,
        csv_files: state.csvFiles,
        rinde_files: state.rindeFiles,
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
      lotNotes: (data.lot_notes ?? {}) as Record<string, string>,
      shpFiles: (data.shp_files ?? []) as string[],
      csvFiles: (data.csv_files ?? []) as string[],
      rindeFiles: (data.rinde_files ?? []) as string[],
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
