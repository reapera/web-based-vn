export function ChoiceMenu({ choices, onChoose }) {
  return (
    <div className="vn-choices" role="menu">
      {choices.map(({ label, goto }) => (
        <button
          key={goto}
          className="vn-choices__btn"
          role="menuitem"
          onClick={() => onChoose(goto)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
