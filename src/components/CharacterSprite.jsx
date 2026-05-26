export function CharacterSprite({ character, src, position = 'center', active = true, leaving = false }) {
  const classes = [
    'vn-sprite',
    `vn-sprite--${position}`,
    leaving ? 'vn-sprite--leaving' : '',
    !active && !leaving ? 'vn-sprite--dim' : '',
  ].filter(Boolean).join(' ');

  return (
    <img
      className={classes}
      src={src}
      alt={character}
      draggable={false}
    />
  );
}
