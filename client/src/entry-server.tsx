import { renderToPipeableStream } from "react-dom/server";
import { Router } from "wouter";
import App from "./App";

export function render(url: string) {
  return renderToPipeableStream(
    <Router ssrPath={url}>
      <App />
    </Router>
  );
}
