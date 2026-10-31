import SwiftUI

struct GamesPoolView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.accessibilityReduceMotion) private var systemReduced
    @AppStorage("games.reduceMotion") private var reduced = false
    @State private var angle = 0.0
    @State private var power = 0.65
    @State private var pocket = 0
    @State private var cueX = 250.0
    @State private var cueY = 250.0
    @State private var frames: [GamesPoolFrame] = []
    @State private var balls: [GamesBall] = []
    @State private var playing = false
    @State private var serverBusy = false
    private let pocketNames = ["1 · Top left", "2 · Top middle", "3 · Top right", "4 · Bottom right", "5 · Bottom middle", "6 · Bottom left"]
    private var inHand: Bool { room.state["ballInHand"].bool }
    private var canControl: Bool { store.myTurn(room) && !serverBusy && !playing }
    private var cueValid: Bool {
        guard cueX >= 11, cueX <= 989, cueY >= 11, cueY <= 489 else { return false }
        let pockets = [(0.0, 0.0), (500.0, 0.0), (1000.0, 0.0), (1000.0, 500.0), (500.0, 500.0), (0.0, 500.0)]
        guard !pockets.contains(where: { hypot(cueX - $0.0, cueY - $0.1) <= 28 }) else { return false }
        return !balls.contains { $0.id != 0 && !$0.pocketed && hypot($0.x - cueX, $0.y - cueY) < 22 }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            groups
            table
            if playing || serverBusy { Label(playing ? "Playing the authoritative shot…" : "Balls settling · controls unlock shortly", systemImage: "waveform.path").font(.caption).foregroundColor(GamesPalette.mint) }
            if !room.state["foul"].string.isEmpty { Text("Foul · " + room.state["foul"].string).font(.subheadline).foregroundColor(GamesPalette.rose) }
            if !room.finished {
                if inHand { placementControls }
                else { shotControls }
            }
            pocketedSummary
        }.task(id: "\(room.id)|\(room.seq)|\(reduced)|\(systemReduced)") { await prepareShot() }
    }
    private var groups: some View {
        HStack {
            ForEach(0..<min(2, room.players.count), id: \.self) { index in
                VStack(alignment: .leading, spacing: 3) {
                    Text(Post.name(room.players[index].actor)).font(.subheadline.bold()).foregroundColor(GamesPalette.player(index))
                    Text(room.state["groups"][index].isNull ? "Open table" : room.state["groups"][index].string.capitalized).font(.caption).foregroundColor(GamesPalette.muted)
                }.frame(maxWidth: .infinity, alignment: index == 0 ? .leading : .trailing)
            }
        }
    }
    private var table: some View {
        GeometryReader { geometry in
            TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !playing)) { timeline in
                let visible = playing ? GamesPoolFrame.sample(frames, at: room.poolElapsed(at: timeline.date)) : balls
                GamesPoolCanvas(balls: visible, angle: angle * .pi / 180, aiming: canControl && !inHand, placement: inHand && canControl ? CGPoint(x: cueX, y: cueY) : nil, pocket: pocket)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                guard canControl else { return }
                let point = GamesPoolCanvas.tablePoint(value.location, size: geometry.size)
                if inHand { cueX = min(989, max(11, point.x)); cueY = min(489, max(11, point.y)) }
                else if let cue = balls.first(where: { $0.id == 0 && !$0.pocketed }) {
                    let radians = atan2(point.y - cue.y, point.x - cue.x)
                    angle = (radians * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
                }
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Pool table. \(balls.filter { !$0.pocketed }.count) balls remain. Use the labeled aim, power and placement controls below.")
        }.aspectRatio(1080.0 / 580, contentMode: .fit)
            .background(GamesPalette.surface, in: RoundedRectangle(cornerRadius: 20))
    }
    private var shotControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("Aim").font(.headline); Spacer(); Text("\(Int(angle))°").monospacedDigit() }
            Slider(value: $angle, in: 0...359, step: 1).accessibilityLabel("Shot angle clockwise from right").accessibilityValue("\(Int(angle)) degrees")
            HStack { Text("Power").font(.headline); Spacer(); Text("\(Int(power * 100))%").monospacedDigit() }
            Slider(value: $power, in: 0...1, step: 0.01).accessibilityLabel("Shot power").accessibilityValue("\(Int(power * 100)) percent")
            Picker("Called pocket for the eight", selection: $pocket) { ForEach(0..<6, id: \.self) { Text(pocketNames[$0]).tag($0) } }.pickerStyle(.menu)
            Button {
                store.move(room, ["type": "shot", "angle": .number(angle * .pi / 180), "power": .number(power), "callPocket": .int(pocket)])
            } label: { Label(store.hasPending(room) ? "Sending shot…" : room.state["breakShot"].bool ? "Take the break" : "Take the shot", systemImage: "arrow.up.right").gamesAction() }
                .disabled(!canControl).accessibilityIdentifier("games.pool.shoot")
            Text("Drag on the cloth to aim. Call the eight’s pocket before shooting; pocket numbers run clockwise from the top left.").font(.caption).foregroundColor(GamesPalette.muted)
        }.disabled(!canControl).gamesPanel()
    }
    private var placementControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Ball in hand · place anywhere clear", systemImage: "hand.draw").font(.headline)
            Text("Tap the cloth or adjust X and Y, then confirm.").font(.caption).foregroundColor(GamesPalette.muted)
            Text("X · \(Int(cueX))").font(.caption.monospacedDigit())
            Slider(value: $cueX, in: 11...989, step: 1).accessibilityLabel("Cue ball X position")
            Text("Y · \(Int(cueY))").font(.caption.monospacedDigit())
            Slider(value: $cueY, in: 11...489, step: 1).accessibilityLabel("Cue ball Y position")
            if !cueValid { Text("Choose a spot outside pockets and other balls.").font(.caption).foregroundColor(GamesPalette.rose) }
            Button { store.move(room, ["type": "place", "x": .number(cueX), "y": .number(cueY)]) } label: { Text(store.hasPending(room) ? "Placing cue…" : "Place cue ball here").gamesAction() }.disabled(!canControl || !cueValid)
        }.disabled(!canControl).gamesPanel()
    }
    private var pocketedSummary: some View {
        let ids = room.state["lastShot"]["pocketed"].array.compactMap(\.int)
        return VStack(alignment: .leading, spacing: 5) {
            if !ids.isEmpty { Text("Last shot potted: " + ids.map { $0 == 0 ? "cue" : String($0) }.joined(separator: ", ")).font(.caption).foregroundColor(GamesPalette.muted) }
            if let contact = room.state["lastShot"]["firstContact"].int { Text("First contact · ball \(contact)").font(.caption).foregroundColor(GamesPalette.muted) }
        }
    }
    private func prepareShot() async {
        balls = room.state["balls"].array.compactMap(GamesBall.init)
        frames = GamesPoolFrame.read(room.state["lastShot"])
        let duration = room.state["lastShot"]["duration"].double ?? 0
        let elapsed = room.poolElapsed(at: Date())
        let remaining = max(0, room.availableAt / 1000 - Date().timeIntervalSince1970)
        serverBusy = remaining > 0
        playing = !reduced && !systemReduced && frames.count > 1 && elapsed < duration && remaining > 0
        if remaining > 0 {
            do { try await Task.sleep(nanoseconds: UInt64(min(remaining + 0.05, 30) * 1_000_000_000)) } catch { return }
        }
        guard !Task.isCancelled else { return }
        // Final authoritative ball positions reconcile any respotted eight or cue.
        playing = false; serverBusy = false
    }
}

struct GamesPoolCanvas: View {
    var balls: [GamesBall]
    var angle: Double
    var aiming: Bool
    var placement: CGPoint?
    var pocket: Int
    private static let pockets: [CGPoint] = [CGPoint(x: 0, y: 0), CGPoint(x: 500, y: 0), CGPoint(x: 1000, y: 0), CGPoint(x: 1000, y: 500), CGPoint(x: 500, y: 500), CGPoint(x: 0, y: 500)]
    static func tablePoint(_ point: CGPoint, size: CGSize) -> (x: Double, y: Double) {
        let scale = max(0.001, min(size.width / 1080, size.height / 580))
        return (Double((point.x - (size.width - 1000 * scale) / 2) / scale), Double((point.y - (size.height - 500 * scale) / 2) / scale))
    }
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 1080, size.height / 580)
            var c = context
            c.translateBy(x: (size.width - 1000 * scale) / 2, y: (size.height - 500 * scale) / 2)
            c.scaleBy(x: scale, y: scale)
            let rail = CGRect(x: -30, y: -30, width: 1060, height: 560)
            c.fill(Path(roundedRect: rail, cornerRadius: 35), with: .linearGradient(Gradient(colors: [Color(red: 0.24, green: 0.17, blue: 0.29), Color(red: 0.12, green: 0.11, blue: 0.2)]), startPoint: .zero, endPoint: CGPoint(x: 1000, y: 500)))
            c.fill(Path(CGRect(x: 0, y: 0, width: 1000, height: 500)), with: .linearGradient(Gradient(colors: [Color(red: 0.05, green: 0.28, blue: 0.27), Color(red: 0.025, green: 0.15, blue: 0.18)]), startPoint: .zero, endPoint: CGPoint(x: 1000, y: 500)))
            for (index, point) in Self.pockets.enumerated() {
                c.fill(Path(ellipseIn: CGRect(x: point.x - 28, y: point.y - 28, width: 56, height: 56)), with: .color(GamesPalette.background))
                let offset: CGFloat = point.y == 0 ? -24 : 24
                c.draw(Text("\(index + 1)").font(.system(size: 17, weight: .bold)).foregroundColor(index == pocket ? GamesPalette.rose : .white.opacity(0.6)), at: CGPoint(x: point.x, y: point.y + offset))
                if index == pocket { c.stroke(Path(ellipseIn: CGRect(x: point.x - 30, y: point.y - 30, width: 60, height: 60)), with: .color(GamesPalette.rose), lineWidth: 3) }
            }
            if aiming, let cue = balls.first(where: { $0.id == 0 && !$0.pocketed }) {
                var aim = Path(); aim.move(to: CGPoint(x: cue.x, y: cue.y)); aim.addLine(to: CGPoint(x: cue.x + cos(angle) * 220, y: cue.y + sin(angle) * 220))
                c.stroke(aim, with: .color(.white.opacity(0.5)), style: StrokeStyle(lineWidth: 2, dash: [9, 7]))
                var stick = Path(); stick.move(to: CGPoint(x: cue.x - cos(angle) * 24, y: cue.y - sin(angle) * 24)); stick.addLine(to: CGPoint(x: cue.x - cos(angle) * 160, y: cue.y - sin(angle) * 160)); c.stroke(stick, with: .color(Color(red: 0.83, green: 0.69, blue: 0.48)), lineWidth: 6)
            }
            for ball in balls where !ball.pocketed {
                if placement != nil && ball.id == 0 { continue }
                drawBall(ball, in: c)
            }
            if let placement {
                c.fill(Path(ellipseIn: CGRect(x: placement.x - 11, y: placement.y - 11, width: 22, height: 22)), with: .color(.white.opacity(0.5)))
                c.stroke(Path(ellipseIn: CGRect(x: placement.x - 20, y: placement.y - 20, width: 40, height: 40)), with: .color(GamesPalette.mint), lineWidth: 3)
            }
        }
    }
    private func drawBall(_ ball: GamesBall, in c: GraphicsContext) {
        let colors: [Color] = [.white, .yellow, .blue, .red, .purple, .orange, .green, Color(red: 0.55, green: 0.15, blue: 0.2), .black]
        let color = colors[ball.id == 0 ? 0 : ball.id == 8 ? 8 : (ball.id - 1) % 8 + 1]
        let circle = CGRect(x: ball.x - 11, y: ball.y - 11, width: 22, height: 22)
        c.fill(Path(ellipseIn: circle.offsetBy(dx: 2, dy: 3)), with: .color(.black.opacity(0.35)))
        c.fill(Path(ellipseIn: circle), with: .color(ball.id > 8 ? .white : color))
        if ball.id > 8 {
            var stripe = c; stripe.clip(to: Path(ellipseIn: circle)); stripe.fill(Path(CGRect(x: ball.x - 11, y: ball.y - 6, width: 22, height: 12)), with: .color(color))
        }
        if ball.id != 0 {
            c.fill(Path(ellipseIn: CGRect(x: ball.x - 6, y: ball.y - 6, width: 12, height: 12)), with: .color(.white))
            c.draw(Text("\(ball.id)").font(.system(size: 8, weight: .bold)).foregroundColor(.black), at: CGPoint(x: ball.x, y: ball.y))
        }
        c.fill(Path(ellipseIn: CGRect(x: ball.x - 6, y: ball.y - 7, width: 5, height: 4)), with: .color(.white.opacity(0.6)))
    }
}
