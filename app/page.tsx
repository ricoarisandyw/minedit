"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type World, type WorldInfo } from "./api";
import { BrushBar, TOOLS } from "./components/BrushBar";
import { ChunkMap } from "./components/ChunkMap";
import { FolderPicker } from "./components/FolderPicker";
import { SeedPanel } from "./components/SeedPanel";
import { Modal } from "./components/ui";

type Dim = World["dims"][number];
const DIM_LABEL: Record<Dim, string> = { overworld: "Overworld", nether: "Nether", end: "The End" };
type Toast = { text: string; error?: boolean };

export default function Home() {
  const [info, setInfo] = useState<WorldInfo | null>(null);
  const [dim, setDim] = useState<Dim>("overworld");
  const [chunks, setChunks] = useState<number[] | null>(null);
  const [strokes, setStrokes] = useState<string[][]>([]);
  const [tool, setTool] = useState<number>(3);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tileVersion, setTileVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);

  const world = info?.world ?? null;
  const say = useCallback((text: string, error = false) => setToast({ text, error }), []);

  const loadWorld = useCallback(async () => {
    try {
      const next = await api<WorldInfo>("/api/world");
      setInfo(next);
      // keep the current dimension if the new world has it
      setDim((d) => (next.world && !next.world.dims.includes(d) ? next.world.dims[0] : d));
    } catch (e) {
      say((e as Error).message, true);
    }
  }, [say]);

  const loadChunks = useCallback(async () => {
    try {
      setChunks((await api<{ chunks: number[] }>(`/api/chunks?dim=${dim}`)).chunks);
    } catch (e) {
      setChunks([]);
      say((e as Error).message, true);
    }
  }, [dim, say]);

  useEffect(() => {
    loadWorld();
  }, [loadWorld]);

  useEffect(() => {
    setChunks(null);
    setStrokes([]);
    if (world?.path) loadChunks();
  }, [world?.path, loadChunks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const pending = useMemo(() => new Set(strokes.flat()), [strokes]);

  const apply = async () => {
    setBusy(true);
    try {
      const chunksToDelete = [...pending].map((k) => k.split(",").map(Number));
      const res = await api<{ deleted: number; backup: string | null }>("/api/delete", { dim, chunks: chunksToDelete });
      setStrokes([]);
      await loadChunks();
      setTileVersion((v) => v + 1);
      say(`Deleted ${res.deleted} chunk${res.deleted === 1 ? "" : "s"}.${res.backup ? ` Backup: ${res.backup}` : ""}`);
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
      setConfirmApply(false);
    }
  };

  const saveSeed = async (input: string) => {
    try {
      const res = await api<{ seed: string; backup: string }>("/api/seed", { seed: input });
      await loadWorld();
      say(`Seed is now ${res.seed}. Backup: ${res.backup}`);
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  const openWorld = async (path: string) => {
    try {
      await api("/api/open", { path });
      setPicker(false);
      setDim("overworld");
      await loadWorld();
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  const refreshMap = async () => {
    if (!world) return;
    setBusy(true);
    try {
      await api("/api/open", { path: world.path });
      await Promise.all([loadWorld(), loadChunks()]);
      setTileVersion((v) => v + 1);
      say("Map refreshed.");
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: 1-5 pick a tool, Ctrl/Cmd+Z undoes the last stroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || picker || confirmApply) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TOOLS.length && !e.metaKey && !e.ctrlKey) setTool(TOOLS[n - 1].size);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setStrokes((s) => s.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker, confirmApply]);

  const parent = world?.path.replace(/[\\/][^\\/]*$/, "") || "";
  const shortcuts = [
    ...(info?.saves ? [{ label: "Minecraft saves", path: info.saves }] : []),
    ...(info ? [{ label: "Home", path: info.home }] : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">MINEDIT</h1>
        {world ? (
          <>
            <span className="world-name">{world.name}</span>
            <span className="world-path" title={world.path}>{world.path}</span>
          </>
        ) : (
          <span className="world-path">No world open</span>
        )}
        <span className="spacer" />
        {world && (
          <button className="btn ghost" onClick={refreshMap} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        )}
        <button className="btn ghost" onClick={() => setPicker(true)} disabled={!info}>Open world</button>
      </header>

      <main className="main">
        <section className="stage">
          {world ? (
            <>
              <div className="canvas-wrap">
                <div className="tabs">
                  {world.dims.map((d) => (
                    <button key={d} className={`btn sm${d === dim ? " on" : ""}`} onClick={() => setDim(d)}>
                      {DIM_LABEL[d]}
                    </button>
                  ))}
                </div>
                <ChunkMap
                  dim={dim}
                  chunks={chunks}
                  pending={pending}
                  brush={tool}
                  resetKey={`${world.path}|${dim}`}
                  tileVersion={tileVersion}
                  onStroke={(keys) => setStrokes((s) => [...s, keys])}
                  onHover={setHover}
                />
              </div>
              <div className="statusbar">
                <span>
                  {hover ? (
                    <>
                      Chunk <b>{hover[0]}, {hover[1]}</b> · blocks <b>{hover[0] * 16}..{hover[0] * 16 + 15}</b> / <b>{hover[1] * 16}..{hover[1] * 16 + 15}</b>
                    </>
                  ) : (
                    "Hover the map"
                  )}
                </span>
                <span>{chunks ? `${chunks.length / 2} chunks` : "Loading..."}</span>
              </div>
            </>
          ) : (
            <div className="blank panel">
              <h2>No world yet</h2>
              <p>
                Pick a Minecraft world folder (containing <code>level.dat</code>) to get started.
              </p>
              <button className="btn green" onClick={() => setPicker(true)} disabled={!info}>Open world folder</button>
            </div>
          )}
        </section>

        {world && (
          <aside className="side">
            <BrushBar
              tool={tool}
              setTool={setTool}
              count={pending.size}
              canUndo={strokes.length > 0}
              onUndo={() => setStrokes((s) => s.slice(0, -1))}
              onClear={() => setStrokes([])}
              onApply={() => setConfirmApply(true)}
            />
            <SeedPanel seed={world.seed} onSave={saveSeed} />
          </aside>
        )}
      </main>

      {picker && info && (
        <FolderPicker
          start={parent || info.saves || info.home}
          shortcuts={shortcuts}
          onPick={openWorld}
          onClose={() => setPicker(false)}
        />
      )}

      {confirmApply && (
        <Modal
          title="Delete chunks?"
          actions={
            <>
              <button className="btn" onClick={() => setConfirmApply(false)} disabled={busy}>Cancel</button>
              <button className="btn red" onClick={apply} disabled={busy}>{busy ? "Deleting..." : `Delete ${pending.size}`}</button>
            </>
          }
        >
          {pending.size} chunk{pending.size === 1 ? "" : "s"} in the {DIM_LABEL[dim]} will be erased and generated again the next time you
          play. The affected files are backed up first. Close Minecraft before you continue.
        </Modal>
      )}

      {toast && (
        <div className={`panel toast${toast.error ? " error" : ""}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
