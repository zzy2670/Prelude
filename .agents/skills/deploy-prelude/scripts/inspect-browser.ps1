[CmdletBinding()]
param(
    [ValidateSet('Chrome','Edge')][string]$Browser = 'Chrome',
    [long]$Hwnd = 0,
    [ValidateRange(1,1000)][int]$MaxControls = 350
)

$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PreludeReadOnlyWindowState {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
    $processName = if ($Browser -eq 'Edge') { 'msedge' } else { 'chrome' }
    $desktop = [System.Windows.Automation.AutomationElement]::RootElement
    $children = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    $windows = @()
    $target = $null
    for ($index=0; $index -lt $children.Count; $index++) {
        $element = $children.Item($index)
        try {
            $process = Get-Process -Id $element.Current.ProcessId -ErrorAction Stop
            if ($process.ProcessName -ne $processName -or $element.Current.ClassName -ne 'Chrome_WidgetWin_1') { continue }
            $handle = [long]$element.Current.NativeWindowHandle
            $windows += [ordered]@{ hwnd=$handle; pid=$process.Id; browser=$Browser; title=$element.Current.Name; offscreen=$element.Current.IsOffscreen }
            if ($Hwnd -ne 0 -and $handle -eq $Hwnd) { $target=$element }
        } catch { continue }
    }
    if ($Hwnd -ne 0 -and $null -eq $target) { throw 'The requested HWND is not a current window of the selected browser.' }
    $controls = @()
    if ($null -ne $target) {
        $elements = $target.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        for ($index=0; $index -lt [Math]::Min($elements.Count,$MaxControls); $index++) {
            $element = $elements.Item($index)
            try {
                $controls += [ordered]@{ index=$index; role=$element.Current.ControlType.ProgrammaticName; name=$element.Current.Name; automationId=$element.Current.AutomationId; enabled=$element.Current.IsEnabled; offscreen=$element.Current.IsOffscreen; patterns=@($element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName }) }
            } catch { continue }
        }
    }
    [ordered]@{ status='read-only'; browser=$Browser; foreground=[PreludeReadOnlyWindowState]::GetForegroundWindow().ToInt64(); windows=$windows; inspectedHwnd=$Hwnd; controls=$controls } | ConvertTo-Json -Depth 8 -Compress
} catch {
    [ordered]@{ status='failed'; error=$_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}

