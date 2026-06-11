import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Target } from "../domain/types";
import { TargetSelector } from "./TargetSelector";

const targets: Target[] = [
  { code: "NASDAQ_100", name: "纳斯达克100", type: "index", aliases: [], region: "US", displayOrder: 1 },
  { code: "SP_500", name: "标普500", type: "index", aliases: [], region: "US", displayOrder: 2 }
];

describe("TargetSelector", () => {
  it("selects an index target", () => {
    const onSelectTarget = vi.fn();

    render(
      <TargetSelector
        targets={targets}
        selectedTargetCode="NASDAQ_100"
        onSelectTarget={onSelectTarget}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "标普500" }));

    expect(onSelectTarget).toHaveBeenCalledWith("SP_500");
  });
});
