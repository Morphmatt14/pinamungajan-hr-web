"use client";

import { useEffect } from "react";

export function DevHydrationExtensionNote() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const root = document.documentElement;
    const body = document.body;

    const suspects = [
      { el: root, attr: "data-qb-installed" },
      { el: body, attr: "data-qb-installed" },
      { el: root, attr: "data-gramm" },
      { el: root, attr: "data-new-gr-c-s-check-loaded" },
      { el: body, attr: "data-gramm" },
      { el: body, attr: "data-new-gr-c-s-check-loaded" },
    ];

    const found = suspects
      .map((s) => {
        const v = s.el.getAttribute(s.attr);
        return v == null ? null : { element: s.el === root ? "<html>" : "<body>", attr: s.attr, value: v };
      })
      .filter(Boolean) as Array<{ element: string; attr: string; value: string }>;

    if (found.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[dev] Hydration mismatch likely caused by a browser extension mutating the DOM before React hydrates. Detected attributes:",
        found
      );
    }
  }, []);

  return null;
}
