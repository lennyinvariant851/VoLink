# Contributing to VoLink

Thanks for helping improve Windows cellular modem support.

## Before opening an issue

- Search existing issues first.
- Include the modem model, firmware, Windows version and driver version.
- Remove IMEI, IMSI, ICCID, phone numbers, activation codes, tokens and passwords from screenshots and logs.
- For detection problems, include the friendly names of the Windows Modem and COM ports.

## Development

```powershell
npm install
npm run typecheck
npm run dev
```

Keep hardware operations behind the preload IPC bridge. Do not enable Node integration in the renderer. New AT commands should validate user input and use the existing exclusive serial-session flow.

## Pull requests

1. Keep each pull request focused.
2. Explain the hardware and workflow tested.
3. Run `npm run typecheck` and `npm run build`.
4. Never commit modem identifiers, SIM credentials or notification secrets.
