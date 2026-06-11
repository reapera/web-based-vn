import { useState } from "react";

export function InputPrompt({ input, onSubmit }) {
  const [value, setValue] = useState("");
  if (!input) return null;

  const submit = (e) => {
    e.preventDefault();
    onSubmit(value);
    setValue("");
  };

  return (
    <div className="vn-overlay" onClick={(e) => e.stopPropagation()}>
      <form className="vn-input-form" onSubmit={submit}>
        {input.prompt && <div className="vn-input-prompt">{input.prompt}</div>}
        <input
          className="vn-input-field"
          autoFocus
          value={value}
          placeholder={input.default}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="vn-button vn-button-big" type="submit">OK</button>
      </form>
    </div>
  );
}
