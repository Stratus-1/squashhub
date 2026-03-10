import Foundation
import UIKit
import UserNotifications
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

final class NotificationManager: NSObject {
    static let shared = NotificationManager()
    private override init() { super.init() }

    func configureFirebaseAndNotifications(application: UIApplication) {
        // Configure UNUserNotificationCenter delegate
        UNUserNotificationCenter.current().delegate = application.delegate as? UNUserNotificationCenterDelegate

        #if canImport(FirebaseCore)
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = self
        application.registerForRemoteNotifications()
        #endif
        #else
        // Even without Firebase, we can still register for APNs if desired
        application.registerForRemoteNotifications()
        #endif
    }

    func requestNotificationAuthorization(completion: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            #if DEBUG
            if let error = error { print("[Push] Authorization error: \(error)") }
            #endif
            DispatchQueue.main.async { completion(granted) }
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if canImport(FirebaseMessaging)
        // Forward the APNs token to Firebase Messaging
        Messaging.messaging().apnsToken = deviceToken
        #else
        #if DEBUG
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("[Push] APNs device token: \(tokenString)")
        #endif
        #endif
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("[Push] Failed to register for remote notifications: \(error)")
        #endif
    }
}

#if canImport(FirebaseMessaging)
extension NotificationManager: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        #if DEBUG
        print("[Push] Firebase Messaging FCM token: \(fcmToken ?? "nil")")
        #endif
    }
}
#endif
