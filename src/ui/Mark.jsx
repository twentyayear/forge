import React from "react";

export function Mark({ height = 30, alt = "" }) {
  return (
    <img src="/brand/workhart_mark.png" alt={alt} aria-hidden={alt ? undefined : "true"}
      style={{ height, width: "auto", display: "block" }} />
  );
}
