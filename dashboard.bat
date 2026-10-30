@echo off
rem Honour NEMONS_PORT: the daemon resolves its port from the environment,
rem then config\daemon.yml, then 3456. A hardcoded 3456 opened the wrong page
rem whenever the port had been moved.
set "PORT=%NEMONS_PORT%"
if "%PORT%"=="" set "PORT=3456"
start http://localhost:%PORT%
