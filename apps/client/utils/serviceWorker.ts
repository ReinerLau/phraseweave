export function getServiceWorkerRegistration(baseURL: string) {
  const scope = baseURL ? `${baseURL.replace(/\/$/, "")}/` : "/";

  return {
    scriptUrl: `${scope}sw.js`,
    scope,
  };
}
