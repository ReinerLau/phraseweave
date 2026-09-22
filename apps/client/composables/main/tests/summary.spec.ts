import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as toolApi from "~/api/tool";
import { useSetup } from "~/tests/helper/component";
import { resetSentenceLoading, useDailySentence, useSummary } from "../summary";

const { runtimeConfig, useRuntimeConfigMock } = vi.hoisted(() => {
  const runtimeConfig = {
    public: {
      backendEndpoint: "https://api.example.com",
    },
  };

  return {
    runtimeConfig,
    useRuntimeConfigMock: vi.fn(() => runtimeConfig),
  };
});

vi.mock("nuxt/app", () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}));

vi.mock("~/api/tool");

describe("summary", () => {
  describe("summary sentence", () => {
    const dummyRes = {
      en: "en",
      zh: "zh",
    };
    beforeEach(() => {
      runtimeConfig.public.backendEndpoint = "https://api.example.com";
      vi.mocked(toolApi.fetchDailySentence).mockResolvedValue(dummyRes);
    });

    afterEach(() => {
      resetSentenceLoading();
      vi.clearAllMocks();
    });

    it("should load the daily sentence", async () => {
      const { wrapper } = useSetup(() => {
        const { zhSentence, enSentence } = useDailySentence();
        return {
          zhSentence,
          enSentence,
        };
      });

      await flushPromises();

      const { zhSentence, enSentence } = wrapper.vm;

      expect(toolApi.fetchDailySentence).toBeCalled();
      expect(zhSentence).toBe(dummyRes.zh);
      expect(enSentence).toBe(dummyRes.en);
    });

    it("should only load sentence once", async () => {
      useSetup(() => {
        useDailySentence();
      });

      await flushPromises();

      useSetup(() => {
        useDailySentence();
      });

      await flushPromises();

      expect(toolApi.fetchDailySentence).toBeCalledTimes(1);
    });

    it("skips the optional request when no backend is configured", async () => {
      runtimeConfig.public.backendEndpoint = "";

      useSetup(() => {
        useDailySentence();
      });

      await flushPromises();

      expect(toolApi.fetchDailySentence).not.toBeCalled();
    });
  });

  describe("summary modal control", () => {
    it("should show summary modal", () => {
      const { showModal, showSummary } = useSummary();
      showSummary();
      expect(showModal.value).toBeTruthy();
    });

    it("should hide summary modal", () => {
      const { showModal, hideSummary } = useSummary();
      hideSummary();
      expect(showModal.value).toBeFalsy();
    });

    it("should return a same value in different hook", () => {
      const { showSummary } = useSummary();
      showSummary();
      const { showModal: anotherShowModal } = useSummary();
      expect(anotherShowModal.value).toBeTruthy();
    });
  });
});
