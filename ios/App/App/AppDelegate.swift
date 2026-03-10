import UIKit
import UserNotifications
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif
import Capacitor
import HealthKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    let healthKitManager = HealthKitManager()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.

        // Set UNUserNotificationCenter delegate and request authorization
        UNUserNotificationCenter.current().delegate = self
        NotificationManager.shared.requestNotificationAuthorization { granted in
            DispatchQueue.main.async {
                if granted {
                    application.registerForRemoteNotifications()
                }
            }
            #if DEBUG
            print("[Push] Notification permission granted: \(granted)")
            #endif
        }

        // Configure Firebase and Notifications (if Firebase is available)
        #if canImport(FirebaseCore)
        NotificationManager.shared.configureFirebaseAndNotifications(application: application)
        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = NotificationManager.shared
        #endif
        #else
        // Fallback: configure notifications without Firebase (if your NotificationManager supports it)
        // If not, you can safely remove this call or implement a non-Firebase path in NotificationManager.
        #if DEBUG
        print("[Push] Firebase not available at compile time. Skipping Firebase configuration.")
        #endif
        #endif

        // MARK: - HealthKit initialization placeholder
        // HealthKit permissions can be triggered from JS via a plugin.
        // Optionally prepare HealthKit here if desired on launch:
        // healthKitManager.prepareIfAvailable()

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // APNs device token received, FCM/APNs mapping handled by NotificationManager
        #if canImport(FirebaseCore)
        NotificationManager.shared.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
        #else
        #if DEBUG
        print("[Push] Firebase not available. Device token received but Firebase messaging is not configured.")
        #endif
        #endif
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // APNs registration failed, NotificationManager handles reporting
        #if canImport(FirebaseCore)
        NotificationManager.shared.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
        #else
        #if DEBUG
        print("[Push] Failed to register for remote notifications: \(error)")
        #endif
        #endif
    }

    // Handle background/silent remote notifications
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable : Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        #if DEBUG
        print("[Push] didReceiveRemoteNotification (background): \(userInfo)")
        #endif
        #if canImport(FirebaseCore)
        // Forward to your NotificationManager if it coordinates FCM/APNs payload handling
        if NotificationManager.shared.application?(application, didReceiveRemoteNotification: userInfo, fetchCompletionHandler: completionHandler) == true {
            return
        }
        #endif
        // Perform minimal background work here if needed.
        completionHandler(.noData)
    }

    // MARK: - UNUserNotificationCenterDelegate
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Show banner/sound/badge while app is in foreground
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        // Handle notification tap/open here if needed, then call completion
        completionHandler()
    }

    // MARK: - HealthKit (placeholder)
    // HealthKit permissions and usage can be triggered via JS through a plugin.
}

