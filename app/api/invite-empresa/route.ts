import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify caller is authenticated
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, email } = (await req.json()) as { empresaId?: string; email?: string };
  if (!empresaId || !email) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  // Verify caller owns the empresa
  const { data: empresa, error: empError } = await supabase
    .from("empresas")
    .select("id, name")
    .eq("id", empresaId)
    .eq("owner_id", user.id)
    .single();
  if (empError || !empresa) return NextResponse.json({ error: "Empresa no encontrada o sin permiso" }, { status: 403 });

  // Admin client (service role) — needed to send invite email and insert invite record
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/recorredor`;

  // Send the Supabase invite email (creates auth user if new, sends "accept invite" link)
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email.toLowerCase(), {
    redirectTo,
    data: { invited_to_empresa: empresa.name },
  });

  // "User already registered" is not an error for us — the invite record handles the link
  if (inviteError && !inviteError.message.toLowerCase().includes("already")) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // Upsert the empresa_invites record (idempotent)
  const { error: dbError } = await admin
    .from("empresa_invites")
    .upsert(
      { empresa_id: empresaId, invited_email: email.toLowerCase(), invited_by: user.id },
      { onConflict: "empresa_id,invited_email", ignoreDuplicates: false }
    );
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
