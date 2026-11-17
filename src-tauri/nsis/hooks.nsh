!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog '"$INSTDIR\glacier-dock.exe" --restore-taskbar'
!macroend
