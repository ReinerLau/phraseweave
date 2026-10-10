import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RemoteLogout from "~/components/RemoteLogout.vue";
import {
  handleRemoteAuth,
  loadRemoteSession,
  remoteLoginPath,
  remoteUsername,
} from "~/services/remoteSession";

describe("local password sessions", () => {
  const assign = vi.fn();
  beforeEach(() => {
    remoteUsername.value = undefined;
    assign.mockClear();
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        pathname: "/game/example",
        search: "?review=1",
        hash: "#unit",
        assign,
      },
    });
    const marker = document.createElement("meta");
    marker.name = "phraseweave-runtime";
    marker.content = "local-package";
    document.head.append(marker);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    remoteUsername.value = undefined;
    document
      .querySelectorAll('meta[name="phraseweave-runtime"]')
      .forEach((marker) => marker.remove());
  });

  it("returns expired API sessions to login with the current route and fragment", async () => {
    const response = new Response(JSON.stringify({ code: "REMOTE_AUTH_REQUIRED" }), {
      status: 401,
    });
    await expect(handleRemoteAuth(response)).rejects.toThrow("登录已过期");
    expect(assign).toHaveBeenCalledWith(remoteLoginPath("/game/example?review=1#unit"));
    expect((await response.json()).code).toBe("REMOTE_AUTH_REQUIRED");
  });

  it("does not turn other API failures or local usage into password login", async () => {
    await handleRemoteAuth(
      new Response(JSON.stringify({ error: "Other account" }), { status: 401 }),
    );
    await handleRemoteAuth(new Response("unavailable", { status: 503 }));
    window.location.protocol = "http:";
    await handleRemoteAuth(
      new Response(JSON.stringify({ code: "REMOTE_AUTH_REQUIRED" }), { status: 401 }),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows logout only when the remote password session exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ username: "phraseweave" }))),
    );
    const wrapper = mount(RemoteLogout);
    expect(wrapper.find("form").exists()).toBe(false);
    await loadRemoteSession();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("form").attributes()).toMatchObject({
      action: "/remote/logout",
      method: "post",
    });
    expect(wrapper.get("button").text()).toBe("退出登录");
    wrapper.unmount();
  });

  it("ignores the SPA fallback from existing Access mode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Access page</html>")));
    await loadRemoteSession();
    expect(remoteUsername.value).toBeUndefined();
    expect(assign).not.toHaveBeenCalled();
  });
});
