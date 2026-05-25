"use client";

import { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import { useTheme } from "../providers";
import {
  loadWorkspaceSummaries,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  setActiveWorkspaceId,
  getEmpresas,
  createEmpresa,
  renameEmpresa,
  deleteEmpresa,
  updateEmpresaLogo,
  inviteToEmpresa,
  acceptPendingEmpresaInvites,
  type WorkspaceSummary,
  type Empresa,
} from "@/lib/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "workspaces" | "preferencias";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resizeLogoToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 180;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Error al cargar imagen")); };
    img.src = url;
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const supabase = useState(() => createSupabaseBrowserClient())[0];
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, setTheme } = useTheme();

  const [tab, setTab] = useState<Tab>("workspaces");

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresasLoading, setEmpresasLoading] = useState(false);

  // Workspace create/edit state
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsLoading, setNewWsLoading] = useState(false);
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [wsNameDraft, setWsNameDraft] = useState("");
  const [wsLogoDraft, setWsLogoDraft] = useState("");
  const [deletingWsId, setDeletingWsId] = useState<string | null>(null);
  const [wsMutating, setWsMutating] = useState(false);

  // Empresa create/edit state
  const [showNewEmp, setShowNewEmp] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpLoading, setNewEmpLoading] = useState(false);
  const [renamingEmpId, setRenamingEmpId] = useState<string | null>(null);
  const [empNameDraft, setEmpNameDraft] = useState("");
  const [deletingEmpId, setDeletingEmpId] = useState<string | null>(null);
  const [empMutating, setEmpMutating] = useState(false);
  const [showInvite, setShowInvite] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load workspaces ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    acceptPendingEmpresaInvites(supabase).catch(() => {});
    loadWorkspaceSummaries(supabase, user.id).then((wsList) => {
      setWorkspaces(wsList);
      if (wsList.length > 0 && !selectedWsId) setSelectedWsId(wsList[0].id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Load empresas when workspace changes ──────────────────────────────────

  useEffect(() => {
    if (!selectedWsId) { setEmpresas([]); return; }
    setEmpresasLoading(true);
    getEmpresas(supabase, selectedWsId).then((emps) => {
      setEmpresas(emps);
      setEmpresasLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWsId]);

  // ── Workspace actions ─────────────────────────────────────────────────────

  async function handleCreateWorkspace() {
    if (!user || !newWsName.trim()) return;
    setNewWsLoading(true);
    try {
      const id = await createWorkspace(supabase, user.id, newWsName.trim());
      const newSummary: WorkspaceSummary = { id, name: newWsName.trim(), logo: "", updatedAt: new Date().toISOString() };
      setWorkspaces((prev) => [newSummary, ...prev]);
      setSelectedWsId(id);
      setNewWsName("");
      setShowNewWs(false);
    } finally {
      setNewWsLoading(false);
    }
  }

  async function handleRenameWorkspace(wsId: string) {
    if (!wsNameDraft.trim()) return;
    setWsMutating(true);
    try {
      await renameWorkspace(supabase, wsId, wsNameDraft.trim(), wsLogoDraft);
      setWorkspaces((prev) => prev.map((w) =>
        w.id === wsId ? { ...w, name: wsNameDraft.trim(), logo: wsLogoDraft } : w
      ));
      setEditingWsId(null);
    } finally {
      setWsMutating(false);
    }
  }

  async function handleDeleteWorkspace(wsId: string) {
    setWsMutating(true);
    try {
      await deleteWorkspace(supabase, wsId);
      const remaining = workspaces.filter((w) => w.id !== wsId);
      setWorkspaces(remaining);
      setDeletingWsId(null);
      if (selectedWsId === wsId) setSelectedWsId(remaining[0]?.id ?? null);
    } finally {
      setWsMutating(false);
    }
  }

  // ── Empresa actions ────────────────────────────────────────────────────────

  async function handleCreateEmpresa() {
    if (!selectedWsId || !newEmpName.trim()) return;
    setNewEmpLoading(true);
    try {
      const emp = await createEmpresa(supabase, selectedWsId, newEmpName.trim());
      setEmpresas((prev) => [...prev, emp]);
      setNewEmpName("");
      setShowNewEmp(false);
    } finally {
      setNewEmpLoading(false);
    }
  }

  async function handleRenameEmpresa(empId: string) {
    if (!empNameDraft.trim()) return;
    setEmpMutating(true);
    try {
      await renameEmpresa(supabase, empId, empNameDraft.trim());
      setEmpresas((prev) => prev.map((e) => e.id === empId ? { ...e, name: empNameDraft.trim() } : e));
      setRenamingEmpId(null);
    } finally {
      setEmpMutating(false);
    }
  }

  async function handleDeleteEmpresa(empId: string) {
    setEmpMutating(true);
    try {
      await deleteEmpresa(supabase, empId);
      setEmpresas((prev) => prev.filter((e) => e.id !== empId));
      setDeletingEmpId(null);
    } finally {
      setEmpMutating(false);
    }
  }

  async function handleInvite(empId: string) {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteMsg("");
    try {
      await inviteToEmpresa(supabase, empId, inviteEmail.trim());
      setInviteMsg(`Invitación enviada a ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch (e) {
      setInviteMsg((e as Error).message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleEmpresaLogo(empId: string, file: File) {
    try {
      const logo = await resizeLogoToBase64(file);
      await updateEmpresaLogo(supabase, empId, logo);
      setEmpresas((prev) => prev.map((e) => e.id === empId ? { ...e, logo } : e));
    } catch { /* ignore */ }
  }

  function goToRecorredor(wsId: string) {
    setActiveWorkspaceId(wsId);
    window.location.href = "/recorredor";
  }

  function goToRecorredorWithEmpresa(wsId: string, empId: string) {
    setActiveWorkspaceId(wsId);
    localStorage.setItem("iag_pending_empresa_open", empId);
    window.location.href = "/recorredor";
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center"
        style={{ background: "var(--iag-bg)", color: "var(--iag-text-muted)" }}>
        Cargando...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "var(--iag-bg)", color: "var(--iag-text)" }}>
        <p>Necesitás iniciar sesión para acceder a la configuración.</p>
        <a href="/login" className="px-6 py-2 rounded-lg font-semibold"
          style={{ background: "var(--iag-accent)", color: "#1a1a2e" }}>
          Iniciar sesión
        </a>
      </div>
    );
  }

  const selectedWs = workspaces.find((w) => w.id === selectedWsId);

  return (
    <div className="min-h-screen" style={{ background: "var(--iag-bg)", color: "var(--iag-text)" }}>

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ background: "var(--iag-nav)", boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
        <div className="flex items-center gap-4">
          <a href="/" className="font-bold text-xl tracking-widest" style={{ color: "var(--iag-accent)" }}>I.Ag</a>
          <span className="text-sm" style={{ color: "#6a8ab0" }}>· Configuración</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/recorredor" className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ background: "#16213e", color: "#aac4e0", border: "1px solid #2a5298" }}>
            Recorrer →
          </a>
          <a href="/comparador" className="text-sm px-3 py-1.5 rounded-lg transition-all"
            style={{ background: "transparent", color: "#6a8ab0", border: "1px solid #1a3460" }}>
            Comparar
          </a>
          <span className="text-xs hidden sm:block" style={{ color: "#4a6a8a" }}>{user.email}</span>
          <a href="/login" className="text-xs px-2 py-1 rounded" style={{ color: "#6a8ab0" }}>Salir</a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit"
          style={{ background: "var(--iag-surface-2)", border: "1px solid var(--iag-border-soft)" }}>
          {(["workspaces", "preferencias"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={tab === t
                ? { background: "var(--iag-surface)", color: "var(--iag-accent)", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }
                : { background: "transparent", color: "var(--iag-text-dim)" }
              }>
              {t === "workspaces" ? "🏢 Espacios" : "⚙️ Preferencias"}
            </button>
          ))}
        </div>

        {/* ══════════ WORKSPACES TAB ══════════ */}
        {tab === "workspaces" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold uppercase tracking-wider" style={{ color: "var(--iag-text-dim)" }}>
                Espacios de trabajo
              </h2>
              <button
                onClick={() => { setShowNewWs(!showNewWs); setNewWsName(""); }}
                className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-all"
                style={{ background: "#1a4a80", color: "var(--iag-accent)", border: "1px solid #2a5298" }}
              >
                + Nuevo espacio
              </button>
            </div>

            {showNewWs && (
              <div className="mb-4 p-4 rounded-xl flex gap-2"
                style={{ background: "var(--iag-surface)", border: "1px solid var(--iag-border)" }}>
                <input
                  autoFocus
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
                  placeholder="Nombre del espacio (ej: Grupo Bermejo)"
                  className="flex-1 rounded px-3 py-2 text-sm"
                  style={{ background: "var(--iag-surface-2)", border: "1px solid var(--iag-border-soft)", color: "var(--iag-text)", outline: "none" }}
                />
                <button onClick={handleCreateWorkspace} disabled={newWsLoading || !newWsName.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: "#3dbb6e", color: "#fff" }}>
                  {newWsLoading ? "..." : "Crear"}
                </button>
                <button onClick={() => setShowNewWs(false)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: "transparent", border: "1px solid var(--iag-border-soft)", color: "var(--iag-text-dim)" }}>
                  Cancelar
                </button>
              </div>
            )}

            {workspaces.length === 0 ? (
              <div className="p-8 rounded-2xl text-center"
                style={{ background: "var(--iag-surface)", border: "1px dashed var(--iag-border-soft)" }}>
                <p className="text-sm mb-4" style={{ color: "var(--iag-text-dim)" }}>
                  Todavía no tenés espacios de trabajo. Creá uno para empezar.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {workspaces.map((ws) => {
                  const isSelected = ws.id === selectedWsId;
                  const isEditing = editingWsId === ws.id;
                  const isDeleting = deletingWsId === ws.id;

                  if (isEditing) {
                    return (
                      <WorkspaceEditCard key={ws.id} ws={ws}
                        nameDraft={wsNameDraft} logoDraft={wsLogoDraft}
                        onNameChange={setWsNameDraft} onLogoChange={setWsLogoDraft}
                        onConfirm={() => handleRenameWorkspace(ws.id)}
                        onCancel={() => setEditingWsId(null)}
                        mutating={wsMutating}
                      />
                    );
                  }

                  if (isDeleting) {
                    return (
                      <div key={ws.id} className="p-4 rounded-xl flex items-center gap-3"
                        style={{ background: "#2a0a0a", border: "1px solid #6a1a1a" }}>
                        <span className="flex-1 text-sm" style={{ color: "#e24a4a" }}>
                          ¿Eliminar <strong>{ws.name}</strong> y todas sus empresas? No se puede deshacer.
                        </span>
                        <button disabled={wsMutating} onClick={() => handleDeleteWorkspace(ws.id)}
                          className="px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
                          style={{ background: "#e24a4a", color: "#fff" }}>
                          {wsMutating ? "..." : "Eliminar"}
                        </button>
                        <button onClick={() => setDeletingWsId(null)}
                          className="px-3 py-1.5 rounded text-sm"
                          style={{ background: "var(--iag-surface-2)", color: "var(--iag-text-dim)" }}>Cancelar</button>
                      </div>
                    );
                  }

                  return (
                    <div key={ws.id}
                      className="rounded-xl overflow-hidden"
                      style={{ background: "var(--iag-surface)", border: `1px solid ${isSelected ? "#3dbb6e" : "var(--iag-border)"}` }}>

                      {/* Workspace header */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer"
                        onClick={() => setSelectedWsId(isSelected ? null : ws.id)}
                      >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                          style={{ background: "var(--iag-surface-2)", border: "1px solid var(--iag-border-soft)" }}>
                          {ws.logo
                            ? <img src={ws.logo} alt="" className="w-full h-full object-cover" />
                            : <span className="text-lg">🏢</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate"
                            style={{ color: isSelected ? "var(--iag-accent)" : "var(--iag-text)" }}>
                            {ws.name}
                          </p>
                          <p className="text-xs" style={{ color: "var(--iag-text-dimmer)" }}>
                            {isSelected ? "▲ ocultar detalle" : "▼ ver detalle"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => goToRecorredor(ws.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: "#1a4a80", color: "var(--iag-accent)", border: "1px solid #2a5298" }}>
                            Recorrer →
                          </button>
                          <button onClick={() => { setWsNameDraft(ws.name); setWsLogoDraft(ws.logo); setEditingWsId(ws.id); }}
                            className="p-1.5 rounded text-sm"
                            style={{ color: "var(--iag-text-dim)", background: "var(--iag-surface-2)" }}
                            title="Editar">✏️</button>
                          <button onClick={() => setDeletingWsId(ws.id)}
                            className="p-1.5 rounded text-sm"
                            style={{ color: "#e24a4a", background: "#2a0a0a" }}
                            title="Eliminar">🗑</button>
                        </div>
                      </div>

                      {/* Empresas (expanded) */}
                      {isSelected && (
                        <div className="border-t px-4 pb-4 pt-3"
                          style={{ borderColor: "var(--iag-border)" }}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--iag-text-dim)" }}>Empresas</p>
                            <button onClick={() => { setShowNewEmp(!showNewEmp); setNewEmpName(""); }}
                              className="text-xs px-2.5 py-1 rounded"
                              style={{ background: "var(--iag-surface-3)", border: "1px solid var(--iag-border-soft)", color: "var(--iag-text-muted)" }}>
                              + Nueva empresa
                            </button>
                          </div>

                          {showNewEmp && (
                            <div className="mb-3 flex gap-2">
                              <input autoFocus value={newEmpName}
                                onChange={(e) => setNewEmpName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreateEmpresa()}
                                placeholder="Nombre de la empresa"
                                className="flex-1 rounded px-3 py-1.5 text-sm"
                                style={{ background: "var(--iag-surface-2)", border: "1px solid var(--iag-border-soft)", color: "var(--iag-text)", outline: "none" }} />
                              <button onClick={handleCreateEmpresa} disabled={newEmpLoading || !newEmpName.trim()}
                                className="px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
                                style={{ background: "#3dbb6e", color: "#fff" }}>
                                {newEmpLoading ? "..." : "Crear"}
                              </button>
                              <button onClick={() => setShowNewEmp(false)}
                                className="px-2 py-1.5 rounded text-sm"
                                style={{ color: "var(--iag-text-dim)" }}>✕</button>
                            </div>
                          )}

                          {empresasLoading ? (
                            <p className="text-xs py-2" style={{ color: "var(--iag-text-dimmer)" }}>Cargando...</p>
                          ) : empresas.length === 0 ? (
                            <p className="text-xs py-2" style={{ color: "var(--iag-text-dimmer)" }}>Sin empresas — agregá una para organizar tus archivos.</p>
                          ) : (
                            <div className="space-y-2">
                              {empresas.map((emp) => {
                                const isRenamingEmp = renamingEmpId === emp.id;
                                const isDeletingEmp = deletingEmpId === emp.id;

                                if (isRenamingEmp) {
                                  return (
                                    <div key={emp.id} className="flex gap-2">
                                      <input autoFocus value={empNameDraft}
                                        onChange={(e) => setEmpNameDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleRenameEmpresa(emp.id);
                                          if (e.key === "Escape") setRenamingEmpId(null);
                                        }}
                                        className="flex-1 rounded px-3 py-1.5 text-sm"
                                        style={{ background: "var(--iag-surface-2)", border: "1px solid #3a6aaa", color: "var(--iag-text)", outline: "none" }} />
                                      <button disabled={empMutating || !empNameDraft.trim()}
                                        onClick={() => handleRenameEmpresa(emp.id)}
                                        className="px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
                                        style={{ background: "#3dbb6e", color: "#fff" }}>✓</button>
                                      <button onClick={() => setRenamingEmpId(null)}
                                        className="px-2 py-1.5 rounded text-sm"
                                        style={{ color: "var(--iag-text-dim)" }}>✕</button>
                                    </div>
                                  );
                                }

                                if (isDeletingEmp) {
                                  return (
                                    <div key={emp.id} className="flex items-center gap-2 p-2 rounded-lg"
                                      style={{ background: "#2a0a0a", border: "1px solid #6a1a1a" }}>
                                      <span className="flex-1 text-xs" style={{ color: "#e24a4a" }}>
                                        ¿Eliminar <strong>{emp.name}</strong>?
                                      </span>
                                      <button disabled={empMutating} onClick={() => handleDeleteEmpresa(emp.id)}
                                        className="px-3 py-1 rounded text-xs font-semibold disabled:opacity-50"
                                        style={{ background: "#e24a4a", color: "#fff" }}>
                                        {empMutating ? "..." : "Eliminar"}
                                      </button>
                                      <button onClick={() => setDeletingEmpId(null)}
                                        className="px-2 py-1 rounded text-xs"
                                        style={{ color: "var(--iag-text-dim)" }}>Cancelar</button>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={emp.id} className="rounded-lg overflow-hidden"
                                    style={{ background: "var(--iag-surface-3)", border: `1px solid ${expandedEmpId === emp.id ? "#2a5298" : "var(--iag-border-soft)"}` }}>
                                    {/* Empresa header row */}
                                    <div className="flex items-center gap-2 px-3 py-2 group">
                                      {/* Logo */}
                                      <label className="cursor-pointer group/logo relative flex-shrink-0" title="Cambiar logo">
                                        <input type="file" accept="image/*" className="sr-only"
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmpresaLogo(emp.id, f); }} />
                                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center"
                                          style={{ background: "var(--iag-surface)", border: "1px solid var(--iag-border-soft)" }}>
                                          {emp.logo
                                            ? <img src={emp.logo} alt="" className="w-full h-full object-cover" />
                                            : <span className="text-sm">🏛</span>
                                          }
                                        </div>
                                        <div className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
                                          style={{ background: "rgba(0,0,0,0.6)", fontSize: 11 }}>🖼</div>
                                      </label>
                                      <button className="flex-1 text-left text-sm font-semibold"
                                        style={{ color: "var(--iag-text-muted)" }}
                                        onClick={() => setExpandedEmpId(expandedEmpId === emp.id ? null : emp.id)}>
                                        {emp.name}
                                        <span className="ml-2 text-xs" style={{ color: "var(--iag-text-dimmer)" }}>
                                          {expandedEmpId === emp.id ? "▲" : "▼"}
                                        </span>
                                      </button>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setInviteEmail(""); setInviteMsg(""); setShowInvite(showInvite === emp.id ? null : emp.id); }}
                                          className="px-2 py-1 rounded text-xs"
                                          style={{ background: "var(--iag-surface-2)", color: "var(--iag-text-dim)", border: "1px solid var(--iag-border-soft)" }}>
                                          Invitar
                                        </button>
                                        <button onClick={() => { setEmpNameDraft(emp.name); setRenamingEmpId(emp.id); }}
                                          className="p-1.5 rounded text-xs"
                                          style={{ color: "var(--iag-text-dim)", background: "var(--iag-surface-2)" }}>✏️</button>
                                        <button onClick={() => setDeletingEmpId(emp.id)}
                                          className="p-1.5 rounded text-xs"
                                          style={{ color: "#e24a4a", background: "#2a0a0a" }}>🗑</button>
                                      </div>
                                    </div>

                                    {/* Expanded: file management */}
                                    {expandedEmpId === emp.id && (
                                      <div className="px-3 pb-3 pt-1"
                                        style={{ borderTop: "1px solid var(--iag-border-soft)" }}>
                                        <p className="text-xs mb-2 mt-2" style={{ color: "var(--iag-text-dim)" }}>
                                          Subí y gestioná los archivos de esta empresa desde el Recorredor.
                                        </p>
                                        <button
                                          onClick={() => goToRecorredorWithEmpresa(ws.id, emp.id)}
                                          className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                                          style={{ background: "#1a4a80", color: "var(--iag-accent)", border: "1px solid #2a5298" }}>
                                          📂 Gestionar archivos (Mapa, Manejo, Rindes, Lluvias) →
                                        </button>
                                      </div>
                                    )}

                                    {/* Invite panel */}
                                    {showInvite === emp.id && (
                                      <div className="mx-2 mb-2 p-3 rounded-lg flex gap-2 flex-col"
                                        style={{ background: "var(--iag-surface-2)", border: "1px solid var(--iag-border-soft)" }}>
                                        <div className="flex gap-2">
                                          <input type="email" value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && handleInvite(emp.id)}
                                            placeholder="email@ejemplo.com"
                                            className="flex-1 rounded px-3 py-1.5 text-sm"
                                            style={{ background: "var(--iag-surface)", border: "1px solid var(--iag-border-soft)", color: "var(--iag-text)", outline: "none" }} />
                                          <button onClick={() => handleInvite(emp.id)} disabled={inviteLoading || !inviteEmail.trim()}
                                            className="px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
                                            style={{ background: "var(--iag-accent)", color: "#1a1a2e" }}>
                                            {inviteLoading ? "..." : "Enviar"}
                                          </button>
                                        </div>
                                        {inviteMsg && (
                                          <p className="text-xs"
                                            style={{ color: inviteMsg.startsWith("Invitación") ? "#3dbb6e" : "#e24a4a" }}>
                                            {inviteMsg}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════ PREFERENCIAS TAB ══════════ */}
        {tab === "preferencias" && (
          <div className="space-y-6">

            {/* ── Apariencia ── */}
            <section className="rounded-2xl p-6"
              style={{ background: "var(--iag-surface)", border: "1px solid var(--iag-border)" }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--iag-text-dim)" }}>
                Apariencia
              </h3>
              <p className="text-xs mb-5" style={{ color: "var(--iag-text-dimmer)" }}>
                Elegí cómo se ve la aplicación.
              </p>

              <div className="flex gap-3">
                {/* Dark option */}
                <button
                  onClick={() => setTheme("dark")}
                  className="flex-1 rounded-xl p-4 flex flex-col items-center gap-3 transition-all"
                  style={{
                    background: theme === "dark" ? "#0d1b35" : "var(--iag-surface-2)",
                    border: theme === "dark" ? "2px solid var(--iag-accent)" : "2px solid var(--iag-border-soft)",
                  }}>
                  {/* Mini preview — dark */}
                  <div className="w-full rounded-lg overflow-hidden"
                    style={{ background: "#1a1a2e", border: "1px solid #0f3460", height: 64 }}>
                    <div className="h-5 flex items-center px-2 gap-1.5"
                      style={{ background: "#0f3460" }}>
                      <div className="h-1.5 w-8 rounded-full" style={{ background: "#e2b04a" }} />
                      <div className="h-1.5 w-5 rounded-full ml-auto" style={{ background: "#2a5298" }} />
                    </div>
                    <div className="px-2 pt-2 space-y-1">
                      <div className="h-1.5 w-3/4 rounded-full" style={{ background: "#16213e" }} />
                      <div className="h-1.5 w-1/2 rounded-full" style={{ background: "#16213e" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌙</span>
                    <span className="text-sm font-semibold" style={{ color: "var(--iag-text)" }}>Oscuro</span>
                    {theme === "dark" && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "var(--iag-accent)", color: "#1a1a2e" }}>✓</span>
                    )}
                  </div>
                </button>

                {/* Light option */}
                <button
                  onClick={() => setTheme("light")}
                  className="flex-1 rounded-xl p-4 flex flex-col items-center gap-3 transition-all"
                  style={{
                    background: theme === "light" ? "#e8f0f8" : "var(--iag-surface-2)",
                    border: theme === "light" ? "2px solid var(--iag-accent)" : "2px solid var(--iag-border-soft)",
                  }}>
                  {/* Mini preview — light */}
                  <div className="w-full rounded-lg overflow-hidden"
                    style={{ background: "#f0f5fb", border: "1px solid #c5d8ee", height: 64 }}>
                    <div className="h-5 flex items-center px-2 gap-1.5"
                      style={{ background: "#0f3460" }}>
                      <div className="h-1.5 w-8 rounded-full" style={{ background: "#e2b04a" }} />
                      <div className="h-1.5 w-5 rounded-full ml-auto" style={{ background: "#2a5298" }} />
                    </div>
                    <div className="px-2 pt-2 space-y-1">
                      <div className="h-1.5 w-3/4 rounded-full" style={{ background: "#c5d8ee" }} />
                      <div className="h-1.5 w-1/2 rounded-full" style={{ background: "#c5d8ee" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">☀️</span>
                    <span className="text-sm font-semibold" style={{ color: "var(--iag-text)" }}>Claro</span>
                    {theme === "light" && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "var(--iag-accent)", color: "#1a1a2e" }}>✓</span>
                    )}
                  </div>
                </button>
              </div>
            </section>

            {/* ── Cuenta ── */}
            <section className="rounded-2xl p-6"
              style={{ background: "var(--iag-surface)", border: "1px solid var(--iag-border)" }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--iag-text-dim)" }}>
                Cuenta
              </h3>
              <p className="text-xs mb-4" style={{ color: "var(--iag-text-dimmer)" }}>
                Información de tu sesión.
              </p>
              <div className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: "var(--iag-surface-2)", border: "1px solid var(--iag-border-soft)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: "#1a4a80" }}>
                  👤
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--iag-text)" }}>
                    {user.email}
                  </p>
                  <p className="text-xs" style={{ color: "var(--iag-text-dimmer)" }}>Usuario autenticado</p>
                </div>
              </div>
            </section>

          </div>
        )}

      </div>
    </div>
  );
}

// ─── WorkspaceEditCard ────────────────────────────────────────────────────────

function WorkspaceEditCard({
  ws, nameDraft, logoDraft, onNameChange, onLogoChange, onConfirm, onCancel, mutating,
}: {
  ws: WorkspaceSummary;
  nameDraft: string;
  logoDraft: string;
  onNameChange: (v: string) => void;
  onLogoChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  mutating: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-4 rounded-xl"
      style={{ background: "var(--iag-surface)", border: "1px solid #2a6aaa" }}>
      <div className="flex items-center gap-3 mb-3">
        <label className="cursor-pointer group relative flex-shrink-0" title="Cambiar logo">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { onLogoChange(await resizeLogoToBase64(f)); } catch { /* ignore */ }
            }} />
          <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ background: "var(--iag-surface-2)", border: "2px solid #2a6aaa" }}>
            {logoDraft
              ? <img src={logoDraft} alt="" className="w-full h-full object-cover" />
              : <span className="text-lg">🏢</span>
            }
          </div>
          <div className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.55)", fontSize: 14 }}>✏️</div>
        </label>
        <input autoFocus value={nameDraft}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm()}
          className="flex-1 rounded px-3 py-2 text-sm font-bold"
          style={{ background: "var(--iag-surface-2)", border: "1px solid #3a6aaa", color: "var(--iag-accent)", outline: "none" }} />
      </div>
      <div className="flex gap-2 justify-end">
        <button disabled={mutating || !nameDraft.trim()} onClick={onConfirm}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "#3dbb6e", color: "#fff" }}>
          {mutating ? "..." : "Guardar"}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "transparent", border: "1px solid var(--iag-border-soft)", color: "var(--iag-text-dim)" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
