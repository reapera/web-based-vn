export function ChoiceMenu({ choice, onChoose }) {
  if (!choice) return null;
  return (
    <div className="vn-choices" onClick={(e) => e.stopPropagation()}>
      {choice.prompt && <div className="vn-choice-prompt">{choice.prompt}</div>}
      {choice.options.map((option, i) => (
        <button key={i} className="vn-choice" onClick={() => onChoose(i)}>
          {option.text}
        </button>
      ))}
    </div>
  );
}
