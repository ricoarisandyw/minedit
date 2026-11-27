import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "./ui";

type Listing = { path: string; parent: string | null; isWorld: boolean; dirs: { name: string; isWorld: boolean }[] };

type Props = { start: string; shortcuts: { label: string; path: string }[]; onPick: (path: string) => void; onClose: () => void };

export function FolderPicker({ start, shortcuts, onPick, onClose }: Props) {
  const [path, setPath] = useState(start);
  const [typed, setTyped] = useState(start);
  const [list, setList] = useState<Listing | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api<Listing>(`/api/fs?path=${encodeURIComponent(path)}`)
      .then((l) => {
        if (!live) return;
        setList(l);
        setTyped(l.path);
        setError("");
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path]);

  const join = (name: string) => (list ? `${list.path.replace(/[\\/]$/, "")}${list.path.includes("\\") ? "\\" : "/"}${name}` : name);

  return (
    <Modal
      title="Open world folder"
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!list?.isWorld} onClick={() => list && onPick(list.path)}>
            Open this world
          </button>
        </>
      }
    >
      <input
        className="input"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && setPath(typed)}
        aria-label="Folder path"
      />
      {shortcuts.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          {shortcuts.map((s) => (
            <button key={s.path} className="btn sm" onClick={() => setPath(s.path)}>{s.label}</button>
          ))}
        </div>
      )}
      {error && <p className="warn">{error}</p>}
      <ul className="dirs">
        {list?.parent && (
          <li><button onClick={() => setPath(list.parent!)}><span className="cube folder" />..</button></li>
        )}
        {list?.dirs.map((d) => (
          <li key={d.name}>
            <button onClick={() => setPath(join(d.name))}>
              <span className={`cube${d.isWorld ? "" : " folder"}`} />
              {d.name}
              {d.isWorld && <span className="tag">WORLD</span>}
            </button>
          </li>
        ))}
        {list && !list.dirs.length && <li style={{ padding: "4px 10px", color: "#999" }}>(no folders)</li>}
      </ul>
      <p className="hint">{list?.isWorld ? "This folder is a Minecraft world." : "Go into a folder marked WORLD (it has level.dat and region/)."}</p>
    </Modal>
  );
}
