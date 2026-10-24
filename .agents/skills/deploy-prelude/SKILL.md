---
name: deploy-prelude
description: Install or update the Prelude new-tab extension in a user's existing Windows Chrome profile, or Edge when explicitly requested, using the official release preparation entry and UI Automation with real new-tab verification.
---

# Deploy Prelude

This is the public Prelude adaptation of the maintainer's browser-deployment skill. It needs local Windows PowerShell and Windows UI Automation (UIA); it does not assume access to private helper files, authenticated APIs or a separate browser profile.

## Scope and identity

- Use Chrome by default. Add Edge only when the user explicitly names it or both browsers. Keep each browser's profile and extension directory independent.
- Reuse the intended running browser profile and existing windows. Identify the executable (`chrome.exe` or `msedge.exe`) and visible profile label through the interface. Multiple plausible profiles need a user choice before installation.
- For an update, first locate the installed Prelude extension and its existing unpacked directory from the browser UI, previous deployment record or a user-supplied path. Keep that path: changing an unpacked path can change its extension ID and lose access to its existing settings. Do not create a duplicate extension to avoid finding the existing installation.
- Do not read browser profile files, cookies, credentials or browser storage; do not change policies, kill/restart the browser, inject shared input, move/confine the desktop cursor, or use a temporary/headless browser as installation evidence.

## Prepare an official package

Read the repository's `AGENTS.md` and [Windows UIA and capture reference](references/windows-browser.md). Run `scripts/prepare-install.ps1` from the project or downloaded release package. With no source argument it downloads the official release and verifies its published SHA-256. Use `-Browser Edge` only within the user's Edge request. Pass `-InstallDirectory` for an existing unpacked installation.

For an explicitly requested local development build, run the project's documented build first and pass `-SourceDirectory` pointing to its `dist`. `-DryRun` validates without writing the extension directory or touching a browser.

Parse the single JSON result. `needs-ui` means files are ready but the extension is not yet verified as installed. `prepared` with `dryRun:true` means validation only. `failed` is a preparation error; fix its stated cause. Keep the permanent source directory available after installation. Do not select a ZIP in the browser's folder picker.

## Complete installation through the real interface

1. Bind UIA to the verified Chrome/Edge window. Record foreground and keyboard-focus state before the first action. Prefer direct UIA Invoke/Toggle/Value/SelectionItem actions. A successful UIA call can still activate the browser; inspect what changed and do not force focus back and forth.
2. Open `chrome://extensions/` or `edge://extensions/` in that same profile using supported browser controls. An existing extensions tab can be reused. Do not replace the user's ordinary page or start a second profile to make automation easier.
3. Enable Developer mode only if disabled. Find Load unpacked by its current localized label or `loadUnpacked` identifier and invoke it.
4. In the actual native folder picker, set and read back the exact prepared path. Verify that the picker navigated into the intended folder, refresh UIA, then invoke Select Folder. Windows folder redirection can change the visible location; verify the actual displayed destination instead of assuming a path entry was accepted. Do not create a second copied source tree to work around a picker.
5. On an update, scope the Reload control to Prelude's extension card. Locate its name and stop at the next card's name; a shared items-list ancestor can select another extension's reload button. Keep the observed extension ID unchanged and verify the updated version.
6. Check that Prelude is enabled and has no load error. Open a genuine new tab through the browser's New Tab button. Prelude uses new-tab navigation, so a normal extension URL in the address bar is expected. Confirm the page's Pinned group and Settings control in the selected UI language.
7. Capture that real surface using WGC first and the screenshot-extension fallback only when applicable, as described in the reference. Verify usable pixels, current window identity and the resulting page. File preparation, a manifest parse or an extension card alone does not prove deployment complete.

Native consent or personal authentication is completed by the user. If no usable UIA action or capture backend is available, report the exact remaining step and keep the result `needs-ui`; do not substitute SendInput, cursor movement, global shortcuts, profile-file editing or browser policy installation.

## Completion

Record the browser/profile label, extension name/version/ID, permanent unpacked path, package source and verified checksum, and the real new-tab evidence. Distinguish preparation, installed/enabled and page verification. Preserve the user's existing cards and settings. Report any step that needed browser foreground or user confirmation, and leave the verified page open unless the user requested cleanup.


