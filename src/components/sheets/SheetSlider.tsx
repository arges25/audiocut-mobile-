interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

export default function SheetSlider({ label, value, min, max, step, displayValue, onChange }: Props) {
  return (
    <label className="sheet-slider-row">
      <div className="sheet-slider-label">
        <span>{label}</span>
        <span className="sheet-slider-value">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
