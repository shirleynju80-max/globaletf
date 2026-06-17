import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("renders two product entry points", () => {
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
    const dispatch = vi.spyOn(window, "dispatchEvent");

    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: /跨境基金/ })).toBeInTheDocument();
    expect(screen.getByText("净值占比")).toBeInTheDocument();
    const otcRow = screen.getByText("000834").closest("tr");
    expect(otcRow?.querySelector(".col-premium")).toHaveTextContent("-");
    fireEvent.click(screen.getAllByRole("button", { name: "指数跟踪" })[0]);

    expect(pushState).toHaveBeenCalledWith({}, "", "/indices");
    expect(dispatch).toHaveBeenCalled();
  });
});
