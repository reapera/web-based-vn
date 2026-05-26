export function Background({ src }) {
  if (!src) return <div className="vn-background vn-background--empty" />;

  return (
    <div
      className="vn-background"
      style={{ backgroundImage: `url(${src})` }}
      aria-hidden="true"
    />
  );
}
