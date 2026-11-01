import SwiftUI

struct GamesBattleshipView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
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
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if placement { placementControls }
            else {
                Text("Their waters · \(room.state["sunk"][me].array.count)/5 ships sunk").font(.headline)
                chart(own: false)
                coordinateControls
                Button { fire(row * 10 + column) } label: { Label("Fire at \(GamesFleet.coordinate(row * 10 + column))", systemImage: "scope").gamesAction() }
                    .disabled(!canFire(row * 10 + column))
            }
            Text("Your private waters").font(.headline)
            chart(own: true)
            if !message.isEmpty { Text(message).font(.subheadline).foregroundColor(GamesPalette.rose).accessibilityAddTraits(.updatesFrequently) }
            HStack { Label("Hit", systemImage: "xmark.circle.fill").foregroundColor(GamesPalette.rose); Label("Miss", systemImage: "circle.fill").foregroundColor(GamesPalette.muted) }.font(.caption)
        }.onAppear(perform: restoreDraft)
            .onChange(of: room.round) { _ in restoreDraft() }
            .onChange(of: ships) { value in
                do { try universe.vault.save(draftKey, value) } catch { message = error.localizedDescription }
            }
    }
    private var placementControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            if committed {
                Text("Fleet locked. Waiting for your person to place theirs.").foregroundColor(GamesPalette.mint)
            } else {
                Text("Drag a ship onto your chart, or select, rotate, and tap its starting cell. Nothing is shared until you lock the fleet.").font(.subheadline).foregroundColor(GamesPalette.muted)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))], spacing: 8) {
                    ForEach(0..<5, id: \.self) { index in
                        Button {
                            selectedShip = index
                            if ships[index].count > 1 { vertical = ships[index][1] - ships[index][0] == 10 }
                        } label: {
                            VStack(spacing: 4) {
                                Text("Ship \(index + 1)").font(.caption.bold())
                                Text(String(repeating: "▪", count: GamesFleet.lengths[index])).font(.title3)
                                Text(ships[index].isEmpty ? "Unplaced" : "Placed").font(.caption2)
                            }.frame(maxWidth: .infinity, minHeight: 68).background(selectedShip == index ? GamesPalette.mint.opacity(0.22) : GamesPalette.surface, in: RoundedRectangle(cornerRadius: 12))
                        }.disabled(!canPlace).draggable("asechka-ship:\(index)")
                            .accessibilityLabel("Ship \(index + 1), length \(GamesFleet.lengths[index]), \(ships[index].isEmpty ? "unplaced" : "placed")\(selectedShip == index ? ", selected" : "")")
                    }
                }
                Button { rotate() } label: { Label(vertical ? "Vertical · rotate to horizontal" : "Horizontal · rotate to vertical", systemImage: "rotate.right").gamesAction(false) }.disabled(!canPlace)
                coordinateControls
                Button { place(row * 10 + column) } label: { Text("Place ship \(selectedShip + 1) at \(GamesFleet.coordinate(row * 10 + column))").gamesAction(false) }.disabled(!canPlace)
                HStack {
                    Button("Clear fleet") { ships = Array(repeating: [], count: 5); message = "" }.frame(minHeight: 44)
                    Spacer()
                    Button("Arrange for me") { ships = zip([0, 20, 40, 60, 80], GamesFleet.lengths).map { start, length in GamesFleet.cells(start: start, length: length, vertical: false) ?? [] }; message = "" }.frame(minHeight: 44)
                }.disabled(!canPlace)
                Button {
                    let fleet = ships.map { GamesJSON.object(["cells": .ints($0)]) }
                    store.move(room, ["type": "fleet", "ships": .array(fleet)])
                } label: { Label(store.hasPending(room) ? "Locking fleet…" : "Lock my private fleet", systemImage: "lock.shield").gamesAction() }
                    .disabled(!canPlace || !GamesFleet.valid(ships)).accessibilityIdentifier("games.battleship.commit")
            }
        }.gamesPanel()
    }
    private var coordinateControls: some View {
        HStack {
            Picker("Row", selection: $row) { ForEach(0..<10, id: \.self) { Text(String(UnicodeScalar(65 + $0)!)).tag($0) } }.pickerStyle(.menu)
            Picker("Column", selection: $column) { ForEach(0..<10, id: \.self) { Text("\($0 + 1)").tag($0) } }.pickerStyle(.menu)
            Spacer(); Text(GamesFleet.coordinate(row * 10 + column)).font(.headline.monospaced())
        }
    }
    private func chart(own: Bool) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 2) { Text(" ").frame(width: 18); ForEach(1...10, id: \.self) { Text("\($0)").frame(maxWidth: .infinity) } }.font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundColor(GamesPalette.muted)
            HStack(spacing: 4) {
                VStack(spacing: 2) { ForEach(0..<10, id: \.self) { Text(String(UnicodeScalar(65 + $0)!)).font(.system(size: 10, weight: .medium, design: .monospaced)).frame(maxHeight: .infinity) } }.frame(width: 18).foregroundColor(GamesPalette.muted)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 10), spacing: 2) {
                    ForEach(0..<100, id: \.self) { cell in
                        Button {
                            row = cell / 10; column = cell % 10
                            if own { place(cell) } else { fire(cell) }
                        } label: { seaCell(cell, own: own) }.buttonStyle(.plain)
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
                }
            }.aspectRatio(1.055, contentMode: .fit)
        }.frame(maxWidth: 600).frame(maxWidth: .infinity)
    }
    private func seaCell(_ cell: Int, own: Bool) -> some View {
        let attacker = own ? 1 - me : me
        let hit = room.state["hits"][attacker].array.contains(.int(cell))
        let shot = room.state["shots"][attacker].array.contains(.int(cell))
        let fleet = own ? ownShips : revealedEnemyShips
        let ship = fleet.firstIndex { $0.contains(cell) }
        let selected = own && placement && ship == selectedShip
        return ZStack {
            RoundedRectangle(cornerRadius: 3).fill(ship == nil ? GamesPalette.surface : GamesPalette.mint.opacity(selected ? 0.65 : 0.3))
            if hit { Image(systemName: "xmark").font(.system(size: 12, weight: .heavy)).foregroundColor(GamesPalette.rose) }
            else if shot { Circle().fill(GamesPalette.muted).padding(10) }
            if !own && pendingCell == cell { Image(systemName: "scope").font(.caption).foregroundColor(GamesPalette.lilac) }
        }.aspectRatio(1, contentMode: .fit)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(selected ? GamesPalette.mint : .white.opacity(0.06)))
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
    private func place(_ cell: Int) {
        guard canPlace else { return }
        guard let cells = GamesFleet.cells(start: cell, length: GamesFleet.lengths[selectedShip], vertical: vertical) else { message = "That ship would extend beyond your chart."; return }
        let occupied = Set(ships.enumerated().filter { $0.offset != selectedShip }.flatMap(\.element))
        guard occupied.isDisjoint(with: cells) else { message = "Ships cannot overlap. Choose another starting cell."; return }
        ships[selectedShip] = cells; message = ""; GamesFeedback.play()
    }
    private func rotate() {
        vertical.toggle()
        if let start = ships[selectedShip].first { place(start) }
    }
    private func restoreDraft() {
        ships = universe.vault.value(draftKey, as: [[Int]].self) ?? Array(repeating: [], count: 5)
        if ships.count != 5 { ships = Array(repeating: [], count: 5) }
        selectedShip = 0; vertical = false; message = ""
    }
}
