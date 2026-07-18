import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RetirementDashboard from "../app/retirement-dashboard";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("Missing #root application mount");

createRoot(root).render(
  <StrictMode>
    <RetirementDashboard />
  </StrictMode>,
);
