import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, dashboard, v23, atlasCss] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/retirement-dashboard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../public/deep-model.html", import.meta.url), "utf8"),
  readFile(new URL("../public/atlas.css", import.meta.url), "utf8"),
]);

const includes = (source, fragment, message) => assert.ok(source.includes(fragment), message);

includes(css, "@media (max-width: 650px)", "Command Centre requires its phone breakpoint");
includes(css, "@media (max-width: 360px)", "Command Centre requires narrow-phone hardening");
includes(css, ".badge { max-width: 100%; white-space: normal;", "Long mobile badges must wrap");
includes(css, ".compare-head { flex-direction: column; }", "Scenario cards must reflow their headings");
includes(css, ".compare-head > span { white-space: normal;", "Scenario source labels must wrap");
includes(css, ".source-list article { align-items: flex-start; flex-direction: column; }", "Evidence cards must stack on phones");
includes(css, ".vr-election-grid { grid-template-columns: repeat(2, minmax(0, 1fr));", "VR elections must remain visible as a phone grid");
includes(css, ".vr-controls .segmented:not(.ages) { grid-template-columns: 1fr; }", "Long VR pathway labels must stack");
includes(css, ".vr-controls .segmented.ages { grid-template-columns: repeat(2, minmax(0, 1fr)); }", "VR age choices must use a two-column phone grid");
includes(css, ".mobile-scroll-cue { display: flex;", "Wide mobile tables need an explicit scroll cue");
includes(css, ".content button, .content a.primary, .content a.secondary, .content a.text-button", "Phone actions must retain a 44px touch target");
includes(dashboard, "Age-by-age VR comparison table; scroll horizontally for all columns", "The VR table must expose its scrollable region to assistive technology");
includes(dashboard, "tabIndex={0}", "The VR comparison table must be keyboard-scrollable");

// Desktop-collapsible sidebar (Command Centre) — guard against silent regression
includes(css, ".desktop-only { display: none; }", "Desktop sidebar toggle needs its base hidden rule");
includes(css, "@media (min-width: 921px)", "Desktop collapse needs its >=921px breakpoint");
const cc920 = css.indexOf("@media (max-width: 920px)");
const cc921 = css.indexOf("@media (min-width: 921px)");
const cc650 = css.indexOf("@media (max-width: 650px)");
const ccNavCollapsed = css.indexOf(".app-layout.nav-collapsed { grid-template-columns: 0 minmax(0, 1fr); }");
assert.ok(cc920 < cc921 && cc921 < cc650, "The desktop collapse @media (min-width: 921px) block must sit after the 920px block and before the 650px block, or the mobile drawer rules override it");
assert.ok(ccNavCollapsed > cc921 && ccNavCollapsed < cc650, ".app-layout.nav-collapsed must be defined inside the @media (min-width: 921px) block");
includes(dashboard, "id=\"nav-menu-button\"", "Mobile menu button needs its id for Escape focus return");
includes(dashboard, "aria-controls=\"retirement-sidebar\" aria-expanded={!navCollapsed}", "Desktop sidebar toggle must expose aria-controls/aria-expanded on the sidebar");
includes(dashboard, "inert={navCollapsed && !navOpen}", "Collapsed sidebar must be inert so hidden nav leaves the tab order (but stays reachable via the mobile drawer)");
includes(dashboard, "robinson-retirement-nav-collapsed", "Sidebar collapse state must persist under the robinson-retirement-nav-collapsed key");

includes(v23, "On a phone, swipe this row to reveal all actions.", "V23 must explain its mobile action strip");
includes(v23, ".controls{margin:0;width:100%;display:flex", "V23 mobile controls must remain in a reachable strip");
assert.doesNotMatch(v23, /\.controls>:nth-child\([^)]*\)\s*\{\s*display:none/i, "V23 must not hide toolbar actions by position");
includes(atlasCss, "@media (max-width: 760px)", "Atlas requires its phone/tablet breakpoint");
includes(atlasCss, "@media (max-width: 480px)", "Atlas requires narrow-phone hardening");

console.log("Mobile layout guardrails passed for Command Centre, VR, V23 and Atlas.");
