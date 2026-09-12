import React from "react";
import { createRoot } from "react-dom/client";
import H5App from "./H5App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <H5App />
  </React.StrictMode>,
);
