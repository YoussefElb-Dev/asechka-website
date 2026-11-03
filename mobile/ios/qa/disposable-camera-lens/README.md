# Disposable camera center tap

The middle lens was a decorative SwiftUI ZStack without an action. It is now a
128-point native button that uses the same guarded camera-opening action as
Take a secret photo. The existing appearance and capture/save path are retained.
If saving, disconnected, waiting to upload, missing a roll, or on a full roll,
tapping the lens shows an explanation instead of silently doing nothing.

The focused iPhone UI checks tap the lens at its exact center, verify camera
presentation, cancel and reopen from the existing photo button, and verify an
unavailable connection produces a dismissible explanation. The existing album
journey verifies developed frames remain reachable.

Writable-roll and camera-controls fixtures are restricted to DEBUG builds.
They exercise presentation without taking or uploading a photograph, and do
not test physical camera hardware or permissions. Release builds retain the
normal camera permission and capture behavior.

Version 2.6.2 (27), source `0c9583e15a4084355e182b35b8a0d488d527c1b8`:
33 unit tests and all three camera UI journeys passed in
[the hosted iPhone run](https://github.com/YoussefElb-Dev/asechka-website/actions/runs/41731229127).
The release IPA passed arm64 app/WidgetKit, version and exact Games-resource
checks. The DEBUG capture fixture is absent from the release executable.

`camera-card.png` shows the unchanged card; `center-opens-camera.png` is the
actual presentation after tapping the lens, using the camera-controls fixture;
`developed-roll.png` verifies the existing album remains reachable.
