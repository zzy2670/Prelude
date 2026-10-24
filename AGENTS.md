# Deploy Prelude

## Public edition scope

This repository is the web-only public edition. It supports webpage cards and `.url` Internet Shortcuts. It does not include Native Messaging, local-script execution or desktop-workbench launchers. Preserve that scope in source, permissions, deployment scripts, tests and release archives. Build and verify releases from this repository; do not replace it with a different local edition.

When asked to deploy this project, follow the public project skill at [.agents/skills/deploy-prelude/SKILL.md](.agents/skills/deploy-prelude/SKILL.md). It is a project-specific adaptation of the maintainer's Windows browser-deployment workflow and is self-contained.

Use the user's real, existing Chrome profile by default. Deploy to Edge only when the user explicitly asks for Edge or both browsers. Installation requires an agent with local Windows PowerShell and Windows UI Automation access. Preserve existing tabs, extension IDs and browser-profile data.

## Prepare the extension

From the repository or a release package containing the deployment entry:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-install.ps1
```

This resolves the official `zzy2670/Prelude` release, downloads the browser-specific archive and checksum file, verifies them, and prepares a persistent unpacked directory. For a local development build, explicitly pass `-SourceDirectory .\dist`. For an existing installation, pass its verified unpacked directory with `-InstallDirectory` so its extension ID and data are retained.

The script prepares files; the skill then completes installation or reload through the actual browser interface and verifies a genuine new tab. If only the GitHub URL is available, read this file and the linked skill from the official repository, save its `scripts/prepare-install.ps1`, and run the saved script.

## Result contract

- `status: "needs-ui"`, `prepared: true`, `installed: false`: files are in the reported persistent directory; continue with UIA installation or reload. This is not installation success.
- `status: "prepared"`, `dryRun: true`, `materialized: false`: validation-only dry run; no extension directory has been written and no browser action has occurred.
- `status: "failed"`, exit code `1`: read the error, repair that cause, and retry only the affected step.

Report deployment complete only after the intended profile shows the extension enabled and a new tab displays Prelude. Ordinary operating-system consent and personal authentication remain with the user. Do not change browser policies or extract profile files, cookies or credentials.


