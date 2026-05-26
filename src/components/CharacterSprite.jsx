export function CharacterSprite({ character, src, position = 'center' }) {
  return (
    <img
      className={`vn-sprite vn-sprite--${position}`}
      src={src}
      alt={character}
      draggable={false}
    />
  );
}
