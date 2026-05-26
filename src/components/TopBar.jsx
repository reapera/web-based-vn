export function TopBar({ location, autoMode, skipMode, onToggleAuto, onToggleSkip }) {
  return (
    <div className="vn-topbar">
      <div className="vn-topbar__location">{location ?? ' '}</div>
      <div className="vn-topbar__controls">
        <button
          className={`vn-topbar__btn${autoMode ? ' vn-topbar__btn--active' : ''}`}
          onClick={onToggleAuto}
        >
          AUTO
        </button>
        <button
          className={`vn-topbar__btn${skipMode ? ' vn-topbar__btn--active' : ''}`}
          onClick={onToggleSkip}
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
