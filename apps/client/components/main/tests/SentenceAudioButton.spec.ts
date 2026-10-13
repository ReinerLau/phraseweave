import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

import SentenceAudioButton from "~/components/main/SentenceAudioButton.vue";
import { useSummary } from "~/composables/main/summary";
import { useWordAudio } from "~/composables/useWordAudio";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

vi.mock("~/composables/useWordAudio", () => {
  const activeSentence = ref<string>();
  const activeElement = shallowRef<HTMLElement>();
  const loadingElement = shallowRef<HTMLElement>();
  const playSentenceAudio = vi.fn();
  const stopWordAudio = vi.fn();
  return {
    useWordAudio: () => ({
      activeSentence,
      activeElement,
      loadingElement,
      playSentenceAudio,
      stopWordAudio,
    }),
  };
});
enableAutoUnmount(afterEach);

beforeEach(() => {
  useSummary().hideSummary();
  useWordAudio().activeSentence.value = undefined;
  useWordAudio().activeElement.value = undefined;
  useWordAudio().loadingElement.value = undefined;
  vi.clearAllMocks();
});

describe("inline sentence audio button", () => {
  it("reads its own complete source and updates when text changes", async () => {
    const wrapper = mount(SentenceAudioButton, { props: { text: "I use a computer every day." } });
    await wrapper.get("button").trigger("click");
    expect(useWordAudio().playSentenceAudio).toHaveBeenCalledWith(
      "I use a computer every day.",
      wrapper.element,
    );
    await wrapper.setProps({ text: "Hello world." });
    await wrapper.get("button").trigger("click");
    expect(useWordAudio().playSentenceAudio).toHaveBeenLastCalledWith(
      "Hello world.",
      wrapper.element,
    );
  });

  it("shows loading and stop only on the clicked instance even for identical text", async () => {
    const first = mount(SentenceAudioButton, { props: { text: "Hello world." } });
    const second = mount(SentenceAudioButton, { props: { text: "Hello world." } });
    const audio = useWordAudio();
    audio.activeSentence.value = "Hello world.";
    audio.activeElement.value = first.element as HTMLElement;
    audio.loadingElement.value = first.element as HTMLElement;
    await first.vm.$nextTick();
    expect(first.get("button").attributes("aria-label")).toBe("停止朗读");
    expect(first.get("button").attributes("aria-busy")).toBe("true");
    expect(second.get("button").attributes("aria-label")).toBe("朗读原句");
    expect(second.get("button").attributes("aria-busy")).toBeUndefined();
    audio.loadingElement.value = undefined;
    await first.vm.$nextTick();
    expect(first.find(".i-ph-stop").exists()).toBe(true);
  });

  it("hides empty text and stops the active button when settlement opens", async () => {
    const empty = mount(SentenceAudioButton, { props: { text: "  " } });
    expect(empty.find("button").exists()).toBe(false);
    const wrapper = mount(SentenceAudioButton, { props: { text: "Hello world." } });
    useWordAudio().activeElement.value = wrapper.element as HTMLElement;
    useSummary().showSummary();
    await wrapper.vm.$nextTick();
    expect(wrapper.find("button").exists()).toBe(false);
    expect(useWordAudio().stopWordAudio).toHaveBeenCalledOnce();
  });

  it("stops its own audio on text changes and unmount, without stopping another button", async () => {
    const first = mount(SentenceAudioButton, { props: { text: "First." } });
    const second = mount(SentenceAudioButton, { props: { text: "Second." } });
    useWordAudio().activeElement.value = first.element as HTMLElement;
    second.unmount();
    expect(useWordAudio().stopWordAudio).not.toHaveBeenCalled();
    await first.setProps({ text: "Updated." });
    expect(useWordAudio().stopWordAudio).toHaveBeenCalledOnce();
    first.unmount();
    expect(useWordAudio().stopWordAudio).toHaveBeenCalledTimes(2);
  });

  it("plays with Enter and Space without invoking global navigation shortcuts", async () => {
    const wrapper = mount(SentenceAudioButton, {
      props: { text: "Hello world." },
      attachTo: document.body,
    });
    const navigate = vi.fn();
    const enter = registerShortcut("enter", navigate);
    const space = registerShortcut(" ", navigate);
    try {
      const button = wrapper.get("button");
      (button.element as HTMLButtonElement).focus();
      await button.trigger("keydown", { key: "Enter" });
      await button.trigger("keydown", { key: " " });
      await button.trigger("keyup", { key: " " });
      expect(useWordAudio().playSentenceAudio).toHaveBeenCalledTimes(2);
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      cancelShortcut(enter);
      cancelShortcut(space);
    }
  });

  it("preserves the typing input focus and caret when clicked", async () => {
    const wrapper = mount(
      {
        components: { SentenceAudioButton },
        template: '<div><input value="hello" /><SentenceAudioButton text="Hello world." /></div>',
      },
      { attachTo: document.body },
    );
    const input = wrapper.get("input").element;
    input.focus();
    input.setSelectionRange(2, 2);
    const button = wrapper.get("button");
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.element.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    await button.trigger("click");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.value).toBe("hello");
  });
});
