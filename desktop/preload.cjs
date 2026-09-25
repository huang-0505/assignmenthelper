const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("offerQuestDesktop", {
  setLayout: (mode, active) =>
    ipcRenderer.send("study:layout", mode, active === true),
  hide: () => ipcRenderer.send("study:hide"),
  openWebsite: () => ipcRenderer.send("study:website"),
});
