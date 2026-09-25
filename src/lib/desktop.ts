export type DesktopBridge = {
  setLayout: (mode: "idle" | "study" | "setup", active: boolean) => void;
  hide: () => void;
  openWebsite: () => void;
};
declare global {
  interface Window {
    offerQuestDesktop?: DesktopBridge;
  }
}
export function desktopBridge() {
  return typeof window === "undefined" ? undefined : window.offerQuestDesktop;
}
