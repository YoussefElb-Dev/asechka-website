import Foundation
import SwiftUI
import CryptoKit
import Network
import UserNotifications

struct ServerError: LocalizedError {
    let message:String
    let status:Int
    var errorDescription:String? {message}
}
final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {completionHandler(nil)}
}
@MainActor final class UniverseStore: ObservableObject {
    let games = GamesStore()
    lazy var liveLocation=LiveLocationModel(universe:self)
    static let site="https://asechka-website.vercel.app"
    @Published var actor=UserDefaults.standard.string(forKey:"person") ?? ""
    @Published var unlocked=false
    @Published private(set) var requiresCode=false
    @Published var doorError:String?
    @Published private(set) var biometricEnabled=false
    @Published var alertsEnabled=UserDefaults.standard.bool(forKey:"alerts-enabled")
    private var biometricPrompt=false
    private var accessEpoch=0
    @Published var memories=Memories()
    @Published var songs:[Song]=[]
    @Published var momentSong:Song?
    @Published var wishes:[Wish]=[]
    @Published var journal:[String:Any]=[:]
    @Published var keepsakes:[String:Any]=[:]
    @Published var translations:[Translation]=[]
    @Published var pending:[PendingChange]=[]
    @Published var message="Opening our little universe…"
    @Published var online=true
    @Published var busy=false
    @Published var error:String?
    @Published var bookmarks:Set<String>=[]
    @Published var hearts:[String:String]=[:]
    @Published var heartVibes:[String:HeartVibeInfo]=[:]
    @Published var heartDays:[String:[String:Int]]=[:]
    @Published var heartStreakPolicy:[String:Any]=[:]
    @Published var serverHeartDay=""
    @Published var dailyPrompt:DailyPromptState?
    @Published var pinnedNote:LittleMessage?
    @Published var throwbackText=""
    @Published var throwbackLabel=""
    private var serverHeartAsOf:Date?
    private var refreshingHearts=false
    private var streakCacheKey=""
    private var streakCache:SharedHeartStreak?
    private var lastPartnerHeartSeen=""
    private var lastNoteSeen=""
    private var lastPromptSeen=""
    func sharedHeartStreak(at date:Date=Date())->SharedHeartStreak {
        let today=online && !serverHeartDay.isEmpty && abs(date.timeIntervalSince(serverHeartAsOf ?? .distantPast))<90 ? serverHeartDay:HeartLedger.day(date)
        let activeDays=heartDays.keys.filter{(heartDays[$0]?["me"] ?? 0)>0 || (heartDays[$0]?["asechka"] ?? 0)>0}.sorted().joined(separator:",")
        let key="\(today)|\(heartStreakPolicy["startedOn"] ?? "")|\(heartStreakPolicy["seededThrough"] ?? "")|\(heartStreakPolicy["seedDays"] ?? 13)|\(activeDays)"
        if key==streakCacheKey,let result=streakCache{return result}
        let result=SharedHeartStreak.calculate(heartDays,policy:heartStreakPolicy,today:today)
        streakCacheKey=key;streakCache=result;return result
    }
    func setAlerts(_ enabled:Bool)async {
        if !enabled { alertsEnabled=false; UserDefaults.standard.set(false,forKey:"alerts-enabled"); return }
        do {
            let granted=try await UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.sound,.badge])
            alertsEnabled=granted; UserDefaults.standard.set(granted,forKey:"alerts-enabled")
            if !granted { self.error="Notifications are off in Settings. Turn them on to get partner heart & Love Jar alerts." }
        } catch { alertsEnabled=false; UserDefaults.standard.set(false,forKey:"alerts-enabled") }
    }
    private func notifyLocal(id:String,title:String,body:String) {
        guard alertsEnabled,!actor.isEmpty else{return}
        let content=UNMutableNotificationContent()
        content.title=title; content.body=body; content.sound = .default
        let req=UNNotificationRequest(identifier:id,content:content,trigger:nil)
        UNUserNotificationCenter.current().add(req)
    }
    private func checkForPartnerNotifications() {
        let otherKey=actor=="asnat" ? "me":"asechka"
        let otherActor=actor=="asnat" ? "youssef":"asnat"
        if let latest=hearts[otherKey],!latest.isEmpty {
            if !lastPartnerHeartSeen.isEmpty && latest>lastPartnerHeartSeen {
                let vibe=heartVibes[otherKey]
                let body=vibe != nil ? "\(partner) sent a heart: \(vibe!.symbol) \(vibe!.label)":"\(partner) is thinking of you ♡"
                notifyLocal(id:"heart-"+latest,title:"A little heart ♡",body:body)
            }
            lastPartnerHeartSeen=latest
        }
        if let newest=littleMessages.last(where:{$0.from==otherActor}) {
            if !lastNoteSeen.isEmpty && newest.id != lastNoteSeen {
                notifyLocal(id:"note-"+newest.id,title:"New Love Jar note ♡",body:"From \(partner): \(newest.preview)")
            }
            lastNoteSeen=newest.id
        }
        if let prompt=dailyPrompt,let ans=prompt.answers[otherActor],ans.answered {
            let stamp=prompt.day+":"+(ans.answeredAt ?? "1")
            if !lastPromptSeen.isEmpty && stamp != lastPromptSeen {
                notifyLocal(id:"prompt-"+stamp,title:"Today’s question",body:"\(partner) answered today’s question. Open Asechka to see ♡")
            }
            lastPromptSeen=stamp
        }
    }
    private func saveTogether(_ data:Data)throws {
        let incoming=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] ?? [:]
        if let saved=vault.read("snapshot:/api/together"), let current=(try? JSONSerialization.jsonObject(with:saved)) as? [String:Any],
           ((current["updatedAt"] as? String ?? "") > (incoming["updatedAt"] as? String ?? "")) {return}
        try vault.write("snapshot:/api/together",data)
    }
    func refreshSharedHearts()async {
        guard unlocked,!locked,online,!cookie.isEmpty,!refreshingHearts else{return}
        refreshingHearts=true;defer{refreshingHearts=false}
        await sync()
        let path=actor.isEmpty ? "/api/together":"/api/together?actor="+actor
        do {let data=try await request(path);guard !locked else{return};try saveTogether(data);restore();checkForPartnerNotifications();status()}catch{}
    }
    private var heartReceipts:Set<String>=[]
    private var inFlightChange:String?
    private var sealedHearts:Set<String>=[]
    private var heartFlush:Task<Void,Never>?
    private var heartCommit:Task<Void,Never>?
    private var heartTaps:[String:Int]=[:]
    private var retryAfter=Date.distantPast
    @Published var littleMessages:[LittleMessage]=[]
    var incomingMessage:LittleMessage? {
        let closed=Set(vault.value("closed-messages",as:[String].self) ?? [])
        return littleMessages.first{$0.to==actor && $0.closedAt==nil && $0.text != nil && !closed.contains($0.id)}
    }
    func sendMessage(_ text:String,mode:String="once",pinned:Bool=false)throws {
        let value=text.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !value.isEmpty,value.count<=1000 else{throw ServerError(message:"Write a little message, up to 1,000 characters.",status:400)}
        guard littleMessages.filter({$0.from==actor && $0.day==HeartLedger.day()}).count<3 else{throw ServerError(message:"Your three messages are sent. More at midnight Eastern. ♡",status:429)}
        try enqueue("/api/together",["action":"sendMessage","actor":actor,"text":value,"mode":mode,"pinned":pinned]);vault.remove("message-draft:"+actor)
    }
    func pinMessage(_ message:LittleMessage,pinned:Bool)throws {
        try enqueue("/api/together",["action":"pinMessage","actor":actor,"id":message.id,"pinned":pinned])
    }
    func closeMessage(_ message:LittleMessage)throws {
        try enqueue("/api/together",["action":"closeMessage","actor":actor,"id":message.id])
        var closed=Set(vault.value("closed-messages",as:[String].self) ?? []);closed.insert(message.id);try vault.save("closed-messages",Array(closed))
    }
    func answerPrompt(_ text:String)throws {
        let value=text.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !value.isEmpty,value.count<=400 else{throw ServerError(message:"Write a short answer, up to 400 characters.",status:400)}
        try enqueue("/api/together",["action":"answerPrompt","actor":actor,"text":value,"day":dailyPrompt?.day ?? HeartLedger.day()])
    }
    func setMomentSong(_ song:Song,note:String="")throws {
        let trimmed=String(note.trimmingCharacters(in:.whitespacesAndNewlines).prefix(240))
        try vault.save("song:\(song.trackId)",song)
        try enqueue("/api/music",["action":"setMoment","trackId":song.trackId,"note":trimmed,"actor":actor])
    }
    func clearMomentSong()throws {
        try enqueue("/api/music",["action":"clearMoment","expectedId":NSNull()])
    }
    @Published var dailyText=""
    @Published var cameraBadge="8 weekly shots · Sun 8pm ET"
    @Published var vaultBadge="Seal notes for later · Shared vault"
    private(set) var storageUnavailable=false
    let vault:Vault
    private let session:URLSession
    private let monitor=NWPathMonitor()
    private var cookie=""
    private var refreshing=false
    private var syncing=false
    private var prefetching=false
    private var locked=false
    private var idMap:[String:String]=[:]
    var name:String {Post.name(actor)}
    var partner:String {actor=="asnat" ? "Youssef" : "Asnat"}
    init(previewFixture:Bool=false) {
        #if DEBUG
        let preview=previewFixture || ProcessInfo.processInfo.arguments.contains("--preview-fixture")
        #else
        let preview=false
        #endif
        do{vault=try preview ? Vault(directory:FileManager.default.temporaryDirectory.appendingPathComponent("Preview-"+UUID().uuidString),key:SymmetricKey(size:.bits256)):Vault()}
        catch{vault=Vault.unavailable(error);storageUnavailable=true}
        let config=URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies=false;config.httpCookieStorage=nil;config.urlCache=nil
        config.timeoutIntervalForRequest=60;config.timeoutIntervalForResource=75
        session=URLSession(configuration:config,delegate:NoRedirect(),delegateQueue:nil)
        guard !storageUnavailable else{return}
        biometricEnabled=vault.value("biometric-enabled",as:Bool.self) ?? false
        if preview {
            actor="asnat";unlocked=true;online=false;memories=bundledMemories()
            requiresCode=false
            let salt=UUID().uuidString;try? vault.save("offline-code",[salt,Self.verifier("123456",salt)])
            #if DEBUG
            if let argument = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--games-play=") }),
               let url = Bundle.main.url(forResource: "games-native-layouts", withExtension: "json"),
               let data = try? Data(contentsOf: url),
               let rooms = try? JSONDecoder().decode([GamesRoom].self, from: data),
               var room = rooms.first(where: { $0.game == String(argument.dropFirst(13)) }) {
                if room.game == "drawing" {var state=room.state.object;state["deadline"] = .number(Date().timeIntervalSince1970*1000+80000);room.state = .object(state)}
                if room.game == "hangman" {
                    var state = room.state.object
                    state["setter"] = .int(1); state["turn"] = .int(0); state["word"] = .null
                    room.state = .object(state)
                }
                try? vault.save("games.rooms:asnat", [room]); try? vault.save("games.active:asnat", room.id)
            }
            if ProcessInfo.processInfo.arguments.contains("--incoming-message") {
                let letter:[String:Any]=["id":UUID().uuidString.lowercased(),"from":"youssef","to":"asnat","text":"A little love from Youssef, right here with you. Every ordinary moment is a little brighter because it is ours.","preview":"A little love from Youssef, right here with you. Every ordinary…","day":HeartLedger.day(),"createdAt":ISO8601DateFormatter().string(from:Date()),"closedAt":NSNull()]
                if let data=try? JSONSerialization.data(withJSONObject:["version":1,"bucketList":[],"hearts":["me":NSNull(),"asechka":NSNull()],"messages":[letter]]){try? vault.write("snapshot:/api/together",data)}
            }
            #endif
            try? vault.save("snapshot:/api/memories",memories);restore();journal["writable"]=true;keepsakes["writable"]=true;try? vault.write("snapshot:/api/journal",JSONSerialization.data(withJSONObject:journal));try? vault.write("snapshot:/api/keepsakes",JSONSerialization.data(withJSONObject:keepsakes));status();return
        }
        cookie=vault.value("session",as:String.self) ?? ""
        locked=vault.value("locked",as:Bool.self) ?? false
        unlocked = !locked && vault.read("snapshot:/api/memories") != nil
        requiresCode=biometricEnabled && unlocked
        pending=vault.value("outbox",as:[PendingChange].self) ?? []
        for index in pending.indices where pending[index].error != nil {
            if let body=(try? JSONSerialization.jsonObject(with:pending[index].body)) as? [String:Any],pending[index].path=="/api/together",body["action"] as? String=="sendHeart"{pending[index].error=nil;sealedHearts.insert(pending[index].id)}
        }
        try? vault.save("outbox",pending)
        sealedHearts.formUnion(vault.value("heart-sealed",as:[String].self) ?? [])
        idMap=vault.value("id-map",as:[String:String].self) ?? [:]
        restore();loadBookmarks()
        monitor.pathUpdateHandler={ [weak self] path in
            Task { @MainActor in
                guard let self else{return};self.online=path.status == .satisfied
                if self.online && self.unlocked {await self.refresh()}else{self.status()}
            }
        };monitor.start(queue:DispatchQueue(label:"app.asechka.connection"))
    }
    func choose(_ value:String){actor=value;UserDefaults.standard.set(value,forKey:"person");loadBookmarks();restore()}
    func loadBookmarks(){bookmarks=Set(vault.value("bookmarks:"+actor,as:[String].self) ?? [])}
    func bookmark(_ post:Post){if !bookmarks.insert(post.key).inserted{bookmarks.remove(post.key)};do{try vault.save("bookmarks:"+actor,Array(bookmarks))}catch{self.error=error.localizedDescription}}
    func status(){message = !online ? "Offline · showing saved content" : cookie.isEmpty ? "Reconnect with our code to sync" : "Up to date · saved on this phone"
        if !pending.isEmpty {message += pending.contains(where:{$0.error != nil}) ? " · changes need review" : " · \(pending.count) waiting to sync"}
    }
    func request(_ path:String,body:Data?=nil,form:Bool=false)async throws->Data {
        guard path.hasPrefix("/"),!path.hasPrefix("//"),!path.contains("\\"),let url=URL(string:Self.site+path)else{throw URLError(.badURL)}
        var request=URLRequest(url:url);request.httpMethod=body==nil ? "GET":"POST";request.httpBody=body
        request.setValue("application/json",forHTTPHeaderField:"Accept");request.setValue(Self.site,forHTTPHeaderField:"Origin")
        request.setValue("no-store",forHTTPHeaderField:"Cache-Control");request.setValue("Asechka-iOS/"+(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.8.0"),forHTTPHeaderField:"User-Agent")
        if !cookie.isEmpty {request.setValue(cookie,forHTTPHeaderField:"Cookie")}
        if body != nil {request.setValue(form ? "application/x-www-form-urlencoded":"application/json",forHTTPHeaderField:"Content-Type")}
        for (endpoint,header) in [("/api/location","X-Asechka-Location"),("/api/camera","X-Asechka-Camera"),("/api/journal","X-Asechka-Journal"),("/api/keepsakes","X-Asechka-Keepsakes"),("/api/memories","X-Asechka-Memories"),("/api/music","X-Asechka-Music"),("/api/together","X-Asechka-Together"),("/api/translation","X-Asechka-Translation"),("/api/games-session","X-Asechka-Games")] {
            if path==endpoint || path.hasPrefix(endpoint+"?") {request.setValue("1",forHTTPHeaderField:header)}
        }
        let (data,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse else{throw URLError(.badServerResponse)}
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode==401 {cookie="";vault.remove("session");status()}
            let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
            throw ServerError(message:json?["error"] as? String ?? "Our connection needs a little moment. Your saved content is here.",status:http.statusCode)
        }
        if path=="/api/session" {
            let headers=http.allHeaderFields.reduce(into:[String:String]()){ if let key=$1.key as? String,let value=$1.value as? String {$0[key]=value} }
            if let value=HTTPCookie.cookies(withResponseHeaderFields:headers,for:url).first(where:{$0.name=="asechka_session"}) {
                cookie=value.name+"="+value.value;try vault.save("session",cookie)
            }
        }
        return data
    }
    func browserCookie()->HTTPCookie?{guard !cookie.isEmpty,let value=cookie.split(separator:"=",maxSplits:1).last else{return nil};return HTTPCookie(properties:[.domain:"asechka-website.vercel.app",.path:"/",.name:"asechka_session",.value:String(value),.secure:"TRUE",.expires:Date().addingTimeInterval(3600)])}
    func requireCode(background:Bool=false){
        guard biometricEnabled else{if background{accessEpoch += 1};requiresCode=false;return}
        if biometricPrompt && !background{HeartRain.shared.stop();return}
        if background{BiometricAccess.cancel();biometricPrompt=false}
        flushHeartTaps();accessEpoch += 1;requiresCode=true;busy=false;doorError=nil;HeartRain.shared.stop()
    }
    func setBiometrics(_ enabled:Bool)async {
        if !enabled{BiometricAccess.remove();biometricEnabled=false;requiresCode=false;try? vault.save("biometric-enabled",false);return}
        guard unlocked,!requiresCode,BiometricAccess.available else{return}
        let visit=accessEpoch;biometricPrompt=true
        defer{if visit==accessEpoch{biometricPrompt=false}}
        do{try await BiometricAccess.authenticate(enroll:true);guard visit==accessEpoch else{return};try vault.save("biometric-enabled",true);biometricEnabled=true}
        catch{if visit==accessEpoch{self.error="Biometrics weren’t enabled. Our code still works."}}
    }
    func biometricLogin()async {
        guard !busy,biometricEnabled,requiresCode,vault.read("snapshot:/api/memories") != nil else{return}
        let visit=accessEpoch;biometricPrompt=true;busy=true;doorError=nil
        defer{if visit==accessEpoch{biometricPrompt=false;busy=false}}
        do{
            try await BiometricAccess.authenticate(enroll:false)
            guard visit==accessEpoch else{return}
            locked=false;try vault.save("locked",false);unlocked=true;requiresCode=false;restore();status();Touch.tap(true);await refresh()
        }catch{if visit==accessEpoch{doorError="Try \(BiometricAccess.name) or your phone’s passcode again."}}
    }
    func login(_ code:String)async {
        guard !busy else{return}
        guard !code.isEmpty else{doorError="Enter our little code first.";return}
        let visit=accessEpoch
        busy=true;doorError=nil
        defer{if visit==accessEpoch{busy=false}}
        func accept()async {
            guard visit==accessEpoch else{return}
            locked=false;try? vault.save("locked",false);unlocked=true;requiresCode=false;restore();status();Touch.tap(true)
            await refresh()
        }
        func savedCodeMatches()->Bool {
            guard let check=vault.value("offline-code",as:[String].self),check.count==2,vault.read("snapshot:/api/memories") != nil else{return false}
            return Self.verifier(code,check[0])==check[1]
        }
        if !online {
            if savedCodeMatches(){await accept()}
            else{doorError="Use the code last used on this phone, or connect to open it for the first time."}
            return
        }
        do {
            var components=URLComponents();components.queryItems=[URLQueryItem(name:"password",value:code)]
            _=try await request("/api/session",body:Data((components.percentEncodedQuery ?? "").replacingOccurrences(of:"+",with:"%2B").utf8),form:true)
            guard visit==accessEpoch else{return}
            let salt=UUID().uuidString
            try vault.save("offline-code",[salt,Self.verifier(code,salt)])
            await accept()
        }catch {
            guard visit==accessEpoch else{return}
            if (error as? ServerError)?.status != 401,savedCodeMatches(){await accept()}
            else{let message=(error as? ServerError)?.status == 401 ? "That code needs another little try. ♡":error.localizedDescription;doorError=message;if unlocked{self.error=message}}
        }
    }
    static func verifier(_ code:String,_ salt:String)->String {
        SHA256.hash(data:Data((salt+":"+code).utf8)).map{String(format:"%02x",$0)}.joined()
    }
    func lock(){WidgetBridge.clear();requireCode();locked=true;unlocked=false;try? vault.save("locked",true);cookie="";vault.remove("session")}
    func restore(){
        littleMessages=[]; pinnedNote=nil; dailyPrompt=nil; heartVibes=[:]
        heartDays=[:];heartReceipts=[];heartStreakPolicy=[:];serverHeartDay="";serverHeartAsOf=nil
        memories=vault.value("snapshot:/api/memories",as:Memories.self) ?? bundledMemories()
        if let musicData=vault.read("snapshot:/api/music"),let decoded=try? JSONDecoder().decode(SongList.self,from:musicData) {
            songs=decoded.tracks; momentSong=decoded.moment
        } else { songs=[]; momentSong=nil }
        wishes=(vault.read("snapshot:/api/together").flatMap{try? JSONDecoder().decode(WishList.self,from:$0)})?.bucketList ?? []
        if let data=vault.read("snapshot:/api/together"),let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
            if let raw=json["messages"],let encoded=try? JSONSerialization.data(withJSONObject:raw){littleMessages=(try? JSONDecoder().decode([LittleMessage].self,from:encoded)) ?? []}
            if let rawPinned=json["pinnedNote"],!(rawPinned is NSNull),let encoded=try? JSONSerialization.data(withJSONObject:rawPinned){pinnedNote=try? JSONDecoder().decode(LittleMessage.self,from:encoded)}
            if let rawPrompt=json["dailyPrompt"],!(rawPrompt is NSNull),let encoded=try? JSONSerialization.data(withJSONObject:rawPrompt){dailyPrompt=try? JSONDecoder().decode(DailyPromptState.self,from:encoded)}
            if let rawVibes=json["heartVibes"] as? [String:Any] {
                for (k,v) in rawVibes {
                    if !(v is NSNull),let encoded=try? JSONSerialization.data(withJSONObject:v),let info=try? JSONDecoder().decode(HeartVibeInfo.self,from:encoded){heartVibes[k]=info}
                }
            }
            let values=json["hearts"] as? [String:Any] ?? [:]
            heartStreakPolicy=json["heartStreak"] as? [String:Any] ?? [:]
            serverHeartDay=(json["streakStatus"] as? [String:Any])?["today"] as? String ?? ""
            serverHeartAsOf=BookDates.instant((json["streakStatus"] as? [String:Any])?["asOf"] as? String ?? "")
            hearts=values.compactMapValues{($0 as? [String:Any])?["sentAt"] as? String}
            heartDays=json["heartDays"] as? [String:[String:Int]] ?? [:]
            heartReceipts=Set(json["heartReceipts"] as? [String] ?? [])
        }
        if let data=vault.read("snapshot:/api/daily-memory"),let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
            let memory=json["memory"] as? [String:Any]
            dailyText=memory?["text"] as? String ?? memory?["caption"] as? String ?? memory?["title"] as? String ?? "A new little moment, every day."
            if let tb=json["throwback"] as? [String:Any] {
                throwbackLabel=tb["throwbackLabel"] as? String ?? tb["label"] as? String ?? "On this day"
                let nested=tb["memory"] as? [String:Any]
                throwbackText=tb["text"] as? String ?? tb["caption"] as? String ?? nested?["text"] as? String ?? nested?["caption"] as? String ?? ""
            } else { throwbackLabel=""; throwbackText="" }
        }
        if let camData=vault.read("snapshot:/api/camera"),let camJson=(try? JSONSerialization.jsonObject(with:camData)) as? [String:Any],let rolls=camJson["rolls"] as? [[String:Any]] {
            if let active=rolls.last(where:{($0["developedAt"] as? String)?.isEmpty ?? true}) {
                let cap=active["capacity"] as? Int ?? 8
                let shots=active["shots"] as? [[String:Any]] ?? []
                let ready=(active["sundayReady"] as? Bool ?? false) || shots.count>=cap
                let lastBy=active["lastShotActor"] as? String ?? ""
                let partnerShot = !lastBy.isEmpty && lastBy != actor
                if ready { cameraBadge="Roll ready to develop! ✨" }
                else if !shots.isEmpty { cameraBadge="\(shots.count)/\(cap) shots" + (partnerShot ? " · \(partner) shot ✨" : " · Sun 8pm ET") }
                else { cameraBadge="\(cap) weekly shots · Sun 8pm ET" }
            } else { cameraBadge="Start a new 8-shot roll · Sun 8pm ET" }
        }
        if let vaultData=vault.read("snapshot:/api/vault"),let vaultJson=(try? JSONSerialization.jsonObject(with:vaultData)) as? [String:Any],let vaults=vaultJson["vaults"] as? [[String:Any]] {
            let readyCount=vaults.filter{($0["ready"] as? Bool)==true}.count
            let locked=vaults.filter{($0["ready"] as? Bool) != true}
            if readyCount > 0 {
                vaultBadge="\(readyCount) ready to open ✨"
            } else if !locked.isEmpty {
                let now=Date()
                let soonest=locked.compactMap{BookDates.instant($0["opensAt"] as? String ?? "")}.sorted().first
                if let nextDate=soonest {
                    let days=max(0,Int(ceil(nextDate.timeIntervalSince(now)/86400)))
                    if days <= 1 { vaultBadge="\(locked.count) locked · Opens soon" }
                    else if days <= 14 { vaultBadge="\(locked.count) locked · In \(days)d" }
                    else {
                        let f=DateFormatter();f.locale=Locale(identifier:"en_US");f.timeZone=BookDates.eastern;f.dateFormat="MMM d"
                        vaultBadge="\(locked.count) locked · Opens \(f.string(from:nextDate))"
                    }
                } else { vaultBadge="\(locked.count) \(locked.count==1 ? "capsule":"capsules") sealed" }
            } else { vaultBadge="Seal notes for later · Shared vault" }
        }
        journal=restoreBook("/api/journal","journal");keepsakes=restoreBook("/api/keepsakes","keepsakes")
        translations=vault.value("translations:"+actor,as:[Translation].self) ?? []
        for change in pending {if change.error != nil,let body=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any],body["action"] as? String=="sendMessage"{continue};Projection.apply(change,to:&memories);projectOther(change)}
        if pinnedNote == nil {
            pinnedNote = littleMessages.last(where: { $0.isJar && $0.pinned == true && ($0.text != nil || !$0.preview.isEmpty) }) ?? littleMessages.last(where: { $0.isJar && $0.text != nil })
        }
        WidgetBridge.save(self)
    }
    private func bundledMemories()->Memories {
        guard let url=Bundle.main.url(forResource:"memories",withExtension:"json",subdirectory:"default"),let data=try? Data(contentsOf:url)else{return Memories()}
        return (try? JSONDecoder().decode(Memories.self,from:data)) ?? Memories()
    }
    func refresh()async {
        guard !refreshing,unlocked,!locked,online else{status();return}
        refreshing=true;defer{refreshing=false;status()}
        await sync()
        let togetherPath=actor.isEmpty ? "/api/together":"/api/together?actor="+actor
        for (key,path) in [("/api/memories","/api/memories"),("/api/music","/api/music"),("/api/together",togetherPath),("/api/daily-memory","/api/daily-memory"),("/api/keepsakes","/api/keepsakes"),("/api/journal","/api/journal"),("/api/camera","/api/camera"),("/api/vault","/api/vault")] {
            do{let data=try await request(path);guard !locked else{return};if key=="/api/together"{try saveTogether(data)}else{try vault.write("snapshot:"+key,data)}}
            catch{if key != "/api/vault",vault.read("snapshot:"+key)==nil {self.error=error.localizedDescription}}
        }
        guard !locked else{return};restore();checkForPartnerNotifications();await prefetch()
    }
    func refreshVaultBadge()async {
        guard unlocked,!locked,online else{return}
        if let data=try? await request("/api/vault") { try? vault.write("snapshot:/api/vault",data); restore() }
    }
    func sendHeart(vibe:String?=nil)throws {
        let from=actor=="asnat" ? "asechka":"me"
        if let vibe,!vibe.isEmpty {
            let day=HeartLedger.day()
            try enqueue("/api/together",["action":"sendHeart","from":from,"day":day,"count":1,"vibe":vibe])
            return
        }
        let key=from+"|"+HeartLedger.day()
        heartTaps[key,default:0]+=1
        guard heartCommit==nil else{return}
        heartCommit=Task{try? await Task.sleep(nanoseconds:16_000_000);guard !Task.isCancelled else{return};flushHeartTaps()}
    }
    private func flushHeartTaps(){
        heartCommit?.cancel();heartCommit=nil
        guard !heartTaps.isEmpty else{return}
        let taps=heartTaps;heartTaps=[:]
        var next=pending,days=heartDays,newHearts=hearts
        do {
            for (key,count) in taps {
                let parts=key.split(separator:"|").map(String.init),from=parts[0],day=parts[1]
                var merged=false
                for index in next.indices.reversed() where next[index].path=="/api/together" && next[index].error==nil && next[index].id != inFlightChange && !sealedHearts.contains(next[index].id) {
                    guard var body=(try? JSONSerialization.jsonObject(with:next[index].body)) as? [String:Any],body["action"] as? String=="sendHeart",body["from"] as? String==from,body["day"] as? String==day,body["vibe"]==nil,(body["count"] as? Int ?? 1)+count<=1000000 else{continue}
                    body["count"]=(body["count"] as? Int ?? 1)+count;next[index].body=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys]);merged=true;break
                }
                if !merged {
                    let body:[String:Any]=["action":"sendHeart","from":from,"day":day,"count":count,"operationId":UUID().uuidString.lowercased()]
                    next.append(PendingChange(id:UUID().uuidString,path:"/api/together",body:try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys]),createdAt:ISO8601DateFormatter().string(from:Date())))
                }
                days[day,default:[:]][from,default:0]+=count;newHearts[from]=ISO8601DateFormatter().string(from:Date())
            }
            pending=next;heartDays=days;hearts=newHearts
            vault.saveDeferred("outbox",next){[weak self] error in
                guard let error else{return}
                Task{@MainActor in self?.error="Your phone couldn’t finish saving those hearts. Please keep the app open and try again. "+error.localizedDescription}
            }
            status()
            if heartFlush==nil {
                heartFlush=Task{do{try await Task.sleep(nanoseconds:35_000_000)}catch{return};heartFlush=nil;await sync();restore();status()}
            }
        }catch{heartTaps.merge(taps,uniquingKeysWith:+);self.error=error.localizedDescription}
    }
    func finishHeartSaves()async {flushHeartTaps();await vault.drain()}

    func forceRefresh()async {
        retryAfter = .distantPast
        await finishHeartSaves()
        var next=pending,recovered=false
        for index in next.indices where next[index].error != nil {
            guard let body=(try? JSONSerialization.jsonObject(with:next[index].body)) as? [String:Any],next[index].path=="/api/together",body["action"] as? String=="sendHeart" else{continue}
            next[index].error=nil;recovered=true
        }
        if recovered {do{try vault.save("outbox",next);pending=next}catch{self.error=error.localizedDescription}}
        await refresh()
    }

    func enqueue(_ path:String,_ input:[String:Any])throws {
        var body=input
        if body["operationId"]==nil {body["operationId"]=UUID().uuidString.lowercased()}
        let data=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys])
        if let encoded=body["photo"] as? String,let bytes=Data(base64Encoded:String(encoded.dropFirst(23))) {
            let key=path=="/api/journal" ? "/api/journal?photo=\(body["operationId"] as? String ?? "")" : path=="/api/memories" ? "/"+Projection.photoPath(body) : "/api/together-photo?kind=bucket&id=\(body["operationId"] as? String ?? "")"
            try vault.write("image:"+key,bytes)
        }
        let change=PendingChange(id:UUID().uuidString,path:path,body:data,createdAt:ISO8601DateFormatter().string(from:Date()))
        var next=pending;next.append(change);try vault.save("outbox",next);pending=next;restore();status()
        Task{await sync();restore();status()}
    }
    func sync()async {
        guard !syncing,online,!cookie.isEmpty,!locked,Date()>=retryAfter else{return};flushHeartTaps();syncing=true;defer{syncing=false;inFlightChange=nil}
        var batches=0
        while !locked {
            if !heartTaps.isEmpty { flushHeartTaps() }
            guard let first=pending.first?.error==nil ? pending.first:pending.first(where:{change in
                guard change.error==nil,change.path=="/api/together",let body=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any] else{return false}
                return ["sendHeart","sendMessage","closeMessage","pinMessage","answerPrompt"].contains(body["action"] as? String ?? "")
            }) else{break}
            let isHeart=((try? JSONSerialization.jsonObject(with:first.body)) as? [String:Any])?["action"] as? String=="sendHeart"
            if isHeart{batches += 1;if batches>12{break}}
            inFlightChange=first.id
            do {
                var body=(try JSONSerialization.jsonObject(with:first.body)) as? [String:Any] ?? [:]
                if body["action"] as? String=="sendHeart" {sealedHearts.insert(first.id);try vault.save("heart-sealed",Array(sealedHearts))}
                for field in ["expectedVersion","expectedId","expectedRevision"] {
                    if var value=body[field] as? String {for _ in 0..<50 {guard let next=idMap[value] else{break};value=next};body[field]=value}
                }
                let reqPath=first.path=="/api/together" && !actor.isEmpty ? "/api/together?actor="+actor : first.path
                let data=try await request(reqPath,body:JSONSerialization.data(withJSONObject:body))
                guard !locked else{return}
                if first.path=="/api/memories",let saved=try? JSONDecoder().decode(Memories.self,from:data),let op=body["operationId"] as? String {
                    let id=body["id"] as? String ?? op
                    if let post=saved.posts.first(where:{$0.id==id}),let version=post.editVersion {idMap["local:"+op]=version}
                }
                if let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
                    if first.path=="/api/together",let list=json["bucketList"] as? [[String:Any]],let op=body["operationId"] as? String,
                       let value=list.first(where:{$0["id"] as? String==body["id"] as? String})?["revision"] as? String {idMap[op]=value}
                    if first.path=="/api/music",let list=json["tracks"] as? [[String:Any]],let value=list.first(where:{$0["rank"] as? Int==body["rank"] as? Int})?["id"] as? String {idMap[first.id]=value}
                }
                if first.path=="/api/together"{try saveTogether(data)}else{try vault.write("snapshot:"+first.path,data)};try vault.save("id-map",idMap)
                var next=pending;next.removeAll{$0.id==first.id};try vault.save("outbox",next);pending=next
                sealedHearts.remove(first.id);try? vault.save("heart-sealed",Array(sealedHearts))
            }catch {
                retryAfter=Date().addingTimeInterval(5)
                if isHeart,(error as? ServerError)?.status==409 {
                    if await reconcileHeart(first){continue}
                    break
                }
                if let server=error as? ServerError,server.status==429,let body=(try? JSONSerialization.jsonObject(with:first.body)) as? [String:Any],body["action"] as? String=="sendMessage",let index=pending.firstIndex(where:{$0.id==first.id}){pending[index].error=server.message;try? vault.save("outbox",pending);continue}
                if let server=error as? ServerError,(400..<500).contains(server.status),![401,429].contains(server.status),let index=pending.firstIndex(where:{$0.id==first.id}) {
                    pending[index].error=server.message;try? vault.save("outbox",pending)
                };break
            }
        }
    }
    private func reconcileHeart(_ change:PendingChange)async->Bool {
        do {
            guard let body=(try JSONSerialization.jsonObject(with:change.body)) as? [String:Any],let op=body["operationId"] as? String else{return false}
            let data=try await request("/api/together?heartOperation="+op)
            guard let response=(try JSONSerialization.jsonObject(with:data)) as? [String:Any],let receipt=response["heartReceipt"] as? [String:Any],receipt["operationId"] as? String==op,receipt["from"] as? String==body["from"] as? String,
                  body["day"]==nil || body["day"] as? String==receipt["day"] as? String,let accepted=receipt["count"] as? Int,accepted>0 else{return false}
            let rest=max(0,(body["count"] as? Int ?? 1)-accepted)
            var next=pending
            guard let index=next.firstIndex(where:{$0.id==change.id}) else{return true}
            if rest>0 {
                var replacement=body;replacement["count"]=rest;replacement["operationId"]=UUID().uuidString.lowercased()
                next[index]=PendingChange(id:UUID().uuidString,path:change.path,body:try JSONSerialization.data(withJSONObject:replacement,options:[.sortedKeys]),createdAt:change.createdAt)
            }else{next.remove(at:index)}
            try saveTogether(data);try vault.save("outbox",next);pending=next
            sealedHearts.remove(change.id);try? vault.save("heart-sealed",Array(sealedHearts));restore();status();return true
        }catch{return false}
    }
    func discard(_ change:PendingChange){do{var next=pending;next.removeAll{$0.id==change.id};try vault.save("outbox",next);pending=next;restore();status()}catch{self.error=error.localizedDescription}}
    private func projectOther(_ change:PendingChange){
        guard let b=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any] else{return}
        if change.path=="/api/together" {
            let action=b["action"] as? String ?? ""
            if action=="sendMessage",let id=b["operationId"] as? String,!littleMessages.contains(where:{$0.id==id}) {
                let text=b["text"] as? String ?? "",from=b["actor"] as? String ?? actor
                let mode=b["mode"] as? String ?? "once",pinned=mode=="jar" && (b["pinned"] as? Bool ?? false)
                if pinned { for i in littleMessages.indices { littleMessages[i].pinned = false } }
                let note=LittleMessage(id:id,from:from,to:from=="asnat" ? "youssef":"asnat",text:text,preview:String(text.split(whereSeparator:{$0.isWhitespace}).joined(separator:" ").prefix(60))+(text.count>60 ? "…":""),day:HeartLedger.day(BookDates.instant(change.createdAt) ?? Date()),createdAt:change.createdAt,mode:mode,pinned:pinned,pending:true)
                littleMessages.append(note)
                if pinned { pinnedNote = note }
                return
            }
            if action=="closeMessage"{if let index=littleMessages.firstIndex(where:{$0.id==b["id"] as? String}){if !littleMessages[index].isJar { littleMessages[index].text=nil }; littleMessages[index].closedAt=change.createdAt};return}
            if action=="pinMessage"{let id=b["id"] as? String ?? "",pinned=b["pinned"] as? Bool ?? true; for i in littleMessages.indices { if littleMessages[i].id == id { littleMessages[i].pinned = pinned } else if pinned { littleMessages[i].pinned = false } }; pinnedNote = littleMessages.last(where: { $0.isJar && $0.pinned == true }); return}
            if action=="answerPrompt" {
                let who=b["actor"] as? String ?? actor,text=b["text"] as? String ?? "",day=b["day"] as? String ?? HeartLedger.day()
                var p=dailyPrompt ?? DailyPromptState(day:day,prompt:"What small moment made you smile today?",revealed:false,answers:[:])
                p.answers[who]=DailyPromptAnswer(answered:true,answeredAt:change.createdAt,text:text)
                p.revealed = (p.answers["asnat"]?.answered == true && p.answers["youssef"]?.answered == true)
                dailyPrompt = p; return
            }
            if action=="sendHeart" {
                HeartLedger.apply(b,to:&heartDays,receipts:heartReceipts,createdAt:change.createdAt)
                let from=b["from"] as? String ?? "me"; hearts[from]=change.createdAt
                if let vibe=b["vibe"] as? String,!vibe.isEmpty {
                    let meta=HomeHub.vibeMeta(vibe)
                    heartVibes[from]=HeartVibeInfo(vibe:vibe,label:meta.1,symbol:meta.0,sentAt:change.createdAt)
                }
                return
            }
            guard let id=b["id"] as? String else{return}
            if action=="removeItem"{wishes.removeAll{$0.id==id};return}
            if let index=wishes.firstIndex(where:{$0.id==id}) {
                if action=="saveItem" {wishes[index].title=b["title"] as? String ?? wishes[index].title;wishes[index].place=b["place"] as? String;wishes[index].note=b["note"] as? String}
                wishes[index].completed=b["completed"] as? Bool;wishes[index].revision=b["operationId"] as? String
                if b["photo"] != nil {wishes[index].photoId=b["operationId"] as? String}
            }else if action=="saveItem" {wishes.append(Wish(id:id,title:b["title"] as? String ?? "",place:b["place"] as? String,note:b["note"] as? String,completed:b["completed"] as? Bool,revision:b["operationId"] as? String,photoId:b["photo"] != nil ? b["operationId"] as? String:nil))}
        }
        if change.path=="/api/music" {
            let action=b["action"] as? String ?? ""
            if action=="clearMoment" { momentSong = nil; return }
            if action=="setMoment",let id=b["trackId"] as? Int,var song=vault.value("song:\(id)",as:Song.self) {
                song.note=b["note"] as? String; song.actor=b["actor"] as? String; song.updatedAt=change.createdAt
                momentSong=song; return
            }
            if let rank=b["rank"] as? Int {
                songs.removeAll{$0.rank==rank}
                if action=="save",let id=b["trackId"] as? Int,var song=vault.value("song:\(id)",as:Song.self) {song.rank=rank;song.savedId=change.id;song.revision=change.id;song.note=b["note"] as? String;songs.append(song)}
                songs.sort{($0.rank ?? 0)<($1.rank ?? 0)}
            }
        }
    }
    func like(_ post:Post,_ liked:Bool){do{try enqueue("/api/memories",["action":"setLike","kind":post.kind,"id":post.id,"actor":actor,"liked":liked])}catch{self.error=error.localizedDescription}}
    func react(_ post:Post,_ emoji:String){let current=post.social?.reactions[actor] ?? "";do{try enqueue("/api/memories",["action":"setReaction","kind":post.kind,"id":post.id,"actor":actor,"reaction":current==emoji ? "":emoji])}catch{self.error=error.localizedDescription}}
    func comment(_ post:Post,_ text:String)throws{try enqueue("/api/memories",["action":"addComment","kind":post.kind,"id":post.id,"actor":actor,"text":text])}
    func current(_ post:Post)->Post{memories.posts.first{$0.id==post.id} ?? post}
    func image(_ source:String)async->Data? {
        guard !source.isEmpty else{return nil}
        var cache=source,bundled=source.trimmingCharacters(in:CharacterSet(charactersIn:"/"))
        if source.hasPrefix("/api/together-photo?kind=memory"),let parts=URLComponents(string:source),let id=parts.queryItems?.first(where:{$0.name=="id"})?.value,
           let photo=memories.photos.first(where:{$0.id==id}),let src=photo.src {cache="/"+src;bundled=src}
        if bundled.hasPrefix("assets/"),!bundled.contains(".."),let url=Bundle.main.url(forResource:String(bundled.dropFirst(7)),withExtension:nil,subdirectory:"default"),let data=try? Data(contentsOf:url){return data}
        if let data=vault.read("image:"+cache){return data}
        guard online else{return nil}
        do {
            let data:Data
            if source.hasPrefix("https://"),let url=URL(string:source),url.host?.hasSuffix(".mzstatic.com")==true {
                let (bytes,response)=try await session.data(from:url);guard (response as? HTTPURLResponse)?.statusCode==200,bytes.count<12_000_000 else{return nil};data=bytes
            }else{data=try await request(source.hasPrefix("/") ? source : "/"+source)}
            guard data.count<12_000_000 else{return nil};try vault.write("image:"+cache,data);return data
        }catch{return nil}
    }
    func prefetch()async {
        guard !prefetching else{return};prefetching=true;defer{prefetching=false}
        let sources=memories.photos.map(\.imageURL)+songs.compactMap(\.artworkUrl)+(momentSong?.artworkUrl.map{[$0]} ?? [])+wishes.compactMap{$0.photoId.map{"/api/together-photo?kind=bucket&id="+$0}}
        for source in sources {guard online,!locked else{return};_=await image(source)}
    }
    func search(_ query:String)async throws->[Song]{
        var parts=URLComponents();parts.queryItems=[URLQueryItem(name:"q",value:query)]
        let path="/api/music-search?"+(parts.percentEncodedQuery ?? "").replacingOccurrences(of:"+",with:"%2B")
        let data:Data
        if !online,let saved=vault.read("search:"+path){data=saved}else{data=try await request(path);try vault.write("search:"+path,data)}
        let list=try JSONDecoder().decode(SongList.self,from:data)
        for song in list.tracks{try vault.save("song:\(song.trackId)",song)};return list.tracks
    }
    func translate(_ text:String,source:String,tone:String,targets:[String])async throws {
        let body:[String:Any]=["text":text,"source":source,"tone":tone,"targets":targets,"speaker":actor=="asnat" ? "female":"male","recipient":actor=="asnat" ? "male":"female"]
        let encoded=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys])
        let key="translation:"+SHA256.hash(data:encoded).map{String(format:"%02x",$0)}.joined()
        let data:Data
        if !online,let saved=vault.read(key){data=saved}else{data=try await request("/api/translation",body:encoded);try vault.write(key,data)}
        translations=try JSONDecoder().decode(TranslationList.self,from:data).translations
        try vault.save("translations:"+actor,translations)
        var history=vault.value("translation-history:"+actor,as:[TranslationRecord].self) ?? []
        history.insert(TranslationRecord(id:UUID().uuidString,text:text,results:translations),at:0)
        try vault.save("translation-history:"+actor,Array(history.prefix(30)))
    }
}
struct SongList:Decodable {var tracks:[Song]; var moment:Song?}
struct WishList:Decodable {var bucketList:[Wish]}
struct TranslationList:Decodable {var translations:[Translation]}
struct TranslationRecord:Codable,Identifiable {var id:String;var text:String;var results:[Translation]}
