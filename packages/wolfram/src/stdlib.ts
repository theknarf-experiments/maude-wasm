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
Integrate[f_ + r__, x_] := Integrate[f, x] + Integrate[Plus[r], x];
Integrate[x_^-1, x_] := Log[x];
Integrate[Sin[x_], x_] := -Cos[x];
Integrate[Cos[x_], x_] := Sin[x];
Integrate[Exp[x_], x_] := Exp[x];

(* chain rules for named functions *)
D[Sin[u_], x_] := Cos[u] * D[u, x];
D[Cos[u_], x_] := -Sin[u] * D[u, x];
D[Exp[u_], x_] := Exp[u] * D[u, x];
D[Log[u_], x_] := D[u, x] / u;

(* polynomial expansion *)
Expand[a_ + r__] := Expand[a] + Expand[Plus[r]];
Expand[a_ * r__] := dist[Expand[a], Expand[Times[r]]];
Expand[a_^n_] := expandPow[Expand[a], n] /; IntegerQ[n] && n > 1;
Expand[e_] := e;
dist[a_ + b__, c_] := dist[a, c] + dist[Plus[b], c];
dist[a_, b_ + c__] := dist[a, b] + dist[a, Plus[c]];
dist[a_, b_] := a * b;
expandPow[a_, 1] := a;
expandPow[a_, n_] := dist[a, expandPow[a, n + -1]];

(* fall back to expanding the integrand, retrying once it changes *)
Integrate[e_, x_] := Integrate[Expand[e], x] /; !(e === Expand[e]);

(* coefficient extraction over the expanded form *)
Coefficient[e_, x_, n_] := coefSum[Expand[e], x, n];
coefSum[a_ + r__, x_, n_] := coefSum[a, x, n] + coefSum[Plus[r], x, n];
coefSum[t_, x_, n_] := coefFree[t * x^(-1 * n), x];
coefFree[u_, x_] := u /; FreeQ[u, x];
coefFree[u_, x_] := 0;

(* protection *)
SetAttributes[Protect, HoldAll];
Protect[f_] := SetAttributes[f, Protected];
SetAttributes[Unprotect, HoldAll];
Unprotect[f_] := ClearAttributes[f, Protected];

(* list utilities *)
Riffle[{}, s_] := {};
Riffle[{x_}, s_] := {x};
Riffle[{x_, r__}, s_] := Join[{x, s}, Riffle[{r}, s]];

(* complex numbers: I is Complex[0, 1]; sums and products fold pairs
   wherever they sit in the flattened argument list *)
Complex[a_, 0] := a;
I = Complex[0, 1];
l___ + Complex[a_, b_] + m___ + Complex[c_, d_] + rr___ :=
  Plus[l] + Complex[a + c, b + d] + Plus[m] + Plus[rr];
x_?NumberQ + l___ + Complex[a_, b_] + m___ :=
  Complex[x + a, b] + Plus[l] + Plus[m] /; x != 0;
l___ * Complex[a_, b_] * m___ * Complex[c_, d_] * rr___ :=
  Times[l] * Complex[a*c - b*d, a*d + b*c] * Times[m] * Times[rr];
x_?NumberQ * l___ * Complex[a_, b_] * m___ :=
  Complex[x*a, x*b] * Times[l] * Times[m] /; x != 1;
Complex[a_, b_]^n_ :=
  Nest[Function[z, z * Complex[a, b]], 1, n] /; IntegerQ[n] && n > 0;
Re[Complex[a_, b_]] := a; Re[x_?NumberQ] := x;
Im[Complex[a_, b_]] := b; Im[x_?NumberQ] := 0;
Conjugate[Complex[a_, b_]] := Complex[a, -b]; Conjugate[x_?NumberQ] := x;

(* in-place update sugar over own-values *)
SetAttributes[AppendTo, HoldFirst];
AppendTo[s_, e_] := s = Append[s, e];
SetAttributes[PrependTo, HoldFirst];
PrependTo[s_, e_] := s = Prepend[s, e];
SetAttributes[AssociateTo, HoldFirst];
AssociateTo[s_, r_] := s = Association[s, r];
SetAttributes[KeyDropFrom, HoldFirst];
KeyDropFrom[s_, k_] := s = KeyDrop[s, k];

(* special values *)
Sin[0] = 0; Cos[0] = 1; Exp[0] = 1; Log[1] = 0
`;
