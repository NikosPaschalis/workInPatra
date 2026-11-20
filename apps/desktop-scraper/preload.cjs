const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld("workInPatra", Object.freeze({
  getState: () => invoke("state:get"),
  startScan: (sources) => invoke("scan:start", { sources }),
  cancelScan: () => invoke("scan:cancel"),
  setReview: (ids, decision) => invoke("review:set", { ids, decision }),
  exportResults: () => invoke("results:export"),
  clearHistory: () => invoke("history:clear"),
  authenticateGitHub: (token, persist) => invoke("github:authenticate", { token, persist }),
  disconnectGitHub: () => invoke("github:disconnect"),
  uploadApproved: () => invoke("github:upload"),
  openExternal: (id) => invoke("external:open", { id }),
  exportDiagnostics: () => invoke("diagnostics:export"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:state", listener);
    return () => ipcRenderer.removeListener("desktop:state", listener);
  },
}));
