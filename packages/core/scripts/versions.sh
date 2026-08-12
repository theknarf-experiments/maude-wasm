# Versions and download locations for all C/C++ sources.
# shellcheck disable=SC2034

# Maude 3.5 is the newest release that ships a `make dist` tarball with a
# pre-generated ./configure (3.5.1 only publishes binaries + git snapshots,
# which would require autoreconf).
MAUDE_VERSION="3.5"
MAUDE_URL="https://github.com/maude-lang/Maude/releases/download/Maude3.5/Maude-${MAUDE_VERSION}.tar.gz"
MAUDE_DIR="maude-${MAUDE_VERSION}"

GMP_VERSION="6.3.0"
GMP_URL="https://gmplib.org/download/gmp/gmp-${GMP_VERSION}.tar.xz"
GMP_DIR="gmp-${GMP_VERSION}"

# Host (build-machine) tool: Maude's parser needs bison >= 3, and macOS
# ships 2.3. Built natively, not with emscripten.
BISON_VERSION="3.8.2"
BISON_URL="https://ftp.gnu.org/gnu/bison/bison-${BISON_VERSION}.tar.xz"
BISON_DIR="bison-${BISON_VERSION}"

BUDDY_VERSION="2.4"
BUDDY_URL="https://github.com/utwente-fmt/buddy/releases/download/v${BUDDY_VERSION}/buddy-${BUDDY_VERSION}.tar.gz"
BUDDY_DIR="buddy-${BUDDY_VERSION}"
