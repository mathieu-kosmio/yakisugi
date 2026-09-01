export type MapBaseLayer = "plan" | "satellite";

type MapBaseLayerSwitchProps = {
  value: MapBaseLayer;
  onChange: (value: MapBaseLayer) => void;
};

const layers: ReadonlyArray<{ value: MapBaseLayer; label: string }> = [
  { value: "plan", label: "Plan" },
  { value: "satellite", label: "Satellite" },
];

export function MapBaseLayerSwitch({
  value,
  onChange,
}: MapBaseLayerSwitchProps) {
  return (
    <fieldset className="map-base-layer-switch">
      <legend className="visually-hidden">Fond de carte</legend>
      {layers.map((layer) => (
        <button
          key={layer.value}
          type="button"
          className="map-base-layer-option"
          aria-pressed={value === layer.value}
          onClick={() => onChange(layer.value)}
        >
          {layer.label}
        </button>
      ))}
    </fieldset>
  );
}
