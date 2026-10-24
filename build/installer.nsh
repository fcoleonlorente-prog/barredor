; Nexo necesita la ruta del ejecutable en el registro, no la del ICO.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
!macroend
