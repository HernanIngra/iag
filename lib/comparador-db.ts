import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ensayo, EnsayoConEntradas, Entrada } from "./comparador-types";

export async function fetchEnsayosConEntradas(
  supabase: SupabaseClient,
  filters?: { cultivo?: string }
): Promise<EnsayoConEntradas[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("ensayos") as any).select("*, entradas(*)");
  if (filters?.cultivo) query = query.eq("cultivo", filters.cultivo);
  const { data, error } = await query;
  if (error) throw error;
  return data as EnsayoConEntradas[];
}

export async function insertEnsayo(
  supabase: SupabaseClient,
  data: Omit<Ensayo, "id" | "created_at">
): Promise<{ id: string }> {
  const { data: result, error } = await supabase
    .from("ensayos")
    .insert(data)
    .select("id")
    .single();
  if (error) throw error;
  return result as { id: string };
}

export async function insertEntradas(
  supabase: SupabaseClient,
  rows: Omit<Entrada, "id">[]
): Promise<void> {
  const { error } = await supabase.from("entradas").insert(rows);
  if (error) throw error;
}
