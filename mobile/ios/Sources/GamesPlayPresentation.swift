import SwiftUI
import UIKit

/// UIKit asks the actual full-screen controller which orientations it supports.
/// A child SwiftUI view's geometry request cannot set that presentation policy.
struct GamesPlayPresentation: UIViewControllerRepresentable {
    @ObservedObject var store: GamesStore
    var universe: UniverseStore

    func makeUIViewController(context: Context) -> GamesPresenterController {
        GamesPresenterController()
    }

    func updateUIViewController(_ controller: GamesPresenterController, context: Context) {
        controller.configure(store: store, universe: universe)
    }

    static func dismantleUIViewController(_ controller: GamesPresenterController, coordinator: ()) {
        controller.tearDown()
    }
}

final class GamesPresenterController: UIViewController {
    private var store: GamesStore?
    private var universe: UniverseStore?
    private var game: GamesPlayHostingController?
    private var transitioning = false

    override func loadView() {
        view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        synchronize()
    }

    func configure(store: GamesStore, universe: UniverseStore) {
        self.store = store
        self.universe = universe
        DispatchQueue.main.async { [weak self] in self?.synchronize() }
    }

    private func synchronize() {
        guard !transitioning else { return }
        if let store, let universe, let room = store.selectedRoom, room.status != "lobby" {
            if let game {
                game.updateOrientation()
                return
            }
            guard viewIfLoaded?.window != nil else { return }
            let screen = GamesPlayHostingController(store: store, universe: universe)
            game = screen
            transitioning = true
            present(screen, animated: true) { [weak self] in
                self?.transitioning = false
                self?.synchronize()
            }
        } else if let screen = game {
            close(screen, animated: true)
        }
    }

    private func close(_ screen: GamesPlayHostingController, animated: Bool) {
        let scene = screen.viewIfLoaded?.window?.windowScene
        transitioning = true
        screen.dismiss(animated: animated) { [weak self] in
            self?.game = nil
            self?.transitioning = false
            if let scene {
                let root = scene.windows.first(where: { !$0.isHidden && $0.windowLevel == .normal })?.rootViewController
                root?.setNeedsUpdateOfSupportedInterfaceOrientations()
                scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
            }
            self?.synchronize()
        }
    }

    func tearDown() {
        store = nil
        universe = nil
        if let game { close(game, animated: false) }
    }
}

final class GamesPlayHostingController: UIHostingController<AnyView> {
    private let store: GamesStore
    private var appliedOrientation: UIInterfaceOrientationMask?
    private var pool: Bool { store.selectedRoom?.kind == .pool }

    init(store: GamesStore, universe: UniverseStore) {
        self.store = store
        super.init(rootView: AnyView(GamesPlayView(store: store)
            .environmentObject(universe)
            .font(.custom("DMSans-Regular", size: 15))
            .buttonStyle(SoftPress())
            .preferredColorScheme(.light)))
        modalPresentationStyle = .fullScreen
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(store:universe:)") }
    deinit { NotificationCenter.default.removeObserver(self) }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { pool ? .landscape : .portrait }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { pool ? .landscapeRight : .portrait }
    override var shouldAutorotate: Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        updateOrientation(force: true)
    }

    @objc private func becameActive() { updateOrientation(force: true) }

    func updateOrientation(force: Bool = false) {
        let mask = supportedInterfaceOrientations
        guard force || appliedOrientation != mask else { return }
        guard let scene = viewIfLoaded?.window?.windowScene, scene.activationState == .foregroundActive else { return }
        appliedOrientation = mask
        setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
            #if DEBUG
            print("Game controller orientation: \(error.localizedDescription)")
            #endif
        }
    }
}
