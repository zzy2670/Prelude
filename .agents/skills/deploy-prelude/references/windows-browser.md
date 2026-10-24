# Windows UI Automation and page capture

## Available capabilities

PowerShell can load `UIAutomationClient` and `UIAutomationTypes` on supported Windows systems. The skill's [read-only inspector](../scripts/inspect-browser.ps1) lists actual browser windows and, for an explicitly selected HWND, its accessible controls. It does not navigate, type, click, move a cursor or change focus.

```powershell
powershell.exe -NoProfile -File .\.agents\skills\deploy-prelude\scripts\inspect-browser.ps1 -Browser Chrome
powershell.exe -NoProfile -File .\.agents\skills\deploy-prelude\scripts\inspect-browser.ps1 -Browser Chrome -Hwnd 123456
```

Replace the example HWND with the exact value returned by the first command. For an explicit Edge deployment, use `-Browser Edge`. Do not select a window solely by its position or by an old screenshot.

Use UIA controls from a fresh tree. InvokePattern, TogglePattern, ValuePattern, SelectionItemPattern and ExpandCollapsePattern are distinct; check `GetSupportedPatterns()` before calling one. Chrome toolbar buttons do not always expose InvokePattern. A button receiving focus is not a verified click.

On the extensions page, common IDs are `devMode`, `loadUnpacked`, `name`, `dev-reload-button`, and `enableToggle`. Treat these as hints and check localized names and current state. In a folder picker, the folder edit may be ID `1152` and the Select Folder button ID `1`; ID `1` can also identify a folder item, so scope by button role, name and native handle. Refresh the UIA tree after folder navigation.

For direct actions, bind `AutomationElement.FromHandle` to the verified window and find the specific control. Read supported patterns, then use the applicable pattern. Do not broadcast native messages. A targeted native control message is a last resort only for a known native Edit/Button HWND with a verified message contract, not a substitute for page interaction or shared keyboard input.

## Input isolation

Prefer a supported page-local accessibility action when it reaches the actual page without changing desktop focus. Otherwise use direct UIA. Read foreground and keyboard-focus identity before and after representative actions. The physical pointer may move because the human is working; that does not mean a semantic action moved it. Do not claim input isolation from a tool's name alone.

`SendInput`, `keybd_event`, `mouse_event`, `SetCursorPos`, cursor clipping and global hotkeys share the desktop's input. They are not a private virtual mouse and are not used by this workflow. UIA may itself bring a browser or native picker forward; finish the necessary modal through its verified controls, and report the actual focus behavior.

## Visual backend order

1. **Windows Graphics Capture (WGC).** Use an installed, documented WGC-capable tool or adapter in the current environment. Target only the exact verified browser top-level HWND. Disable cursor capture and the capture border when the backend supports it. Record window/process identity, time, PNG path and byte count. Verify a fresh usable frame and unchanged foreground. A minimized/non-rendering window, timeout, wrong window or blank/stale image is failure.
2. **Browser `captureVisibleTab()` fallback.** After a recorded WGC failure, an available screenshot extension may capture the active tab's visible viewport. A minimal helper requires `activeTab` plus a supported delivery route such as `downloads`, invoked through a genuine browser/UIA action. It does not capture the browser toolbar or hidden content. If no isolated action reaches its toolbar control, a user invocation may be needed. Do not grant broad host, cookie, history or native-messaging access merely to bypass invocation requirements.

WGC is a Windows API, not a built-in PowerShell screenshot command. Neither a WGC adapter nor a screenshot extension is presumed to exist. Discover actual environment capabilities; do not invent a helper path or treat `captureVisibleTab()` as callable from arbitrary page JavaScript. If neither backend can provide current pixels, retain `needs-ui` and identify the remaining visual verification step.

Visible pixels do not guarantee interaction with every drawn element. Combine the screenshot with current UIA roles, names, states and bounds. Never mark the new-tab behavior verified solely because its source files exist.

