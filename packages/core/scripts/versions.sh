# Versions and download locations for all C/C++ sources.
# shellcheck disable=SC2034

# Maude 3.5.1 publishes no dist tarball, only the git tag snapshot, so
# the build runs autoreconf with the host autotools below.
MAUDE_VERSION="3.5.1"
MAUDE_URL="https://github.com/maude-lang/Maude/archive/refs/tags/Maude${MAUDE_VERSION}.tar.gz"
MAUDE_DIR="Maude-Maude${MAUDE_VERSION}"

GMP_VERSION="6.3.0"
GMP_URL="https://gmplib.org/download/gmp/gmp-${GMP_VERSION}.tar.xz"
GMP_DIR="gmp-${GMP_VERSION}"

BUDDY_VERSION="2.4"
BUDDY_URL="https://github.com/utwente-fmt/buddy/releases/download/v${BUDDY_VERSION}/buddy-${BUDDY_VERSION}.tar.gz"
BUDDY_DIR="buddy-${BUDDY_VERSION}"

# Host (build-machine) tools, built natively rather than with emscripten:
# bison >= 3 for Maude's grammar (macOS ships 2.3), and m4 + autoconf +
# automake to regenerate ./configure from the git snapshot.
BISON_VERSION="3.8.2"
BISON_URL="https://ftp.gnu.org/gnu/bison/bison-${BISON_VERSION}.tar.xz"
BISON_DIR="bison-${BISON_VERSION}"

M4_VERSION="1.4.19"
M4_URL="https://ftp.gnu.org/gnu/m4/m4-${M4_VERSION}.tar.xz"
M4_DIR="m4-${M4_VERSION}"

AUTOCONF_VERSION="2.72"
AUTOCONF_URL="https://ftp.gnu.org/gnu/autoconf/autoconf-${AUTOCONF_VERSION}.tar.xz"
AUTOCONF_DIR="autoconf-${AUTOCONF_VERSION}"

AUTOMAKE_VERSION="1.17"
AUTOMAKE_URL="https://ftp.gnu.org/gnu/automake/automake-${AUTOMAKE_VERSION}.tar.xz"
AUTOMAKE_DIR="automake-${AUTOMAKE_VERSION}"
