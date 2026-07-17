import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICP_RECORD } from "../lib/compliance";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("renders the ICP record link", () => {
    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: ICP_RECORD.text });
    expect(link).toHaveAttribute("href", ICP_RECORD.href);
  });
});
