export type RecoverySources = [string] | [string, string];

interface RecoveryFrame {
  targetUnitId: string;
  unitIds: readonly string[];
  index: number;
}

/** Keeps error-driven review separate from the course's saved question index. */
export class ReviewRecovery {
  private frames: RecoveryFrame[] = [];
  currentUnitId: string | undefined;

  constructor(private readonly sourcesByUnitId: Map<string, RecoverySources>) {}

  canDecompose(unitId: string | undefined): boolean {
    return !!unitId && this.sourcesByUnitId.has(unitId);
  }

  /** Planned steps end with the failed target; absent evidence keeps direct-source recovery. */
  fail(unitId: string | undefined, reviewSteps?: readonly string[]): string | undefined {
    if (!unitId) return this.currentUnitId;
    const originalSources = this.sourcesByUnitId.get(unitId);
    if (!originalSources) return this.currentUnitId;
    const unitIds = reviewSteps?.length ? reviewSteps : [...originalSources, unitId];

    const frame = this.frames.at(-1);
    if (frame?.targetUnitId === unitId && frame.index === frame.unitIds.length - 1) {
      frame.unitIds = unitIds;
      frame.index = 0;
    } else {
      this.frames.push({
        targetUnitId: unitId,
        unitIds,
        index: 0,
      });
    }
    this.currentUnitId = unitIds[0];
    return this.currentUnitId;
  }

  correct(): string | undefined {
    while (this.frames.length) {
      const frame = this.frames.at(-1)!;
      if (frame.index + 1 < frame.unitIds.length) {
        frame.index += 1;
        this.currentUnitId = frame.unitIds[frame.index];
        return this.currentUnitId;
      }
      // Completing a nested target also completes the paused outer step.
      this.frames.pop();
    }
    this.currentUnitId = undefined;
    return undefined;
  }

  cancel(): void {
    this.frames = [];
    this.currentUnitId = undefined;
  }
}
