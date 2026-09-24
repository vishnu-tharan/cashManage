import { currencies } from "../storage";
export function Field({
  label,
  children
}) {
  return <label className="field">
      <span>{label}</span>
      {children}
    </label>;
}
export function Currency({
  value,
  onChange
}) {
  return <select aria-label="Currency" value={value} onChange={onChange}>
      {currencies.map(c => <option key={c}>{c}</option>)}
    </select>;
}
