import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

window.onerror = function (message, source, lineno, colno, error) {
  document.body.innerHTML =
    '<div style="background:#000;color:#f59e0b;padding:20px;font-family:monospace;font-size:14px;white-space:pre-wrap;">' +
    "JS ERROR:\n" + message + "\nLine: " + lineno + ":" + colno +
    "\n\n" + (error && error.stack ? error.stack : "") +
    "</div>";
};

window.onunhandledrejection = function (event) {
  document.body.innerHTML =
    '<div style="background:#000;color:#f59e0b;padding:20px;font-family:monospace;font-size:14px;white-space:pre-wrap;">' +
    "PROMISE ERROR:\n" + (event.reason && event.reason.message ? event.reason.message : String(event.reason)) +
    "</div>";
};

createRoot(document.getElementById("root")).render(<App />);
