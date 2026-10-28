# Home Screen widgets

Version 2.2.8 includes six matching, horizontal widgets on iPhone and Android: quotes, your hearts, both people's totals and last-sent times, today's hearts, the together timer, and streak/lives. Both people's values are side by side. iPhone uses the wide medium Home Screen size. Android requests four columns by two rows and can resize horizontally.

## iPhone with Sideloadly

1. Load the updated complete IPA in Sideloadly. Keep **Remove App Extensions (Plug-ins)** unchecked; if individual extensions are listed, keep **AsechkaWidgets**.
2. Install over the existing app with the same Apple ID and bundle ID. The embedded widget needs its own valid signature/profile as part of this installation.
3. Open Asechka once. Open **Messages → Our home-screen widgets**. The page checks whether the actual extension is present and whether shared widget data is available. Tap **Refresh widgets**.
4. Long-press the Home Screen, choose **Edit → Add Widget**, search **Asechka**, and add a wide widget.

Personal widget counts require the app and extension to share the same provisioned App Group, `group.app.asechka.shared`. The app and extension also recognize a renamed version of that group listed in their own provisioning profiles. If the signer removes the permission entirely, the app reports the missing shared-data access. Apple currently lists App Groups as available to free developer accounts as well; the signer still needs to provision and retain the matching permission on both targets. Keeping an extension and granting shared-data access are separate requirements.

The IPA packaging step preserves the app's requested shared-data permission in preparation signatures; the resulting IPA still requires Apple-ID signing in Sideloadly before installation. Source changes cannot force a signing tool to retain extensions or add a capability that its provisioning profile does not allow. No paid service or credentials are embedded in the IPA.

## Android

Install the updated APK, open the app once, and sync. Long-press the Home Screen, choose **Widgets → Asechka**, and add any of the six wide widgets. The widgets use the app's encrypted offline snapshots. Updates and resize broadcasts keep the receiver alive until the saved snapshot has reached the system widget manager.

## Refresh and offline behavior

Saved content remains available without a connection. Together timers use native system timers. Other refreshes are scheduled by the operating system; minute-by-minute background refresh is not guaranteed. Open the app and refresh to collect new content. Widgets show the saved timestamp so old data remains identifiable.

## Validation

Android passed 33 actual widget-host assertions, including all six providers, side-by-side counters, saved updates reaching the host, and compact-height layouts. The existing 21 feature assertions passed on Android 6 and Android 15; five release-update assertions passed while preserving saved data and the original signing identity.

The latest iPhone run passed 17 unit tests and six existing screen journeys. Earlier runs displayed all six choices in the real system picker and added a widget, but the complete new Home Screen automation has not passed. The latest failure was a missing search result on a fresh simulator; the test now dismisses the keyboard introduction and waits up to 60 seconds for registration while refreshing its search. That test change has not been rerun. Physical Sideloadly installation remains unverified. There is no new 2.2.8 IPA from that failed run.

IPA packaging verifies the embedded arm64 executable, WidgetKit extension metadata, matching versions, archive integrity, and matching requested App Group permissions. In-app preview screenshots alone are not considered proof of system widget registration.

## Manual builds and runner use

The **Native Android and iPhone apps** workflow only runs when manually started. Source pushes do not start it. Choose `iphone`, `android`, or `both`; the default is iPhone only. Compilation, signing checks, and package validation always run for the selected platform. The optional **full_checks** input also runs the backend suite and, when iPhone is selected, the simulator suite including the real Home Screen test. It is off by default to avoid repeating simulator runs for packaging-only changes. Each native job has a 15-minute limit. Test screenshots/logs are kept for three days; duplicate result archives, recordings, and the extra delivery-mirroring job have been removed.

Download completed packages directly from the run's **Artifacts** section. A failed or billing-blocked run is not a new release; do not use an old delivery-branch status as evidence that a build is still running. No further cloud build was launched after the runner-limit failure. For a Mac build without GitHub runner use, see `ios/BUILDING.md`.

References: [Sideloadly extension options](https://sideloadly.io/), [Apple widget extension setup](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension), [Apple App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups), [Android widget sizes](https://developer.android.com/develop/ui/views/appwidgets/layouts).
