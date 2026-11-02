import SwiftUI
import AVFoundation
import UIKit

struct FilmShot: Decodable, Identifiable {
    let id: String; let actor: String; let createdAt: String
    var caption: String?; var reactions: [String:String]?
}
struct FilmRoll: Decodable, Identifiable {
    let id: String; let title: String; let actor: String; let createdAt: String
    let developedAt: String?; let shots: [FilmShot]
}
struct FilmCollection: Decodable { let rolls: [FilmRoll]; let writable: Bool }

struct FilmView: View {
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.dismiss) private var dismiss
    @State private var rolls: [FilmRoll] = []
    @State private var writable = false
    @State private var busy = false
    @State private var title = ""
    @State private var message = "Connecting our shared camera…"
    @State private var camera = false
    @State private var album: FilmRoll?
    @State private var pending: Data?
    @State private var createID = UUID().uuidString.lowercased()
    @State private var discard = false
    private var current: FilmRoll? { rolls.first { $0.developedAt == nil } }
    var body: some View {
        NavigationStack {
            ScrollView { VStack(alignment: .leading, spacing: 22) {
                Text("24 moments.\nA little surprise.").font(.custom("Manrope-Bold", size: 33))
                Text("One camera for both of us. No previews. No retakes. Keep a little of your day for each other.").foregroundColor(Palette.muted)
                cameraCard
                Text(message).font(.subheadline).foregroundColor(Palette.purple).accessibilityIdentifier("film-status")
                if pending != nil {
                    Button("Retry saving our sealed shot") { Task { await retry() } }.primary().disabled(busy)
                    Button("Discard unsent shot", role: .destructive) { discard = true }.disabled(busy)
                }
                Text("OUR DEVELOPED ROLLS").font(.caption.weight(.semibold)).tracking(2).foregroundColor(Palette.purple)
                if rolls.allSatisfy({ $0.developedAt == nil }) { Text("Your first developed roll will live here.").foregroundColor(Palette.muted) }
                ForEach(rolls.reversed().filter { $0.developedAt != nil }) { roll in
                    Button { album = roll; Touch.tap() } label: {
                        HStack { VStack(alignment: .leading, spacing: 7) { Text(roll.title).font(.headline); Text("24 moments · " + String((roll.developedAt ?? "").prefix(10))).font(.caption).foregroundColor(Palette.muted) }; Spacer(); Image(systemName: "arrow.up.right") }.foregroundColor(Palette.ink).card()
                    }.buttonStyle(.plain)
                }
            }.padding(22) }.background(Palette.background)
            .navigationTitle("Our disposable camera").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }; ToolbarItem(placement: .primaryAction) { Button { Task { await refresh() } } label: { Image(systemName: "arrow.clockwise") }.disabled(busy).accessibilityLabel("Refresh camera") } }
        }
        .sheet(isPresented: $camera) {
            NavigationStack {
                NativeFilmCamera { bytes, caption in
                    camera = false
                    Task { await capture(bytes, caption: caption) }
                }
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Keep this moment")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { camera = false } } }
            }
        }
        .sheet(item: $album) { FilmAlbumView(roll: $0, changed: { await refresh() }) }
        .confirmationDialog("Discard this unsent shot? A saved server copy, if any, stays on the roll.", isPresented: $discard, titleVisibility: .visible) { Button("Discard local copy", role: .destructive) { universe.vault.remove("film-pending"); pending = nil; Task { await refresh() } }; Button("Keep it", role: .cancel) {} }
        .task {
            pending = universe.vault.read("film-pending")
            await refresh()
            while !Task.isCancelled { do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }; await refresh() }
        }
    }
    private var cameraCard: some View {
        VStack(spacing: 18) {
            HStack { Text("ASECHKA / 24").font(.caption.weight(.bold)).tracking(2); Spacer(); Circle().fill(Color(red: 0.7, green: 0.4, blue: 0.55)).frame(width: 10, height: 10) }
            HStack {
                Image(systemName: "viewfinder").font(.system(size: 36)).foregroundColor(Palette.purple)
                Spacer()
                ZStack { Circle().fill(Color(red: 0.31, green: 0.27, blue: 0.37)).frame(width: 128, height: 128); Circle().stroke(Color.white.opacity(0.15), lineWidth: 12).frame(width: 95, height: 95); Image(systemName: "sparkle").font(.system(size: 34)).foregroundColor(Palette.lavender) }
                Spacer()
                VStack { Text("LEFT").font(.caption2); Text(String(format: "%02d", 24 - (current?.shots.count ?? 0))).font(.system(size: 28, weight: .medium, design: .monospaced)) }.padding(10).background(Palette.ink, in: RoundedRectangle(cornerRadius: 10)).foregroundColor(.white)
            }
            Text(current?.title ?? "Our next little adventure").font(.title3.weight(.semibold))
            if let roll = current {
                Text("\(roll.shots.count) of 24 · Asnat \(roll.shots.filter { $0.actor == "asnat" }.count) · Youssef \(roll.shots.filter { $0.actor == "youssef" }.count)").font(.caption).foregroundColor(Palette.muted)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 6) { ForEach(0..<24, id: \.self) { index in Text(index < roll.shots.count ? "♡" : String(index + 1)).font(.caption2).frame(maxWidth: .infinity, minHeight: 29).background(index < roll.shots.count ? Palette.purple : .white.opacity(0.7), in: RoundedRectangle(cornerRadius: 5)).foregroundColor(index < roll.shots.count ? .white : Palette.muted) } }
                if roll.shots.count == 24 {
                    Button("Develop our 24 moments ✦") { Task { await mutate(["action":"develop", "rollId":roll.id, "actor":universe.actor, "operationId":UUID().uuidString.lowercased()]) } }.primary().disabled(busy || !writable)
                } else { Button { camera = true; Touch.tap() } label: { Label("Take a secret photo", systemImage: "camera.fill").frame(maxWidth: .infinity).primary() }.disabled(busy || !writable || pending != nil) }
            } else {
                TextField("Name our next roll", text: $title).textFieldStyle(.roundedBorder)
                Button("Load a fresh roll ↗") { Task { if await mutate(["action":"create", "title":title, "actor":universe.actor, "operationId":createID]) { title = ""; createID = UUID().uuidString.lowercased() } } }.primary().disabled(busy || !writable || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.count > 80 || pending != nil)
            }
            Text("Shooting as \(universe.name). Pictures stay sealed until the roll is full and developed.").font(.caption).foregroundColor(Palette.muted)
        }.padding(22).background(Palette.lavender, in: RoundedRectangle(cornerRadius: 28))
    }
    @MainActor private func refresh() async {
        guard !busy else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--film-preview") {
            let date = "2026-11-02T20:00:00Z"
            let frames = (0..<24).map { FilmShot(id: "fixture-\($0)", actor: $0 % 2 == 0 ? "asnat" : "youssef", createdAt: date, caption: "A little surprise, kept for you. ♡", reactions: ["asnat":"", "youssef":""]) }
            rolls = [FilmRoll(id: "current", title: "Our ordinary November", actor: "asnat", createdAt: date, developedAt: nil, shots: Array(frames.prefix(18))), FilmRoll(id: "album", title: "A weekend in little pieces", actor: "youssef", createdAt: date, developedAt: date, shots: frames)]
            writable = false; message = "Preview · 18 moments kept. Six little surprises left."; return
        }
        #endif
        do { let bytes = try await universe.request("/api/camera"); let collection = try JSONDecoder().decode(FilmCollection.self, from: bytes); rolls = collection.rolls; writable = collection.writable; try? universe.vault.write("film-collection", bytes); if pending == nil { message = "Connected. Our ordinary, extraordinary life. ♡" } }
        catch { if rolls.isEmpty, let saved = universe.vault.read("film-collection"), let collection = try? JSONDecoder().decode(FilmCollection.self, from: saved) { rolls = collection.rolls }; writable = false; message = error.localizedDescription }
    }
    @MainActor @discardableResult private func mutate(_ body: [String:Any]) async -> Bool {
        guard !busy else { return false }; busy = true; defer { busy = false }
        do { let bytes = try await universe.request("/api/camera", body: JSONSerialization.data(withJSONObject: body)); let collection = try JSONDecoder().decode(FilmCollection.self, from: bytes); rolls = collection.rolls; writable = collection.writable; try? universe.vault.write("film-collection", bytes); message = body["action"] as? String == "develop" ? "Developed. Open our roll together below. ♡" : "Saved for both of us. ♡"; Touch.tap(true); return true }
        catch { message = error.localizedDescription; return false }
    }
    @MainActor private func capture(_ bytes: Data, caption: String) async {
        guard let roll = current else { return }
        busy = true
        do { let photo = try await Task.detached { try ComposerView.preparePhoto(bytes) }.value; let body: [String:Any] = ["action":"capture", "rollId":roll.id, "actor":universe.actor, "operationId":UUID().uuidString.lowercased(), "caption":String(caption.prefix(240)), "photo":"data:image/jpeg;base64," + photo.base64EncodedString()]; let encoded = try JSONSerialization.data(withJSONObject: body); try universe.vault.write("film-pending", encoded); pending = encoded; busy = false; await retry() }
        catch { busy = false; message = error.localizedDescription }
    }
    @MainActor private func retry() async {
        guard let pending, let body = (try? JSONSerialization.jsonObject(with: pending)) as? [String:Any] else { return }
        if await mutate(body) { self.pending = nil; universe.vault.remove("film-pending"); message = "A moment kept. You’ll see it when we develop the roll. ♡" }
    }
}

struct FilmAlbumView: View {
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.dismiss) private var dismiss
    let roll: FilmRoll
    var changed: () async -> Void
    @State private var index = 0
    @State private var image: UIImage?
    @State private var message = ""
    @State private var reactions: [String:String] = [:]
    @State private var busy = false
    private var shot: FilmShot { roll.shots[index] }
    var body: some View {
        NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 18) {
            Text("FRAME \(index + 1) / 24").font(.caption.weight(.semibold)).tracking(2).foregroundColor(Palette.purple)
            if let image { Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 16)) } else { ProgressView().frame(maxWidth: .infinity, minHeight: 200) }
            Text("From \(shot.actor == "asnat" ? "Asnat" : "Youssef") · \(String(shot.createdAt.prefix(10)))").font(.caption).foregroundColor(Palette.muted)
            if let caption = shot.caption, !caption.isEmpty { Text(caption).font(.title3) }
            HStack { ForEach(["♡", "😂", "🥹", "✨"], id: \.self) { reaction in Button(reaction) { Task { await react(reaction) } }.font(.title2).frame(minWidth: 48, minHeight: 48).background(reactions[universe.actor] == reaction ? Palette.lavender : .white, in: RoundedRectangle(cornerRadius: 12)).disabled(busy) } }
            Text("Asnat \(reactions["asnat"] ?? "—") · Youssef \(reactions["youssef"] ?? "—")").font(.caption).foregroundColor(Palette.purple)
            if !message.isEmpty { Text(message).font(.caption).foregroundColor(Palette.purple) }
            HStack { Button("← Previous") { index -= 1; Touch.tap() }.disabled(index == 0); Spacer(); Button("Next moment →") { index += 1; Touch.tap() }.disabled(index == 23) }.padding(.vertical, 12)
        }.padding(22) }.background(Palette.background).navigationTitle(roll.title).navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } } }
        .task(id: shot.id) {
            image = nil; reactions = shot.reactions ?? [:]; message = ""
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--film-preview"), let path = Bundle.main.path(forResource: "cats-cuddle", ofType: "jpg", inDirectory: "default") { image = UIImage(contentsOfFile: path); return }
            #endif
            do { let bytes = try await universe.request("/api/camera?photo=" + shot.id); guard !Task.isCancelled else { return }; image = UIImage(data: bytes); try? universe.vault.write("film-photo:" + shot.id, bytes) } catch { if let bytes = universe.vault.read("film-photo:" + shot.id) { image = UIImage(data: bytes) }; message = error.localizedDescription }
        }
    }
    @MainActor private func react(_ reaction: String) async {
        busy = true; defer { busy = false }; let id = shot.id
        do { let body: [String:Any] = ["action":"react", "actor":universe.actor, "rollId":roll.id, "shotId":id, "reaction":reactions[universe.actor] == reaction ? "" : reaction, "operationId":UUID().uuidString.lowercased()]; let bytes = try await universe.request("/api/camera", body: JSONSerialization.data(withJSONObject: body)); let collection = try JSONDecoder().decode(FilmCollection.self, from: bytes); if shot.id == id { reactions = collection.rolls.first { $0.id == roll.id }?.shots.first { $0.id == id }?.reactions ?? [:] }; await changed() } catch { message = error.localizedDescription }
    }
}

struct NativeFilmCamera: UIViewControllerRepresentable {
    var captured: (Data, String) -> Void
    func makeUIViewController(context: Context) -> FilmCaptureController { FilmCaptureController(captured: captured) }
    func updateUIViewController(_ uiViewController: FilmCaptureController, context: Context) {}
}
final class FilmCaptureController: UIViewController, AVCapturePhotoCaptureDelegate {
    let captureSession = AVCaptureSession()
    let output = AVCapturePhotoOutput()
    let queue = DispatchQueue(label: "app.asechka.film-camera")
    let caption = UITextField()
    let shutter = UIButton(type: .system)
    let flip = UIButton(type: .system)
    let status = UILabel()
    var preview: AVCaptureVideoPreviewLayer?
    var captured: (Data, String) -> Void
    var facing: AVCaptureDevice.Position = .back
    var captionAtCapture = ""
    init(captured: @escaping (Data, String) -> Void) { self.captured = captured; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = UIColor(red: 0.12, green: 0.10, blue: 0.16, alpha: 1)
        caption.placeholder = "A note for later · optional"; caption.borderStyle = .roundedRect; caption.backgroundColor = .white; caption.textColor = .black; caption.returnKeyType = .done; caption.accessibilityLabel = "A note for later"
        shutter.setTitle("Keep this moment ●", for: .normal); shutter.backgroundColor = UIColor(red: 0.48, green: 0.38, blue: 0.65, alpha: 1); shutter.setTitleColor(.white, for: .normal); shutter.layer.cornerRadius = 16; shutter.addTarget(self, action: #selector(take), for: .touchUpInside); shutter.isEnabled = false
        flip.setTitle("Flip camera ↻", for: .normal); flip.setTitleColor(.white, for: .normal); flip.addTarget(self, action: #selector(switchCamera), for: .touchUpInside)
        status.text = "No previews. Keep a little surprise."; status.textColor = .white; status.font = .systemFont(ofSize: 13); status.numberOfLines = 0; status.textAlignment = .center
        for item in [caption, shutter, flip, status] { view.addSubview(item) }
        switch AVCaptureDevice.authorizationStatus(for: .video) { case .authorized: start(); case .notDetermined: AVCaptureDevice.requestAccess(for: .video) { allowed in DispatchQueue.main.async { if allowed { self.start() } else { self.status.text = "Allow camera access in Settings to keep a moment." } } }; default: status.text = "Allow camera access in Settings to keep a moment." }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews(); let width = view.bounds.width, bottom = view.bounds.height - view.safeAreaInsets.bottom
        preview?.frame = CGRect(x: 0, y: 0, width: width, height: max(80, bottom - 210))
        caption.frame = CGRect(x: 20, y: bottom - 195, width: width - 40, height: 44)
        shutter.frame = CGRect(x: 20, y: bottom - 137, width: width - 40, height: 52)
        flip.frame = CGRect(x: 20, y: bottom - 79, width: width - 40, height: 40)
        status.frame = CGRect(x: 20, y: bottom - 38, width: width - 40, height: 35)
    }
    func start() {
        let layer = AVCaptureVideoPreviewLayer(session: captureSession); layer.videoGravity = .resizeAspectFill; view.layer.insertSublayer(layer, at: 0); preview = layer; view.setNeedsLayout()
        queue.async { [weak self] in guard let self else { return }; self.configure(); self.captureSession.startRunning() }
    }
    func configure() {
        captureSession.beginConfiguration(); captureSession.sessionPreset = .photo
        for input in captureSession.inputs { captureSession.removeInput(input) }
        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: facing), let input = try? AVCaptureDeviceInput(device: device), captureSession.canAddInput(input) {
            captureSession.addInput(input); if captureSession.outputs.isEmpty && captureSession.canAddOutput(output) { captureSession.addOutput(output) }
            captureSession.commitConfiguration(); DispatchQueue.main.async { self.shutter.isEnabled = true }
        } else { captureSession.commitConfiguration(); DispatchQueue.main.async { self.status.text = "This device doesn’t have an available camera."; self.shutter.isEnabled = false } }
    }
    @objc func take() {
        caption.resignFirstResponder(); captionAtCapture = String((caption.text ?? "").prefix(240)); shutter.isEnabled = false; flip.isEnabled = false
        if let connection = output.connection(with: .video), connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
        output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }
    @objc func switchCamera() { shutter.isEnabled = false; facing = facing == .back ? .front : .back; queue.async { [weak self] in self?.configure() } }
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let bytes = photo.fileDataRepresentation() else { status.text = "Couldn’t capture this frame. Try again."; shutter.isEnabled = true; flip.isEnabled = true; return }
        captured(bytes, captionAtCapture)
    }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); queue.async { [weak self] in self?.captureSession.stopRunning() } }
}
