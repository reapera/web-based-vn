const EMOTION_CLASS = {
  idle:    'vn-sprite--idle',
  happy:   'vn-sprite--happy',
  sad:     'vn-sprite--sad',
  shocked: 'vn-sprite--shocked',
  angry:   'vn-sprite--angry',
  nervous: 'vn-sprite--nervous',
};

export function CharacterSprite({ character, src, position = 'center', active = true, leaving = false, emotion = 'idle' }) {
  const wrapClass = [
    'vn-sprite-wrap',
    `vn-sprite-wrap--${position}`,
    leaving          ? 'vn-sprite-wrap--leaving' : '',
    !active && !leaving ? 'vn-sprite-wrap--dim' : '',
  ].filter(Boolean).join(' ');

  const imgClass = ['vn-sprite', EMOTION_CLASS[emotion] ?? EMOTION_CLASS.idle].join(' ');

  return (
    <div className={wrapClass}>
      <img className={imgClass} src={src} alt={character} draggable={false} />
    </div>
  );
}
