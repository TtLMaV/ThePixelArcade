@echo off
setlocal

REM Converts Question.csv (in this same folder, unless you drag-and-drop a
REM different file onto this .bat) into questions.ts, ready to drop into
REM your scene's src folder.
REM
REM Usage:
REM   - Double-click this file to convert Question.csv -> questions.ts
REM   - Or drag a different .csv file onto this .bat to convert that one
REM   - Or run from a command prompt: convert-questions.bat MyFile.csv Out.ts

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on this machine.
    echo Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)

set "INPUT=%~1"
if "%INPUT%"=="" set "INPUT=Question.csv"

set "OUTPUT=%~2"
if "%OUTPUT%"=="" set "OUTPUT=questions.ts"

node "%~dp0convert-questions.js" "%INPUT%" "%OUTPUT%"

if errorlevel 1 (
    echo.
    echo Conversion failed - see the error above.
    pause
    exit /b 1
)

echo Done. Copy %OUTPUT% into your scene's src folder to update the game's question bank.
pause
