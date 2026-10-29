# 📱 GetMyShow Gate Scanner Terminal & PWA

> High-speed camera QR pass validator and gate entry management terminal for GetMyShow events in Bihar.

## Features
- **Instant Camera Reticle**: High-FPS hardware camera scanning via `html5-qrcode`.
- **Audio Feedback**: Web Audio API double-beep for valid passes, triple-buzz for rejected/duplicate passes.
- **Double-Entry Prevention**: Cryptographic HMAC signature check + database verification to eliminate duplicate scans.
- **Torch Toggle**: Hardware flashlight for night concerts and dark venue gates.
- **Manual Entry Fallback**: Alphanumeric keypad entry for scratched or cracked phone screens.
- **PWA Ready**: Installable to Android and iOS home screens ("Add to Home Screen").

## Live Production
- **Vercel**: https://getmyshow-scan.vercel.app
- **Main Platform**: https://getmyshow-nine.vercel.app
