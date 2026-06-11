import characters from "../data/characters.json";
import { useTypewriter } from "../engine/useTypewriter";

export function DialogueBox({ dialogue, onAdvance }) {
  const { visible, done, skip } = useTypewriter(dialogue?.text);
  if (!dialogue) return null;

  const speaker = dialogue.actor ? characters[dialogue.actor] : null;

  const handleClick = (e) => {
    e.stopPropagation();
    if (done) onAdvance();
    else skip();
  };

  return (
    <div className="vn-dialogue" onClick={handleClick}>
      {speaker && (
        <div className="vn-nametag" style={{ background: speaker.color }}>
          {speaker.name}
        </div>
      )}
      <p className={speaker ? "" : "vn-narration"}>
        {visible}
        {done && <span className="vn-continue">▾</span>}
      </p>
    </div>
  );
}
