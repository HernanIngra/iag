"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, Layer, GeoJSON as LeafletGeoJSON } from "leaflet";
import type { Feature } from "geojson";
import type { GeoCollection } from "@/lib/shapefile";
import type { LotData, RindeData, ParsedRow, ColumnMapping } from "@/lib/data-parser";
import {
  getLotName,
  getCampo,
  buildColorMap,
  buildCultivoColorMap,
  loadShapefiles,
} from "@/lib/shapefile";
import {
  parseManagementFile,
  parseRindeFile,
  detectLinkColumns,
  detectColumnMapping,
} from "@/lib/data-parser";
import {
  tipoColor,
  isWinterCrop,
  cultivoIcon,
  DEFAULT_FILTERS,
  type ActiveFilters,
} from "@/lib/recorredor-types";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  saveWorkspace,
  loadWorkspace,
  saveWorkspaceLocal,
  loadWorkspaceLocal,
  saveManagementBackup,
  loadManagementBackup,
  clearManagementBackup,
  getEmpresas,
  getSharedEmpresas,
  acceptPendingEmpresaInvites,
  createEmpresa,
  inviteToEmpresa,
  type Workspace,
  type LotVisit,
  type DriveManejo,
  type FileMeta,
  type Empresa,
  type SharedEmpresa,
} from "@/lib/db";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const SPRAYING_TIPOS = new Set(["HERBICIDA", "FUNGICIDA", "INSECTICIDA", "ACARICIDA"]);
import AuthButton from "@/components/AuthButton";

// ── State types ───────────────────────────────────────────────────────────────

interface LotLayer {
  layer: LeafletGeoJSON;
  lotName: string;
  zone: string;
  props: Record<string, unknown>;
}

interface SelectedLot {
  lotName: string;
  zone: string;
  props: Record<string, unknown>;
  layer: LeafletGeoJSON;
}

// ── Main component ─────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "hernaningrassia@gmail.com";

export default function RecorredorApp({ asUserId, asEmail }: { asUserId?: string; asEmail?: string } = {}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const shpLayerRef = useRef<LayerGroup | null>(null);
  const allLotLayersRef = useRef<LotLayer[]>([]);
  const selectedLayerRef = useRef<LeafletGeoJSON | null>(null);
  const lotDimmedRef = useRef<Set<string>>(new Set());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [collections, setCollections] = useState<GeoCollection[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, string>>({});
  const [cultivoColorMap, setCultivoColorMap] = useState<Record<string, string>>({});
  const [lotData, setLotData] = useState<LotData>({});
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [rindeData, setRindeData] = useState<RindeData>({});
  const [selectedLot, setSelectedLot] = useState<SelectedLot | null>(null);
  const [lotVisits, setLotVisits] = useState<Record<string, LotVisit[]>>({});
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [fieldName, setFieldName] = useState("");
  const [lotCount, setLotCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shpStatus, setShpStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [csvStatus, setCsvStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rindeStatus, setRindeStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");

  // Auth + persistence
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const supabase = useState(() => createSupabaseBrowserClient())[0];

  // Admin helpers (computed after user is known)
  const isAdmin = user?.email === ADMIN_EMAIL;
  const effectiveUserId = (isAdmin && asUserId) ? asUserId : user?.id;

  // Column picker — manejo (step 1: link column)
  const [linkPickerCols, setLinkPickerCols] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Column mapper — manejo (step 2: full mapping)
  const [pendingColMapping, setPendingColMapping] = useState<ColumnMapping | null>(null);
  const [colMappingAllCols, setColMappingAllCols] = useState<string[]>([]);
  // Column picker — rindes
  const [rindePickerCols, setRindePickerCols] = useState<string[]>([]);
  const [pendingRindeFile, setPendingRindeFile] = useState<File | null>(null);

  // Loaded file names
  const [shpFiles, setShpFiles] = useState<string[]>([]);
  const [csvFiles, setCsvFiles] = useState<string[]>([]);
  const [rindeFiles, setRindeFiles] = useState<string[]>([]);

  // Management data backup (localStorage, 7-day TTL)
  const [prevManagementRows, setPrevManagementRows] = useState<ParsedRow[]>([]);
  const [prevManagementTimestamp, setPrevManagementTimestamp] = useState<number>(0);

  const [isMobile, setIsMobile] = useState(false);

  const gpsWatchRef = useRef<number | null>(null);
  const gpsMarkerRef = useRef<Layer | null>(null);
  const gpsCircleRef = useRef<Layer | null>(null);

  // Drive manejo
  const [driveManejo, setDriveManejo] = useState<DriveManejo | null>(null);
  const [manejoColMapping, setManejoColMapping] = useState<ColumnMapping | null>(null);
  const [driveRefreshing, setDriveRefreshing] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [pendingDriveInfo, setPendingDriveInfo] = useState<DriveManejo | null>(null);
  const [manejoTab, setManejoTab] = useState<"local" | "drive">("local");
  const [driveUrlInput, setDriveUrlInput] = useState("");

  // View: 'dashboard' = file management screen; 'map' = map + sidebar
  const [view, setView] = useState<"dashboard" | "map">("dashboard");

  // Empresas
  const [myEmpresas, setMyEmpresas] = useState<Empresa[]>([]);
  const [sharedEmpresas, setSharedEmpresas] = useState<SharedEmpresa[]>([]);
  const [activeEmpresaId, setActiveEmpresaId] = useState<string | undefined>(undefined);
  const [activeWorkspaceOwnerId, setActiveWorkspaceOwnerId] = useState<string | undefined>(undefined);

  // File meta (parallel arrays with shpFiles/csvFiles/rindeFiles, includes empresaId)
  const [shpFileMeta, setShpFileMeta] = useState<FileMeta[]>([]);
  const [csvFileMeta, setCsvFileMeta] = useState<FileMeta[]>([]);
  const [rindeFileMeta, setRindeFileMeta] = useState<FileMeta[]>([]);
  const pendingCsvEmpresaIdRef = useRef<string | undefined>(undefined);

  // ── Switch to Drive tab when a Drive link is active ─────────────────────────

  useEffect(() => {
    if (driveManejo) setManejoTab("drive");
  }, [driveManejo]);

  // ── Mobile detection ────────────────────────────────────────────────────────

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let ignored = false;
    import("leaflet").then((L) => {
      if (ignored) return;
      const container = document.getElementById("recorredor-map") as HTMLElement & { _leaflet_id?: number };
      if (!container || container._leaflet_id) return;
      const map = L.map("recorredor-map", {
        center: [-34.5, -63.0],
        zoom: 6,
        zoomControl: true,
      });
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles © Esri", maxZoom: 19 }
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { attribution: "", maxZoom: 19, opacity: 0.8 }
      ).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      ignored = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Auth subscription ────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthLoaded(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load empresas and accept pending invites on login ───────────────────────

  useEffect(() => {
    if (!user) return;
    setActiveWorkspaceOwnerId((prev) => prev ?? user.id);
    acceptPendingEmpresaInvites(supabase).then(async () => {
      const [emps, shared] = await Promise.all([
        getEmpresas(supabase),
        getSharedEmpresas(supabase),
      ]);
      setMyEmpresas(emps);
      setSharedEmpresas(shared);
      if (emps.length > 0) setActiveEmpresaId((prev) => prev ?? emps[0].id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Invalidate map size when switching to map view ───────────────────────────

  useEffect(() => {
    if (view === "map") {
      setTimeout(() => mapRef.current?.invalidateSize(), 50);
    }
  }, [view]);

  // ── Load management backup from localStorage on mount ────────────────────────

  useEffect(() => {
    const backup = loadManagementBackup();
    if (backup) {
      setPrevManagementRows(backup.rows);
      setPrevManagementTimestamp(backup.timestamp);
    }
  }, []);

  // ── Workspace restore helper ─────────────────────────────────────────────────

  function applyWorkspace(ws: Workspace) {
    setFieldName(ws.fieldName);
    setLotCount(ws.lotCount);
    setCollections(ws.collections);
    setColorMap(ws.colorMap);
    setCultivoColorMap(ws.cultivoColorMap);
    setLotData(ws.lotData);
    setAllRows(ws.allRows);
    setRindeData(ws.rindeData);
    setLotVisits(ws.lotVisits ?? {});
    setShpFiles(ws.shpFiles);
    setCsvFiles(ws.csvFiles);
    setRindeFiles(ws.rindeFiles);
    setShpFileMeta(ws.shpFileMeta ?? []);
    setCsvFileMeta(ws.csvFileMeta ?? []);
    setRindeFileMeta(ws.rindeFileMeta ?? []);
    if (ws.driveManejo) setDriveManejo(ws.driveManejo);
    if (ws.manejoColMapping) setManejoColMapping(ws.manejoColMapping);
    setShpStatus({ msg: `✓ ${ws.lotCount} lotes`, ok: true });
    if (ws.allRows.length) {
      setCsvStatus({ msg: `✓ ${ws.allRows.length} registros · ${Object.keys(ws.lotData).length} lotes`, ok: true });
      const campaigns = [...new Set(ws.allRows.map((r) => r._campaign).filter(Boolean))].sort();
      const tipos = [...new Set(ws.allRows.map((r) => r._tipo).filter(Boolean))];
      const dates = ws.allRows.map((r) => r._fecha).filter((d): d is Date => !!d && !isNaN(d.getTime()));
      const from = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10) : "";
      const to = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10) : "";
      setActiveFilters({ campaign: campaigns.length === 1 ? campaigns[0] : "", from, to, tipos, cultivo: "", genetica: "" });
    }
    if (Object.keys(ws.rindeData).length) {
      setRindeStatus({ msg: `✓ Rindes · ${Object.keys(ws.rindeData).length} lotes`, ok: true });
    }
  }

  // ── Load workspace from DB (with localStorage fallback) ──────────────────────

  useEffect(() => {
    if (!user || !mapReady) return;
    loadWorkspace(supabase, effectiveUserId ?? user.id).then(async (ws) => {
      if (!ws || !ws.collections.length) ws = loadWorkspaceLocal();
      if (!ws || !ws.collections.length) return;
      applyWorkspace(ws);
      const layerList = await drawCollections(ws.collections, ws.colorMap, ws.cultivoColorMap, ws.lotData);
      import("leaflet").then((mod) => {
        const bounds = mod.default.featureGroup(layerList as LeafletGeoJSON[]).getBounds();
        if (bounds.isValid()) mapRef.current!.fitBounds(bounds, { padding: [30, 30] });
      });
      if (ws.driveManejo && ws.manejoColMapping) {
        refreshDriveWith(ws.driveManejo, ws.manejoColMapping);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mapReady]);

  // ── Load from localStorage when no user (after auth resolves) ────────────────

  useEffect(() => {
    if (!mapReady || !authLoaded || user) return;
    const ws = loadWorkspaceLocal();
    if (!ws || !ws.collections.length) return;
    applyWorkspace(ws);
    drawCollections(ws.collections, ws.colorMap, ws.cultivoColorMap, ws.lotData).then((layerList) => {
      import("leaflet").then((mod) => {
        const bounds = mod.default.featureGroup(layerList as LeafletGeoJSON[]).getBounds();
        if (bounds.isValid()) mapRef.current!.fitBounds(bounds, { padding: [30, 30] });
      });
    });
    if (ws.driveManejo && ws.manejoColMapping) {
      refreshDriveWith(ws.driveManejo, ws.manejoColMapping);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, authLoaded, user]);

  // ── Auto-save (always localStorage; also Supabase when logged in) ─────────────

  useEffect(() => {
    if (!collections.length) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const state: Workspace = {
        fieldName, lotCount, collections, colorMap, cultivoColorMap,
        lotData, allRows, rindeData, lotVisits, shpFiles, csvFiles, rindeFiles,
        shpFileMeta, csvFileMeta, rindeFileMeta,
        driveManejo, manejoColMapping,
      };
      saveWorkspaceLocal(state);
      if (user) {
        setIsSaving(true);
        await saveWorkspace(supabase, activeWorkspaceOwnerId ?? effectiveUserId ?? user.id, state);
        setIsSaving(false);
      }
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, lotData, rindeData, lotVisits, driveManejo, manejoColMapping, user]);

  // ── Dim/highlight lots based on tipo filter ─────────────────────────────────

  useEffect(() => {
    if (!allLotLayersRef.current.length) return;
    const filterActive = activeFilters.tipos.length > 0;
    const newDimmed = new Set<string>();
    allLotLayersRef.current.forEach(({ layer, lotName }) => {
      if (layer === selectedLayerRef.current) return;
      if (!filterActive) {
        layer.setStyle({ fillOpacity: 0.35 });
      } else {
        const hasMatch = (lotData[lotName] ?? []).some(
          (r) => r._tipo && activeFilters.tipos.includes(r._tipo)
        );
        layer.setStyle({ fillOpacity: hasMatch ? 0.45 : 0.08 });
        if (!hasMatch) newDimmed.add(lotName);
      }
    });
    lotDimmedRef.current = newDimmed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters.tipos, lotData]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getLotBaseColor(props: Record<string, unknown>, cultivoMap: Record<string, string>, data: LotData): string {
    if (Object.keys(cultivoMap).length) {
      const name = getLotName(props);
      const rows = (data[name] || []).filter((r) => r._cultivo);
      rows.sort((a, b) => (b._fecha?.getTime() ?? 0) - (a._fecha?.getTime() ?? 0));
      const c = rows[0]?._cultivo ?? "";
      if (c && cultivoMap[c]) return cultivoMap[c];
    }
    return "#e2b04a";
  }

  function getFilteredRows(lotKey: string, filters: ActiveFilters, data: LotData): ParsedRow[] {
    return (data[lotKey] ?? []).filter((r) => {
      if (filters.campaign && r._campaign !== filters.campaign) return false;
      if (filters.cultivo && r._cultivo !== filters.cultivo) return false;
      if (filters.genetica && r._genetica !== filters.genetica) return false;
      if (filters.tipos.length && !filters.tipos.includes(r._tipo)) return false;
      if (filters.from && r._fecha && r._fecha < new Date(filters.from)) return false;
      if (filters.to && r._fecha && r._fecha > new Date(filters.to + "T23:59:59")) return false;
      return true;
    });
  }

  function rebuildFilters(rows: ParsedRow[]) {
    const campaigns = [...new Set(rows.map((r) => r._campaign).filter(Boolean))].sort();
    const tipos = [...new Set(rows.map((r) => r._tipo).filter(Boolean))];
    const dates = rows.map((r) => r._fecha).filter((d): d is Date => !!d && !isNaN(d.getTime()));
    const from = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10) : "";
    const to = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10) : "";
    setActiveFilters({ campaign: campaigns.length === 1 ? campaigns[0] : "", from, to, tipos, cultivo: "", genetica: "" });
  }

  // ── Draw collections on map ──────────────────────────────────────────────────

  async function drawCollections(
    cols: GeoCollection[],
    cMap: Record<string, string>,
    cCultivoMap: Record<string, string>,
    data: LotData
  ): Promise<Layer[]> {
    const L = (await import("leaflet")).default;
    if (shpLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(shpLayerRef.current);
    }
    allLotLayersRef.current = [];
    const layerList: Layer[] = [];
    cols.forEach((col) => {
      const geoLayer = L.geoJSON(col as Parameters<typeof L.geoJSON>[0], {
        style: (feature) => {
          const props = (feature as Feature).properties ?? {};
          return {
            color: "#fff", weight: 1.2, opacity: 0.8,
            fillColor: getLotBaseColor(props as Record<string, unknown>, cCultivoMap, data),
            fillOpacity: 0.35,
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties ?? {};
          const lotName = getLotName(props as Record<string, unknown>);
          const zone = getCampo(props as Record<string, unknown>);
          const lotLayer = layer as LeafletGeoJSON;
          allLotLayersRef.current.push({ layer: lotLayer, lotName, zone, props: props as Record<string, unknown> });
          lotLayer.on("click", () => selectLot(lotLayer, lotName, zone, props as Record<string, unknown>, cMap, cCultivoMap, data));
          lotLayer.on("mouseover", () => {
            if (lotLayer !== selectedLayerRef.current) {
              const opacity = lotDimmedRef.current.has(lotName) ? 0.2 : 0.6;
              lotLayer.setStyle({ fillOpacity: opacity, weight: 2 });
            }
            lotLayer.bindTooltip(`<b>${lotName}</b><br><small>${zone}</small>`, { sticky: true }).openTooltip();
          });
          lotLayer.on("mouseout", () => {
            if (lotLayer !== selectedLayerRef.current) {
              const opacity = lotDimmedRef.current.has(lotName) ? 0.08 : 0.35;
              lotLayer.setStyle({ fillOpacity: opacity, weight: 1.2 });
            }
            lotLayer.unbindTooltip();
          });
        },
      });
      layerList.push(geoLayer);
    });
    const group = L.layerGroup(layerList);
    group.addTo(mapRef.current!);
    shpLayerRef.current = group;
    return layerList;
  }

  // ── Load shapefile (accumulates — never replaces) ───────────────────────────

  async function handleShpFiles(files: FileList) {
    setShpStatus({ msg: "Procesando shapefile...", ok: false });
    try {
      const newCols = await loadShapefiles(files);
      const fileNames = Array.from(files).map((f) => f.name);
      newCols.forEach((col, i) => { (col as unknown as Record<string, unknown>)._file = fileNames[Math.min(i, fileNames.length - 1)]; });
      const mergedCols = [...collections, ...newCols];
      const cMap = buildColorMap(mergedCols);
      setCollections(mergedCols);
      setColorMap(cMap);

      const layerList = await drawCollections(mergedCols, cMap, cultivoColorMap, lotData);

      let total = 0;
      mergedCols.forEach((c) => (total += c.features.length));
      setLotCount(total);

      if (!fieldName) {
        const name = Array.from(files)[0].name.replace(/\..+$/, "").replace(/_/g, " ");
        setFieldName(name);
      }

      const L = (await import("leaflet")).default;
      const bounds = L.featureGroup(layerList as LeafletGeoJSON[]).getBounds();
      if (bounds.isValid()) mapRef.current!.fitBounds(bounds, { padding: [30, 30] });

      setShpStatus({ msg: `✓ ${total} lotes`, ok: true });
      const newFileNames = Array.from(files).map((f) => f.name);
      setShpFiles((prev) => [...prev, ...newFileNames]);
      setShpFileMeta((prev) => [...prev, ...newFileNames.map((name) => ({ name, empresaId: activeEmpresaId }))]);
    } catch (err) {
      setShpStatus({ msg: `✗ ${(err as Error).message}`, ok: false });
    }
  }

  // ── Management upload: step 1 — detect columns ──────────────────────────────

  async function handleDataFileStart(file: File) {
    setCsvStatus({ msg: "Leyendo columnas...", ok: false });
    try {
      const cols = await detectLinkColumns(file);
      setPendingFile(file);
      setLinkPickerCols(cols);
    } catch (err) {
      setCsvStatus({ msg: `✗ ${(err as Error).message}`, ok: false });
    }
  }

  // ── Management upload: step 2 — link column selected, show full mapper ───────

  function handleLinkColumnSelected(col: string) {
    if (!pendingFile) return;
    const allCols = [...linkPickerCols];
    setLinkPickerCols([]);
    const mapping = detectColumnMapping(allCols, col);
    setColMappingAllCols(allCols);
    setPendingColMapping(mapping);
  }

  // ── Management upload: step 3 — confirmed mapping, parse & season-merge ──────

  async function handleColMappingConfirmed(mapping: ColumnMapping, mergeMode: "replace" | "add") {
    if (!pendingFile) return;
    setPendingColMapping(null);
    setCsvStatus({ msg: "Procesando...", ok: false });
    try {
      const { rows, lotData: newLd } = await parseManagementFile(pendingFile, mapping);

      let finalRows: ParsedRow[];
      let finalLotData: LotData;

      if (mergeMode === "replace" && allRows.length > 0) {
        // Replace only the campaigns present in the new file; keep other seasons intact
        const newCampaigns = new Set(rows.map((r) => r._campaign).filter(Boolean));
        const discarded = allRows.filter((r) => newCampaigns.has(r._campaign));
        if (discarded.length > 0) {
          saveManagementBackup(discarded);
          const backup = loadManagementBackup();
          if (backup) {
            setPrevManagementRows(backup.rows);
            setPrevManagementTimestamp(backup.timestamp);
          }
        }
        const kept = allRows.filter((r) => !newCampaigns.has(r._campaign));
        finalRows = [...kept, ...rows];
        finalLotData = {};
        finalRows.forEach((row) => {
          if (!finalLotData[row._linkKey]) finalLotData[row._linkKey] = [];
          finalLotData[row._linkKey].push(row);
        });
      } else {
        // Add mode: append without removing anything
        finalRows = [...allRows, ...rows];
        finalLotData = { ...lotData };
        Object.entries(newLd).forEach(([k, v]) => {
          finalLotData[k] = [...(finalLotData[k] ?? []), ...v];
        });
      }

      setAllRows(finalRows);
      setLotData(finalLotData);

      const cultivoNames = [...new Set(finalRows.map((r) => r._cultivo).filter(Boolean))];
      const cMap = buildCultivoColorMap(cultivoNames);
      setCultivoColorMap(cMap);
      recolorPolygons(cMap, finalLotData);

      setManejoColMapping(mapping);
      if (pendingDriveInfo) {
        setDriveManejo(pendingDriveInfo);
        setPendingDriveInfo(null);
        setCsvFiles([]);
        const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
        setCsvStatus({ msg: `✓ Drive · ${finalRows.length} registros · ${Object.keys(finalLotData).length} lotes · ${time}`, ok: true });
      } else {
        setCsvStatus({ msg: `✓ ${finalRows.length} registros · ${Object.keys(finalLotData).length} lotes`, ok: true });
        const csvName = pendingFile!.name;
        setCsvFiles((prev) => [...prev, csvName]);
        setCsvFileMeta((prev) => [...prev, { name: csvName, empresaId: pendingCsvEmpresaIdRef.current ?? activeEmpresaId }]);
        pendingCsvEmpresaIdRef.current = undefined;
      }
      setPendingFile(null);

      rebuildFilters(finalRows);
    } catch (err) {
      setCsvStatus({ msg: `✗ ${(err as Error).message}`, ok: false });
    }
  }

  // ── Restore previous management data from backup ─────────────────────────────

  function restoreManagementBackup() {
    if (!prevManagementRows.length) return;
    const restoredRows = [...allRows, ...prevManagementRows];
    const restoredLotData = { ...lotData };
    prevManagementRows.forEach((row) => {
      if (!restoredLotData[row._linkKey]) restoredLotData[row._linkKey] = [];
      restoredLotData[row._linkKey].push(row);
    });
    setAllRows(restoredRows);
    setLotData(restoredLotData);
    clearManagementBackup();
    setPrevManagementRows([]);
    setPrevManagementTimestamp(0);
    const cultivoNames = [...new Set(restoredRows.map((r) => r._cultivo).filter(Boolean))];
    const cMap = buildCultivoColorMap(cultivoNames);
    setCultivoColorMap(cMap);
    recolorPolygons(cMap, restoredLotData);
    setCsvStatus({ msg: `✓ ${restoredRows.length} registros · ${Object.keys(restoredLotData).length} lotes (restaurado)`, ok: true });
  }

  // ── Rindes upload ────────────────────────────────────────────────────────────

  async function handleRindeFileStart(file: File) {
    setRindeStatus({ msg: "Leyendo columnas...", ok: false });
    try {
      const cols = await detectLinkColumns(file);
      setPendingRindeFile(file);
      setRindePickerCols(cols);
    } catch (err) {
      setRindeStatus({ msg: `✗ ${(err as Error).message}`, ok: false });
    }
  }

  async function handleRindeLinkColumnSelected(col: string) {
    if (!pendingRindeFile) return;
    setRindePickerCols([]);
    setRindeStatus({ msg: "Procesando rindes...", ok: false });
    try {
      const rd = await parseRindeFile(pendingRindeFile, col);
      setRindeData((prev) => {
        const merged = { ...prev };
        Object.entries(rd).forEach(([k, v]) => {
          merged[k] = [...(merged[k] ?? []), ...v];
        });
        return merged;
      });
      const uniqueLots = Object.keys(rd).length;
      setRindeStatus({ msg: `✓ Rindes · ${uniqueLots} lotes`, ok: true });
      const rindeName = pendingRindeFile!.name;
      setRindeFiles((prev) => [...prev, rindeName]);
      setRindeFileMeta((prev) => [...prev, { name: rindeName, empresaId: activeEmpresaId }]);
      setPendingRindeFile(null);
    } catch (err) {
      setRindeStatus({ msg: `✗ ${(err as Error).message}`, ok: false });
    }
  }

  // ── Polygon coloring ────────────────────────────────────────────────────────

  function recolorPolygons(cMap: Record<string, string>, data: LotData) {
    allLotLayersRef.current.forEach(({ layer, props }) => {
      if (layer === selectedLayerRef.current) return;
      layer.setStyle({ fillColor: getLotBaseColor(props, cMap, data) });
    });
  }

  // ── Lot selection ───────────────────────────────────────────────────────────

  function selectLot(
    layer: LeafletGeoJSON,
    lotName: string,
    zone: string,
    props: Record<string, unknown>,
    cMap: Record<string, string>,
    cCultivoMap: Record<string, string>,
    data: LotData
  ) {
    if (selectedLayerRef.current) {
      const prev = allLotLayersRef.current.find((l) => l.layer === selectedLayerRef.current);
      const prevOpacity = prev && lotDimmedRef.current.has(prev.lotName) ? 0.08 : 0.35;
      selectedLayerRef.current.setStyle({
        fillOpacity: prevOpacity,
        weight: 1.2,
        color: "#fff",
        fillColor: getLotBaseColor(prev?.props ?? {}, cCultivoMap, data),
      });
    }
    selectedLayerRef.current = layer;
    layer.setStyle({
      fillOpacity: 0.75,
      weight: 3,
      color: "#ffe066",
      fillColor: getLotBaseColor(props, cCultivoMap, data),
    });
    setSelectedLot({ lotName, zone, props, layer });
    setSidebarOpen(true);
  }

  // ── Remove a shapefile and its lots ─────────────────────────────────────────

  async function removeShpFile(fileName: string) {
    const newCols = collections.filter((col) => (col as unknown as Record<string, unknown>)._file !== fileName);
    const cMap = buildColorMap(newCols);
    setCollections(newCols);
    setColorMap(cMap);
    setShpFiles((prev) => prev.filter((f) => f !== fileName));
    setShpFileMeta((prev) => prev.filter((m) => m.name !== fileName));
    let total = 0;
    newCols.forEach((c) => (total += c.features.length));
    setLotCount(total);
    if (total === 0) {
      setShpStatus(null);
      setFieldName("");
    } else {
      setShpStatus({ msg: `✓ ${total} lotes`, ok: true });
    }
    await drawCollections(newCols, cMap, cultivoColorMap, lotData);
  }

  // ── Remove a single CSV file and its rows ────────────────────────────────────

  function removeCsvFile(fileName: string) {
    const newRows = allRows.filter((r) => r._file !== fileName);
    const newLotData: LotData = {};
    newRows.forEach((r) => {
      if (!newLotData[r._linkKey]) newLotData[r._linkKey] = [];
      newLotData[r._linkKey].push(r);
    });
    setAllRows(newRows);
    setLotData(newLotData);
    setCsvFiles((prev) => prev.filter((f) => f !== fileName));
    setCsvFileMeta((prev) => prev.filter((m) => m.name !== fileName));
    if (newRows.length === 0) {
      setCsvStatus(null);
    } else {
      setCsvStatus({ msg: `✓ ${newRows.length} registros · ${Object.keys(newLotData).length} lotes`, ok: true });
    }
    rebuildFilters(newRows);
    const cultivoNames = [...new Set(newRows.map((r) => r._cultivo).filter(Boolean))];
    const cMap = buildCultivoColorMap(cultivoNames);
    setCultivoColorMap(cMap);
    recolorPolygons(cMap, newLotData);
  }

  // ── GPS ─────────────────────────────────────────────────────────────────────

  async function toggleGPS() {
    if (!navigator.geolocation) { setGpsStatus("GPS no disponible"); return; }
    if (gpsTracking) {
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      if (gpsMarkerRef.current && mapRef.current) mapRef.current.removeLayer(gpsMarkerRef.current);
      if (gpsCircleRef.current && mapRef.current) mapRef.current.removeLayer(gpsCircleRef.current);
      setGpsTracking(false);
      setGpsStatus("GPS desactivado");
      return;
    }
    setGpsStatus("Obteniendo ubicación...");
    const L = (await import("leaflet")).default;
    const onSuccess = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      if (gpsMarkerRef.current && mapRef.current) mapRef.current.removeLayer(gpsMarkerRef.current);
      if (gpsCircleRef.current && mapRef.current) mapRef.current.removeLayer(gpsCircleRef.current);
      gpsCircleRef.current = L.circle([lat, lng], {
        radius: acc, color: "#3dbb6e", fillColor: "#3dbb6e", fillOpacity: 0.08, weight: 1.5, dashArray: "4 4",
      }).addTo(mapRef.current!);
      gpsMarkerRef.current = L.circleMarker([lat, lng], {
        radius: 9, color: "#fff", weight: 2.5, fillColor: "#3dbb6e", fillOpacity: 1,
      }).addTo(mapRef.current!).bindPopup(`<b>📍 Mi ubicación</b><br>Precisión: ±${Math.round(acc)} m`).openPopup();
      setGpsStatus(`±${Math.round(acc)} m`);
    };
    navigator.geolocation.getCurrentPosition(onSuccess, () => setGpsStatus("Error GPS"), { enableHighAccuracy: true });
    gpsWatchRef.current = navigator.geolocation.watchPosition(onSuccess, undefined, { enableHighAccuracy: true, maximumAge: 5000 });
    setGpsTracking(true);
  }

  // ── Drive manejo ─────────────────────────────────────────────────────────────

  async function refreshDriveWith(info: DriveManejo, mapping: ColumnMapping) {
    setDriveRefreshing(true);
    setDriveError(null);
    setCsvStatus({ msg: "Actualizando desde Drive...", ok: false });
    try {
      const res = await fetch(`/api/drive-fetch?fileId=${info.fileId}&type=${info.type}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const file = new File([blob], "drive-manejo.xlsx", { type: blob.type });
      const { rows, lotData: newLd } = await parseManagementFile(file, mapping);
      setAllRows(rows);
      setLotData(newLd);
      const cultivoNames = [...new Set(rows.map((r) => r._cultivo).filter(Boolean))];
      const cMap = buildCultivoColorMap(cultivoNames);
      setCultivoColorMap(cMap);
      recolorPolygons(cMap, newLd);
      rebuildFilters(rows);
      const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      setCsvStatus({ msg: `✓ Drive · ${rows.length} registros · actualizado ${time}`, ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      setDriveError(msg);
      setCsvStatus({ msg: `✗ Drive: ${msg}`, ok: false });
    } finally {
      setDriveRefreshing(false);
    }
  }

  async function handleDriveLink() {
    const parsed = parseDriveUrl(driveUrlInput.trim());
    if (!parsed) {
      setDriveError("Link inválido. Usá el link compartido de Google Sheets o Drive.");
      return;
    }
    const info: DriveManejo = { ...parsed, url: driveUrlInput.trim() };
    setDriveError(null);
    setPendingDriveInfo(info);
    setCsvStatus({ msg: "Descargando desde Drive...", ok: false });
    try {
      const res = await fetch(`/api/drive-fetch?fileId=${parsed.fileId}&type=${parsed.type}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const file = new File([blob], "drive-manejo.xlsx", { type: blob.type });
      setCsvStatus(null);
      await handleDataFileStart(file);
    } catch (err) {
      const msg = (err as Error).message;
      setDriveError(msg);
      setCsvStatus({ msg: `✗ Drive: ${msg}`, ok: false });
      setPendingDriveInfo(null);
    }
  }

  // ── Export visits CSV ────────────────────────────────────────────────────────

  function downloadVisitsCSV() {
    const header = ["Lote", "Fecha", "Rinde estimado (★)", "Blanco de aplicación", "Efectividad (★)", "Notas"];
    const rows: string[][] = [header];
    Object.entries(lotVisits)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([lot, visits]) => {
        [...visits]
          .sort((a, b) => b.date.localeCompare(a.date))
          .forEach((v) => {
            if (!v.note && !v.yieldStars && !v.sprayTarget) return;
            const fecha = new Date(v.date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
            rows.push([lot, fecha, v.yieldStars ? String(v.yieldStars) : "", v.sprayTarget ?? "", v.sprayEffect ? String(v.sprayEffect) : "", v.note ?? ""]);
          });
      });
    if (rows.length === 1) return;
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recorridos-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Visit observations ───────────────────────────────────────────────────────

  function saveVisit(lotName: string, date: string, update: Partial<LotVisit>) {
    setLotVisits((prev) => {
      const visits = [...(prev[lotName] ?? [])];
      const idx = visits.findIndex((v) => v.date === date);
      const base = idx >= 0 ? visits[idx] : { date, note: "", yieldStars: 0, sprayTarget: "", sprayEffect: 0 };
      const updated = { ...base, ...update };
      if (idx >= 0) visits[idx] = updated;
      else visits.unshift(updated);
      return { ...prev, [lotName]: visits };
    });
  }

  function sendNotes() {
    const today = todayStr();
    const entries = Object.entries(lotVisits)
      .map(([lot, visits]) => ({ lot, visit: visits.find((v) => v.date === today) }))
      .filter(({ visit }) => visit && (visit.note || visit.yieldStars || visit.sprayTarget));
    if (!entries.length) return;
    const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    let body = `RECORRIDO DEL ${fecha}\n${"=".repeat(40)}\n\n`;
    entries.forEach(({ lot, visit }) => {
      if (!visit) return;
      body += `LOTE: ${lot}\n`;
      if (visit.yieldStars) body += `Estimación de rinde: ${"★".repeat(visit.yieldStars)}${"☆".repeat(5 - visit.yieldStars)}\n`;
      if (visit.sprayTarget) body += `Blanco de aplicación: ${visit.sprayTarget}\n`;
      if (visit.sprayEffect) body += `Efectividad: ${"★".repeat(visit.sprayEffect)}${"☆".repeat(5 - visit.sprayEffect)}\n`;
      if (visit.note) body += `\n${visit.note}\n`;
      body += `${"─".repeat(30)}\n\n`;
    });
    body += "\nEnviado desde I.Ag · Recorredor";
    window.location.href = `mailto:?subject=${encodeURIComponent(`Recorrido ${fecha}`)}&body=${encodeURIComponent(body)}`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const today = todayStr();
  const noteCount = Object.values(lotVisits).filter((visits) => {
    const v = visits.find((v) => v.date === today);
    return v && (v.note || v.yieldStars || v.sprayTarget);
  }).length;
  const filteredRows = selectedLot ? getFilteredRows(selectedLot.lotName, activeFilters, lotData) : [];
  const allLotRows = selectedLot ? (lotData[selectedLot.lotName] ?? []) : [];
  const todayVisit = selectedLot
    ? (lotVisits[selectedLot.lotName] ?? []).find((v) => v.date === today) ?? { date: today, note: "", yieldStars: 0, sprayTarget: "", sprayEffect: 0 }
    : null;
  const recentSprayingsForSelected = allLotRows.filter((r) => {
    if (!r._fecha) return false;
    const days = (Date.now() - r._fecha.getTime()) / 86400000;
    return days <= 45 && SPRAYING_TIPOS.has((r._tipo ?? "").toUpperCase());
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#1a1a2e", color: "#e0e0e0" }}>

      {/* ── TOP BAR ── */}
      <header className="flex items-center justify-between px-4 py-2 flex-shrink-0 z-50" style={{ background: "#0f3460", boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
        <div className="flex items-center gap-3">
          {view === "map" && !isMobile && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="px-2 py-1 rounded text-sm" style={{ background: "#0f3460", color: "#aac4e0", border: "1px solid #2a5298" }}>☰</button>
          )}
          {view === "map" && (
            <button
              onClick={() => setView("dashboard")}
              className="px-2 py-1 rounded text-sm font-semibold"
              style={{ background: "#16213e", color: "#aac4e0", border: "1px solid #2a5298" }}
            >
              ← Archivos
            </button>
          )}
          <a href="/" className="font-bold text-lg tracking-widest" style={{ color: "#e2b04a" }}>I.Ag</a>
          {view === "map" && (
            <>
              <span className="text-sm hidden sm:inline" style={{ color: "#aac4e0" }}>
                {fieldName ? `✓ ${fieldName}` : "· Cargá archivos para comenzar"}
              </span>
              {lotCount > 0 && <span className="text-xs" style={{ color: "#6a8ab0" }}>{lotCount} lotes</span>}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && !asUserId && (
            <a href="/admin" className="text-xs font-semibold px-2 py-1 rounded" style={{ background: "#1a2a10", color: "#3dbb6e", border: "1px solid #1a4a20" }}>
              Admin
            </a>
          )}
          {isSaving && <span className="text-xs" style={{ color: "#6a8ab0" }}>Guardando...</span>}
          {noteCount > 0 && (
            <>
              <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#1a4a2a", color: "#3dbb6e" }}>
                📝 {noteCount} nota{noteCount > 1 ? "s" : ""}
              </span>
              <button onClick={sendNotes} className="text-xs font-bold px-3 py-1 rounded" style={{ background: "#e2b04a", color: "#1a1a2e" }}>
                ✉️ Enviar
              </button>
            </>
          )}
          <AuthButton />
        </div>
      </header>

      {/* ── ADMIN BANNER ── */}
      {isAdmin && asUserId && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 text-xs" style={{ background: "#2a1a00", borderBottom: "1px solid #e2b04a" }}>
          <span style={{ color: "#e2b04a" }}>
            🔧 <strong>Modo admin</strong> · cargando para <strong>{asEmail ?? asUserId}</strong>
          </span>
          <a href="/admin" className="font-semibold px-3 py-1 rounded" style={{ background: "#0f3460", color: "#e2b04a", border: "1px solid #2a5298" }}>
            ← Panel admin
          </a>
        </div>
      )}

      {/* ── LOGIN BANNER ── */}
      {!user && lotCount > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 text-xs" style={{ background: "#1a2a4a", borderBottom: "1px solid #2a5298" }}>
          <span style={{ color: "#aac4e0" }}>💡 Ingresá para guardar tu trabajo en la nube</span>
          <a href="/login" className="font-semibold px-3 py-1 rounded" style={{ background: "#0f3460", color: "#e2b04a", border: "1px solid #2a5298" }}>
            Ingresar →
          </a>
        </div>
      )}

      {/* ── DASHBOARD VIEW ── */}
      {view === "dashboard" && (
        <FileDashboard
          user={user}
          myEmpresas={myEmpresas}
          sharedEmpresas={sharedEmpresas}
          activeEmpresaId={activeEmpresaId}
          onSelectEmpresa={(id, workspaceOwnerId) => {
            setActiveEmpresaId(id);
            setActiveWorkspaceOwnerId(workspaceOwnerId ?? user?.id);
          }}
          onNewEmpresa={async (name) => {
            const emp = await createEmpresa(supabase, name);
            setMyEmpresas((prev) => [...prev, emp]);
            setActiveEmpresaId(emp.id);
            setActiveWorkspaceOwnerId(user?.id);
          }}
          onInvite={async (empresaId, email) => {
            await inviteToEmpresa(supabase, empresaId, email);
          }}
          shpFiles={shpFiles}
          shpFileMeta={shpFileMeta}
          csvFiles={csvFiles}
          csvFileMeta={csvFileMeta}
          rindeFiles={rindeFiles}
          rindeFileMeta={rindeFileMeta}
          onUploadShp={handleShpFiles}
          onUploadCsv={(fl) => {
            pendingCsvEmpresaIdRef.current = activeEmpresaId;
            if (fl[0]) handleDataFileStart(fl[0]);
          }}
          onUploadRinde={(fl) => { if (fl[0]) handleRindeFileStart(fl[0]); }}
          onRemoveShp={removeShpFile}
          onRemoveCsv={removeCsvFile}
          onRemoveRinde={(name) => {
            setRindeFiles((prev) => prev.filter((f) => f !== name));
            setRindeFileMeta((prev) => prev.filter((m) => m.name !== name));
            setRindeData((prev) => {
              const next = { ...prev };
              delete next[name];
              return next;
            });
          }}
          shpStatus={shpStatus}
          csvStatus={csvStatus}
          rindeStatus={rindeStatus}
          onGoToMap={() => setView("map")}
        />
      )}

      {/* ── MAIN MAP (always mounted, hidden when dashboard is active) ── */}
      <div className="flex-1 overflow-hidden" style={{ display: view === "map" ? "flex" : "none", flexDirection: isMobile ? "column" : "row", position: "relative" }}>

        {/* ── MAP AREA — always rendered, positioned by isMobile ── */}
        <div style={isMobile
          ? { position: "relative", height: "38vh", flexShrink: 0, width: "100%" }
          : { position: "absolute", inset: 0 }
        }>
          <div id="recorredor-map" className="absolute inset-0" />

          {/* GPS button */}
          <button
            onClick={toggleGPS}
            className="absolute bottom-8 right-3 w-11 h-11 rounded-full flex items-center justify-center text-xl z-[1000]"
            style={{
              background: gpsTracking ? "#1a4a1a" : "#0f3460",
              border: `2px solid ${gpsTracking ? "#3dbb6e" : "#2a5298"}`,
              boxShadow: "0 2px 8px rgba(0,0,0,.5)",
            }}
            title="Mi ubicación"
          >
            {gpsTracking ? "🎯" : "📍"}
          </button>

          {/* GPS status */}
          {gpsStatus && (
            <div className="absolute bottom-20 right-3 text-xs px-2 py-1 rounded-lg z-[1000] max-w-[160px] text-center"
              style={{ background: "rgba(15,52,96,.92)", color: "#aac4e0", border: "1px solid #2a5298" }}>
              {gpsStatus}
            </div>
          )}

          {/* Yield overlay — only on desktop (on mobile it's in the panel) */}
          {!isMobile && selectedLot && (rindeData[selectedLot.lotName] ?? []).length > 0 && (
            <div className="absolute bottom-4 right-16 z-[500]" style={{ maxWidth: "360px" }}>
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(13,27,53,.95)", border: "1px solid #2a5298", backdropFilter: "blur(4px)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: "#6a8ab0" }}>
                  🌾 Rindes · <span style={{ color: "#e2b04a" }}>{selectedLot.lotName}</span>
                </p>
                <YieldBar lotRindes={rindeData[selectedLot.lotName] ?? []} />
              </div>
            </div>
          )}
        </div>

        {/* ── PANEL CONTENT (shared between desktop sidebar and mobile bottom panel) ── */}
        {(() => {
          const panelContent = (
            <>
              {lotCount > 0 && (
                <div className="p-3" style={{ borderBottom: "1px solid #0f3460" }}>
                  <button className="w-full text-xs py-1 rounded" style={{ background: "#1a4a80", color: "#e0e8f0" }}
                    onClick={() => {
                      if (!shpLayerRef.current || !mapRef.current) return;
                      const layers = allLotLayersRef.current.map((l) => l.layer);
                      import("leaflet").then((L) => {
                        const bounds = L.featureGroup(layers).getBounds();
                        if (bounds.isValid()) mapRef.current!.fitBounds(bounds, { padding: [30, 30] });
                      });
                    }}>
                    📍 Centrar en los lotes
                  </button>
                </div>
              )}

              {selectedLot && todayVisit && (
                <SidebarSection title="📌 Recorrida de hoy" collapsible defaultOpen={true}>
                  <VisitForm
                    visit={todayVisit}
                    onSave={(u) => saveVisit(selectedLot.lotName, today, u)}
                    hasSprayingContext={recentSprayingsForSelected.length > 0}
                    recentSprayings={recentSprayingsForSelected}
                  />
                </SidebarSection>
              )}

              {allRows.length > 0 && (
                <FiltersPanel
                  allRows={allRows}
                  cultivoColorMap={cultivoColorMap}
                  filters={activeFilters}
                  onChange={setActiveFilters}
                />
              )}

              {Object.values(lotVisits).some((vs) => vs.some((v) => v.note || v.yieldStars || v.sprayTarget)) && (
                <div className="p-3" style={{ borderBottom: "1px solid #0f3460" }}>
                  <button
                    className="w-full py-1.5 text-xs rounded"
                    style={{ background: "transparent", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
                    onClick={downloadVisitsCSV}
                  >
                    ⬇ Exportar historial de recorridas (.csv)
                  </button>
                </div>
              )}

              {Object.keys(cultivoColorMap).length > 0 && (
                <SidebarSection title="🌱 Cultivos" collapsible defaultOpen={false}>
                  <ul className="space-y-1">
                    {Object.entries(cultivoColorMap).sort((a, b) => a[0].localeCompare(b[0])).map(([name, color]) => (
                      <li key={name} className="flex items-center gap-2 text-xs" style={{ color: "#ccd" }}>
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                        {name}
                      </li>
                    ))}
                  </ul>
                </SidebarSection>
              )}

              <div className="p-4">
                <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "#aac4e0" }}>📌 Lote seleccionado</p>
                {!selectedLot ? (
                  <p className="text-xs italic" style={{ color: "#445" }}>Tocá un lote del mapa para ver su información.</p>
                ) : (
                  <>
                    <LotInfo
                      lotName={selectedLot.lotName}
                      zone={selectedLot.zone}
                      color={colorMap[selectedLot.zone] ?? "#e2b04a"}
                      filteredRows={filteredRows}
                      allRows={allLotRows}
                      visits={lotVisits[selectedLot.lotName] ?? []}
                      onSaveVisit={(date, update) => saveVisit(selectedLot.lotName, date, update)}
                      recentSprayings={allLotRows.filter((r) => {
                        if (!r._fecha) return false;
                        const days = (Date.now() - r._fecha.getTime()) / 86400000;
                        return days <= 45 && SPRAYING_TIPOS.has((r._tipo ?? "").toUpperCase());
                      })}
                      lotRindes={rindeData[selectedLot.lotName] ?? []}
                    />
                  </>
                )}
              </div>
            </>
          );

          if (isMobile) {
            return (
              <div className="flex-1 overflow-y-auto" style={{ background: "#16213e", borderTop: "1px solid #0f3460" }}>
                {panelContent}
              </div>
            );
          }

          return (
            <>
              {sidebarOpen && (
                <div className="absolute inset-0 z-[400]" style={{ background: "rgba(0,0,0,.55)" }}
                  onClick={() => setSidebarOpen(false)} />
              )}
              <aside
                className="absolute top-0 left-0 bottom-0 flex flex-col overflow-y-auto transition-all duration-300 z-[500]"
                style={{
                  width: sidebarOpen ? "300px" : "0",
                  overflow: sidebarOpen ? "auto" : "hidden",
                  background: "#16213e",
                  borderRight: "1px solid #0f3460",
                }}
              >
                {panelContent}
              </aside>
            </>
          );
        })()}
      </div>

      {/* ── LINK COLUMN PICKER MODAL (step 1: identify lote column) ── */}
      {linkPickerCols.length > 0 && (
        <ColumnPickerModal
          columns={linkPickerCols}
          fileName={pendingFile?.name ?? ""}
          onSelect={handleLinkColumnSelected}
          onCancel={() => { setLinkPickerCols([]); setPendingFile(null); setPendingDriveInfo(null); setCsvStatus(null); }}
        />
      )}

      {/* ── COLUMN MAPPING MODAL (step 2: map remaining fields) ── */}
      {pendingColMapping && (
        <ColumnMappingModal
          mapping={pendingColMapping}
          allColumns={colMappingAllCols}
          fileName={pendingFile?.name ?? ""}
          hasExistingData={allRows.length > 0}
          onConfirm={handleColMappingConfirmed}
          onCancel={() => { setPendingColMapping(null); setPendingFile(null); setPendingDriveInfo(null); setCsvStatus(null); }}
        />
      )}

      {/* ── LINK COLUMN PICKER MODAL (rindes) ── */}
      {rindePickerCols.length > 0 && (
        <ColumnPickerModal
          columns={rindePickerCols}
          fileName={pendingRindeFile?.name ?? ""}
          onSelect={handleRindeLinkColumnSelected}
          onCancel={() => { setRindePickerCols([]); setPendingRindeFile(null); setRindeStatus(null); }}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDriveUrl(url: string): { fileId: string; type: "sheets" | "file" } | null {
  const sheetsMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetsMatch) return { fileId: sheetsMatch[1], type: "sheets" };
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return { fileId: driveMatch[1], type: "file" };
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return { fileId: openMatch[1], type: "file" };
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SidebarSection({ title, children, optional, collapsible, defaultOpen = true }: {
  title: string; children: React.ReactNode; optional?: boolean; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="p-3" style={{ borderBottom: "1px solid #0f3460" }}>
      <button
        className="flex items-center justify-between w-full mb-0"
        style={{ cursor: collapsible ? "pointer" : "default", background: "none", border: "none", padding: 0 }}
        onClick={() => collapsible && setOpen((o) => !o)}
      >
        <p className="text-xs uppercase tracking-wider flex items-center gap-2" style={{ color: "#aac4e0" }}>
          {title}
          {optional && <span className="text-xs normal-case px-2 py-0.5 rounded-full" style={{ background: "#1e2e3e", color: "#6a8ab0", letterSpacing: 0, textTransform: "none" }}>Optativo</span>}
        </p>
        {collapsible && <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#6a8ab0" }}>{open ? "▲" : "▼"}</span>}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function UploadZone({
  accept, multiple, hint, onFiles, status, icon, loadedFiles = [], onRemove,
}: {
  accept: string; multiple: boolean; hint: string;
  onFiles: (files: FileList) => void;
  status: { msg: string; ok: boolean } | null;
  icon: string;
  loadedFiles?: string[];
  onRemove?: (name: string) => void;
}) {
  const [drag, setDrag] = useState(false);

  if (loadedFiles.length > 0) {
    return (
      <div className="space-y-1">
        {loadedFiles.map((name, i) => (
          <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: "#0d2a1a", border: "1px solid #1e5a2e", color: "#3dbb6e" }}>
            <span className="truncate flex-1">✓ {name}</span>
            {onRemove && (
              <button
                onClick={() => onRemove(name)}
                title="Eliminar este archivo"
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:opacity-70"
                style={{ color: "#e25a5a", fontSize: "14px", lineHeight: 1 }}
              >×</button>
            )}
          </div>
        ))}
        <label
          className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded text-xs transition-colors hover:opacity-80"
          style={{ background: "#0d1b35", border: "1px dashed #2a5298", color: "#6a8ab0" }}
        >
          <input type="file" accept={accept} multiple={multiple} className="sr-only"
            onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
          + Agregar otro archivo
        </label>
        {status && !status.ok && (
          <p className="text-xs px-2 py-1 rounded" style={{ background: "#3a2a0a", color: "#e2b04a" }}>{status.msg}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <label
        className="block rounded-lg text-center cursor-pointer transition-all relative"
        style={{
          border: `2px dashed ${drag ? "#e2b04a" : "#2a5298"}`,
          background: drag ? "#1a2a4a" : "#0d1b35",
          padding: "12px 10px",
        }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
      >
        <input type="file" accept={accept} multiple={multiple} className="sr-only"
          onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
        <div className="text-2xl mb-1">{icon}</div>
        <p className="text-xs" style={{ color: "#8ab" }}>Clic para subir o arrastrá acá</p>
        <p className="text-xs mt-1" style={{ color: "#445" }}>{hint}</p>
      </label>
      {status && !status.ok && (
        <p className="text-xs mt-1 px-2 py-1 rounded" style={{ background: "#3a2a0a", color: "#e2b04a" }}>{status.msg}</p>
      )}
    </>
  );
}

function FiltersPanel({
  allRows, cultivoColorMap, filters, onChange,
}: {
  allRows: ParsedRow[];
  cultivoColorMap: Record<string, string>;
  filters: ActiveFilters;
  onChange: (f: ActiveFilters) => void;
}) {
  const campaigns = [...new Set(allRows.map((r) => r._campaign).filter(Boolean))].sort();
  const PRIORITY_TIPOS = ["Herbicidas", "Insecticidas", "Fungicidas"];
  const allTipos = [...new Set(allRows.map((r) => r._tipo).filter(Boolean))];
  const tipos = [
    ...PRIORITY_TIPOS.filter((t) => allTipos.includes(t)),
    ...allTipos.filter((t) => !PRIORITY_TIPOS.includes(t)).sort(),
  ];
  const cultivos = Object.keys(cultivoColorMap).sort();
  const geneticas = [...new Set(allRows.map((r) => r._genetica).filter(Boolean))].sort();

  return (
    <SidebarSection title="🔍 Filtros">
      <div className="space-y-3 text-xs">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span style={{ color: "#6a8ab0" }}>Tipo de aplicación</span>
            <div className="flex gap-1">
              <button className="px-1.5 py-0.5 rounded text-xs" style={{ background: "none", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
                onClick={() => onChange({ ...filters, tipos })}>Todos</button>
              <button className="px-1.5 py-0.5 rounded text-xs" style={{ background: "none", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
                onClick={() => onChange({ ...filters, tipos: [] })}>Ninguno</button>
            </div>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tipos.map((tipo) => {
              const color = tipoColor(tipo);
              return (
                <label key={tipo} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={filters.tipos.includes(tipo)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...filters.tipos, tipo] : filters.tipos.filter((t) => t !== tipo);
                      onChange({ ...filters, tipos: next });
                    }} />
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: color + "22", color, border: `1px solid ${color}44` }}>{tipo}</span>
                </label>
              );
            })}
          </div>
        </div>

        <select className="w-full rounded px-2 py-1.5" style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd" }}
          value={filters.campaign} onChange={(e) => onChange({ ...filters, campaign: e.target.value })}>
          <option value="">Todas las campañas</option>
          {campaigns.map((c) => <option key={c} value={c}>Campaña {c}</option>)}
        </select>

        {cultivos.length > 0 && (
          <select className="w-full rounded px-2 py-1.5" style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd" }}
            value={filters.cultivo} onChange={(e) => onChange({ ...filters, cultivo: e.target.value })}>
            <option value="">Todos los cultivos</option>
            {cultivos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {geneticas.length > 0 && (
          <select className="w-full rounded px-2 py-1.5" style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd" }}
            value={filters.genetica} onChange={(e) => onChange({ ...filters, genetica: e.target.value })}>
            <option value="">Todas las genéticas</option>
            {geneticas.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        <button className="w-full py-1.5 rounded font-semibold text-xs" style={{ background: "transparent", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
          onClick={() => {
            const dates = allRows.map((r) => r._fecha).filter((d): d is Date => !!d && !isNaN(d.getTime()));
            const from = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10) : "";
            const to = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10) : "";
            onChange({ campaign: "", from, to, tipos: [...new Set(allRows.map((r) => r._tipo).filter(Boolean))], cultivo: "", genetica: "" });
          }}>
          Limpiar filtros
        </button>
      </div>
    </SidebarSection>
  );
}

function StarRating({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: "#6a8ab0" }}>{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            style={{ fontSize: "1.4rem", lineHeight: 1, color: n <= value ? "#e2b04a" : "#2a4a6a", background: "none", border: "none", cursor: "pointer", padding: "2px" }}
            onClick={() => onChange(n === value ? 0 : n)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function VisitForm({ visit, onSave, onDone, hasSprayingContext, recentSprayings }: {
  visit: LotVisit;
  onSave: (u: Partial<LotVisit>) => void;
  onDone?: () => void;
  hasSprayingContext: boolean;
  recentSprayings: ParsedRow[];
}) {
  const [localNote, setLocalNote] = useState(visit.note);
  const [localTarget, setLocalTarget] = useState(visit.sprayTarget);
  return (
    <div className="space-y-3">
      <StarRating value={visit.yieldStars} onChange={(n) => onSave({ yieldStars: n })} label="Estimación de rinde" />
      {hasSprayingContext && (
        <div className="p-2 rounded space-y-2" style={{ background: "#0d1b35", border: "1px solid #2a4a6a" }}>
          <p className="text-xs" style={{ color: "#6a8ab0" }}>
            Aplicación reciente:{" "}
            {recentSprayings.slice(0, 3).map((r, i) => (
              <span key={i}>{i > 0 ? ", " : ""}<strong style={{ color: "#e2b04a" }}>{r._prod || r._tipo}</strong>{r._fechaStr ? ` (${r._fechaStr})` : ""}</span>
            ))}
          </p>
          <div>
            <label className="text-xs block mb-1" style={{ color: "#aac4e0" }}>¿Cuál fue el blanco?</label>
            <input
              className="w-full rounded px-2 py-1 text-xs"
              style={{ background: "#16213e", border: "1px solid #2a5298", color: "#e0e0e0", outline: "none" }}
              placeholder="Ej: yuyo colorado, roya..."
              value={localTarget}
              onChange={(e) => setLocalTarget(e.target.value)}
              onBlur={() => onSave({ sprayTarget: localTarget })}
            />
          </div>
          <StarRating value={visit.sprayEffect} onChange={(n) => onSave({ sprayEffect: n })} label="Efectividad" />
        </div>
      )}
      <div>
        <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: "#6a8ab0" }}>Notas</label>
        <textarea
          value={localNote}
          onChange={(e) => setLocalNote(e.target.value)}
          onBlur={() => onSave({ note: localNote })}
          placeholder="Observaciones del recorrido..."
          className="w-full rounded-md p-2 text-sm resize-y leading-relaxed"
          style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#e0e0e0", outline: "none", minHeight: "70px" }}
        />
      </div>
      {onDone && (
        <button className="text-xs py-1 px-3 rounded" style={{ background: "#1a2a4a", border: "1px solid #2a5298", color: "#aac4e0" }} onClick={onDone}>
          Listo
        </button>
      )}
    </div>
  );
}

function LotInfo({
  lotName, zone, color, filteredRows, allRows, visits, onSaveVisit, recentSprayings, lotRindes,
}: {
  lotName: string; zone: string; color: string;
  filteredRows: ParsedRow[]; allRows: ParsedRow[];
  visits: LotVisit[];
  onSaveVisit: (date: string, update: Partial<LotVisit>) => void;
  recentSprayings: ParsedRow[];
  lotRindes: Array<{ campana: string; cultivo: string; tipoCorr: string; genetica: string; rinde: number }>;
}) {
  const today = todayStr();
  const pastVisits = [...visits].filter((v) => v.date !== today).sort((a, b) => b.date.localeCompare(a.date));
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [rindesOpen, setRindesOpen] = useState(false);

  const cultivos = [...new Set(filteredRows.map((r) => r._cultivo).filter(Boolean))];
  const sups = [...new Set(filteredRows.map((r) => String(r._sup ?? "")).filter(Boolean))];
  const campaigns = [...new Set(filteredRows.map((r) => r._campaign).filter(Boolean))];
  const hasLabor = filteredRows.some((r) => r._labor);
  const sortedRows = [...filteredRows].sort((a, b) => (b._fecha?.getTime() ?? 0) - (a._fecha?.getTime() ?? 0));

  return (
    <div>
      <div className="text-xl font-bold mb-1" style={{ color }}>🌿 {lotName}</div>
      <div className="text-xs mb-3" style={{ color: "#8ab" }}>Campo: {zone}</div>

      {allRows.length > 0 && (
        <div className="rounded-lg p-2 mb-3 text-xs space-y-1" style={{ background: "#0d1b35", color: "#8ab" }}>
          {cultivos.length > 0 && <div>🌱 <strong style={{ color: "#e2b04a" }}>Cultivo:</strong> {cultivos.join(", ")}</div>}
          {sups.length > 0 && <div>📐 <strong style={{ color: "#e2b04a" }}>Sup:</strong> {sups[0]} ha</div>}
          {campaigns.length > 0 && <div>📅 <strong style={{ color: "#e2b04a" }}>Campaña:</strong> {campaigns.join(", ")}</div>}
          <div>📋 <strong style={{ color: "#e2b04a" }}>{filteredRows.length}</strong> registro{filteredRows.length !== 1 ? "s" : ""}
            {filteredRows.length < allRows.length && <span style={{ color: "#6a8ab0" }}> (de {allRows.length})</span>}
          </div>
        </div>
      )}

      {/* ── Rindes históricos (collapsible) ── */}
      {lotRindes.length > 0 && (
        <div style={{ borderTop: "1px solid #1e2e4e", marginBottom: "8px" }}>
          <button
            className="flex items-center justify-between w-full py-2 text-xs uppercase tracking-wider"
            style={{ background: "none", border: "none", color: "#6a8ab0", cursor: "pointer" }}
            onClick={() => setRindesOpen((o) => !o)}
          >
            <span>🌾 Rindes históricos</span>
            <span>{rindesOpen ? "▲" : "▼"}</span>
          </button>
          {rindesOpen && <YieldBar lotRindes={lotRindes} />}
        </div>
      )}

      {/* ── Applications table ── */}
      {sortedRows.length > 0 && (
        <div style={{ borderTop: "1px solid #1e2e4e" }}>
          <p className="text-xs uppercase tracking-wider mt-3 mb-2" style={{ color: "#6a8ab0" }}>Historial de aplicaciones</p>
          {allRows.length === 0 && (
            <p className="text-xs italic mb-2" style={{ color: "#445" }}>
              No hay datos de manejo. Cargá un CSV/XLSX con columna "Lote".
            </p>
          )}
          <div className="overflow-x-auto mb-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: "#0d1b35" }}>
                  <th className="text-left px-2 py-1" style={{ color: "#667" }}>Tipo</th>
                  {hasLabor && <th className="text-left px-2 py-1" style={{ color: "#667" }}>Labor</th>}
                  <th className="text-left px-2 py-1" style={{ color: "#667" }}>{hasLabor ? "Producto" : "Producto / Labor"}</th>
                  <th className="text-left px-2 py-1" style={{ color: "#667" }}>Dosis</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastFecha = "";
                  const colSpan = hasLabor ? 4 : 3;
                  return sortedRows.flatMap((row, i) => {
                    const tc = tipoColor(row._tipo);
                    const dosisNum = parseFloat(String(row._dosis ?? ""));
                    const dosisStr = row._dosis !== "" && !isNaN(dosisNum) ? `${dosisNum.toFixed(2)} ${row._unid}` : "–";
                    const fechaStr = row._fechaStr || "–";
                    const cells = [];
                    if (fechaStr !== lastFecha) {
                      lastFecha = fechaStr;
                      cells.push(
                        <tr key={`fecha-${i}`}>
                          <td colSpan={colSpan} className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide"
                            style={{ background: "#0f3460", color: "#e2b04a", borderTop: "2px solid #1e3a5a", borderBottom: "1px solid #2a5298" }}>
                            📅 {fechaStr}
                          </td>
                        </tr>
                      );
                    }
                    cells.push(
                      <tr key={i} style={{ borderBottom: "1px solid #1e2e4e" }}>
                        <td className="px-2 py-1.5">
                          <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: tc + "22", color: tc, border: `1px solid ${tc}44` }}>
                            {row._tipo || "–"}
                          </span>
                        </td>
                        {hasLabor && <td className="px-2 py-1.5" style={{ color: "#aac4e0" }}>{row._labor || "–"}</td>}
                        <td className="px-2 py-1.5" style={{ color: "#ccd" }}>{row._prod || "–"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: "#ccd" }}>{dosisStr}</td>
                      </tr>
                    );
                    return cells;
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Past visits ── */}
      {pastVisits.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid #1e2e4e" }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "#6a8ab0" }}>Visitas anteriores</p>
          <div className="space-y-3">
            {pastVisits.map((v) => {
              const formatted = new Date(v.date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
              const hasContent = v.note || v.yieldStars || v.sprayTarget;
              const isEditing = editingDate === v.date;
              return (
                <div key={v.date} className="rounded-lg p-2 text-xs" style={{ background: "#0d1b35", border: "1px solid #1e3050" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold" style={{ color: "#aac4e0" }}>📅 {formatted}</span>
                    <button className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "transparent", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
                      onClick={() => setEditingDate(isEditing ? null : v.date)}>
                      {isEditing ? "Cerrar" : "Editar"}
                    </button>
                  </div>
                  {isEditing ? (
                    <VisitForm visit={v} onSave={(u) => onSaveVisit(v.date, u)} onDone={() => setEditingDate(null)} hasSprayingContext={recentSprayings.length > 0} recentSprayings={recentSprayings} />
                  ) : (
                    <>
                      {!hasContent && <p style={{ color: "#445" }}>Sin anotaciones</p>}
                      {v.yieldStars > 0 && (
                        <p style={{ color: "#e2b04a" }}>{"★".repeat(v.yieldStars)}{"☆".repeat(5 - v.yieldStars)} rinde estimado</p>
                      )}
                      {v.sprayTarget && (
                        <p style={{ color: "#ccd" }}>
                          Blanco: {v.sprayTarget}
                          {v.sprayEffect > 0 && <span style={{ color: "#e2b04a" }}> · {"★".repeat(v.sprayEffect)}{"☆".repeat(5 - v.sprayEffect)}</span>}
                        </p>
                      )}
                      {v.note && <p style={{ color: "#ccd", whiteSpace: "pre-wrap", marginTop: "4px" }}>{v.note}</p>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function YieldBar({ lotRindes }: { lotRindes: Array<{ campana: string; cultivo: string; tipoCorr: string; genetica: string; rinde: number }> }) {
  const byCampaign: Record<string, typeof lotRindes> = {};
  lotRindes.forEach((r) => {
    if (!byCampaign[r.campana]) byCampaign[r.campana] = [];
    byCampaign[r.campana].push(r);
  });
  const campaigns = Object.keys(byCampaign).sort((a, b) => b.localeCompare(a)).slice(0, 5);

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1e2e4e" }}>
      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "#6a8ab0" }}>🌾 Rindes históricos</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <th className="pr-3 text-left" style={{ color: "#4a6a8a" }} />
              {campaigns.map((c) => <th key={c} className="px-3 text-left" style={{ color: "#6a8ab0" }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {(["cultivo", "rinde"] as const).map((row) => (
              <tr key={row}>
                <td className="pr-3 text-xs uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  {row === "cultivo" ? "Cultivo" : "kg/ha"}
                </td>
                {campaigns.map((camp) => {
                  const records = byCampaign[camp];
                  const summer = records.find((r) => !isWinterCrop(r.cultivo));
                  const winter = records.find((r) => isWinterCrop(r.cultivo));
                  const main = summer ?? (!winter ? records[0] : null);
                  return (
                    <td key={camp} className="px-3 py-1" style={{ borderLeft: "1px solid #1e3050", color: "#ccd" }}>
                      {row === "cultivo" ? (
                        <div>
                          {main && <span>{cultivoIcon(main.cultivo)} {main.cultivo}</span>}
                          {winter && <div className="mt-1 pt-1" style={{ borderTop: "1px dashed #253a50" }}>
                            {cultivoIcon(winter.cultivo)} {winter.cultivo}
                          </div>}
                        </div>
                      ) : (
                        <div>
                          {main && <span className="font-bold" style={{ color: "#e2b04a" }}>{Number(main.rinde).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>}
                          {winter && <div className="mt-1 pt-1 font-bold" style={{ borderTop: "1px dashed #253a50", color: "#e2b04a" }}>
                            {Number(winter.rinde).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                          </div>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step 1: which column identifies the lote ──────────────────────────────────

function ColumnPickerModal({
  columns, fileName, onSelect, onCancel,
}: {
  columns: string[]; fileName: string;
  onSelect: (col: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.7)" }}>
      <div className="rounded-xl p-6 w-full max-w-sm" style={{ background: "#16213e", border: "1px solid #0f3460" }}>
        <h3 className="font-bold text-base mb-1" style={{ color: "#e2b04a" }}>¿Qué columna identifica el lote?</h3>
        <p className="text-xs mb-4" style={{ color: "#aac4e0" }}>
          Archivo: <strong>{fileName}</strong><br />
          Elegí la columna que contiene el nombre del lote, para vincularlo con el mapa.
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
          {columns.map((col) => (
            <button key={col} className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ background: "#0d1b35", border: "1px solid #2a5298", color: "#ccd" }}
              onClick={() => onSelect(col)}>
              {col}
            </button>
          ))}
        </div>
        <button className="w-full py-2 rounded text-xs" style={{ background: "transparent", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
          onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Step 2: map remaining canonical fields + merge mode ───────────────────────

const FIELD_DEFS: { key: keyof Omit<ColumnMapping, "linkCol">; label: string; hint?: string }[] = [
  { key: "dateCol",     label: "Fecha",               hint: "FECHA" },
  { key: "tipoCol",     label: "Tipo de aplicación",  hint: "TIPO" },
  { key: "prodCol",     label: "Producto / Labor",    hint: "PRODUCTO/LABOR" },
  { key: "laborCol",    label: "Labor (separado)",     hint: "LABOR — solo si va en columna aparte" },
  { key: "dosisCol",    label: "Dosis",               hint: "DOSIS" },
  { key: "unidCol",     label: "Unidad",              hint: "UNID" },
  { key: "cultivoCol",  label: "Cultivo",             hint: "CULTIVO" },
  { key: "geneticaCol", label: "Genética / Variedad", hint: "GENETICA, VARIEDAD, HIBRIDO…" },
  { key: "supCol",      label: "Superficie (ha)",     hint: "SUP" },
];

function ColumnMappingModal({
  mapping, allColumns, fileName, hasExistingData, onConfirm, onCancel,
}: {
  mapping: ColumnMapping;
  allColumns: string[];
  fileName: string;
  hasExistingData: boolean;
  onConfirm: (mapping: ColumnMapping, mergeMode: "replace" | "add") => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState<ColumnMapping>(mapping);
  const [mergeMode, setMergeMode] = useState<"replace" | "add">("replace");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }}>
      <div className="rounded-xl p-6 w-full max-w-md flex flex-col" style={{ background: "#16213e", border: "1px solid #0f3460", maxHeight: "90vh" }}>
        <h3 className="font-bold text-base mb-1 flex-shrink-0" style={{ color: "#e2b04a" }}>Configurar columnas</h3>
        <p className="text-xs mb-3 flex-shrink-0" style={{ color: "#aac4e0" }}>
          Archivo: <strong>{fileName}</strong> · Columna lote: <strong>{local.linkCol}</strong><br />
          Revisá cómo mapeamos el resto de columnas. Podés cambiar cualquiera.
        </p>

        {/* Field mapping table */}
        <div className="overflow-y-auto flex-1 space-y-2 mb-4 pr-1">
          {FIELD_DEFS.map(({ key, label, hint }) => {
            const detected = !!local[key];
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-36 flex-shrink-0" style={{ color: detected ? "#ccd" : "#556" }}>
                  {label}
                </span>
                <select
                  className="flex-1 rounded px-2 py-1 text-xs"
                  style={{
                    background: "#0d1b35",
                    border: `1px solid ${detected ? "#2a7a5a" : "#2a5298"}`,
                    color: detected ? "#ccd" : "#6a8ab0",
                  }}
                  value={local[key]}
                  onChange={(e) => setLocal({ ...local, [key]: e.target.value })}
                >
                  <option value="">— No vincular —</option>
                  {allColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="w-3 flex-shrink-0 text-center" style={{ color: detected ? "#3dbb6e" : "#333" }}>
                  {detected ? "✓" : ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* Merge mode (only when existing data is present) */}
        {hasExistingData && (
          <div className="flex-shrink-0 mb-4 p-3 rounded-lg text-xs space-y-2" style={{ background: "#0d1b35", border: "1px solid #2a4a6a" }}>
            <p style={{ color: "#aac4e0" }}>¿Qué hacer con los datos de la/s campaña/s de este archivo?</p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mergeMode" value="replace" checked={mergeMode === "replace"} onChange={() => setMergeMode("replace")} className="mt-0.5 flex-shrink-0" />
              <span style={{ color: mergeMode === "replace" ? "#ccd" : "#6a8ab0" }}>
                <strong>Reemplazar la campaña</strong> — este archivo incluye todo el historial de la temporada
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mergeMode" value="add" checked={mergeMode === "add"} onChange={() => setMergeMode("add")} className="mt-0.5 flex-shrink-0" />
              <span style={{ color: mergeMode === "add" ? "#ccd" : "#6a8ab0" }}>
                <strong>Solo agregar nuevos registros</strong> — el archivo tiene solo registros adicionales
              </span>
            </label>
          </div>
        )}

        <div className="flex gap-2 flex-shrink-0">
          <button
            className="flex-1 py-2 rounded font-semibold text-sm"
            style={{ background: "#e2b04a", color: "#1a1a2e" }}
            onClick={() => onConfirm(local, mergeMode)}
          >
            Confirmar y procesar
          </button>
          <button
            className="px-4 py-2 rounded text-xs"
            style={{ background: "transparent", border: "1px solid #2a4a6a", color: "#6a8ab0" }}
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FileDashboard ─────────────────────────────────────────────────────────────

interface WorkspaceItem { id: string; label: string; isOwn: boolean }
interface EmpresaItem  { id: string; name: string; workspaceId: string; isOwner: boolean }

function FileDashboard({
  user,
  myEmpresas, sharedEmpresas, activeEmpresaId,
  onSelectEmpresa, onNewEmpresa, onInvite,
  shpFiles, shpFileMeta, csvFiles, csvFileMeta, rindeFiles, rindeFileMeta,
  onUploadShp, onUploadCsv, onUploadRinde,
  onRemoveShp, onRemoveCsv, onRemoveRinde,
  shpStatus, csvStatus, rindeStatus,
  onGoToMap,
}: {
  user: import("@supabase/supabase-js").User | null;
  myEmpresas: Empresa[];
  sharedEmpresas: SharedEmpresa[];
  activeEmpresaId: string | undefined;
  onSelectEmpresa: (id: string, ownerWorkspaceId?: string) => void;
  onNewEmpresa: (name: string) => Promise<void>;
  onInvite: (empresaId: string, email: string) => Promise<void>;
  shpFiles: string[]; shpFileMeta: FileMeta[];
  csvFiles: string[]; csvFileMeta: FileMeta[];
  rindeFiles: string[]; rindeFileMeta: FileMeta[];
  onUploadShp: (fl: FileList) => void;
  onUploadCsv: (fl: FileList) => void;
  onUploadRinde: (fl: FileList) => void;
  onRemoveShp: (name: string) => void;
  onRemoveCsv: (name: string) => void;
  onRemoveRinde: (name: string) => void;
  shpStatus: { msg: string; ok: boolean } | null;
  csvStatus: { msg: string; ok: boolean } | null;
  rindeStatus: { msg: string; ok: boolean } | null;
  onGoToMap: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [newEmpresaName, setNewEmpresaName] = useState("");
  const [showNewEmpresa, setShowNewEmpresa] = useState(false);
  const [newEmpresaLoading, setNewEmpresaLoading] = useState(false);

  // ── Workspace list (own + one per shared asesor) ───────────────────────────
  const workspaces = useMemo<WorkspaceItem[]>(() => {
    const ws: WorkspaceItem[] = [];
    if (user) ws.push({ id: user.id, label: "Mi espacio", isOwn: true });
    const seen = new Set<string>();
    sharedEmpresas.forEach((e) => {
      if (!seen.has(e.ownerWorkspaceId)) {
        seen.add(e.ownerWorkspaceId);
        ws.push({ id: e.ownerWorkspaceId, label: e.ownerName ?? "Espacio compartido", isOwn: false });
      }
    });
    return ws;
  }, [user, sharedEmpresas]);

  // ── Multi-select: workspaces & empresas ───────────────────────────────────
  const [selWs, setSelWs] = useState<Set<string>>(() =>
    new Set(user?.id ? [user.id] : [])
  );
  const [selEmp, setSelEmp] = useState<Set<string>>(() =>
    activeEmpresaId ? new Set([activeEmpresaId]) : new Set()
  );

  // Empresas visible given selected workspaces
  const availableEmpresas = useMemo<EmpresaItem[]>(() => {
    const result: EmpresaItem[] = [];
    if (selWs.has(user?.id ?? "")) {
      myEmpresas.forEach((e) => result.push({ id: e.id, name: e.name, workspaceId: e.ownerId, isOwner: true }));
    }
    sharedEmpresas.forEach((e) => {
      if (selWs.has(e.ownerWorkspaceId))
        result.push({ id: e.empresaId, name: e.empresaName, workspaceId: e.ownerWorkspaceId, isOwner: false });
    });
    return result;
  }, [selWs, myEmpresas, sharedEmpresas, user]);

  // Keep selEmp in sync when workspace selection changes
  useEffect(() => {
    const valid = new Set(availableEmpresas.map((e) => e.id));
    setSelEmp((prev) => {
      const kept = new Set([...prev].filter((id) => valid.has(id)));
      if (kept.size === 0 && availableEmpresas.length > 0) return new Set([availableEmpresas[0].id]);
      return kept;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableEmpresas]);

  // Primary empresa for uploads (first selected)
  const primaryEmpresaId = [...selEmp][0] ?? availableEmpresas[0]?.id;
  const primaryEmpresa = availableEmpresas.find((e) => e.id === primaryEmpresaId);

  // Notify parent when primary empresa changes
  useEffect(() => {
    if (!primaryEmpresaId) return;
    const emp = availableEmpresas.find((e) => e.id === primaryEmpresaId);
    onSelectEmpresa(primaryEmpresaId, emp?.workspaceId !== user?.id ? emp?.workspaceId : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryEmpresaId]);

  function toggleWs(id: string) {
    setSelWs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  }
  function toggleEmp(id: string) {
    setSelEmp((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  }

  // Files filtered to selected empresas
  const filteredShp = shpFiles.filter((n) => {
    const m = shpFileMeta.find((x) => x.name === n);
    return !m?.empresaId || selEmp.has(m.empresaId);
  });
  const filteredCsv = csvFiles.filter((n) => {
    const m = csvFileMeta.find((x) => x.name === n);
    return !m?.empresaId || selEmp.has(m.empresaId);
  });
  const filteredRinde = rindeFiles.filter((n) => {
    const m = rindeFileMeta.find((x) => x.name === n);
    return !m?.empresaId || selEmp.has(m.empresaId);
  });

  async function handleInvite() {
    if (!primaryEmpresaId || !inviteEmail.trim()) return;
    setInviteLoading(true); setInviteMsg("");
    try {
      await onInvite(primaryEmpresaId, inviteEmail.trim());
      setInviteMsg(`Invitación enviada a ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch (e) { setInviteMsg((e as Error).message); }
    finally { setInviteLoading(false); }
  }

  async function handleNewEmpresa() {
    if (!newEmpresaName.trim()) return;
    setNewEmpresaLoading(true);
    try { await onNewEmpresa(newEmpresaName.trim()); setNewEmpresaName(""); setShowNewEmpresa(false); }
    finally { setNewEmpresaLoading(false); }
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#1a1a2e" }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h2 className="text-2xl font-bold" style={{ color: "#e2b04a" }}>Archivos</h2>
          <p className="text-sm mt-1" style={{ color: "#6a8ab0" }}>Seleccioná workspace y empresa para ver y gestionar archivos</p>
        </div>

        {user && (
          <>
            {/* ── Workspace selector ── */}
            {workspaces.length > 0 && (
              <div className="mb-4 p-4 rounded-xl" style={{ background: "#16213e", border: "1px solid #0f3460" }}>
                <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "#6a8ab0" }}>Workspace</p>
                <div className="flex flex-wrap gap-2">
                  {workspaces.map((ws) => {
                    const active = selWs.has(ws.id);
                    return (
                      <button key={ws.id} onClick={() => toggleWs(ws.id)}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          background: active ? "#1a4a80" : "#0f2040",
                          border: `2px solid ${active ? "#2a6aaa" : "#1a3460"}`,
                          color: active ? "#e0e8f0" : "#6a8ab0",
                        }}>
                        {ws.isOwn ? "📁 " : "🤝 "}{ws.label}
                        {active && selWs.size > 1 && <span className="ml-1 text-xs opacity-60">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Empresa selector ── */}
            {availableEmpresas.length > 0 && (
              <div className="mb-4 p-4 rounded-xl" style={{ background: "#16213e", border: "1px solid #0f3460" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider" style={{ color: "#6a8ab0" }}>Empresa</p>
                  <div className="flex gap-2">
                    {primaryEmpresa?.isOwner && primaryEmpresaId && (
                      <button className="text-xs px-2 py-1 rounded"
                        style={{ background: "#0f2040", border: "1px solid #2a4a6a", color: "#aac4e0" }}
                        onClick={() => { setShowInvite(!showInvite); setShowNewEmpresa(false); }}>
                        Invitar →
                      </button>
                    )}
                    {selWs.has(user.id) && (
                      <button className="text-xs px-2 py-1 rounded"
                        style={{ background: "#0f2040", border: "1px solid #2a4a6a", color: "#aac4e0" }}
                        onClick={() => { setShowNewEmpresa(!showNewEmpresa); setShowInvite(false); }}>
                        + Nueva
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {availableEmpresas.map((emp) => {
                    const active = selEmp.has(emp.id);
                    const isPrimary = emp.id === primaryEmpresaId;
                    return (
                      <button key={emp.id} onClick={() => toggleEmp(emp.id)}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          background: active ? "#1a3a60" : "#0f2040",
                          border: `2px solid ${isPrimary ? "#3dbb6e" : active ? "#2a5298" : "#1a3460"}`,
                          color: active ? "#e2b04a" : "#6a8ab0",
                        }}>
                        {emp.name}
                      </button>
                    );
                  })}
                </div>

                {selEmp.size > 1 && (
                  <p className="text-xs mt-2" style={{ color: "#4a6a8a" }}>
                    Mostrando archivos de {selEmp.size} empresas · los nuevos archivos van a <strong style={{ color: "#aac4e0" }}>{primaryEmpresa?.name}</strong>
                  </p>
                )}

                {showNewEmpresa && (
                  <div className="mt-3 flex gap-2">
                    <input type="text" value={newEmpresaName} autoFocus
                      onChange={(e) => setNewEmpresaName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNewEmpresa()}
                      placeholder="Nombre de la empresa"
                      className="flex-1 rounded px-3 py-1.5 text-sm"
                      style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#e0e0e0", outline: "none" }} />
                    <button onClick={handleNewEmpresa} disabled={newEmpresaLoading}
                      className="px-3 py-1.5 rounded text-sm font-semibold"
                      style={{ background: "#3dbb6e", color: "#fff" }}>
                      {newEmpresaLoading ? "..." : "Crear"}
                    </button>
                  </div>
                )}

                {showInvite && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs" style={{ color: "#6a8ab0" }}>
                      Invitar a <strong style={{ color: "#aac4e0" }}>{primaryEmpresa?.name}</strong> — el usuario verá esta empresa en su cuenta
                    </p>
                    <div className="flex gap-2">
                      <input type="email" value={inviteEmail} autoFocus
                        onChange={(e) => setInviteEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                        placeholder="email@ejemplo.com"
                        className="flex-1 rounded px-3 py-1.5 text-sm"
                        style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#e0e0e0", outline: "none" }} />
                      <button onClick={handleInvite} disabled={inviteLoading || !inviteEmail.trim()}
                        className="px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
                        style={{ background: "#1a4a80", color: "#e0e8f0", border: "1px solid #2a5298" }}>
                        {inviteLoading ? "..." : "Invitar"}
                      </button>
                    </div>
                    {inviteMsg && <p className="text-xs" style={{ color: "#3dbb6e" }}>{inviteMsg}</p>}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── File sections ── */}
        <div className="space-y-4">
          <DashFileSection title="🗺 Shapes / KMZ" hint=".zip con .shp + .dbf + .shx"
            accept=".zip,.shp,.dbf,.shx,.prj,.kmz" multiple
            files={filteredShp} status={shpStatus} onFiles={onUploadShp} onRemove={onRemoveShp} />
          <DashFileSection title="📄 Manejo de lotes" hint="CSV o XLSX — elegís columnas en el siguiente paso"
            accept=".csv,.xlsx,.xls" multiple={false}
            files={filteredCsv} status={csvStatus} onFiles={onUploadCsv} onRemove={onRemoveCsv} />
          <DashFileSection title="🌾 Rindes históricos" hint="CSV o XLSX con columna de lote y rendimiento"
            accept=".csv,.xlsx,.xls" multiple={false}
            files={filteredRinde} status={rindeStatus} onFiles={onUploadRinde} onRemove={onRemoveRinde} />
        </div>

        <div className="mt-8">
          <button onClick={onGoToMap}
            className="w-full py-4 rounded-xl text-lg font-bold transition-all"
            style={{ background: "#1a4a80", color: "#e2b04a", border: "2px solid #2a5298" }}>
            Ir a recorrer →
          </button>
        </div>
      </div>
    </div>
  );
}

function DashFileSection({
  title, hint, accept, multiple, files, status, onFiles, onRemove,
}: {
  title: string; hint: string; accept: string; multiple: boolean;
  files: string[];
  status: { msg: string; ok: boolean } | null;
  onFiles: (fl: FileList) => void;
  onRemove: (name: string) => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#16213e", border: "1px solid #0f3460" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "#aac4e0" }}>{title}</p>
      {files.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {files.map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: "#0d2a1a", border: "1px solid #1e5a2e" }}>
              <span className="truncate flex-1" style={{ color: "#3dbb6e" }}>✓ {name}</span>
              <button onClick={() => onRemove(name)}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:opacity-70 text-sm"
                style={{ color: "#e25a5a" }}>×</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs mb-3" style={{ color: "#445" }}>Sin archivos cargados</p>
      )}
      {status && !status.ok && (
        <p className="text-xs mb-2 px-2 py-1 rounded" style={{ background: "#3a2a0a", color: "#e2b04a" }}>{status.msg}</p>
      )}
      <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg text-xs hover:opacity-80"
        style={{ background: "#0d1b35", border: "1px dashed #2a5298", color: "#6a8ab0" }}>
        <input type="file" accept={accept} multiple={multiple} className="sr-only"
          onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
        + Agregar archivo
      </label>
    </div>
  );
}
