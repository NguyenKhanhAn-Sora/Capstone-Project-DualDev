# Cordigram Mobile

This app is configured to connect to the existing Cordigram backend.

## Quick Start (Android Phone via USB)

1. Start backend:

	npm run start:dev

2. Connect phone with USB and verify it is visible:

	flutter devices

3. Reverse backend port to the phone:

	adb reverse tcp:9999 tcp:9999

	If adb is not recognized, run:

	C:\Users\admin\AppData\Local\Android\Sdk\platform-tools\adb.exe reverse tcp:9999 tcp:9999

4. Run app with API base URL:

	flutter run --dart-define=API_BASE_URL=http://localhost:9999

## Phone Setup Required

1. Enable Developer options.
2. Enable USB debugging.
3. Allow USB debugging permission when prompted on phone.
4. Keep the USB cable connected during development.

## Notes

1. API base URL is read from dart-define key API_BASE_URL.
2. Default base URL is http://localhost:9999 for USB reverse workflow.
3. Android cleartext HTTP is enabled in main manifest for local development.
