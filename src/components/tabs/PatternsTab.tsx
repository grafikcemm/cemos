"use client";

import { useState } from "react";
import { useXAgentStore } from "@/store/xagent";

export default function PatternsTab() {
  const patterns = useXAgentStore((s) => s.patterns);
  const addPattern = useXAgentStore((s) => s.addPattern);
  const removePattern = useXAgentStore((s) => s.removePattern);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [hook, setHook] = useState("");

  const handleSave = () => {
    if (!name.trim() || !hook.trim()) return;
    addPattern({
      id: `p-${Date.now()}`,
      name: name.trim(),
      hookText: hook.trim(),
      type: "custom",
      createdAt: new Date().toISOString(),
    });
    setName(""); setHook(""); setShowForm(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Viral Paternler</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>({patterns.length})</span>
        <button onClick={() => setShowForm(!showForm)} style={{
          marginLeft: "auto", background: "var(--accent)", color: "var(--accent-fg)", border: "none",
          borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 500, cursor: "pointer",
        }}>+ Pattern Kaydet</button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 14, marginBottom: 16,
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pattern adı"
            style={{
              width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "var(--text-primary)",
              outline: "none", marginBottom: 8, boxSizing: "border-box",
            }} />
          <textarea value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Hook metni..." rows={3}
            style={{
              width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "var(--text-primary)",
              outline: "none", marginBottom: 8, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
            }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowForm(false)} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              padding: "5px 14px", fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
            }}>İptal</button>
            <button onClick={handleSave} style={{
              background: "var(--accent)", color: "var(--accent-fg)", border: "none", borderRadius: 6,
              padding: "5px 14px", fontSize: 11, fontWeight: 500, cursor: "pointer",
            }}>Kaydet</button>
          </div>
        </div>
      )}

      {/* Pattern grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {patterns.map((p) => (
          <div key={p.id} style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
              &ldquo;{p.hookText}&rdquo;
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                background: "var(--bg-elevated)", color: "var(--text-muted)", fontSize: 9,
                borderRadius: 4, padding: "2px 6px", border: "1px solid var(--border)",
              }}>{p.type}</span>
              <button style={{
                marginLeft: "auto", background: "var(--accent)", color: "var(--accent-fg)", border: "none",
                borderRadius: 5, padding: "3px 10px", fontSize: 10, fontWeight: 500, cursor: "pointer",
              }}>Kullan</button>
              <button onClick={() => removePattern(p.id)} style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                fontSize: 12, cursor: "pointer", padding: "2px 4px",
              }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
