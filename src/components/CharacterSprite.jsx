export function CharacterSprite({ character, src, position = 'right', active = true }) {
  return (
    <img
      className={[
        'vn-sprite',
        `vn-sprite--${position}`,
        !active ? 'vn-sprite--dim' : '',
      ].join(' ').trim()}
      src={src}
      alt={character}
      draggable={false}
    />
  );
}
