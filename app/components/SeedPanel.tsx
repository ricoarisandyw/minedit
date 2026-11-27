import { useState } from "react";
import { Modal } from "./ui";

type Props = { seed: string | null; onSave: (input: string) => Promise<void> };

const randomSeed = () => String(BigInt.asIntN(64, crypto.getRandomValues(new BigUint64Array(1))[0]));

export function SeedPanel({ seed, onSave }: Props) {
  const [input, setInput] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(input);
      setInput("");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="panel">
      <h2>World seed</h2>
      <p className="seed">{seed ?? "unknown"}</p>
      <input
        className="input"
        placeholder="New seed (number or text)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        aria-label="New seed"
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => setInput(randomSeed())}>Random</button>
        <button className="btn sm green" onClick={() => setConfirm(true)} disabled={seed === null}>Save seed</button>
      </div>
      <p className="hint warn">
        Chunks that already exist keep their old terrain. Only newly generated chunks use the new seed, so you may see sharp edges where they meet.
      </p>
      {confirm && (
        <Modal
          title="Change seed?"
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
              <button className="btn green" onClick={save} disabled={busy}>{busy ? "Saving..." : "Change seed"}</button>
            </>
          }
        >
          {input.trim() ? <>New seed: <code>{input.trim()}</code>.</> : <>No text entered, a random seed will be used.</>} A backup of
          level.dat is made first. Close Minecraft before saving.
        </Modal>
      )}
    </div>
  );
}
