/**
 * Coverage-guided, epsilon-greedy element chooser. Prefers controls it hasn't
 * exercised in the current state; with probability epsilon it picks uniformly
 * at random to escape traps (modals that reopen, etc.). Every choice flows
 * through the seeded {@link Rng} so a seed reproduces the run.
 */
import type { Rng } from '../core/rng';
import type { ElementDescriptor } from '../core/types';

export class Explorer {
  private seenStates = new Set<string>();
  /** `${stateHash}:${fp}` pairs already exercised. */
  private exercised = new Set<string>();

  constructor(
    private rng: Rng,
    private epsilon = 0.15,
  ) {}

  isNewState(stateHash: string): boolean {
    return !this.seenStates.has(stateHash);
  }

  markState(stateHash: string): void {
    this.seenStates.add(stateHash);
  }

  get statesDiscovered(): number {
    return this.seenStates.size;
  }

  /**
   * Choose an element to act on. Returns undefined only if `elements` is empty.
   * Sorting by fingerprint first guarantees deterministic indexing.
   */
  choose(stateHash: string, elements: readonly ElementDescriptor[]): ElementDescriptor | undefined {
    if (elements.length === 0) return undefined;
    const sorted = [...elements].sort((a, b) => a.fp.localeCompare(b.fp));
    const unseen = sorted.filter((e) => !this.exercised.has(`${stateHash}:${e.fp}`));

    const chosen =
      unseen.length > 0 && !this.rng.bool(this.epsilon)
        ? this.rng.pick(unseen) // coverage-guided
        : this.rng.pick(sorted); // random-walk escape

    this.exercised.add(`${stateHash}:${chosen.fp}`);
    return chosen;
  }
}
