import { immerable } from "immer";
import { create, Draft } from "mutative";

type ChangeListener = () => void;

export interface StateMutation<State, T = void> {
  (state: Draft<State>): T;
}

/**
 * Base class for a store that holds a state object and allows for mutations
 */
export class SyncExternalStore<TState extends object> {
  #state: TState;

  constructor(initialState: TState) {
    this.#state = initialState;
  }

  getSnapshot(): TState {
    return this.#state;
  }

  #listeners = new Set<ChangeListener>();
  public subscribe = (listener: ChangeListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  protected notify() {
    this.#notify();
  }

  #notify() {
    this.#listeners.forEach((listener) => listener());
  }

  #mutRC = 0;
  public mutate = <U>(fn: StateMutation<TState, U>): U => {
    this.#mutRC++;
    try {
      const oldState = this.#state;
      const [draft, finish] = create(oldState, {
        enablePatches: true,
        mark: (target) => {
          if (target == null || typeof target !== "object") return;
          if (immerable in target) {
            if (!target[immerable]) {
              return "mutable";
            } else {
              return "immutable";
            }
          }
          return "immutable";
        },
      });
      const out = fn(draft);
      const [updatedState, fwd, bwd] = finish();

      // some 'mutate' calls may not actually change the state, so we can skip the
      // usual undo queue and notification steps.
      if (updatedState === oldState) {
        return out;
      }

      this.#state = updatedState;

      this.#notify();

      return out;
    } finally {
      this.#mutRC--;
    }
  };
}
