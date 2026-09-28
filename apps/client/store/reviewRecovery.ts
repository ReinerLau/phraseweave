export type RecoverySources = [string] | [string, string];

interface RecoveryFrame {
  targetUnitId: string;
  sourceUnitIds: RecoverySources;
  sourceIndex: number;
  retrying: boolean;
}

/** Keeps error-driven review separate from the course's saved question index. */
export class ReviewRecovery {
  private frames: RecoveryFrame[] = [];
  currentUnitId: string | undefined;

  constructor(private readonly sourcesByUnitId: Map<string, RecoverySources>) {}

  fail(unitId: string | undefined): string | undefined {
    if (!unitId) return this.currentUnitId;
    const sources = this.sourcesByUnitId.get(unitId);
    if (!sources) return this.currentUnitId;

    const frame = this.frames.at(-1);
    if (frame?.targetUnitId === unitId && frame.retrying) {
      frame.sourceIndex = 0;
      frame.retrying = false;
    } else {
      this.frames.push({
        targetUnitId: unitId,
        sourceUnitIds: sources,
        sourceIndex: 0,
        retrying: false,
      });
    }
    this.currentUnitId = sources[0];
    return this.currentUnitId;
  }

  correct(): string | undefined {
    while (this.frames.length) {
      const frame = this.frames.at(-1)!;
      if (frame.retrying) {
        this.frames.pop();
        continue;
      }
      if (frame.sourceIndex + 1 < frame.sourceUnitIds.length) {
        frame.sourceIndex += 1;
        this.currentUnitId = frame.sourceUnitIds[frame.sourceIndex];
        return this.currentUnitId;
      }
      frame.retrying = true;
      this.currentUnitId = frame.targetUnitId;
      return this.currentUnitId;
    }
    this.currentUnitId = undefined;
    return undefined;
  }

  cancel(): void {
    this.frames = [];
    this.currentUnitId = undefined;
  }
}
