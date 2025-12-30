; Aether IDE Custom Installer Script
; WebXExpert - Rajesh Kumar

!macro customInstall
  ; Create Chrome Extension instructions file
  CreateDirectory "$INSTDIR\Chrome Extension"

  FileOpen $0 "$INSTDIR\Chrome Extension\HOW_TO_INSTALL.txt" w
  FileWrite $0 "Aether IDE - Chrome Extension Installation$\r$\n"
  FileWrite $0 "===========================================$\r$\n$\r$\n"
  FileWrite $0 "The Chrome extension files are located at:$\r$\n"
  FileWrite $0 "$INSTDIR\resources\chrome-extension$\r$\n$\r$\n"
  FileWrite $0 "To install the Chrome extension:$\r$\n$\r$\n"
  FileWrite $0 "1. Open Chrome and go to: chrome://extensions/$\r$\n"
  FileWrite $0 "2. Enable 'Developer mode' (toggle in top right)$\r$\n"
  FileWrite $0 "3. Click 'Load unpacked'$\r$\n"
  FileWrite $0 "4. Navigate to: $INSTDIR\resources\chrome-extension$\r$\n"
  FileWrite $0 "5. Click 'Select Folder'$\r$\n$\r$\n"
  FileWrite $0 "The extension will now appear in your Chrome toolbar.$\r$\n"
  FileClose $0

  ; Open the instructions file after install
  ExecShell "open" "$INSTDIR\Chrome Extension\HOW_TO_INSTALL.txt"
!macroend

!macro customUnInstall
  ; Clean up Chrome Extension folder
  RMDir /r "$INSTDIR\Chrome Extension"
!macroend
