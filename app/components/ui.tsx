import type { ReactNode } from "react";

export function Modal({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="modal-back">
      <div className="panel modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="body">{children}</div>
        <div className="actions">{actions}</div>
      </div>
    </div>
  );
}
