# ================================================================
#  VRChat Dashboard - Build Installer
#  Right-click -> "Run with PowerShell"
#
#  Kept for old habits: the real build script is BUILD-INSTALLER.ps1.
#  (This file used to carry its own copy of the build, with an old console launcher inside.)
# ================================================================

$build = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "BUILD-INSTALLER.ps1"
& $build
