# Home Screen widgets

Version 2.2.8 includes six matching, horizontal widgets on iPhone and Android: quotes, your hearts, both people's totals and last-sent times, today's hearts, the together timer, and streak/lives. Both people's values are side by side. iPhone uses the wide medium Home Screen size. Android requests four columns by two rows and can resize horizontally.

## iPhone with Sideloadly

1. Load the updated complete IPA in Sideloadly. Keep **Remove App Extensions (Plug-ins)** unchecked; if individual extensions are listed, keep **AsechkaWidgets**.
2. Install over the existing app with the same Apple ID and bundle ID. The embedded widget needs its own valid signature/profile as part of this installation.
3. Open Asechka once. Open **Messages → Our home-screen widgets**. The page checks whether the actual extension is present and whether shared widget data is available. Tap **Refresh widgets**.
4. Long-press the Home Screen, choose **Edit → Add Widget**, search **Asechka**, and add a wide widget.

Personal widget counts require the app and extension to share the same provisioned App Group, `group.app.asechka.shared`. The app and extension also recognize a renamed version of that group listed in their own provisioning profiles. If the signer removes the permission entirely, the app reports the missing shared-data access. Apple currently lists App Groups as available to free developer accounts as well; the signer still needs to provision and retain the matching permission on both targets. Keeping an extension and granting shared-data access are separate requirements.

The delivered IPA has preparation signatures that preserve the app's requested shared-data permission; it still requires Apple-ID signing in Sideloadly before installation. Source changes cannot force a signing tool to retain extensions or add a capability that its provisioning profile does not allow. No paid service or credentials are embedded in the IPA.

## Android

Install the updated APK, open the app once, and sync. Long-press the Home Screen, choose **Widgets → Asechka**, and add any of the six wide widgets. The widgets use the app's encrypted offline snapshots. Updates and resize broadcasts keep the receiver alive until the saved snapshot has reached the system widget manager.

## Refresh and offline behavior

Saved content remains available without a connection. Together timers use native system timers. Other refreshes are scheduled by the operating system; minute-by-minute background refresh is not guaranteed. Open the app and refresh to collect new content. Widgets show the saved timestamp so old data remains identifiable.

## Validation

The iPhone suite checks the installed extension, app/extension versions, horizontal counter content, and the actual Home Screen widget picker and add flow. IPA delivery also checks the embedded arm64 executable and WidgetKit extension metadata. Android instrumentation binds all six actual providers to a native `AppWidgetHost`, checks the wide footprint and side-by-side counts, and verifies a saved change reaches the hosted widget. In-app preview screenshots alone are not considered widget registration tests.

References: [Sideloadly extension options](https://sideloadly.io/), [Apple widget extension setup](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension), [Apple App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups), [Android widget sizes](https://developer.android.com/develop/ui/views/appwidgets/layouts).
