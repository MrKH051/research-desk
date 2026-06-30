@echo off
title Research Desk - Server
cd /d "%~dp0"
echo Stopping any old server instance...
taskkill /F /IM node.exe >nul 2>&1
echo.
echo Starting Research Desk server... (keep this window open while you record)
echo Dashboard: http://localhost:3000
echo.
call npm start
echo.
echo The server has stopped. Press any key to close this window.
pause >nul
