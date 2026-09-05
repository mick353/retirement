/* Atlas is now a rendering module inside Command Centre.
   Old bookmarks retain their full scenario and open the corresponding view. */
(function () {
  const query = new URLSearchParams(location.search);
  if (query.get("embedded") === "1" && window.parent !== window) {
    document.documentElement.dataset.embedded = "true";
    document.documentElement.dataset.embedPanel = ["studio","cashflow","returns","map","trade"].includes(query.get("panel")) ? query.get("panel") : "studio";
    return;
  }
  const section = location.hash.slice(1);
  const routes = {frontier:["scenario","frontier",""],tax:["estate","",""],governance:["evidence","",""],architecture:["scenario","explore","map"],objectives:["scenario","explore","map"],lifecycle:["scenario","explore","map"],cashflow:["scenario","explore","cashflow"],trajectory:["scenario","explore","studio"]};
  const [target,tool,panel] = routes[section] || ["scenario","explore","studio"];
  query.delete("embedded");
  query.set("section",target);
  if(tool)query.set("tool",tool);else query.delete("tool");
  if(panel)query.set("panel",panel);else query.delete("panel");
  const destination=new URL("./",location.href);
  destination.search=query.toString();
  location.replace(destination.href);
})();
