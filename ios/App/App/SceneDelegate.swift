import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        // If the window is managed by Capacitor or storyboard, nothing else is needed here.
        // This ensures compatibility with Capacitor's hosting of the web view.
        if window == nil {
            window = UIWindow(windowScene: windowScene)
            // If you use storyboards, this will be replaced by the storyboard's initial VC automatically.
            // Leaving window creation here is safe for apps that don't use storyboards.
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) { }
    func sceneWillResignActive(_ scene: UIScene) { }
    func sceneWillEnterForeground(_ scene: UIScene) { }
    func sceneDidEnterBackground(_ scene: UIScene) { }
}
