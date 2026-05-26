import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [leavingSprite, setLeavingSprite] = useState(null);
  const prevActiveRef = useRef(null);

  const handleAdvance = useCallback(() => advance(), [advance]);

  const activeCharacter = current?.type === 'dialogue' ? current.character : null;
  const activeEmotion   = current?.type === 'dialogue' ? (current.emotion ?? 'idle') : 'idle';
  const visibleSprite = activeCharacter ? sprites[activeCharacter] : null;

  // Track character switches to play exit animation on the outgoing sprite
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeCharacter; // always update first
    if (prev && prev !== activeCharacter && sprites[prev]) {
      setLeavingSprite({ character: prev, src: sprites[prev].src });
      const t = setTimeout(() => setLeavingSprite(null), 320);
      return () => clearTimeout(t);
    }
  }, [activeCharacter, sprites]);

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
        {leavingSprite && (
          <CharacterSprite
            key={`leaving-${leavingSprite.character}`}
            character={leavingSprite.character}
            src={leavingSprite.src}
            position="center"
            leaving
          />
        )}
        {visibleSprite && (
          <CharacterSprite
            key={activeCharacter}
            character={activeCharacter}
            src={visibleSprite.src}
            position="center"
            emotion={activeEmotion}
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
