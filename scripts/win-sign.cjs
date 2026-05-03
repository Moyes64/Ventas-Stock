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
 * Setting `build.win.sign` to this file tells electron-builder to invoke our
 * custom function instead of entering the built-in signing path.  The built-in
 * path is the one that downloads `winCodeSign`, so pointing `sign` here
 * bypasses the download entirely without requiring any OS-level privileges.
 *
 * The app is intentionally left unsigned.  Code signing can be re-enabled later
 * by replacing this file with a real signing implementation and providing a
 * certificate via WIN_CSC_LINK / CSC_LINK.
 */

/**
 * @param {object} _config  Sign configuration passed by electron-builder.
 * @returns {Promise<void>}
 */
module.exports = async function winSign(_config) {
  // No-op: skip code signing intentionally.
}
