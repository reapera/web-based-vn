import { useState } from "react";
import { Background } from "./components/Background";
import { ChapterMenu } from "./components/ChapterMenu";
import { CharacterSprite } from "./components/CharacterSprite";
import { ChoiceMenu } from "./components/ChoiceMenu";
import { DialogueBox } from "./components/DialogueBox";
import { InputPrompt } from "./components/InputPrompt";
import { SaveLoadMenu } from "./components/SaveLoadMenu";
import { audio } from "./engine/audio";
import { useVNEngine } from "./engine/useVNEngine";

export default function App() {
  const engine = useVNEngine();
  const { state } = engine;
  const [menu, setMenu] = useState(null); // "save" | "load" | null
  const [muted, setMuted] = useState(false);

  const toggleMute = () => {
    audio.setMuted(!muted);
    setMuted(!muted);
  };

  return (
    <div className="vn-app">
      <div className="vn-stage" onClick={engine.advance}>
        <Background background={state.background} />

        {Object.entries(state.sprites).map(([actor, sprite]) => (
          <CharacterSprite key={actor} actor={actor} sprite={sprite} bus={engine.bus} onExited={engine.notifyExited} />
        ))}

        {state.status === "playing" && (
          <>
            <ChoiceMenu choice={state.choice} onChoose={engine.choose} />
            <DialogueBox dialogue={state.dialogue} vars={state.vars} onAdvance={engine.advance} />
            <InputPrompt input={state.input} onSubmit={engine.submitInput} />
            <div className="vn-toolbar" onClick={(e) => e.stopPropagation()}>
              <button className="vn-button" onClick={() => setMenu("save")}>Save</button>
              <button className="vn-button" onClick={() => setMenu("load")}>Load</button>
              <button className="vn-button" onClick={() => setMenu("chapters")}>Scenes</button>
              <button className="vn-button" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
            </div>
          </>
        )}

        {state.status === "title" && (
          <div className="vn-overlay vn-title" onClick={(e) => e.stopPropagation()}>
            <h1>{engine.title}</h1>
            <div className="vn-title-buttons">
              <button className="vn-button vn-button-big" onClick={engine.start}>New Game</button>
              <button className="vn-button vn-button-big" onClick={() => setMenu("load")}>Load Game</button>
              <button className="vn-button vn-button-big" onClick={() => setMenu("chapters")}>Scenes</button>
            </div>
          </div>
        )}

        {state.status === "ended" && (
          <div className="vn-overlay vn-title" onClick={(e) => e.stopPropagation()}>
            <h1>The End</h1>
            <div className="vn-title-buttons">
              <button className="vn-button vn-button-big" onClick={engine.start}>Play Again</button>
            </div>
          </div>
        )}

        {(menu === "save" || menu === "load") && (
          <SaveLoadMenu mode={menu} onSave={engine.save} onLoad={engine.load} onClose={() => setMenu(null)} />
        )}
        {menu === "chapters" && <ChapterMenu onPlay={engine.startAt} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}
