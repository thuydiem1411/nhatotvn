import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";

// Application entrypoint: mount React app to #root
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

