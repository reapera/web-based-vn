import { useTypewriter } from '../engine/useTypewriter';

export function DialogueBox({ character, text, onAdvance }) {
  const { displayed, done, skip } = useTypewriter(text, 30);

  function handleClick() {
    if (!done) {
      skip();
    } else {
      onAdvance();
    }
  }

  return (
    <div className="vn-dialogue" onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? handleClick() : null}>
      {character && <div className="vn-dialogue__name">{character}</div>}
      <p className="vn-dialogue__text">
        {displayed}
        {done && <span className="vn-dialogue__caret" aria-hidden="true"> ▼</span>}
      </p>
    </div>
  );
}
