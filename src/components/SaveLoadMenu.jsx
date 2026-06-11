import { useState } from "react";
import { deleteSlot, listSaves } from "../engine/saves";

export function SaveLoadMenu({ mode, onSave, onLoad, onClose }) {
  const [saves, setSaves] = useState(listSaves);

  const refresh = () => setSaves(listSaves());

  const handleSlot = (i) => {
    if (mode === "save") {
      onSave(i);
      refresh();
    } else if (saves[i]) {
      onLoad(i);
      onClose();
    }
  };

  return (
    <div className="vn-overlay" onClick={onClose}>
      <div className="vn-menu" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === "save" ? "Save Game" : "Load Game"}</h2>
        <div className="vn-slots">
          {saves.map((save, i) => (
            <div key={i} className={`vn-slot ${save ? "filled" : "empty"}`}>
              <button className="vn-slot-main" onClick={() => handleSlot(i)} disabled={mode === "load" && !save}>
                <span className="vn-slot-num">{i + 1}</span>
                {save ? (
                  <span className="vn-slot-info">
                    <span className="vn-slot-preview">{save.preview}</span>
                    <span className="vn-slot-date">{new Date(save.savedAt).toLocaleString()}</span>
                  </span>
                ) : (
                  <span className="vn-slot-info">Empty slot</span>
                )}
              </button>
              {save && (
                <button
                  className="vn-slot-delete"
                  title="Delete save"
                  onClick={() => {
                    deleteSlot(i);
                    refresh();
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="vn-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
