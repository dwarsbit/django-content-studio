import "@fontsource-variable/inter";
import "../public/icons/pi/style.css";
import "./prototypes.css";

import ReactDOM from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";

import { PrototypeApp } from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <TooltipProvider delayDuration={300}>
    <PrototypeApp />
  </TooltipProvider>,
);
