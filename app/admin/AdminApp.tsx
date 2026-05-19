"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getMyOwnedEmpresas, inviteToEmpresa, type Empresa } from "@/lib/db";

const ADMIN_EMAIL = "hernaningrassia@gmail.com";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  last_sign_in: string | null;
}

export default function AdminApp() {
  const supabase = createSupabaseBrowserClient();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // All empresas owned by the admin
  const [myEmpresas, setMyEmpresas] = useState<Array<Empresa & { workspaceName: string }>>([]);

  // Sharing state: which user row is expanded, which empresa selected, result msg
  const [sharingUserId, setSharingUserId] = useState<string | null>(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>("");
  const [shareMsg, setShareMsg] = useState<string>("");
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const ok = data.user?.email === ADMIN_EMAIL;
      setAuthed(ok);
      if (ok) {
        fetchUsers();
        getMyOwnedEmpresas(supabase).then(setMyEmpresas);
      } else {
        setLoading(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: UserRow[] = await res.json();
      setUsers(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleShare(targetEmail: string) {
    if (!selectedEmpresaId || !targetEmail) return;
    setShareLoading(true);
    setShareMsg("");
    try {
      await inviteToEmpresa(supabase, selectedEmpresaId, targetEmail);
      const empName = myEmpresas.find((e) => e.id === selectedEmpresaId)?.name ?? "";
      setShareMsg(`✓ ${empName} compartida con ${targetEmail}`);
    } catch (e) {
      setShareMsg(`Error: ${(e as Error).message}`);
    } finally {
      setShareLoading(false);
    }
  }

  if (authed === null || loading) {
    return (
      <main style={{ background: "#1a1a2e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#e2b04a", fontSize: 20 }}>Cargando…</span>
      </main>
    );
  }

  if (!authed) {
    return (
      <main style={{ background: "#1a1a2e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#e24a7a", fontSize: 18, marginBottom: 16 }}>Acceso denegado.</p>
          <Link href="/" style={{ color: "#4a6a8a" }}>← Inicio</Link>
        </div>
      </main>
    );
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link href="/" style={{ color: "#4a6a8a", fontSize: 13, display: "block", marginBottom: 16 }}>
            ← I.Ag
          </Link>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ color: "#e2b04a", fontSize: 24, fontWeight: 700 }}>Panel Admin</h1>
            <span style={{ fontSize: 11, background: "#1a3010", color: "#3dbb6e", border: "1px solid #1a4a20", borderRadius: 20, padding: "2px 10px" }}>
              {users.length} usuarios
            </span>
          </div>
          <p style={{ color: "#6a8ab0", fontSize: 13, marginTop: 4 }}>
            Compartí empresas con otros usuarios o cargá archivos en su nombre.
          </p>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email o nombre…"
          style={{
            width: "100%", background: "#16213e", border: "1px solid #1a4a80",
            borderRadius: 10, padding: "10px 14px", color: "#e0e0e0", fontSize: 14,
            outline: "none", marginBottom: 16, boxSizing: "border-box",
          }}
        />

        {error && (
          <p style={{ color: "#e24a7a", background: "#2a0a1a", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
            {error}
          </p>
        )}

        {/* User list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((u) => {
            const isSelf = u.email === ADMIN_EMAIL;
            const name = u.full_name ?? u.email.split("@")[0];
            const initial = name[0]?.toUpperCase() ?? "U";
            const lastSeen = u.last_sign_in
              ? new Date(u.last_sign_in).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })
              : "Nunca";
            const isSharing = sharingUserId === u.id;

            return (
              <div key={u.id} style={{ background: "#16213e", border: `1px solid ${isSelf ? "#2a5a20" : isSharing ? "#2a5298" : "#0f3460"}`, borderRadius: 12, overflow: "hidden" }}>
                {/* User row */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
                  {u.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar_url} alt={name} style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1a4a80", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#e2b04a" }}>
                      {initial}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#e0e0e0", fontSize: 14, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 10, background: "#1a3010", color: "#3dbb6e", borderRadius: 10, padding: "1px 7px" }}>vos</span>}
                    </p>
                    <p style={{ color: "#4a6a8a", fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                    <p style={{ color: "#2a4060", fontSize: 11, margin: "2px 0 0" }}>Último acceso: {lastSeen}</p>
                  </div>

                  {!isSelf && (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          if (isSharing) { setSharingUserId(null); setShareMsg(""); }
                          else { setSharingUserId(u.id); setSelectedEmpresaId(myEmpresas[0]?.id ?? ""); setShareMsg(""); }
                        }}
                        style={{ background: isSharing ? "#2a5298" : "#1a3060", color: isSharing ? "#e2b04a" : "#6ab0e0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, border: "1px solid #2a5298", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        {isSharing ? "✕ Cerrar" : "Compartir empresa"}
                      </button>
                      <Link
                        href={`/recorredor?as=${u.id}&email=${encodeURIComponent(u.email)}`}
                        style={{ flexShrink: 0, background: "#0f2040", color: "#6a8ab0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid #1a3460", whiteSpace: "nowrap" }}
                      >
                        Cargar archivos →
                      </Link>
                    </div>
                  )}
                  {isSelf && (
                    <Link href="/recorredor" style={{ flexShrink: 0, background: "#1a3010", color: "#3dbb6e", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid #1a4a20", whiteSpace: "nowrap" }}>
                      Mi workspace →
                    </Link>
                  )}
                </div>

                {/* Share panel */}
                {isSharing && (
                  <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #1a3460" }}>
                    <p style={{ color: "#6a8ab0", fontSize: 12, marginBottom: 10 }}>
                      Seleccioná una empresa para compartir con <strong style={{ color: "#aac4e0" }}>{u.email}</strong>:
                    </p>
                    {myEmpresas.length === 0 ? (
                      <p style={{ color: "#4a6a8a", fontSize: 12 }}>No tenés empresas creadas.</p>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          value={selectedEmpresaId}
                          onChange={(e) => { setSelectedEmpresaId(e.target.value); setShareMsg(""); }}
                          style={{ flex: 1, minWidth: 200, background: "#0d1b35", border: "1px solid #2a5298", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13, outline: "none" }}
                        >
                          {myEmpresas.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}{emp.workspaceName ? ` — ${emp.workspaceName}` : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleShare(u.email)}
                          disabled={shareLoading || !selectedEmpresaId}
                          style={{ background: "#3dbb6e", color: "#fff", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, border: "none", cursor: shareLoading ? "default" : "pointer", opacity: shareLoading ? 0.6 : 1, whiteSpace: "nowrap" }}
                        >
                          {shareLoading ? "Enviando…" : "Compartir"}
                        </button>
                      </div>
                    )}
                    {shareMsg && (
                      <p style={{ marginTop: 8, fontSize: 12, color: shareMsg.startsWith("✓") ? "#3dbb6e" : "#e24a4a" }}>
                        {shareMsg}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p style={{ color: "#4a6a8a", textAlign: "center", padding: 24 }}>
              Sin resultados para &quot;{search}&quot;
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
