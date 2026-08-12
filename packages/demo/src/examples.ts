export interface Example {
  name: string;
  code: string;
}

export const examples: Example[] = [
  {
    name: "Arithmetic in NAT",
    code: `reduce in NAT : 3 * 4 + 1 .
reduce in NAT : 2 ^ 10 .
reduce in NAT : gcd(120, 84) .`,
  },
  {
    name: "Peano naturals",
    code: `fmod PEANO is
  sort Nat .
  op zero : -> Nat [ctor] .
  op s_ : Nat -> Nat [ctor] .
  op _plus_ : Nat Nat -> Nat .
  op _times_ : Nat Nat -> Nat .
  vars N M : Nat .
  eq zero plus N = N .
  eq (s N) plus M = s (N plus M) .
  eq zero times N = zero .
  eq (s N) times M = M plus (N times M) .
endfm

reduce (s s s zero) times (s s zero) .`,
  },
  {
    name: "Vending machine (search)",
    code: `mod VENDING-MACHINE is
  sorts Coin Item Marking .
  subsorts Coin Item < Marking .
  op __ : Marking Marking -> Marking [assoc comm id: null] .
  op null : -> Marking .
  ops $ q : -> Coin [ctor] .
  ops apple cake : -> Item [ctor] .
  rl [buy-cake]  : $ => cake .
  rl [buy-apple] : $ => apple q .
  rl [change]    : q q q q => $ .
endm

search $ q q q =>! apple cake M:Marking .`,
  },
  {
    name: "Sorting by rewriting",
    code: `mod SORTING is
  protecting NAT .
  sort List .
  subsort Nat < List .
  op nil : -> List [ctor] .
  op __ : List List -> List [ctor assoc id: nil] .
  vars I J : Nat .
  crl [swap] : I J => J I if J < I .
endm

rewrite 4 3 7 1 5 0 .`,
  },
  {
    name: "LTL model checking",
    code: `load model-checker

mod TRAFFIC is
  including MODEL-CHECKER .
  ops green yellow red : -> State [ctor] .
  rl green => yellow .
  rl yellow => red .
  rl red => green .
  op is-green : -> Prop [ctor] .
  var S : State .
  eq green |= is-green = true .
  eq S |= is-green = false [owise] .
endm

*** holds: the light is always eventually green
reduce modelCheck(green, [] <> is-green) .

*** fails, with a counterexample trace
reduce modelCheck(green, [] is-green) .`,
  },
  {
    name: "Unification & variants",
    code: `unify in NAT : X:Nat + 1 =? Y:Nat + 2 .

fmod EXCL is
  sort E .
  ops a b c : -> E [ctor] .
  op f : E -> E .
  eq f(a) = a [variant] .
endfm

get variants f(X:E) .`,
  },
  {
    name: "Meta-level",
    code: `reduce in META-LEVEL :
  metaReduce(upModule('NAT, false), '_+_['s_^3['0.Zero], 's_^4['0.Zero]]) .`,
  },
];
