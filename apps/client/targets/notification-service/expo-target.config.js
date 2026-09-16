/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "notification-service",
  name: "ClaireNotificationService",
  displayName: "Claire Notifications",
  bundleIdentifier: ".notification-service",
  deploymentTarget: "15.0",
  frameworks: ["Intents", "UserNotifications"],
  entitlements: {
    "com.apple.developer.siri": true,
    "com.apple.developer.usernotifications.communication": true,
  },
});
