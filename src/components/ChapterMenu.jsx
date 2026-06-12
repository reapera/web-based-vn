import { useMemo, useState } from "react";
import chapters from "../data/chapters.json";

export function ChapterMenu({ onPlay, onClose }) {
  const groups = useMemo(() => {
    const out = new Map();
    for (const chapter of chapters) {
      if (!out.has(chapter.group)) out.set(chapter.group, []);
      out.get(chapter.group).push(chapter);
    }
    return [...out.entries()];
  }, []);
  const [openGroup, setOpenGroup] = useState(groups[0]?.[0]);

  return (
    <div className="vn-overlay" onClick={onClose}>
      <div className="vn-menu vn-chapters" onClick={(e) => e.stopPropagation()}>
        <h2>Scenes</h2>
        <div className="vn-chapter-list">
          {groups.map(([group, items]) => (
            <div key={group}>
              <button className="vn-chapter-group" onClick={() => setOpenGroup(openGroup === group ? null : group)}>
                {openGroup === group ? "▾" : "▸"} {group} <span className="vn-chapter-count">({items.length})</span>
              </button>
              {openGroup === group &&
                items.map((chapter) => (
                  <button
                    key={chapter.id}
                    className="vn-chapter"
                    onClick={() => {
                      onPlay(chapter.id);
                      onClose();
                    }}
                  >
                    {chapter.title}
                  </button>
                ))}
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
