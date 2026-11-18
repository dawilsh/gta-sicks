@echo off
rem Opens a .firebotsetup file in Firebot without needing any file association.
rem
rem Firebot scans its own command line for a path ending in .firebotsetup, both on
rem cold start and when a second instance is launched while it is already running
rem (checkForFirebotSetupPathInArgs). So handing it the path is all that is needed
rem - no registry entries, no "Open with", no menu bar.
rem
rem Usage: double-click it, or drag a .firebotsetup file onto it.
rem        Run with /dry to print what it would do without launching anything.

setlocal enabledelayedexpansion

rem --- /dry may be given on its own or alongside a dropped file
set "DRY="
set "SETUP="
if /i "%~1"=="/dry" (set "DRY=1") else (set "SETUP=%~1")
if /i "%~2"=="/dry" set "DRY=1"

if not defined SETUP (
  set "COUNT=0"
  for %%F in ("%~dp0*.firebotsetup") do (
    set /a COUNT+=1
    set "SETUP=%%~fF"
  )
  if "!COUNT!"=="0" (
    echo No .firebotsetup file found next to this script.
    echo Keep them in the same folder, or drag one onto this file.
    pause
    exit /b 1
  )
  if not "!COUNT!"=="1" (
    echo More than one .firebotsetup here - drag the one you want onto this script.
    pause
    exit /b 1
  )
)

if not exist "!SETUP!" (
  echo Cannot find: !SETUP!
  pause
  exit /b 1
)

rem --- find Firebot. The stub in the Firebot root survives version updates;
rem     fall back to the newest app-* folder if it is missing.
set "EXE=%LOCALAPPDATA%\Firebot\Firebot v5.exe"
if not exist "!EXE!" (
  set "EXE="
  for /f "delims=" %%A in ('dir /b /ad /o-n "%LOCALAPPDATA%\Firebot\app-*" 2^>nul') do (
    if not defined EXE if exist "%LOCALAPPDATA%\Firebot\%%A\Firebot v5.exe" (
      set "EXE=%LOCALAPPDATA%\Firebot\%%A\Firebot v5.exe"
    )
  )
)

if not defined EXE (
  echo Could not find Firebot under %LOCALAPPDATA%\Firebot
  echo.
  echo If Firebot is installed somewhere else, drag the .firebotsetup file onto
  echo your Firebot desktop shortcut instead. That does exactly the same thing.
  pause
  exit /b 1
)

if defined DRY (
  echo Firebot : "!EXE!"
  echo Setup   : "!SETUP!"
  echo.
  echo Would run: "!EXE!" "!SETUP!"
  exit /b 0
)

echo Opening the setup in Firebot...
echo If Firebot is already running it will come to the front with the import dialog.
start "" "!EXE!" "!SETUP!"
exit /b 0
