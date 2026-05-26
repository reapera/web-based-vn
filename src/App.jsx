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
  const spriteEntries = Object.entries(sprites);

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
        {spriteEntries.map(([character, { src, position }]) => (
          <CharacterSprite
            key={character}
            character={character}
            src={src}
            position={position}
            active={activeCharacter === null || activeCharacter === character}
          />
        ))}
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
