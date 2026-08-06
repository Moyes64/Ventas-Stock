@echo off
:: Reset para produccion — Ventas-Stock

setlocal
cd /d "%~dp0"

set ELECTRON_CMD=node_modules\.bin\electron.cmd

if not exist "%ELECTRON_CMD%" (
  echo.
  echo ERROR: No se encontro electron en node_modules.
  echo Asegurate de ejecutar este .bat desde la carpeta del proyecto: C:\Users\gguti\Ventas-Stock
  echo.
  pause
  exit /b 1
)

echo.
echo === RESET PARA PRODUCCION - Ventas-Stock ===
echo.
echo Se abrira una ventana de confirmacion. Lee bien antes de aceptar.
echo.

"%ELECTRON_CMD%" scripts\reset-produccion.cjs

echo.
echo Script finalizado.
pause
