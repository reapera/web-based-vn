import { useState, useCallback } from 'react';
import { useVNEngine } from './engine/useVNEngine';
import { Background } from './components/Background';
import { CharacterSprite } from './components/CharacterSprite';
import { DialogueBox } from './components/DialogueBox';
import { ChoiceMenu } from './components/ChoiceMenu';
import { TopBar } from './components/TopBar';
import script from './data/script.json';
import './App.css';

export default function App() {
  const { current, background, location, sprites, advance, choose, reset } = useVNEngine(script);
  const [autoMode, setAutoMode] = useState(false);
  const [skipMode, setSkipMode] = useState(false);

  const handleAdvance = useCallback(() => advance(), [advance]);

  const activeCharacter = current?.type === 'dialogue' ? current.character : null;

  // Option B: only render the sprite of the speaking character.
  // During narrator lines or choices, keep the last speaker visible.
  const visibleSprite = activeCharacter
    ? sprites[activeCharacter]
    : null;

  return (
    <div className="vn-stage">
      <Background src={background} />

      <TopBar
        location={location}
        autoMode={autoMode}
        skipMode={skipMode}
        onToggleAuto={() => { setAutoMode((v) => !v); setSkipMode(false); }}
        onToggleSkip={() => { setSkipMode((v) => !v); setAutoMode(false); }}
      />

      <div className="vn-sprites">
        {visibleSprite && (
          <CharacterSprite
            key={activeCharacter}
            character={activeCharacter}
            src={visibleSprite.src}
            position="center"
            active
          />
        )}
      </div>

      <div className="vn-ui">
        {current?.type === 'dialogue' && (
          <DialogueBox
            key={current.id}
            character={current.character}
            text={current.text}
            onAdvance={handleAdvance}
            autoMode={autoMode}
            skipMode={skipMode}
          />
        )}

        {current?.type === 'choice' && (
          <ChoiceMenu choices={current.choices} onChoose={choose} />
        )}

        {current?.type === 'end' && (
          <div className="vn-end">
            <p>— End —</p>
            <button onClick={reset}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
