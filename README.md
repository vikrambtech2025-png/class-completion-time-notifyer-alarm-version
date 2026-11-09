# Class Completion Time Notifyer (Alarm Version)

[![React Native](https://img.shields.io/badge/React_Native-0.78-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo SDK](https://img.shields.io/badge/Expo_SDK-52.0-000000?logo=expo&logoColor=white)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Android Compatible](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white)](https://www.android.com/)

A mobile application designed for college students and faculty to automate period transition alerts using an authentic **school bell buzzer sound**. The application displays daily schedules in a clear **12-hour (AM/PM) format**, manages recurring exact hardware alarms, and includes a real-time period editor for dynamic timetable adjustments.

---

## 🌟 Key Features

- 🔔 **School Bell Buzzer Sound**: Plays a realistic metallic school bell tone (`buzzer.wav`) at the exact start of every class period.
- ⏰ **Hardware Alarm Integration**: Schedules high-priority system alarms (`RTC_WAKEUP`) with DND (Do Not Disturb) bypass and custom vibration patterns via Android Notification Channels (`period-alarms-v3`).
- 🕒 **12-Hour Clock Format**: Automatically formats all period start/end timings into normal 12-hour AM/PM times across the main view and editor.
- 📝 **Dynamic Period Editor Modal**: Allows users to edit period titles, adjust start/end times, and add or delete periods on demand.
- 🔄 **Instant Auto-Rescheduling**: Recalculates and re-registers all hardware alarms instantly upon saving timetable modifications.
- 📱 **Mobile Responsive Layout**: Optimized UI designed for smooth scrolling and responsive card components across Android smartphones.

---

## 📅 Default Timetable Schedule

The app comes pre-configured with a standard 6-day (Monday to Saturday) timetable containing 7 daily periods:

| Period | Standard Hours | 12-Hour Clock Display |
| :---: | :---: | :---: |
| **P1** | `09:00 - 09:45` | `9:00 AM - 9:45 AM` |
| **P2** | `09:45 - 10:30` | `9:45 AM - 10:30 AM` |
| **P3** | `10:50 - 11:35` | `10:50 AM - 11:35 AM` |
| **P4** | `11:40 - 12:25` | `11:40 AM - 12:25 PM` |
| **P5** | `13:20 - 14:05` | `1:20 PM - 2:05 PM` |
| **P6** | `14:15 - 15:00` | `2:15 PM - 3:00 PM` |
| **P7** | `15:20 - 16:05` | `3:20 PM - 4:05 PM` |

---

## 🏗️ Project Architecture

```
class-completion-time-notifyer-alarm-version/
├── App.js                   # Main application entry point, UI & notification scheduling
├── app.json                 # Expo project configuration & permission specifications
├── timetable.json           # Timetable data structure (6 days x 7 periods)
├── assets/
│   ├── buzzer.wav           # School bell buzzer sound asset (44.1kHz PCM)
│   ├── icon.png             # Application icon
│   └── splash-icon.png      # Application splash screen image
└── android/                 # Native Android project files (Generated via Expo prebuild)
```

---

## 🛠️ Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **bun**
- **Android SDK** & **Java Development Kit (JDK 17)** (for local builds)
- **ADB (Android Debug Bridge)** (for physical device testing)

### Installation & Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/vikrambtech2025-png/class-completion-time-notifyer-alarm-version.git
   cd class-completion-time-notifyer-alarm-version
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Prebuild Native Projects:**
   ```bash
   npx expo prebuild --platform android
   ```

4. **Build Standalone Release APK:**
   ```bash
   cd android
   .\gradlew.bat assembleRelease --offline
   ```
   *The generated APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.*

---

## 🔔 Android Permissions & Troubleshooting

To ensure exact alarm ringing:
1. **Notification Permission**: Grant notification access when prompted, or run:
   ```bash
   adb shell pm grant com.periodtimer.test android.permission.POST_NOTIFICATIONS
   ```
2. **Notification Volume**: Ensure your phone's **Notification Volume** slider is turned up in Android Settings.

---

## 📜 License

This project is open-source and available under the [MIT License](LICENSE).
