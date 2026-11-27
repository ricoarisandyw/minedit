import { useEffect, useMemo, useRef } from "react";

type Props = {
  dim: string;
  chunks: number[] | null; // flat [x, z, x, z, ...]; null while loading
  pending: Set<string>; // "x,z" keys marked for deletion
  brush: number; // 0 = pan, else eraser size in chunks
  resetKey: string; // change = fit the view to the chunks again
  tileVersion?: number; // change = reload tiles without resetting view
  onStroke: (keys: string[]) => void;
  onHover: (c: [number, number] | null) => void;
};

const MIN_S = 1;
const MAX_S = 64;

export function ChunkMap({ dim, chunks, pending, brush, resetKey, tileVersion = 0, onStroke, onHover }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, z: 0, s: 8 }); // centre in chunk units, pixels per chunk
  const hover = useRef<[number, number] | null>(null);
  const live = useRef(new Set<string>()); // stroke being painted right now
  const needFit = useRef(true);
  const frame = useRef(0);

  // Client-side cache of rendered PNG images for regions
  const tiles = useRef<Map<string, HTMLImageElement>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());

  const existing = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; chunks && i < chunks.length; i += 2) set.add(`${chunks[i]},${chunks[i + 1]}`);
    return set;
  }, [chunks]);

  const existingRegions = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; chunks && i < chunks.length; i += 2) {
      set.add(`${chunks[i] >> 5},${chunks[i + 1] >> 5}`);
    }
    return set;
  }, [chunks]);

  // Clear region tiles when world/dimension resets or user refreshes
  useEffect(() => {
    tiles.current.clear();
    inFlight.current.clear();
  }, [resetKey, dim, tileVersion]);

  // Latest props for the draw loop and handlers, without re-binding them.
  const latest = useRef({ dim, resetKey, tileVersion, chunks, pending, brush, existing, existingRegions, onStroke, onHover });
  latest.current = { dim, resetKey, tileVersion, chunks, pending, brush, existing, existingRegions, onStroke, onHover };

  const fetchTile = (rx: number, rz: number) => {
    const currentDim = latest.current.dim;
    const currentResetKey = latest.current.resetKey;
    const currentVersion = latest.current.tileVersion;
    const key = `${currentResetKey}|${currentVersion}|${rx}|${rz}`;
    if (tiles.current.has(key) || inFlight.current.has(key)) return;
    inFlight.current.add(key);

    const img = new Image();
    img.onload = () => {
      if (latest.current.resetKey === currentResetKey && latest.current.tileVersion === currentVersion) {
        tiles.current.set(key, img);
        redraw();
      }
      inFlight.current.delete(key);
    };
    img.onerror = () => {
      inFlight.current.delete(key);
    };
    img.src = `/api/tile?dim=${encodeURIComponent(currentDim)}&rx=${rx}&rz=${rz}&v=${encodeURIComponent(`${currentResetKey}|${currentVersion}`)}`;
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { x: vx, z: vz, s } = view.current;
    const { resetKey: currentResetKey, tileVersion: currentVersion, chunks, pending, brush, existing, existingRegions } = latest.current;
    const sx = (cx: number) => (cx - vx) * s + W / 2;
    const sz = (cz: number) => (cz - vz) * s + H / 2;

    ctx.fillStyle = "#161616";
    ctx.fillRect(0, 0, W, H);

    // Visible region range
    const rx0 = Math.floor((vx - W / 2 / s) / 32);
    const rx1 = Math.floor((vx + W / 2 / s) / 32);
    const rz0 = Math.floor((vz - H / 2 / s) / 32);
    const rz1 = Math.floor((vz + H / 2 / s) / 32);

    const size = Math.ceil(s);

    // 1. Draw green chunk presence underneath so unexplored/transparent parts of Xaero tiles never leave black holes
    for (let i = 0; chunks && i < chunks.length; i += 2) {
      const cx = chunks[i];
      const cz = chunks[i + 1];
      const x = sx(cx);
      const y = sz(cz);
      if (x < -s || y < -s || x > W || y > H) continue;
      ctx.fillStyle = (cx + cz) & 1 ? "#4f8a33" : "#5a9a3b";
      ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
    }

    // 2. Render region tiles on top (Tier 1: Xaero, Tier 2: Heightmap, Tier 3: Presence)
    for (let rx = rx0; rx <= rx1; rx++) {
      for (let rz = rz0; rz <= rz1; rz++) {
        const regKey = `${rx},${rz}`;
        if (!existingRegions.has(regKey)) continue;

        const tileKey = `${currentResetKey}|${currentVersion}|${rx}|${rz}`;
        const tileImg = tiles.current.get(tileKey);

        if (tileImg) {
          ctx.imageSmoothingEnabled = false;
          const tx = Math.floor(sx(rx * 32));
          const ty = Math.floor(sz(rz * 32));
          const tw = Math.ceil(32 * s);
          const th = Math.ceil(32 * s);
          ctx.drawImage(tileImg, tx, ty, tw, th);

          // 3. Mask out chunks that were deleted / do not exist in .mca so stale Xaero pixels disappear immediately
          if (chunks) {
            ctx.fillStyle = "#161616";
            const baseCx = rx * 32;
            const baseCz = rz * 32;
            for (let lz = 0; lz < 32; lz++) {
              const cz = baseCz + lz;
              const y = sz(cz);
              if (y < -s || y > H) continue;
              for (let lx = 0; lx < 32; lx++) {
                const cx = baseCx + lx;
                const x = sx(cx);
                if (x < -s || x > W) continue;
                if (!existing.has(`${cx},${cz}`)) {
                  ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
                }
              }
            }
          }
        } else {
          fetchTile(rx, rz);
        }
      }
    }

    // Draw deletion markings (pending & live brush strokes)
    const rect = (key: string, color: string) => {
      const [cx, cz] = key.split(",").map(Number);
      const x = sx(cx);
      const y = sz(cz);
      if (x < -s || y < -s || x > W || y > H) return;
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
    };
    pending.forEach((k) => rect(k, "rgba(217, 58, 58, 0.85)"));
    live.current.forEach((k) => rect(k, "rgba(217, 58, 58, 0.85)"));

    // Chunk grid (zoomed in) and region borders (every 32 chunks)
    const x0 = Math.floor(vx - W / 2 / s);
    const x1 = Math.ceil(vx + W / 2 / s);
    const z0 = Math.floor(vz - H / 2 / s);
    const z1 = Math.ceil(vz + H / 2 / s);
    const lines = (step: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        ctx.moveTo(Math.round(sx(x)) + 0.5, 0);
        ctx.lineTo(Math.round(sx(x)) + 0.5, H);
      }
      for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) {
        ctx.moveTo(0, Math.round(sz(z)) + 0.5);
        ctx.lineTo(W, Math.round(sz(z)) + 0.5);
      }
      ctx.stroke();
    };
    if (s >= 10) lines(1, "rgba(0,0,0,0.28)");
    if (s >= 1.5) lines(32, "rgba(255,255,255,0.35)");

    // World origin
    ctx.strokeStyle = "#ffaa00";
    ctx.lineWidth = 2;
    if (s >= 4) ctx.strokeRect(sx(0) + 1, sz(0) + 1, s - 2, s - 2);
    else {
      ctx.beginPath();
      ctx.moveTo(sx(0) - 6, sz(0));
      ctx.lineTo(sx(0) + 6, sz(0));
      ctx.moveTo(sx(0), sz(0) - 6);
      ctx.lineTo(sx(0), sz(0) + 6);
      ctx.stroke();
    }

    // Brush cursor
    const h = hover.current;
    if (h) {
      const n = brush || 1;
      const r = (n - 1) / 2;
      ctx.strokeStyle = brush ? "#ffffff" : "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(h[0] - r) + 1, sz(h[1] - r) + 1, n * s - 2, n * s - 2);
    }
  };

  const redraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  };

  // Repaint when data changes.
  useEffect(redraw, [chunks, pending, brush, tileVersion]);

  // Fit the view to the chunks once per world/dimension.
  useEffect(() => {
    needFit.current = true;
  }, [resetKey]);
  useEffect(() => {
    const c = canvas.current;
    if (!needFit.current || !chunks || !c) return;
    needFit.current = false;
    if (!chunks.length) {
      view.current = { x: 0, z: 0, s: 8 };
    } else {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < chunks.length; i += 2) {
        minX = Math.min(minX, chunks[i]);
        maxX = Math.max(maxX, chunks[i]);
        minZ = Math.min(minZ, chunks[i + 1]);
        maxZ = Math.max(maxZ, chunks[i + 1]);
      }
      const s = Math.min(c.clientWidth / (maxX - minX + 6), c.clientHeight / (maxZ - minZ + 6));
      view.current = { x: (minX + maxX + 1) / 2, z: (minZ + maxZ + 1) / 2, s: Math.min(MAX_S, Math.max(MIN_S, s)) };
    }
    redraw();
  }, [chunks]);

  useEffect(() => {
    const c = canvas.current!;
    const ro = new ResizeObserver(redraw);
    ro.observe(c);

    const toChunk = (e: { clientX: number; clientY: number }): [number, number] => {
      const r = c.getBoundingClientRect();
      const { x, z, s } = view.current;
      return [Math.floor((e.clientX - r.left - r.width / 2) / s + x), Math.floor((e.clientY - r.top - r.height / 2) / s + z)];
    };

    const mark = ([cx, cz]: [number, number]) => {
      const { brush, existing, pending } = latest.current;
      const r = (brush - 1) / 2;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const k = `${cx + dx},${cz + dz}`;
          if (existing.has(k) && !pending.has(k)) live.current.add(k);
        }
    };
    const markLine = (a: [number, number], b: [number, number]) => {
      const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
      for (let i = 0; i <= steps; i++) mark([Math.round(a[0] + ((b[0] - a[0]) * i) / steps), Math.round(a[1] + ((b[1] - a[1]) * i) / steps)]);
    };

    let mode: "pan" | "paint" | null = null;
    let last: [number, number] | null = null;
    let lastPx = { x: 0, y: 0 };

    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      mode = e.button === 0 && latest.current.brush > 0 ? "paint" : "pan";
      lastPx = { x: e.clientX, y: e.clientY };
      if (mode === "paint") {
        last = toChunk(e);
        mark(last);
        redraw();
      }
    };
    const move = (e: PointerEvent) => {
      const here = toChunk(e);
      if (!hover.current || hover.current[0] !== here[0] || hover.current[1] !== here[1]) {
        hover.current = here;
        latest.current.onHover(here);
      }
      if (mode === "pan") {
        view.current.x -= (e.clientX - lastPx.x) / view.current.s;
        view.current.z -= (e.clientY - lastPx.y) / view.current.s;
        lastPx = { x: e.clientX, y: e.clientY };
      } else if (mode === "paint" && last) {
        markLine(last, here);
        last = here;
      }
      redraw();
    };
    const up = () => {
      if (mode === "paint" && live.current.size) latest.current.onStroke([...live.current]);
      live.current = new Set();
      mode = null;
      last = null;
    };
    const leave = () => {
      if (mode) return;
      hover.current = null;
      latest.current.onHover(null);
      redraw();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left - r.width / 2;
      const pz = e.clientY - r.top - r.height / 2;
      const v = view.current;
      const s = Math.min(MAX_S, Math.max(MIN_S, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      v.x += px / v.s - px / s;
      v.z += pz / v.s - pz / s;
      v.s = s;
      redraw();
    };
    const noMenu = (e: Event) => e.preventDefault();

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("contextmenu", noMenu);
    return () => {
      ro.disconnect();
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("contextmenu", noMenu);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  return <canvas ref={canvas} style={{ cursor: brush ? "crosshair" : "grab" }} aria-label="Chunk map" />;
}
