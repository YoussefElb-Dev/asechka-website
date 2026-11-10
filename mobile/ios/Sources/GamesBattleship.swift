import SwiftUI

struct GamesBattleshipView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.gamesCompact) private var compact
    @Environment(\.gamesBoardLimit) private var boardLimit
    @State private var oceanOverride: Bool?
    @State private var dragIndex: Int?
    @State private var dragAnchor: CGPoint?
    @State private var dragOffset = 0
    @State private var ships: [[Int]] = Array(repeating: [], count: 5)
    @State private var selectedShip = 0
    @State private var vertical = false
    @State private var row = 0
    @State private var column = 0
    @State private var message = ""
    private var me: Int { room.player(universe.actor) ?? 0 }
    private var placement: Bool { room.state["phase"].string == "placement" }
    private var committed: Bool { !room.state["fleets"][me].isNull }
    private var canPlace: Bool { placement && !committed && store.canAct(room) }
    private var draftKey: String { "games.fleet:\(universe.actor):\(room.id):\(room.round)" }
    private var pendingCell: Int? { store.pending.first { $0.room == room.id }?.action["cell"].int }
    private var ownShips: [[Int]] {
        committed ? room.state["fleets"][me].array.map { $0["cells"].array.compactMap(\.int) } : ships
    }
    private var showingOwn: Bool { placement || (oceanOverride ?? (room.state["turn"].int != me)) }
    private var myAfloatCount: Int { max(0, 5 - room.state["sunkShips"][1 - me].array.count) }
    private var enemySunkCount: Int { room.state["sunkShips"][me].array.count }
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 18) {
            if !placement {
                HStack {
                    Button { oceanOverride = true } label: { Text("Your fleet").gamesAction(showingOwn) }
                    Button { oceanOverride = false } label: { Text("Their waters").gamesAction(!showingOwn) }
                }
            }
            Text(placement ? "Your ocean · place ships" : showingOwn ? "Your fleet · \(myAfloatCount)/5 afloat · incoming fire" : "Their waters · \(enemySunkCount)/5 sunk · tap to fire")
                .font(.caption.bold()).foregroundColor(GamesPalette.muted)
            chart(own: showingOwn)
            if placement { placementControls }
            else if !compact && !showingOwn { coordinateControls; Button("Fire at selected coordinates") { fire(row * 10 + column) }.disabled(!canFire(row * 10 + column)) }
            if !message.isEmpty { Text(message).font(.caption).foregroundColor(GamesPalette.rose).accessibilityAddTraits(.updatesFrequently) }
        }.onAppear(perform: restoreDraft)
            .onChange(of: room.round) { _ in restoreDraft() }
            .onChange(of: room.state["turn"].int) { _ in oceanOverride = nil; dragIndex = nil; dragAnchor = nil }
            .onChange(of: ships) { value in
                do { try universe.vault.save(draftKey, value) } catch { message = error.localizedDescription }
            }
    }
    private var placementControls: some View {
        VStack(alignment: .leading, spacing: 6) {
            if committed { Text("Fleet locked. Waiting for your partner.").font(.subheadline).foregroundColor(GamesPalette.mint) }
            else {
                HStack {
                    Menu {
                        ForEach(0..<5, id: \.self) { index in Button("\(shipNames[index].capitalized) · \(GamesFleet.lengths[index]) cells") { selectShip(index) } }
                    } label: {
                        Label(shipNames[selectedShip].capitalized, systemImage: "chevron.down").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
                    }.accessibilityLabel("Select ship, \(shipNames[selectedShip])")
                    Button { rotate() } label: { Label(vertical ? "Rotate ↔" : "Rotate ↕", systemImage: "rotate.right").font(.subheadline).frame(minHeight: 44) }
                        .accessibilityLabel(vertical ? "Rotate selected ship to horizontal" : "Rotate selected ship to vertical")
                }.disabled(!canPlace)
                Text("\(ships.filter { !$0.isEmpty }.count) / 5 placed · mint fits, rose cannot fit").font(.caption).foregroundColor(GamesPalette.muted)
                HStack {
                    Button("Arrange") { ships = zip([0, 20, 40, 60, 80], GamesFleet.lengths).map { start, length in GamesFleet.cells(start: start, length: length, vertical: false) ?? [] }; selectShip(0) }.frame(minHeight: 48)
                    Button("Clear") { ships = Array(repeating: [], count: 5); selectedShip = 0; vertical = false; message = "" }.frame(minHeight: 48)
                    Button {
                        store.move(room, ["type": "fleet", "ships": .array(ships.map { .object(["cells": .ints($0)]) })])
                    } label: { Text(store.hasPending(room) ? "Locking…" : "Lock fleet").gamesAction() }
                        .disabled(!canPlace || !GamesFleet.valid(ships)).accessibilityIdentifier("games.battleship.commit")
                }.disabled(!canPlace)
                if !compact { coordinateControls; Button("Place at selected coordinates") { place(row * 10 + column) }.frame(minHeight: 44).disabled(!canPlace) }
            }
        }
    }
    private var coordinateControls: some View {
        HStack {
            Picker("Row", selection: $row) { ForEach(0..<10, id: \.self) { Text(String(UnicodeScalar(65 + $0)!)).tag($0) } }.pickerStyle(.menu)
            Picker("Column", selection: $column) { ForEach(0..<10, id: \.self) { Text("\($0 + 1)").tag($0) } }.pickerStyle(.menu)
            Spacer(); Text(GamesFleet.coordinate(row * 10 + column)).font(.headline.monospaced())
        }
    }
    private func chart(own: Bool) -> some View {
        GeometryReader { geometry in
            let side = max(0, min(geometry.size.width - 22, geometry.size.height - 18))
            let cellSide = side / 10
            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    Color.clear.frame(width: 18)
                    HStack(spacing: 0) { ForEach(1...10, id: \.self) { Text("\($0)").frame(width: cellSide) } }
                }.frame(height: 14).font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundColor(GamesPalette.muted)
                HStack(spacing: 4) {
                    VStack(spacing: 0) { ForEach(0..<10, id: \.self) { Text(String(UnicodeScalar(65 + $0)!)).font(.system(size: 10, weight: .medium, design: .monospaced)).frame(width: 18, height: cellSide) } }.foregroundColor(GamesPalette.muted)
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(cellSide), spacing: 0), count: 10), spacing: 0) {
                        ForEach(0..<100, id: \.self) { cell in
                            Button {
                                row = cell / 10; column = cell % 10
                                if own { place(cell) } else { fire(cell) }
                            } label: { seaCell(cell, own: own).frame(width: cellSide, height: cellSide) }.buttonStyle(.plain)
                                .disabled(own ? !canPlace : !canFire(cell))
                                .accessibilityLabel(cellLabel(cell, own: own))
                                .accessibilityIdentifier("games.battleship.\(own ? "own" : "target").\(cell)")
                                .dropDestination(for: String.self) { items, _ in
                                    guard own && canPlace, let item = items.first, item.hasPrefix("asechka-ship:"), let index = Int(item.dropFirst(13)), (0..<5).contains(index) else { return false }
                                    selectedShip = index
                                    if ships[index].count > 1 { vertical = ships[index][1] - ships[index][0] == 10 }
                                    place(cell)
                                    return ships[index].first == cell
                                }
                        }
                    }.frame(width: side, height: side)
                    .background { fleetArtwork(own: own) }.background(GamesSprite("battleship/board"))
                    .overlay { if own && canPlace { placementGesture } }
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }.aspectRatio(1, contentMode: .fit).frame(maxWidth: min(600, boardLimit)).frame(maxWidth: .infinity)
    }
    private func seaCell(_ cell: Int, own: Bool) -> some View {
        let attacker = own ? 1 - me : me
        let hit = room.state["hits"][attacker].array.contains(.int(cell))
        let shot = room.state["shots"][attacker].array.contains(.int(cell))
        let fleet = own ? ownShips : revealedEnemyShips
        let ship = fleet.firstIndex { $0.contains(cell) }
        let selected = own && placement && ship == selectedShip
        return ZStack {
            Color.clear
            if hit { GamesSprite("common/hit").scaledToFit().padding(3) }
            else if shot { GamesSprite("common/miss").scaledToFit().padding(3) }
            if !own && pendingCell == cell { Image(systemName: "scope").font(.caption).foregroundColor(GamesPalette.lilac) }
        }.aspectRatio(1, contentMode: .fit).contentShape(Rectangle())
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(selected ? GamesPalette.mint.opacity(0.7) : .clear))
    }
    private let shipNames = ["carrier", "battleship", "cruiser", "submarine", "destroyer"]
    private func fleetArtwork(own: Bool) -> some View {
        GeometryReader { geometry in
            let fleet = own ? ownShips : revealedEnemyShips
            let cellSize = geometry.size.width / 10
            ForEach(Array(fleet.enumerated()), id: \.offset) { index, cells in
                if let first = cells.first, let last = cells.last, cells.count > 1 {
                    let vertical = cells[1] - first == 10
                    // Sunk reveal preserves original ship index while hiding all
                    // remaining enemy ships. Never infer a fleet from a cover.
                    let original = own || room.finished ? index : room.state["sunkShips"][me][index]["index"].int ?? index
                    GamesSprite("battleship/\(shipNames[min(4, max(0, original))])")
                        .frame(width: cellSize * 0.74, height: cellSize * (CGFloat(cells.count) - 0.16))
                        .rotationEffect(.degrees(vertical ? 0 : 90)).opacity(own && dragIndex == index ? 0.35 : 1)
                        .position(x: (CGFloat(first % 10 + last % 10) / 2 + 0.5) * cellSize, y: (CGFloat(first / 10 + last / 10) / 2 + 0.5) * cellSize)
                }
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
    private var revealedEnemyShips: [[Int]] {
        // Read only the explicit sunk reveal, or the public final fleet after game over.
        if room.finished { return room.state["fleets"][1 - me].array.map { $0["cells"].array.compactMap(\.int) } }
        return room.state["sunkShips"][me].array.map { $0["cells"].array.compactMap(\.int) }
    }
    private func cellLabel(_ cell: Int, own: Bool) -> String {
        let attacker = own ? 1 - me : me
        let hit = room.state["hits"][attacker].array.contains(.int(cell))
        let shot = room.state["shots"][attacker].array.contains(.int(cell))
        let occupied = own && ownShips.contains { $0.contains(cell) }
        return "\(own ? "Your chart" : "Target chart"), \(GamesFleet.coordinate(cell)), \(hit ? "hit" : shot ? "miss" : occupied ? "ship" : "unfired")"
    }
    private func canFire(_ cell: Int) -> Bool { store.myTurn(room) && !placement && !room.state["shots"][me].array.contains(.int(cell)) }
    private func fire(_ cell: Int) { guard canFire(cell) else { return }; store.move(room, ["type": "fire", "cell": .int(cell)]) }
    private func selectShip(_ index: Int) {
        selectedShip = index
        if ships[index].count > 1 { vertical = ships[index][1] - ships[index][0] == 10 }
        message = ""
    }
    private func problem(_ cell: Int, orientation: Bool) -> String? {
        guard let cells = GamesFleet.cells(start: cell, length: GamesFleet.lengths[selectedShip], vertical: orientation) else { return "Keep the whole ship inside the ocean." }
        let occupied = Set(ships.enumerated().filter { $0.offset != selectedShip }.flatMap(\.element))
        return occupied.isDisjoint(with: cells) ? nil : "That position overlaps another ship."
    }
    private func place(_ cell: Int) {
        guard canPlace else { return }
        if let error = problem(cell, orientation: vertical) { message = error + " Your ship stayed in its last position."; return }
        ships[selectedShip] = GamesFleet.cells(start: cell, length: GamesFleet.lengths[selectedShip], vertical: vertical) ?? []
        row = cell / 10; column = cell % 10; message = ""; GamesFeedback.play()
    }
    private func rotate() {
        let next = !vertical
        if let start = ships[selectedShip].first {
            if let error = problem(start, orientation: next) { message = "Cannot rotate here: " + error + " Move the ship first."; return }
            ships[selectedShip] = GamesFleet.cells(start: start, length: GamesFleet.lengths[selectedShip], vertical: next) ?? []
        }
        vertical = next; message = ""; GamesFeedback.play()
    }
    private var placementGesture: some View {
        GeometryReader { geometry in
            let size = geometry.size.width / 10
            ZStack(alignment: .topLeading) {
                Color.clear
                if let anchor = dragAnchor {
                    let inside = anchor.x >= 0 && anchor.y >= 0 && anchor.x < 10 && anchor.y < 10
                    let cell = Int(anchor.y) * 10 + Int(anchor.x)
                    let valid = inside && problem(cell, orientation: vertical) == nil
                    RoundedRectangle(cornerRadius: 5).fill((valid ? GamesPalette.mint : GamesPalette.rose).opacity(0.3))
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(valid ? GamesPalette.mint : GamesPalette.rose, lineWidth: 3))
                        .frame(width: size * CGFloat(vertical ? 1 : GamesFleet.lengths[selectedShip]), height: size * CGFloat(vertical ? GamesFleet.lengths[selectedShip] : 1))
                        .offset(x: anchor.x * size, y: anchor.y * size)
                        .allowsHitTesting(false)
                }
            }.contentShape(Rectangle()).clipped().accessibilityHidden(true)
                .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                    if dragIndex == nil {
                        let startColumn = Int(floor(value.startLocation.x / size)), startRow = Int(floor(value.startLocation.y / size))
                        let start = startRow * 10 + startColumn
                        let index = ships.firstIndex { $0.contains(start) } ?? selectedShip
                        selectShip(index); dragIndex = index; dragOffset = ships[index].firstIndex(of: start) ?? 0
                    }
                    dragAnchor = CGPoint(x: floor(value.location.x / size) - CGFloat(vertical ? 0 : dragOffset), y: floor(value.location.y / size) - CGFloat(vertical ? dragOffset : 0))
                }.onEnded { _ in
                    if let anchor = dragAnchor, anchor.x >= 0, anchor.y >= 0, anchor.x < 10, anchor.y < 10 { place(Int(anchor.y) * 10 + Int(anchor.x)) }
                    else { message = "Keep the whole ship inside the ocean. Your ship stayed in its last position." }
                    dragIndex = nil; dragAnchor = nil
                })
        }
    }
    private func restoreDraft() {
        ships = universe.vault.value(draftKey, as: [[Int]].self) ?? Array(repeating: [], count: 5)
        if ships.count != 5 { ships = Array(repeating: [], count: 5) }
        selectShip(0); oceanOverride = nil; dragIndex = nil; dragAnchor = nil
    }
}
