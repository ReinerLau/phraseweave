import { describe, expect, it } from "vitest";

import { useSetup } from "~/tests/helper/component";
import { useSummary } from "../summary";

describe("summary", () => {
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
