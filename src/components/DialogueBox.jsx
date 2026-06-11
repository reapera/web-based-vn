import characters from "../data/characters.json";
import { useTypewriter } from "../engine/useTypewriter";
import { interpolate } from "../engine/vars";

export function DialogueBox({ dialogue, vars, onAdvance }) {
  const { visible, done, skip } = useTypewriter(dialogue?.text);
  if (!dialogue) return null;

  // Speaker names may contain variables, e.g. the player character "{player_name}".
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
          {interpolate(speaker.name, vars)}
        </div>
      )}
      <p className={speaker ? "" : "vn-narration"}>
        {visible}
        {done && <span className="vn-continue">▾</span>}
      </p>
    </div>
  );
}
