export function ChoiceMenu({ choices, onChoose }) {
  return (
    <div className="vn-choices" role="menu">
      {choices.map(({ label, goto }, i) => (
        <button
          key={goto}
          className="vn-choices__btn"
          style={{ animationDelay: `${i * 90}ms` }}
          role="menuitem"
          onClick={() => onChoose(goto)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
