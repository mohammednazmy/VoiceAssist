import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initSentry } from "./lib/sentry";
import "./styles.css";

// Initialize Sentry error tracking first
initSentry();

console.log("🔍 main.tsx executing");
console.log("🔍 root element:", document.getElementById("root"));

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("❌ Root element not found!");
  document.body.innerHTML =
    '<div style="padding: 50px; font-family: system-ui;"><h1 style="color: red;">Error: Root element not found</h1><p>The div with id="root" is missing from the HTML.</p></div>';
} else {
  console.log("✅ Root element found, creating React root...");
  try {
    const root = ReactDOM.createRoot(rootElement as HTMLElement);
    console.log("✅ React root created, rendering App...");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    console.log("✅ App render called");
  } catch (error) {
    console.error("❌ Error creating React root:", error);
    document.body.innerHTML =
      '<div style="padding: 50px; font-family: system-ui;"><h1 style="color: red;">Error creating React root</h1><pre>' +
      error +
      "</pre></div>";
  }
}
