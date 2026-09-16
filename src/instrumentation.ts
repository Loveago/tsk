export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startProviderSyncPoller } = await import("./lib/provider-apis/poller");
    startProviderSyncPoller();
  }
}
