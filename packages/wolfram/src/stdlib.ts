// The WL/M bootstrap library, written in Wolfram notation and evaluated
// at the start of every session (task 5.4: the library dog-foods the
// language). Sequence blanks + OneIdentity (`Plus[r]`, `Times[r]`)
// stand in for matching modulo Flat, which the engine does not do yet.
export const stdlib = `
(* differentiation *)
D[x_, x_] := 1;
D[c_, x_] := 0 /; FreeQ[c, x];
D[f_ + r__, x_] := D[f, x] + D[Plus[r], x];
D[f_ * r__, x_] := D[f, x] * Times[r] + f * D[Times[r], x];
D[f_^n_, x_] := n * f^(n + -1) * D[f, x] /; FreeQ[n, x];

(* a Rubi-flavoured integration rule slice *)
Integrate[x_, x_] := x^2 * (1/2);
Integrate[c_, x_] := c * x /; FreeQ[c, x];
Integrate[x_^n_, x_] := x^(n + 1) * (1/(n + 1)) /; FreeQ[n, x] && n != -1;
Integrate[c_ * f__, x_] := c * Integrate[Times[f], x] /; FreeQ[c, x];
Integrate[f_ + r__, x_] := Integrate[f, x] + Integrate[Plus[r], x]
`;
