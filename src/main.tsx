import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Le squelette statique de index.html est peint AVANT React (c'est lui
// l'élément LCP). On ne le retire qu'une fois la coquille React montée,
// sinon l'écran clignote en blanc entre les deux.
function removeShell() {
  const shell = document.getElementById("dk-shell");
  if (shell) shell.remove();
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
  // Un frame après le premier rendu : React a peint, on peut enlever le décor.
  requestAnimationFrame(() => requestAnimationFrame(removeShell));
}
