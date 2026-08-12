
export type Op =
  | { method: "reduce" | "parse"; term: string; module?: string }
  | { method: "rewrite" | "frewrite"; term: string; module?: string; bound?: number }
  | {
      method: "search";
      subject: string;
      pattern: string;
      arrow?: "=>1" | "=>+" | "=>*" | "=>!";
      bound?: number;
      depth?: number;
      suchThat?: string;
      module?: string;
    }
  | { method: "match"; pattern: string; subject: string; extension?: boolean; module?: string }
  | { method: "unify"; problem: string; module?: string }
  | { method: "variants"; term: string; module?: string }
  | { method: "modelCheck"; initial: string; formula: string; module?: string }
  | { method: "show"; what: string };

export type WorkerRequest =
  | { id: number; kind: "raw"; code: string }
  | { id: number; kind: "capability"; setup: string; op: Op };

export type WorkerResponse =
  | { id: number; result: unknown }
  | { id: number; error: string };

