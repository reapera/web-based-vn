import { useVNEngine } from './engine/useVNEngine';
import { Background } from './components/Background';
import { CharacterSprite } from './components/CharacterSprite';
import { DialogueBox } from './components/DialogueBox';
import { ChoiceMenu } from './components/ChoiceMenu';
import script from './data/script.json';
import './App.css';

export default function App() {
  const { current, background, sprites, advance, choose, reset } = useVNEngine(script);

  return (
    <div className="vn-stage">
      <Background src={background} />

      <div className="vn-sprites">
        {Object.entries(sprites).map(([character, { src, position }]) => (
          <CharacterSprite
            key={character}
            character={character}
            src={src}
            position={position}
          />
        ))}
      </div>

      <div className="vn-ui">
        {current?.type === 'dialogue' && (
          <DialogueBox
            character={current.character}
            text={current.text}
            onAdvance={() => advance()}
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
