import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "hernaningrassia@gmail.com";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data as Array<{
    id: string;
    display_name: string | null;
    email: string;
    role: string;
    created_at: string;
  }>).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    full_name: u.display_name ?? null,
    avatar_url: null,
    last_sign_in: null,
  }));

  return NextResponse.json(users);
}
