'use strict'

/**
 * No-op custom sign function for electron-builder (Windows target).
 *
 * electron-builder 24.x downloads the `winCodeSign` binary archive before it
 * checks whether a code-signing certificate is actually available.  That archive
 * contains macOS `.dylib` symlinks; extracting those on a non-admin Windows
 * machine (without Developer Mode / SeCreateSymbolicLinkPrivilege) causes 7-Zip
 * to exit with code 2, which electron-builder treats as a fatal error.
 *
 * Two-layer defence:
 *
 *   1. `build.win.sign` (this file) – when `cscInfo` is null (no certificate),
 *      electron-builder calls `windowsCodeSign.sign()` only because a custom
 *      sign function is set.  As long as that function is a no-op, no tool is
 *      downloaded.  However, if module resolution fails at runtime (e.g. a CWD
 *      mismatch inside electron-builder), it falls back to the built-in `doSign`
 *      which downloads winCodeSign.
 *
 *   2. `build.win.signingHashAlgorithms: []` – the sign loop in
 *      `windowsCodeSign.sign()` iterates over the hash list; an empty array
 *      means the loop body (and therefore any executor, including `doSign`)
 *      is never entered, making the winCodeSign download impossible regardless
 *      of certificate state or module-resolution outcome.
 *
 * Together the two options provide a belt-and-suspenders guarantee that the app
 * is left unsigned without triggering the problematic archive extraction.
 *
 * Code signing can be re-enabled later by replacing this file with a real
 * signing implementation, providing a certificate via WIN_CSC_LINK / CSC_LINK,
 * and removing (or restoring) the `signingHashAlgorithms` override.
 */

/**
 * @param {object} _config  Sign configuration passed by electron-builder.
 * @returns {Promise<void>}
 */
module.exports = async function winSign(_config) {
  // No-op: skip code signing intentionally.
}
