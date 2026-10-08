/**
 * A wall-clock budget shared across the optional parts of a scan.
 *
 * The core checks always run; the expensive ones (deployment age, holder
 * distribution) ask the deadline before each round of RPC calls and stop
 * early if the budget is gone. That way a slow node degrades the report
 * into "we could not check this" instead of timing out the request and
 * returning nothing at all.
 */
export class Deadline {
  private constructor(private readonly endsAt: number) {}

  static in(ms: number): Deadline {
    return new Deadline(Date.now() + ms);
  }

  get expired(): boolean {
    return Date.now() >= this.endsAt;
  }

  get remainingMs(): number {
    return Math.max(0, this.endsAt - Date.now());
  }
}
