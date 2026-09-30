<template>
  <div>
    <dialog
      v-if="showModal"
      open
      className="modal mt-[-8vh]"
    >
      <div className="modal-box w-[calc(100vw-2rem)] max-w-[48rem]">
        <h3 className="font-bold text-lg mb-4">🎉 Congratulations!</h3>

        <div class="flex flex-col">
          <p class="pl-14 text-base leading-loose text-gray-600">
            {{
              `恭喜您一共完成 ${courseTimer.totalRecordNumber()} 道题，用时 ${formatSecondsToTime(
                courseTimer.calculateTotalTime(),
              )} `
            }}
          </p>
        </div>
        <div className="modal-action">
          <button
            class="btn btn-primary"
            @click="toShare"
          >
            生成打卡图
          </button>
          <button
            class="btn"
            @click="handleDoAgain"
          >
            再来一次
          </button>

          <button
            class="btn"
            @click="goToNextCourse"
          >
            {{ haveNextCourse ? "开始下一张练习卡片" : "返回练习清单" }}
            <kbd class="kbd"> ↵ </kbd>
          </button>
        </div>
      </div>
      <canvas
        ref="confettiCanvasRef"
        class="pointer-events-none absolute left-0 top-0 h-full w-full"
      ></canvas>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { computed, ref, watch } from "vue";

import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useConfetti } from "~/composables/main/confetti/useConfetti";
import { useGameMode } from "~/composables/main/game";
import { useShareModal } from "~/composables/main/shareImage/share";
import { useSummary } from "~/composables/main/summary";
import { useExerciseStore } from "~/store/exercise";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";
import { formatSecondsToTime } from "~/utils/date";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const courseStore = useExerciseStore();
const exerciseCatalogStore = useExerciseCatalogStore();
const { goToNextCourse, completeCourse, haveNextCourse } = useCourse();
const { handleDoAgain } = useDoAgain();
const { showModal, hideSummary } = useSummary();
const { confettiCanvasRef, playConfetti } = useConfetti();
const { showShareModal } = useShareModal();
const { updateActiveCourseMap } = useActiveCourseMap();

watch(showModal, (val) => {
  if (val) {
    // 注册回车键进入下一课
    registerShortcut("enter", goToNextCourse);
    // 显示结算面板代表当前练习卡片已经完成
    completeCourse();
    // 延迟一小会放彩蛋
    setTimeout(async () => {
      playConfetti();
    }, 300);
  } else {
    // 取消回车键进入下一课
    cancelShortcut("enter", goToNextCourse);
  }
});

function useDoAgain() {
  const { showQuestion } = useGameMode();

  function handleDoAgain() {
    courseStore.doAgain();
    hideSummary();
    showQuestion();
    courseTimer.reset();
  }

  return {
    handleDoAgain,
  };
}

function useCourse() {
  let nextCourseId = ref("");

  const haveNextCourse = computed(() => {
    return nextCourseId.value;
  });

  async function goToNextCourse() {
    // 无论后续如何处理，都需要先隐藏 Summary 页面
    hideSummary();

    if (nextCourseId.value) {
      navigateTo(`/game/${courseStore.currentCourse?.coursePackId}/${nextCourseId.value}`);
    } else {
      navigateTo("/course-pack");
    }
  }

  async function completeCourse() {
    if (courseStore.currentCourse) {
      const { coursePackId } = courseStore.currentCourse;
      const { nextCourse } = await courseStore.completeCourse();
      exerciseCatalogStore.updateExerciseCompleteCount(coursePackId);

      if (nextCourse) {
        nextCourseId.value = nextCourse.id;
        updateActiveCourseMap(coursePackId, nextCourseId.value);
      } else {
        updateActiveCourseMap(coursePackId, "");
      }
    }
  }

  return {
    completeCourse,
    goToNextCourse,
    haveNextCourse,
  };
}

const toShare = () => {
  showShareModal();
};
</script>
