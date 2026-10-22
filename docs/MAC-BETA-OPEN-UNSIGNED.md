# Opening Rough Cut on a Mac (beta)

> Draft for the download page. Not published.

Rough Cut for Mac is a free beta, tested by the community. It is not signed with a paid Apple developer account, so the first time you open it macOS says it "cannot check it for malicious software". That is expected. You only have to do this once.

**Which file?** Apple chip (M1, M2, M3, M4 and newer): `mac-arm64`. Older Intel Mac: `mac-x64`. Not sure? Apple menu > About This Mac: "Chip: Apple" means arm64.

## Install

1. Open the `.dmg` and drag **Rough Cut** onto **Applications**.
2. Open Rough Cut from Applications. macOS blocks it the first time. Click **Done** (or **OK**).
3. Open **System Settings > Privacy & Security**, scroll down to the message about Rough Cut and click **Open Anyway**. Confirm with your password or Touch ID.
4. Rough Cut opens. From now on it opens normally.

On macOS 14 and older you can instead right-click (or Control-click) Rough Cut in Applications, choose **Open**, then **Open** again.

## Permissions for recording

The first time you record, macOS asks for each thing Rough Cut needs. Click **Allow**:

- **Screen Recording** (required). After allowing it, quit Rough Cut and open it again; macOS only applies this after a restart of the app.
- **Microphone** and **Camera**, if you record them.
- **Accessibility** (optional). Lets Rough Cut see your clicks, so auto-zoom can follow them. Without it, recording still works.

If you clicked "Don't Allow" by mistake: System Settings > Privacy & Security > Screen Recording (or Microphone, Camera), turn **Rough Cut** on, then reopen Rough Cut. Rough Cut also tells you this in the recorder.

**After each update** macOS may ask for these permissions again, because the beta is not signed with a fixed Apple identity. If recording shows a black screen after updating, turn Rough Cut off and on again under Screen Recording.

## What works in the beta

- Recording the main display, microphone and camera; editing; export.
- Recording what the Mac plays (system audio) needs a free audio loopback driver such as BlackHole; it then appears as a system-audio source.
- Captions transcription runs on the Mac's processor: it works, but slower than on a PC with an Nvidia card.
- Not yet: choosing a second display, automatic updates.

Found a problem? Please report it on GitHub Issues with your Mac model and macOS version.

## For people comfortable with Terminal

Instead of steps 2-3 you can remove the download quarantine flag:

```
xattr -dr com.apple.quarantine "/Applications/Rough Cut.app"
```
