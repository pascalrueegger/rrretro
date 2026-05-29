"use client";

import { useState, type ReactNode } from "react";
import type { Group as GroupT } from "@/lib/types";

export function GroupView({
  group, children, onUnGroup, onRenameGroup,
}: {
  group: GroupT;
  children: ReactNode;
  onUnGroup: (id: string) => void;
  onRenameGroup: (id: string, label: string) => void;
}) {
  const [label, setLabel] = useState(group.label);
  const [prevGroupLabel, setPrevGroupLabel] = useState(group.label);
  if (prevGroupLabel !== group.label) {
    setPrevGroupLabel(group.label);
    setLabel(group.label);
  }
  const commit = () => {
    if (label.trim() !== group.label) onRenameGroup(group.id, label.trim() || "Cluster");
  };
  return (
    <div className="group">
      <div className="group-label">
        <input value={label}
               style={{
                 background: "transparent", border: 0, outline: "none",
                 color: "inherit", fontSize: "inherit", letterSpacing: "inherit",
                 textTransform: "inherit", flex: 1, fontFamily: "inherit", padding: 0,
               }}
               onChange={(e) => setLabel(e.target.value)}
               onBlur={commit}
               onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="x" title="Break apart" onClick={() => onUnGroup(group.id)}>×</span>
      </div>
      {children}
    </div>
  );
}
