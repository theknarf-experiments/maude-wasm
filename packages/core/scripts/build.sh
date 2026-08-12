#!/usr/bin/env bash
# Cross-compile Maude and its dependencies to WebAssembly with Emscripten.
# Requires emcc on PATH (see mise.toml at the repo root); fetches sources
# automatically if third_party/ is missing.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=versions.sh
source scripts/versions.sh

if [ -f dist/maude.wasm ] && [ "${FORCE:-0}" != "1" ]; then
  echo "dist/maude.wasm already built - use 'pnpm rebuild-wasm' (FORCE=1) to rebuild"
  exit 0
fi

command -v emcc >/dev/null || { echo "error: emcc not found - run 'mise install' and retry" >&2; exit 1; }
[ -d third_party ] || scripts/fetch-sources.sh

ROOT="$(pwd)"
PREFIX="$ROOT/build/prefix"
JOBS="$(getconf _NPROCESSORS_ONLN)"
mkdir -p build dist "$PREFIX"

# ---------------------------------------------------------------- host tools
# Built natively (not with emscripten): bison >= 3 for Maude's grammar,
# and m4/autoconf/automake to regenerate ./configure from the git
# snapshot (Maude 3.5.1 publishes no dist tarball).
HOSTTOOLS="$ROOT/build/hosttools"
export PATH="$HOSTTOOLS/bin:$PATH"

build_host_tool() {
  local name="$1" dir="$2" check="$3"
  if [ ! -x "$HOSTTOOLS/bin/$check" ]; then
    echo "=== building host $name ==="
    rm -rf "build/$name" && cp -Rp "third_party/$dir" "build/$name"
    (
      cd "build/$name"
      ./configure --prefix="$HOSTTOOLS" >/dev/null
      make -j"$JOBS" >/dev/null
      make install >/dev/null
    )
  fi
}

build_host_tool bison    "$BISON_DIR"    bison
build_host_tool m4       "$M4_DIR"       m4
build_host_tool autoconf "$AUTOCONF_DIR" autoconf
build_host_tool automake "$AUTOMAKE_DIR" automake

# ---------------------------------------------------------------- GMP
# Generic C limbs (no assembly) build; Maude needs the C++ bindings (gmpxx).
if [ ! -f "$PREFIX/lib/libgmp.a" ]; then
  echo "=== building GMP $GMP_VERSION ==="
  rm -rf build/gmp && cp -R "third_party/$GMP_DIR" build/gmp
  (
    cd build/gmp
    emconfigure ./configure \
      --host=none \
      --disable-assembly \
      --disable-shared \
      --enable-cxx \
      --prefix="$PREFIX" \
      CC_FOR_BUILD=cc HOST_CC=cc
    emmake make -j"$JOBS"
    emmake make install
  )
fi

# ---------------------------------------------------------------- BuDDy
# The 2.4 tarball's config.sub predates wasm, so give it a dummy host
# triple; emconfigure overrides the actual compilers anyway.
if [ ! -f "$PREFIX/lib/libbdd.a" ]; then
  echo "=== building BuDDy $BUDDY_VERSION ==="
  rm -rf build/buddy && cp -R "third_party/$BUDDY_DIR" build/buddy
  (
    cd build/buddy
    emconfigure ./configure \
      --host=i686-pc-linux-gnu \
      --disable-shared \
      --prefix="$PREFIX" \
      CFLAGS="-O2" CXXFLAGS="-O2" LDFLAGS="-lm"
    emmake make -j"$JOBS" -C src
    emmake make -C src install
  )
fi

# ---------------------------------------------------------------- Maude
echo "=== building Maude $MAUDE_VERSION ==="
rm -rf build/maude && cp -Rp "third_party/$MAUDE_DIR" build/maude

# Git snapshots ship no ./configure; generate it with the host autotools.
if [ ! -f build/maude/configure ]; then
  (cd build/maude && autoreconf -i >/dev/null)
fi

# Embed the standard library (prelude.maude and friends) into the wasm
# binary at the virtual filesystem root; the wrapper sets MAUDE_LIB=/ so
# Maude finds them without any separate data download.
EMBED_FLAGS=""
for f in build/maude/src/Main/*.maude; do
  EMBED_FLAGS="$EMBED_FLAGS --embed-file $ROOT/$f@/$(basename "$f")"
done

EM_LINK_FLAGS="\
 -Oz\
 -sMODULARIZE=1\
 -sEXPORT_ES6=1\
 -sEXPORT_NAME=createMaudeModule\
 -sALLOW_MEMORY_GROWTH=1\
 -sSTACK_SIZE=16MB\
 -sINVOKE_RUN=0\
 -sEXIT_RUNTIME=1\
 -sEXPORTED_RUNTIME_METHODS=callMain,FS,ENV\
 -sENVIRONMENT=web,worker,node\
 $EMBED_FLAGS"

# Notes:
# - Yices2 (SMT) defaults to on and must be disabled explicitly.
# - CFLAGS/CXXFLAGS must be set: if unset, Maude's configure injects
#   -fforce-addr, which emcc (clang) rejects.
# - Maude uses no C++ exceptions, so Emscripten's default
#   -sDISABLE_EXCEPTION_CATCHING is fine.
# - The Emscripten -s/--embed-file flags must NOT be in configure's
#   LDFLAGS: emconfigure runs its test links with NODERAWFS, which
#   conflicts with --embed-file. They are injected via a relink pass
#   after the main build instead.
(
  cd build/maude
  emconfigure ./configure \
    --host=wasm32-unknown-emscripten \
    --with-yices2=no \
    --with-cvc4=no \
    --with-tecla=no \
    --with-libsigsegv=no \
    CPPFLAGS="-I$PREFIX/include" \
    CFLAGS="-Oz -fno-stack-protector" \
    CXXFLAGS="-Oz -fno-stack-protector" \
    LDFLAGS="-L$PREFIX/lib" \
    GMP_LIBS="$PREFIX/lib/libgmpxx.a $PREFIX/lib/libgmp.a" \
    BUDDY_LIB="$PREFIX/lib/libbdd.a"
  emmake make -j"$JOBS"
  # Relink the maude executable with the wasm module settings.
  rm -f src/Main/maude src/Main/maude.js src/Main/maude.wasm
  emmake make -C src/Main maude LDFLAGS="-L$PREFIX/lib $EM_LINK_FLAGS"
)

# The link step names its output after the executable ("maude"): a JS
# loader plus maude.wasm next to it.
MAIN_DIR="build/maude/src/Main"
if [ -f "$MAIN_DIR/maude.js" ]; then cp "$MAIN_DIR/maude.js" dist/maude.mjs; else cp "$MAIN_DIR/maude" dist/maude.mjs; fi
cp "$MAIN_DIR/maude.wasm" dist/maude.wasm
cp dist-types/maude.d.ts dist/maude.d.ts

echo "=== done: $(du -h dist/maude.wasm | cut -f1) wasm binary in packages/core/dist ==="
