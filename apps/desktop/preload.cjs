const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("phraseweaveDesktop", {
  getStatus: () => ipcRenderer.invoke("generator:status"),
  startJob: (payload) => ipcRenderer.invoke("generator:start", payload),
  getJob: (id) => ipcRenderer.invoke("generator:job", id),
  releaseJob: (id) => ipcRenderer.invoke("generator:release", id),
  consumeCapture: (id) => ipcRenderer.invoke("capture:consume", id),
  retryGenerator: () => ipcRenderer.invoke("generator:retry"),
});
