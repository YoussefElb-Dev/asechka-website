import SwiftUI

struct GamesPoolView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    var compact = false
    @State private var manualControls = false
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.accessibilityReduceMotion) private var systemReduced
    @AppStorage("games.reduceMotion") private var reduced = false
    @State private var angle = 0.0
    @State private var power = 0.65
    @State private var pocket = 0
    @State private var spinX=0.0
    @State private var spinY=0.0
    @State private var spinSheet=false
    @State private var cueX = 250.0
    @State private var cueY = 250.0
    @State private var frames: [GamesPoolFrame] = []
    @State private var balls: [GamesBall] = []
    @State private var playing = false
    @State private var serverBusy = false
    @State private var charging: Bool?
    @State private var gestureAngle = 0.0
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
        Group {
            if compact {
                GeometryReader { geometry in
                    HStack(spacing: 12) {
                        table.frame(maxWidth: .infinity, maxHeight: .infinity)
                        ScrollView { compactControls }.frame(width: min(200, geometry.size.width * 0.29))
                    }
                }
            } else { standardBody }
        }.task(id: "\(room.id)|\(room.seq)|\(reduced)|\(systemReduced)") { await prepareShot() }
            .sheet(isPresented:$spinSheet){GamesSpinControl(x:$spinX,y:$spinY).presentationDetents([.medium])}
            .sheet(isPresented: $manualControls) {
                NavigationStack { ScrollView { VStack(spacing: 12) { groups; if inHand { placementControls } else { shotControls }; pocketedSummary }.padding(18) }.navigationTitle("Shot controls").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { manualControls = false } } } }
            }
    }
    private var standardBody: some View {
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
        }
    }
    private var compactControls: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(room.state["groups"][room.player(universe.actor) ?? 0].isNull ? "Open table" : room.state["groups"][room.player(universe.actor) ?? 0].string.capitalized).font(.caption.bold())
            if room.finished {
                GamesOutcomeCard(store: store, room: room, compact: true)
            } else if playing || serverBusy { Text("Balls settling…").foregroundColor(GamesPalette.mint) }
            else if inHand {
                Text("Ball in hand · tap a clear spot, then confirm.").font(.caption)
                Button { store.move(room, ["type": "place", "x": .number(cueX), "y": .number(cueY)]) } label: { Text("Place cue").gamesAction() }.disabled(!canControl || !cueValid)
            } else {
                Text("Drag to aim. Pull back from the cue ball to shoot.").font(.caption).foregroundColor(GamesPalette.muted)
                Text("Power · \(Int(power * 100))%").font(.caption.bold())
                Slider(value: $power, in: 0...1, step: 0.01).accessibilityLabel("Shot power").disabled(!canControl)
                Picker("Call eight pocket", selection: $pocket) { ForEach(0..<6, id: \.self) { Text(pocketNames[$0]).tag($0) } }.pickerStyle(.menu).disabled(!canControl)
                Button("Cue-ball spin"){spinSheet=true}.frame(minHeight:44)
                Button { takeShot() } label: { Text("Shoot").gamesAction() }.disabled(!canControl)
            }
            Button("Fine controls") { manualControls = true }.font(.caption).frame(minHeight: 44)
        }
    }
    private func remainingBalls(for group: String) -> Int {
        if group == "solids" { return balls.filter { (1...7).contains($0.id) && !$0.pocketed }.count }
        if group == "stripes" { return balls.filter { (9...15).contains($0.id) && !$0.pocketed }.count }
        return balls.filter { $0.id != 0 && $0.id != 8 && !$0.pocketed }.count
    }
    private var groups: some View {
        HStack {
            ForEach(0..<min(2, room.players.count), id: \.self) { index in
                let grp = room.state["groups"][index].string
                VStack(alignment: .leading, spacing: 3) {
                    Text(Post.name(room.players[index].actor)).font(.subheadline.bold()).foregroundColor(GamesPalette.player(index))
                    Text(grp.isEmpty ? "Open table" : "\(grp.capitalized) · \(remainingBalls(for: grp)) left").font(.caption).foregroundColor(GamesPalette.muted)
                }.frame(maxWidth: .infinity, alignment: index == 0 ? .leading : .trailing)
            }
        }
    }
    private var table: some View {
        GeometryReader { geometry in
            TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !playing)) { timeline in
                let visible = playing ? GamesPoolFrame.sample(frames, at: room.poolElapsed(at: timeline.date)) : balls
                GamesPoolCanvas(balls: visible, angle: angle * .pi / 180, aiming: canControl && !inHand, placement: inHand && canControl ? CGPoint(x: cueX, y: cueY) : nil, pocket: pocket, pull: power)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                guard canControl else { return }
                let point = GamesPoolCanvas.tablePoint(value.location, size: geometry.size)
                if inHand { cueX = min(989, max(11, point.x)); cueY = min(489, max(11, point.y)) }
                else if let cue = balls.first(where: { $0.id == 0 && !$0.pocketed }) {
                    let start = GamesPoolCanvas.tablePoint(value.startLocation, size: geometry.size)
                    if charging == nil { charging = hypot(start.x - cue.x, start.y - cue.y) < 75; gestureAngle = angle * .pi / 180 }
                    if charging == true {
                        power = min(1, max(0, (-(point.x - start.x) * cos(gestureAngle) - (point.y - start.y) * sin(gestureAngle)) / 280))
                    } else {
                        let radians = atan2(point.y - cue.y, point.x - cue.x)
                        angle = (radians * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
                    }
                }
            }.onEnded { _ in
                if charging == true && canControl && !inHand && power >= 0.03 { takeShot() }
                charging = nil
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
                takeShot()
            } label: { Label(store.hasPending(room) ? "Sending shot…" : room.state["breakShot"].bool ? "Take the break" : "Take the shot", systemImage: "arrow.up.right").gamesAction() }
                .disabled(!canControl).accessibilityIdentifier("games.pool.shoot")
            Text("Drag on the cloth to aim. Pull back from the cue ball and release to shoot, or use the controls. Call the eight’s pocket before shooting; numbers run clockwise from the top left.").font(.caption).foregroundColor(GamesPalette.muted)
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
    private func takeShot() {
        guard canControl else { return }
        store.move(room, ["type": "shot", "angle": .number(angle * .pi / 180), "power": .number(power), "spinX": .number(spinX), "spinY": .number(spinY), "callPocket": .int(pocket)])
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
    var pull: Double = 0
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
            c.draw(Image(uiImage: GamesAssets.image("pool/board")), in: CGRect(x: -40, y: -40, width: 1080, height: 580))
            for (index, point) in Self.pockets.enumerated() {
                c.draw(Image(uiImage: GamesAssets.image("pool/pocket")), in: CGRect(x: point.x - 28, y: point.y - 28, width: 56, height: 56))
                let offset: CGFloat = point.y == 0 ? -24 : 24
                c.draw(Text("\(index + 1)").font(.system(size: 17, weight: .bold)).foregroundColor(index == pocket ? Color(red: 1, green: 0.78, blue: 0.86) : .white.opacity(0.75)), at: CGPoint(x: point.x, y: point.y + offset))
                if index == pocket { c.stroke(Path(ellipseIn: CGRect(x: point.x - 30, y: point.y - 30, width: 60, height: 60)), with: .color(Color(red: 1, green: 0.78, blue: 0.86)), lineWidth: 3) }
            }
            if aiming, let cue = balls.first(where: { $0.id == 0 && !$0.pocketed }) {
                GamesPoolVisual.guide(balls,angle:angle,in:c)
                var stick = c; stick.translateBy(x: cue.x, y: cue.y); stick.rotate(by: .radians(angle))
                stick.draw(Image(uiImage: GamesAssets.image("pool/cue")), in: CGRect(x: -220-pull*100, y: -4, width: 195, height: 8))
            }
            for ball in balls where !ball.pocketed {
                if placement != nil && ball.id == 0 { continue }
                GamesPoolVisual.ball(ball,c)
            }
            if let placement {
                c.fill(Path(ellipseIn: CGRect(x: placement.x - 11, y: placement.y - 11, width: 22, height: 22)), with: .color(.white.opacity(0.5)))
                c.stroke(Path(ellipseIn: CGRect(x: placement.x - 20, y: placement.y - 20, width: 40, height: 40)), with: .color(GamesPalette.mint), lineWidth: 3)
            }
        }
    }
    private func drawBall(_ ball: GamesBall, in c: GraphicsContext) {
        let circle = CGRect(x: ball.x - 11, y: ball.y - 11, width: 22, height: 22)
        c.fill(Path(ellipseIn: circle.offsetBy(dx: 1, dy: 2)), with: .color(GamesPalette.ink.opacity(0.16)))
        c.draw(Image(uiImage: GamesAssets.image("pool/ball-\(ball.id)-small")), in: circle)
        if ball.id != 0 {
            c.draw(Text("\(ball.id)").font(.system(size: 8, weight: .bold)).foregroundColor(GamesPalette.ink), at: CGPoint(x: ball.x, y: ball.y))
        }
    }
}
