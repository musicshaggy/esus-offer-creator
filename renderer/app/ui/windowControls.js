export function initWindowControls() {
  if (!window.esusAPI) return;

  document.getElementById("btnWinMin")?.addEventListener("click", () => window.esusAPI.winMinimize());
  document.getElementById("btnWinMax")?.addEventListener("click", () => window.esusAPI.winToggleMaximize());
  document.getElementById("btnWinClose")?.addEventListener("click", () => window.esusAPI.winClose());

  document.getElementById("appTitlebar")?.addEventListener("dblclick", () => {
    window.esusAPI?.winToggleMaximize();
  });
}
