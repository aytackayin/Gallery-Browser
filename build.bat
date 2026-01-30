@echo off
set CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC_PATH%" set CSC_PATH=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe

echo GalleryLauncher.exe derleniyor...
"%CSC_PATH%" /target:winexe /out:GalleryLauncher.exe /reference:System.Windows.Forms.dll,System.Drawing.dll Launcher.cs
echo Bitti!
