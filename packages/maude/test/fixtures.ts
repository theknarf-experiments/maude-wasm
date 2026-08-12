export const VENDING = `
mod VENDING is
  sorts Coin Item Marking .
  subsorts Coin Item < Marking .
  op __ : Marking Marking -> Marking [assoc comm id: null] .
  op null : -> Marking .
  ops $ q : -> Coin [ctor] .
  ops apple cake : -> Item [ctor] .
  rl [buy-cake] : $ => cake .
  rl [buy-apple] : $ => apple q .
  rl [change] : q q q q => $ .
endm
`;

export const EXCL = `
fmod EXCL is
  sort E .
  ops a b c : -> E [ctor] .
  op f : E -> E .
  eq f(a) = a [variant] .
endfm
`;
