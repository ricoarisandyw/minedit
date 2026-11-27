// tool 0 = pan (hand), otherwise eraser brush size in chunks.
export const TOOLS = [
  { size: 0, label: "Pan" },
  { size: 1, label: "1x1" },
  { size: 3, label: "3x3" },
  { size: 5, label: "5x5" },
  { size: 9, label: "9x9" },
] as const;

type Props = {
  tool: number;
  setTool: (size: number) => void;
  count: number;
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
  onApply: () => void;
};

export function BrushBar({ tool, setTool, count, canUndo, onUndo, onClear, onApply }: Props) {
  return (
    <div className="panel">
      <h2>Eraser brush</h2>
      <div className="hotbar">
        {TOOLS.map((t, i) => (
          <button
            key={t.size}
            className={`slot${tool === t.size ? " sel" : ""}`}
            onClick={() => setTool(t.size)}
            title={t.size ? `Eraser ${t.label}` : "Move the map"}
          >
            <kbd>{i + 1}</kbd>
            {t.label}
          </button>
        ))}
      </div>
      <p className="count">
        Marked: <b>{count}</b> chunk{count === 1 ? "" : "s"}
      </p>
      <div className="row">
        <button className="btn sm" onClick={onUndo} disabled={!canUndo}>Undo</button>
        <button className="btn sm" onClick={onClear} disabled={!count}>Clear</button>
        <button className="btn sm red" onClick={onApply} disabled={!count}>Apply</button>
      </div>
      <p className="hint">Drag on the map to mark chunks. Right-drag always moves the map. Nothing is deleted until you press Apply.</p>
    </div>
  );
}
