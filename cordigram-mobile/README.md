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
flutter run --dart-define=API_BASE_URL=https://api.cordigram.com

5. Build apk cordigram-mobile:
tăng version trong pubspec.ya,l lên ở dòng thứ 19
sau đó flutter pub get
sau đó chạy build: flutter build apk --release --build-number=3 --build-name=1.0.2
sau đó push lên github
sau đó tạo release mới trên github với tag là version mới, sau đó đưa file .apk trong build -> app -> ouputs -> flutter-apk vào release rồi lưu lại
sau đó vào render.com sửa lại .env của backend và deploy lại
=> vào app tự động update lên bản mới


## Phone Setup Required

1. Enable Developer options.
2. Enable USB debugging.
3. Allow USB debugging permission when prompted on phone.
4. Keep the USB cable connected during development.

## Notes

1. API base URL is read from dart-define key API_BASE_URL.
2. Default base URL is http://localhost:9999 for USB reverse workflow.
3. Android cleartext HTTP is enabled in main manifest for local development.
