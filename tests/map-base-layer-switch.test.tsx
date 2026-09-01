import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapBaseLayerSwitch } from "@/components/map/map-base-layer-switch";

describe("MapBaseLayerSwitch", () => {
  it("exposes the selected background and reports a satellite selection", () => {
    const onChange = vi.fn();
    render(<MapBaseLayerSwitch value="plan" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Satellite" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Satellite" }));

    expect(onChange).toHaveBeenCalledWith("satellite");
  });
});
