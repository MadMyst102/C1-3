@echo off
echo Starting Cashier Management System...

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed! Please install Node.js from https://nodejs.org/
    pause
    exit /b
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing client dependencies...
    call npm install
)

if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server
    call npm install
    cd ..
)

:: Initialize database
cd server
call npm run init-db
cd ..

:: Start both servers
echo Starting servers...
start cmd /k "cd server && npm run dev"
timeout /t 5
start cmd /k "npm run dev"

echo.
echo Application is starting...
echo You can access it at http://localhost:5173
echo.
echo Press any key to close all servers...
pause

:: Kill all Node.js processes
taskkill /F /IM node.exe >nul 2>&1
