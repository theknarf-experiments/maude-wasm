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

(* linear substitution a x + b: canonical order puts the constant
   first, so both orderings of the sum appear as patterns *)
Integrate[(b_ + x_)^n_, x_] :=
  (b + x)^(n + 1) * (1/(n + 1)) /; FreeQ[{b, n}, x] && n != -1;
Integrate[(b_ + a_ * x_)^n_, x_] :=
  (b + a*x)^(n + 1) * (1/(a*(n + 1))) /; FreeQ[{a, b, n}, x] && n != -1;
Integrate[(b_ + x_)^-1, x_] := Log[b + x] /; FreeQ[b, x];
Integrate[(b_ + a_ * x_)^-1, x_] := Log[b + a*x] * (1/a) /; FreeQ[{a, b}, x];
Integrate[Sin[a_ * x_], x_] := -Cos[a*x] * (1/a) /; FreeQ[a, x];
Integrate[Cos[a_ * x_], x_] := Sin[a*x] * (1/a) /; FreeQ[a, x];
Integrate[Exp[a_ * x_], x_] := Exp[a*x] * (1/a) /; FreeQ[a, x];
Integrate[Sin[b_ + x_], x_] := -Cos[b + x] /; FreeQ[b, x];
Integrate[Cos[b_ + x_], x_] := Sin[b + x] /; FreeQ[b, x];
Integrate[Exp[b_ + x_], x_] := Exp[b + x] /; FreeQ[b, x];
Integrate[Sin[b_ + a_ * x_], x_] := -Cos[b + a*x] * (1/a) /; FreeQ[{a, b}, x];
Integrate[Cos[b_ + a_ * x_], x_] := Sin[b + a*x] * (1/a) /; FreeQ[{a, b}, x];
Integrate[Exp[b_ + a_ * x_], x_] := Exp[b + a*x] * (1/a) /; FreeQ[{a, b}, x];

(* simple rational forms via polynomial division *)
Integrate[x_ * (b_ + x_)^-1, x_] := x - b * Log[b + x] /; FreeQ[b, x];
Integrate[x_ * (b_ + a_ * x_)^-1, x_] :=
  x * (1/a) - (b/a^2) * Log[b + a*x] /; FreeQ[{a, b}, x];

(* partial fractions for distinct linear factors, in both shapes the
   parser produces: a product of reciprocals and a reciprocal of a
   product *)
Integrate[(b1_ + x_)^-1 * (b2_ + x_)^-1, x_] :=
  (Log[b1 + x] - Log[b2 + x]) * (1/(b2 - b1)) /;
    FreeQ[{b1, b2}, x] && b1 != b2;
Integrate[((b1_ + x_) * (b2_ + x_))^-1, x_] :=
  (Log[b1 + x] - Log[b2 + x]) * (1/(b2 - b1)) /;
    FreeQ[{b1, b2}, x] && b1 != b2;

(* the general rational-functions chapter ------------------------- *)

(* polynomial division as a recurrence: x^n over a linear factor *)
Integrate[x_^n_ * (b_ + x_)^-1, x_] :=
  Integrate[x^(n - 1), x] - b * Integrate[x^(n - 1) * (b + x)^-1, x] /;
    FreeQ[b, x] && IntegerQ[n] && n >= 2;
Integrate[x_^n_ * (b_ + a_ * x_)^-1, x_] :=
  Integrate[x^(n - 1) * (1/a), x] -
    (b/a) * Integrate[x^(n - 1) * (b + a*x)^-1, x] /;
    FreeQ[{a, b}, x] && IntegerQ[n] && n >= 2;

(* numerator x over distinct linear factors *)
Integrate[x_ * (b1_ + x_)^-1 * (b2_ + x_)^-1, x_] :=
  (-b1/(b2 - b1)) * Log[b1 + x] + (b2/(b2 - b1)) * Log[b2 + x] /;
    FreeQ[{b1, b2}, x] && b1 != b2;
Integrate[x_ * ((b1_ + x_) * (b2_ + x_))^-1, x_] :=
  (-b1/(b2 - b1)) * Log[b1 + x] + (b2/(b2 - b1)) * Log[b2 + x] /;
    FreeQ[{b1, b2}, x] && b1 != b2;

(* repeated linear factor: p is squared, q is simple *)
intRep2[p_, q_, x_] :=
  (Log[q + x] - Log[p + x]) * (1/(q - p)^2) - 1/((q - p)*(p + x));
Integrate[(p_ + x_)^-2 * (q_ + x_)^-1, x_] :=
  intRep2[p, q, x] /; FreeQ[{p, q}, x] && p != q;
Integrate[(q_ + x_)^-1 * (p_ + x_)^-2, x_] :=
  intRep2[p, q, x] /; FreeQ[{p, q}, x] && p != q;
Integrate[((q_ + x_) * (p_ + x_)^2)^-1, x_] :=
  intRep2[p, q, x] /; FreeQ[{p, q}, x] && p != q;
Integrate[((p_ + x_)^2 * (q_ + x_))^-1, x_] :=
  intRep2[p, q, x] /; FreeQ[{p, q}, x] && p != q;

(* quadratic denominators with rational roots: factor through the
   discriminant when it is a perfect square, then recurse into the
   linear-factor rules; x/(c + x^2) integrates directly to a Log *)
isq[n_] := If[IntegerQ[Sqrt[n]], Sqrt[n], -1];
sqDiscQ[b_, c_] :=
  IntegerQ[b^2 - 4*c] && b^2 - 4*c > 0 && isq[b^2 - 4*c] >= 0;
quadFac[b_, c_, num_, x_] :=
  Module[{s, r1, r2}, s = isq[b^2 - 4*c];
    r1 = (-b - s)/2; r2 = (-b + s)/2;
    Integrate[num * (x - r1)^-1 * (x - r2)^-1, x]];
Integrate[(c_ + x_^2 + b_ * x_)^-1, x_] :=
  quadFac[b, c, 1, x] /; FreeQ[{b, c}, x] && sqDiscQ[b, c];
Integrate[(c_ + x_^2 + x_)^-1, x_] :=
  quadFac[1, c, 1, x] /; FreeQ[c, x] && sqDiscQ[1, c];
Integrate[(c_ + x_^2)^-1, x_] :=
  quadFac[0, c, 1, x] /; FreeQ[c, x] && sqDiscQ[0, c];
Integrate[x_ * (c_ + x_^2 + b_ * x_)^-1, x_] :=
  quadFac[b, c, x, x] /; FreeQ[{b, c}, x] && sqDiscQ[b, c];
Integrate[x_ * (c_ + x_^2 + x_)^-1, x_] :=
  quadFac[1, c, x, x] /; FreeQ[c, x] && sqDiscQ[1, c];
Integrate[x_ * (c_ + x_^2)^-1, x_] := Log[c + x^2] * (1/2) /; FreeQ[c, x];
Integrate[(c_ + x_^2 + b_ * x_)^-1, x_] :=
  -1/(x + b/2) /; FreeQ[{b, c}, x] && b^2 - 4*c == 0;

(* square roots and inverse tangent *)
Sqrt[x_] := x^(1/2);
D[ArcTan[u_], x_] := D[u, x] / (1 + u^2);
ArcTan[0] = 0; ArcTan[1] = Pi/4;

(* irreducible quadratics complete the square into an ArcTan *)
Integrate[(c_ + x_^2)^-1, x_] :=
  ArcTan[x * (1/Sqrt[c])] * (1/Sqrt[c]) /; FreeQ[c, x] && c > 0;
Integrate[(c_ + x_^2 + b_ * x_)^-1, x_] :=
  2 * ArcTan[(2*x + b) * (1/Sqrt[4*c - b^2])] * (1/Sqrt[4*c - b^2]) /;
    FreeQ[{b, c}, x] && b^2 - 4*c < 0;
Integrate[(c_ + x_^2 + x_)^-1, x_] :=
  2 * ArcTan[(2*x + 1) * (1/Sqrt[4*c - 1])] * (1/Sqrt[4*c - 1]) /;
    FreeQ[c, x] && 1 - 4*c < 0;
Integrate[x_ * (c_ + x_^2 + b_ * x_)^-1, x_] :=
  Log[c + b*x + x^2] * (1/2) - (b/2) * Integrate[(c + x^2 + b*x)^-1, x] /;
    FreeQ[{b, c}, x] && b^2 - 4*c < 0;
Integrate[x_ * (c_ + x_^2 + x_)^-1, x_] :=
  Log[c + x + x^2] * (1/2) - (1/2) * Integrate[(c + x^2 + x)^-1, x] /;
    FreeQ[c, x] && 1 - 4*c < 0;

(* fall back to expanding the integrand, retrying once it changes *)
Integrate[e_, x_] := Integrate[Expand[e], x] /; !(e === Expand[e]);

(* coefficient extraction over the expanded form *)
Coefficient[e_, x_, n_] := coefSum[Expand[e], x, n];
coefSum[a_ + r__, x_, n_] := coefSum[a, x, n] + coefSum[Plus[r], x, n];
coefSum[t_, x_, n_] := coefFree[t * x^(-1 * n), x];
coefFree[u_, x_] := u /; FreeQ[u, x];
coefFree[u_, x_] := 0;

(* Exponent and Collect over the expanded form *)
Exponent[e_, x_] := expTop[Expand[e], x];
expTop[a_ + r__, x_] := Max[expTop[a, x], expTop[Plus[r], x]];
expTop[t_, x_] := 0 /; FreeQ[t, x];
expTop[x_, x_] := 1;
expTop[x_^n_, x_] := n;
expTop[c_ * r__, x_] := expTop[Times[r], x] /; FreeQ[c, x];
expTop[t_, x_] := 1;
Collect[e_, x_] :=
  Total[Table[Coefficient[e, x, n] * x^n, {n, 0, Exponent[e, x]}]];

(* Together: combine sums of fractions over a common denominator *)
num[r_Rational] := Numerator[r];
den[r_Rational] := Denominator[r];
num[t_ * r__] := num[t] * num[Times[r]];
den[t_ * r__] := den[t] * den[Times[r]];
num[Power[b_, n_]] := 1 /; NumberQ[n] && n < 0;
den[Power[b_, n_]] := b^(0 - n) /; NumberQ[n] && n < 0;
num[t_] := t;
den[t_] := 1;
Together[a_ + r__] := togAdd[Together[a], Together[Plus[r]]];
Together[e_] := e;
togAdd[p_, q_] := togFrac[num[p]*den[q] + num[q]*den[p], den[p]*den[q]];
togFrac[n_, 1] := n;
togFrac[n_, d_] := Expand[n] / d;

(* protection *)
SetAttributes[Protect, HoldAll];
Protect[f_] := SetAttributes[f, Protected];
SetAttributes[Unprotect, HoldAll];
Unprotect[f_] := ClearAttributes[f, Protected];

(* list utilities *)
GroupBy[l_, f_] :=
  Fold[Function[{acc, e},
    Association[acc, f[e] -> Append[Lookup[acc, f[e], {}], e]]], <||>, l];
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

(* messages as state: raised message names accumulate in $MessageList;
   Quiet scopes it, Check watches it *)
$MessageList = {};
SetAttributes[Message, HoldFirst];
Message[name_, args___] :=
  ($MessageList = Append[$MessageList, HoldForm[name]]; Null);
SetAttributes[Quiet, HoldAll];
Quiet[e_] :=
  Module[{saved, r}, saved = $MessageList; r = e; $MessageList = saved; r];
SetAttributes[Check, HoldAll];
Check[e_, f_] :=
  Module[{n, r}, n = Length[$MessageList]; r = e;
    If[Length[$MessageList] > n, f, r]];

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
