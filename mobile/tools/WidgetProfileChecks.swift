import Foundation

// Exercise the actual parser without booting a simulator for this signing fix.
@main enum WidgetProfileChecks {
    static func main() throws {
        let renamed="group.app.asechka.ios.EXAMPLETEAM"
        let cases:[([String],[String])] = [
            ([renamed,"group.unrelated.other",renamed,"group.app.asechka.*"],[renamed]),
            (["group.TEAM.app.asechka.shared"],["group.TEAM.app.asechka.shared"]),
            (["group.app.asechka.shared"],["group.app.asechka.shared"]),
            (["group.unrelated.other","group.app.asechka.*"],[])
        ]
        var checked=0
        for (groups,expected) in cases {
            let profile:[String:Any] = ["Entitlements":["com.apple.security.application-groups":groups]]
            for format in [PropertyListSerialization.PropertyListFormat.xml,.binary] {
                let plist=try PropertyListSerialization.data(fromPropertyList:profile,format:format,options:0)
                precondition(WidgetSnapshot.provisionedGroups(in:plist)==expected,"Incorrect provisioned widget groups")
                checked += 1
                if format == .xml {
                    let wrapped=Data([48,130,1,0])+plist+Data([0,1,2])
                    precondition(WidgetSnapshot.provisionedGroups(in:wrapped)==expected,"CMS-wrapped profile not recognised")
                    checked += 1
                }
            }
        }
        precondition(WidgetSnapshot.provisionedGroups(in:Data("invalid profile".utf8)).isEmpty)
        print("PASS: \(checked+1) widget profile checks, including the renamed group observed on the iPhone.")
    }
}
